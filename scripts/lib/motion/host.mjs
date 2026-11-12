/**
 * AiEmcee Motion: the local host the render pages load from.
 *
 *   /                the bundle (index.html, bundle.js, assets)
 *   /public/...      remotion/public: art, logos, staged film media
 *   /__frame         one exact video frame as a JPEG (see FrameSource)
 *
 * Footage is decoded forward, once: each page keeps one ffmpeg per video it
 * shows, reading frames in order as the page asks for later times. A page that
 * jumps (a new chunk, a seek backwards) restarts that decoder at the new time.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

const widths = new Map();
/** A video's width in pixels, probed once. */
function sourceWidth(file) {
  if (!widths.has(file)) {
    const out = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width", "-of", "csv=p=0", file], { encoding: "utf8", windowsHide: true });
    widths.set(file, Number(out.stdout.trim()) || Infinity);
  }
  return widths.get(file);
}

const IDLE_MS = 3000;
const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

/**
 * Frames of one video, in order, from one ffmpeg: the source resampled to the
 * film's frame rate, so frame k is at start + k / fps.
 *
 * Two sizes: half the source when the frame shows it at half size or less
 * (an unzoomed 4K shot in a 1080p film), else the source size. A decoder only
 * ever steps up: switching size restarts it, and a restart re-decodes from the
 * last keyframe (up to seconds of 4K), so a zoom out never pays that twice.
 * The downscale is a box filter (area): exact for 2x, and what the browser's
 * own mipmapped downscale of the full frame amounts to.
 *
 *   jpeg   q2 MJPEG (the default): small, a fast encode and decode.
 *   bmp    uncompressed, no encode: measured slower, Chromium decodes 24 MB BMPs
 *          slowly. Kept for experiments: AIEMCEE_FRAME_FORMAT=bmp.
 */
class FrameSource {
  constructor(file, fps, { format = "jpeg", quality = 2 } = {}) {
    this.width = null; // null: not started; 0: the source size; else a scaled width
    this.file = file;
    this.fps = fps;
    this.format = format;
    this.quality = quality;
    this.proc = null;
    this.ahead = format === "bmp" ? 3 : 8; // frames decoded ahead of the page
  }

  get type() {
    return this.format === "bmp" ? "image/bmp" : "image/jpeg";
  }

  /** The frame shown at time t (seconds), at least `width` wide (0: the source size). */
  /**
   * One request at a time per decoder: a page can ask for a new frame while
   * its previous request is still decoding (mount shows frame 0, then the
   * renderer seeks), and two readers on one stream would race for its frames.
   */
  at(t, width) {
    const run = (this.queue ?? Promise.resolve()).then(() => this.serve(t, width));
    this.queue = run.catch(() => {});
    return run;
  }

  async serve(t, width) {
    // An idle decoder lets go of its file a few seconds after its last frame:
    // on Windows an open file cannot be replaced, and compose restages footage
    // while a preview (Motion Studio) may still have it open. The clock starts
    // only when a request is done, never while one waits on a slow seek.
    clearTimeout(this.idle);
    try {
      return await this.frameAt(t, width);
    } finally {
      this.idle = setTimeout(() => this.stop(), IDLE_MS);
      this.idle.unref?.();
    }
  }

  async frameAt(t, width) {
    const k = Math.max(0, Math.round(t * this.fps));
    const bigger = this.width !== null && this.width !== 0 && (width === 0 || width > this.width);
    if (this.width === null || bigger) this.width = width;
    // Reuse the running decoder when t is ahead of it, not too far, and big enough.
    if (!this.proc || bigger || k < this.next || k - this.next > this.fps * 2) this.start(k);
    let backedOff = false;
    while (this.next <= k) {
      const frame = await this.read();
      if (!frame) {
        // Past the end of the file: hold the last frame there is.
        if (this.last) return this.last;
        // Seeking right at the end yields nothing: back up a second and read to the end.
        if (backedOff || k === 0) throw new Error(`no frame at ${t.toFixed(3)}s in ${path.basename(this.file)}`);
        backedOff = true;
        this.start(Math.max(0, k - this.fps));
        continue;
      }
      this.last = frame;
      this.next++;
    }
    return this.last;
  }

