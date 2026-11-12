/**
 * AiEmcee Motion: the renderer.
 *
 *   openMotion()   one headless Chromium, N pages, each with the bundle loaded
 *   renderRange()  one page draws frames [a, b) of a composition and pipes them,
 *                  as JPEGs, into ffmpeg -> H.264 in MPEG-TS
 *
 * A frame is: seek (React renders it), wait until every image, video frame
 * and font it needs has decoded, screenshot over CDP. Frames go straight to
 * ffmpeg's stdin; nothing touches the disk until the encoded chunk.
 *
 * The picture matches the chunks the engine has always made: JPEG frames into
 * x264 as full-range BT.601 (yuvj420p). The master converts to BT.709 once.
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { startHost } from "./host.mjs";

async function chromium() {
  const { chromium } = await import("playwright");
  return chromium;
}

/**
 * Chromium's graphics backend. `render.gl` in the config picks one:
 *   unset       Windows: hardware D3D11 through ANGLE (measured 20-40% faster
 *   or "angle"  per frame than software here); elsewhere ANGLE's default
 *   "software"  SwiftShader, the CPU rasteriser (also "swiftshader", "swangle")
 *   other       passed through as --use-gl=<value>
 */
function graphicsArgs(gl) {
  // "angle" is the engine default from the Remotion days: the same hardware path.
  if (gl == null || gl === "angle") return process.platform === "win32" ? ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] : gl ? ["--use-gl=angle"] : [];
  // Chromium's default can still pick a GPU: name the software rasteriser explicitly.
  if (["software", "swiftshader", "swangle"].includes(gl)) return ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
  return [`--use-gl=${gl}`];
}

/**
 * Pages are spread over a few Chromium processes. Rendering is CPU-bound
 * (measured: 100% CPU at 4-6 pages on 12 threads), so pages, not browsers, are
 * the knob; a second browser only keeps one crash from taking every page.
 * @param {{ bundleDir: string, publicDir: string, env?: object, width: number, height: number, scale?: number, pages?: number, browsers?: number, gl?: string }} o
 */
export async function openMotion({ bundleDir, publicDir, env = {}, width, height, scale = 1, pages = 4, browsers = Math.ceil(pages / 2), gl = null, frameFormat = process.env.AIEMCEE_FRAME_FORMAT ?? "jpeg" }) {
  const host = await startHost({ bundleDir, publicDir, frameFormat });
  const launcher = await chromium();
  const launched = await Promise.all(
    Array.from({ length: Math.max(1, Math.min(browsers, pages)) }, () =>
      launcher.launch({
        headless: true,
        args: [
          "--disable-background-timer-throttling",
          "--disable-renderer-backgrounding",
          "--disable-backgrounding-occluded-windows",
          "--font-render-hinting=none",
          "--force-color-profile=srgb",
          "--hide-scrollbars",
          ...graphicsArgs(gl),
          // Extra Chromium switches, for tuning: AIEMCEE_MOTION_ARGS="--a --b".
          ...(process.env.AIEMCEE_MOTION_ARGS?.split(" ").filter(Boolean) ?? []),
        ],
      }),
    ),
  );
  const hash = encodeURIComponent(JSON.stringify(env));
  const open = async (i) => {
    const browser = launched[i % launched.length];
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.goto(`${host.url}/index.html?page=${i}#${hash}`);
    await page.waitForFunction(() => document.documentElement.dataset.motion === "ready", null, { timeout: 60000 }).catch(() => {
      throw new Error(`motion page did not start${errors.length ? `:\n  ${errors.join("\n  ")}` : ""}`);
    });
    const cdp = await context.newCDPSession(page);
    return { i, page, cdp, errors, mounted: null };
  };
  const all = await Promise.all(Array.from({ length: pages }, (_, i) => open(i)));
  return {
    pages: all,
    width,
    height,
    scale,
    async close() {
      await Promise.all(launched.map((b) => b.close().catch(() => {})));
      await host.close();
    },
  };
}

/** Mounts `id` with `props` on a page, once per (id, props). */
async function mount(p, id, props) {
  const key = `${id}|${crypto.createHash("sha1").update(JSON.stringify(props ?? {})).digest("hex")}`;
  if (p.mounted?.key === key) return p.mounted.config;
  const config = await p.page.evaluate(([id, props]) => window.__motion.init(id, props), [id, props ?? {}]);
  // The page is the frame: fit it to this composition (a vertical intro, say).
  const vp = p.page.viewportSize();
  if (!vp || vp.width !== config.width || vp.height !== config.height) await p.page.setViewportSize({ width: config.width, height: config.height });
  p.mounted = { key, config };
  return config;
}

/** The composition's resolved size, rate and length (runs calculateMetadata). */
export async function selectComposition(motion, id, props) {
  return mount(motion.pages[0], id, props);
}

/**
 * The chunk encode for each frame format:
 *   jpeg   the browser's JPEG is already YCbCr (BT.601 full range): keep it as
 *          is, tagged yuvj420p; the master converts to BT.709 once
 *   png    lossless RGB: converted straight to BT.709 limited range, the
 *          delivery format, so the master has nothing left to convert
 */