  start(k) {
    this.stop();
    this.next = k;
    this.last = null;
    this.parts = [];
    this.len = 0;
    this.frames = [];
    this.tail = -1; // last byte seen, for an end marker split across chunks
    this.waiters = this.waiters ?? [];
    this.ended = false;
    const ss = (k / this.fps).toFixed(6);
    const codec = this.format === "bmp" ? ["-c:v", "bmp", "-pix_fmt", "bgr24"] : ["-c:v", "mjpeg", "-q:v", String(this.quality)];
    this.proc = spawn("ffmpeg", ["-v", "error", "-ss", ss, "-i", this.file, "-an", "-vf", this.width ? `fps=${this.fps},scale=${this.width}:-2:flags=area` : `fps=${this.fps}`, "-f", "image2pipe", ...codec, "-"], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const proc = this.proc;
    let err = "";
    proc.stderr.on("data", (d) => (err += d));
    // A replaced decoder can still flush a few bytes: only the current one feeds.
    proc.stdout.on("data", (d) => proc === this.proc && this.feed(d));
    proc.on("close", () => {
      if (proc !== this.proc) return;
      this.ended = true;
      if (err.trim()) console.error(`motion: ffmpeg on ${path.basename(this.file)}: ${err.trim().split("\n").at(-1)}`);
      this.wake();
    });
  }

  /** Joins the pending chunks into one buffer (only when a frame boundary is needed). */
  joined() {
    if (this.parts.length > 1) this.parts = [Buffer.concat(this.parts, this.len)];
    return this.parts[0] ?? Buffer.alloc(0);
  }

  take(n) {
    const buf = this.joined();
    const frame = buf.subarray(0, n);
    const rest = buf.subarray(n);
    this.parts = rest.length ? [rest] : [];
    this.len = rest.length;
    return frame;
  }

  feed(d) {
    this.parts.push(d);
    this.len += d.length;
    if (this.format === "bmp") {
      // A BMP's header says how long it is: bytes 2-5, little-endian.
      for (;;) {
        if (this.len < 6) break;
        if (this.need == null) {
          const head = this.parts[0].length >= 6 ? this.parts[0] : this.joined();
          if (head[0] !== 0x42 || head[1] !== 0x4d) throw new Error(`motion: not a BMP stream from ${path.basename(this.file)}`);
          this.need = head.readUInt32LE(2);
        }
        if (this.len < this.need) break;
        this.frames.push(this.take(this.need));
        this.need = null;
      }
    } else {
      // A frame arrives in many pipe chunks. Joining and rescanning the whole
      // pending buffer on every chunk is quadratic in chunks per frame, so only
      // the new bytes are searched for an end marker (with the byte before
      // them, for a marker split across two chunks); the join waits for one.
      const ended = d.indexOf(EOI) >= 0 || (this.tail === 0xff && d[0] === 0xd9);
      this.tail = d[d.length - 1];
      if (!ended) {
        this.wake();
        return;
      }
      for (;;) {
        // Each frame runs from its SOI marker to the next EOI; anything before SOI is not a frame.
        const buf = this.joined();
        const start = buf.indexOf(SOI);
        if (start < 0) {
          this.parts = [];
          this.len = 0;
          break;
        }
        const end = buf.indexOf(EOI, start + 2);
        if (end < 0) break;
        this.take(start);
        this.frames.push(this.take(end + 2 - start));
      }
    }
    // Do not let ffmpeg run far ahead of the page.
    if (this.frames.length >= this.ahead) this.proc?.stdout.pause();
    this.wake();
  }

  wake() {
    // Everyone waiting is woken; each re-checks for its frame.
    const w = this.waiters ?? [];
    this.waiters = [];
    for (const r of w) r();
  }

  async read() {
    while (!this.frames.length) {
      if (this.ended) return null;
      await new Promise((r) => (this.waiters ??= []).push(r));
    }
    const f = this.frames.shift();
    if (this.frames.length < Math.ceil(this.ahead / 2)) this.proc?.stdout.resume();
    return f;
  }

  stop() {
    if (this.proc && !this.ended) this.proc.kill();
    this.proc = null;
    this.need = null;
    // Nobody may be left waiting on a decoder that is gone.
    this.ended = true;
    this.wake();
  }
}

/**
 * Starts the host. `routes(req, res, url)` may answer a request first (the
 * preview studio adds its page and reload stream); `port` 0 picks a free one.
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function startHost({ bundleDir, publicDir, frameFormat = "jpeg", frameQuality = 2, routes = null, port = 0 }) {
  const sources = new Map(); // `${page}|${file}` -> FrameSource
  const inside = (root, rel) => {
    const full = path.resolve(root, rel);
    return full === root || full.startsWith(root + path.sep) ? full : null;
  };

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://motion");
      if (routes && (await routes(req, res, url))) return;
      if (url.pathname === "/__frame") {
        const src = url.searchParams.get("src") ?? "";
        const t = Number(url.searchParams.get("t"));
        const fps = Number(url.searchParams.get("fps")) || 60;
        const asked = Math.max(0, Math.round(Number(url.searchParams.get("w")) || 0));
        const page = url.searchParams.get("page") ?? "0";
        if (!src.startsWith("/public/")) throw Object.assign(new Error("frames come from /public only"), { status: 400 });
        const file = inside(publicDir, decodeURIComponent(src.slice("/public/".length)));
        if (!file || !fs.existsSync(file)) throw Object.assign(new Error(`no video ${src}`), { status: 404 });
        // Half the source when that is enough, else the source itself.
        const native = sourceWidth(file);
        const half = Math.round(native / 2);
        const width = asked && Number.isFinite(native) && asked <= half ? half : 0;
        const key = `${page}|${file}|${fps}`;
        let source = sources.get(key);
        if (!source) sources.set(key, (source = new FrameSource(file, fps, { format: frameFormat, quality: frameQuality })));
        const image = await source.at(t, width);
        res.writeHead(200, { "content-type": source.type, "content-length": image.length, "cache-control": "no-store" });
        return res.end(image);
      }

      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      const file = rel.startsWith("public/") ? inside(publicDir, rel.slice("public/".length)) : inside(bundleDir, rel || "index.html");
      if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw Object.assign(new Error(`not found: ${url.pathname}`), { status: 404 });
      const size = fs.statSync(file).size;
      const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
      if (range) {
        const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
        res.writeHead(206, { "content-type": type, "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1 });
        fs.createReadStream(file, { start, end }).pipe(res);
      } else {
        // The bundle changes on every rebuild: revalidate it. Art and media rarely do.
        const cache = rel.startsWith("public/") ? "max-age=3600" : "no-cache";
        res.writeHead(200, { "content-type": type, "content-length": size, "cache-control": cache });
        fs.createReadStream(file).pipe(res);
      }
    } catch (err) {
      if (!res.headersSent) res.writeHead(err.status ?? 500, { "content-type": "text/plain" });
      res.end(String(err.message));
      if (!err.status || err.status >= 500) console.error(`motion host: ${err.message}`);
    }
  });
  server.keepAliveTimeout = 60000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    async close() {
      for (const s of sources.values()) s.stop();
      await new Promise((r) => server.close(r));
      server.closeAllConnections?.();
    },
  };
}