const PICTURE = {
  jpeg: { input: ["-c:v", "mjpeg"], output: ["-pix_fmt", "yuvj420p", "-color_range", "pc", "-colorspace", "bt470bg"] },
  png: {
    input: ["-c:v", "png"],
    output: ["-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709"],
  },
};

/**
 * Renders frames [a, b) of `id` on page `p` into `dest` (MPEG-TS, H.264).
 * @param {{ crf: number, preset: string, imageFormat?: "jpeg" | "png", jpegQuality?: number, fps: number }} encode
 */
export async function renderRange(motion, p, { id, props, a, b, dest, encode }) {
  const config = await mount(p, id, props);
  const fps = encode.fps ?? config.fps;
  const quality = encode.jpegQuality ?? 90;
  const format = encode.imageFormat === "png" ? "png" : "jpeg";
  const ff = spawn(
    "ffmpeg",
    [
      "-v", "error",
      "-f", "image2pipe", "-framerate", String(fps), ...PICTURE[format].input, "-i", "-",
      "-c:v", "libx264", "-preset", encode.preset, "-crf", String(encode.crf),
      ...PICTURE[format].output,
      "-f", "mpegts", "-y", dest,
    ],
    { stdio: ["pipe", "ignore", "pipe"], windowsHide: true },
  );
  let ffErr = "";
  ff.stderr.on("data", (d) => (ffErr += d));
  const closed = new Promise((resolve, reject) =>
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg encode failed (${code}): ${ffErr.trim().split("\n").at(-1)}`)))),
  );
  ff.stdin.on("error", () => {}); // reported through `closed`

  const clip = { x: 0, y: 0, width: config.width, height: config.height, scale: 1 };
  // AIEMCEE_MOTION_PROFILE=1 prints where each page's time goes.
  const prof = process.env.AIEMCEE_MOTION_PROFILE ? { seek: 0, shot: 0, pipe: 0 } : null;
  try {
    for (let f = a; f < b; f++) {
      let t = prof && performance.now();
      await p.page.evaluate((f) => window.__motion.seek(f), f);
      if (prof) prof.seek += performance.now() - t;
      if (p.errors.length) throw new Error(`frame ${f}: ${p.errors.splice(0).join("\n  ")}`);
      t = prof && performance.now();
      const shot = format === "png" ? { format: "png" } : { format: "jpeg", quality };
      const { data } = await p.cdp.send("Page.captureScreenshot", { ...shot, clip, optimizeForSpeed: true, captureBeyondViewport: false });
      if (prof) prof.shot += performance.now() - t;
      t = prof && performance.now();
      const buf = Buffer.from(data, "base64");
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
      if (prof) prof.pipe += performance.now() - t;
    }
    if (prof) {
      const n = b - a;
      console.log(`  profile page ${p.i} frames ${a}-${b}: seek ${(prof.seek / n).toFixed(1)}ms  screenshot ${(prof.shot / n).toFixed(1)}ms  pipe ${(prof.pipe / n).toFixed(1)}ms per frame`);
    }
  } catch (err) {
    ff.stdin.destroy();
    ff.kill();
    await closed.catch(() => {});
    fs.rmSync(dest, { force: true });
    throw err;
  }
  ff.stdin.end();
  await closed;
}

/**
 * Renders [a, b) using every page: the range is cut into contiguous pieces,
 * one per page, encoded separately and joined with a stream copy.
 */
export async function renderSplit(motion, { id, props, a, b, dest, encode, pieces = motion.pages.length, minFrames = 30, take }) {
  const n = Math.max(1, Math.min(pieces, Math.floor((b - a) / minFrames)));
  if (n === 1) {
    const p = await take();
    try {
      return await renderRange(motion, p.page, { id, props, a, b, dest, encode });
    } finally {
      p.release();
    }
  }
  const cuts = Array.from({ length: n + 1 }, (_, k) => a + Math.round(((b - a) * k) / n));
  const parts = cuts.slice(0, -1).map((s, k) => ({ a: s, b: cuts[k + 1], file: `${dest}.${k}.ts` }));
  try {
    await Promise.all(
      parts.map(async (part) => {
        const p = await take();
        try {
          await renderRange(motion, p.page, { id, props, a: part.a, b: part.b, dest: part.file, encode });
        } finally {
          p.release();
        }
      }),
    );
    const list = `${dest}.txt`;
    fs.writeFileSync(list, parts.map((x) => `file '${path.basename(x.file)}'\nduration ${((x.b - x.a) / encode.fps).toFixed(6)}`).join("\n") + "\n");
    await new Promise((resolve, reject) => {
      const c = spawn("ffmpeg", ["-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-f", "mpegts", "-y", dest], { cwd: path.dirname(dest), windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
      let e = "";
      c.stderr.on("data", (d) => (e += d));
      c.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`join failed: ${e.trim()}`))));
    });
    fs.rmSync(list, { force: true });
  } finally {
    for (const x of parts) fs.rmSync(x.file, { force: true });
  }
}

/** A pool of the motion pages: take() waits for a free one. */
export function pagePool(motion) {
  const free = [...motion.pages];
  const waiting = [];
  return async function take() {
    const page = free.shift() ?? (await new Promise((r) => waiting.push(r)));
    return {
      page,
      release() {
        const w = waiting.shift();
        if (w) w(page);
        else free.push(page);
      },
    };
  };
}
