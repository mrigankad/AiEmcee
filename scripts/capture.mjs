/**
 * Records one video file per captured scene by driving your running app.
 *
 * Every scene gets its own browser context, so each clip lines up against its
 * own narration track.
 *
 * Two capture modes (capture.mode in video.config.mjs):
 *
 *   screencast   (default) the page renders at viewport x deviceScaleFactor
 *                (3840x2160 for a 1080p film at dsf 2). Every composited frame
 *                arrives over CDP with its timestamp, is written to
 *                work/<scene>/frames/, then assembled into a constant-fps
 *                lossless H.264 at raw/<scene>.mp4. See docs/11-quality.md.
 *   recordVideo  Playwright's built-in VP8 recorder at 1x -> raw/<scene>.webm.
 *                Soft; kept for compatibility.
 *
 * Record against a PRODUCTION build. A dev server can render an error overlay,
 * a hydration warning or a hot-reload toast at any moment, and there is no way
 * to get that out of the footage afterwards.
 *
 *   node scripts/capture.mjs [--project dir] [sceneId]
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { at, ensureDir, loadConfig, loadDurations, resetDir, show } from "./lib/config.mjs";
import { Scene, cursorInitScript } from "./lib/scene.mjs";
import { assemble, startScreencast } from "./lib/screencast.mjs";

const { config } = await loadConfig();
const durations = loadDurations(config);
const { SCENES } = await import(pathToFileURL(at(config.paths.scenes)).href);

const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
const outDir = ensureDir(at(config.paths.raw));
const mode = config.capture.mode ?? "screencast";
if (!["screencast", "recordVideo"].includes(mode)) {
  throw new Error(`capture.mode must be "screencast" or "recordVideo", not "${mode}"`);
}

const planned = config.sequence.filter((s) => s.from === "capture" && (!only || s.id === only));

if (!planned.length) {
  // Asking for a scene that is not there is a mistake. Having no captured
  // scenes at all is a legitimate shape of film, so a full build passes through.
  if (only) {
    console.error(`no captured scene called "${only}"`);
    process.exit(1);
  }
  console.log("no captured scenes in the sequence — nothing to record");
  process.exit(0);
}

for (const scene of planned) {
  if (!SCENES[scene.id]) {
    throw new Error(`scenes.mjs has no choreography for "${scene.id}"`);
  }
}

const { viewport, deviceScaleFactor: dsf = 1 } = config.capture;
console.log(
  `recording ${planned.length} scene(s) against ${config.capture.baseUrl}\n` +
    `mode ${mode}, viewport ${viewport.width}x${viewport.height} @ dsf ${dsf}` +
    (mode === "screencast"
      ? ` -> ${viewport.width * dsf}x${viewport.height * dsf} ${config.capture.format ?? "png"} -> ${config.video.fps}fps lossless\n`
      : "\n"),
);

// Imported here, not at the top, so a film made entirely of clips and motion
// never needs Playwright or a downloaded browser installed at all.
const { chromium } = await import("playwright");

// Emulated deviceScaleFactor alone is not enough: Chromium then renders at 2x
// but the screencast hands back frames at CSS-pixel size (measured: 1920x1080
// at dsf 2). A real device scale factor makes it return physical pixels.
const launchArgs = [
  ...config.capture.launchArgs,
  ...(mode === "screencast" && dsf !== 1 ? [`--force-device-scale-factor=${dsf}`] : []),
];
const browser = await chromium.launch({ args: launchArgs });
const initScript = cursorInitScript(config.tokens, config.capture.hide);

// Frame assembly (frames -> lossless H.264) runs behind the next recording,
// so the browser and ffmpeg stop waiting on each other.
const assembling = [];

for (const entry of planned) {
  const id = entry.id;
  const target = durations[id];
  if (!target) throw new Error(`no narration duration for ${id} — run narrate`);

  const scratch = resetDir(path.join(outDir, id));
  const frameDir = mode === "screencast" ? resetDir(at(config.paths.work, id, "frames")) : null;

  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: dsf,
    reducedMotion: "no-preference",
    ...(mode === "recordVideo" ? { recordVideo: { dir: scratch, size: viewport } } : {}),
  });
  await context.addInitScript(initScript);

  const page = await context.newPage();
  // Application logs and errors are the app's business, not the recording's.
  page.on("console", () => {});
  page.on("pageerror", () => {});

  const cast =
    mode === "screencast"
      ? await startScreencast(page, {
          dir: frameDir,
          format: config.capture.format ?? "png",
          quality: config.capture.quality ?? 95,
          width: viewport.width * dsf,
          height: viewport.height * dsf,
        })
      : null;

  const scene = new Scene(page, config);
  const started = Date.now();

  try {
    await SCENES[id](scene);
  } catch (err) {
    // A missed selector should cost one scene, not the whole run. The clip is
    // still written, so you can watch it and see exactly where it went wrong.
    console.warn(`  ! ${id}: ${err.message.split("\n")[0]}`);
  }

  // Hold the final frame until the clip outlasts its narration. Without this
  // the compositor would have to freeze-frame the tail, which looks dead.
  const elapsed = (Date.now() - started) / 1000;
  const pad = Math.max(config.timing.minPad, target + config.timing.tailPad - elapsed);
  await new Promise((r) => setTimeout(r, pad * 1000));

  const verdict = elapsed > target + config.timing.tailPad ? "  (choreography overran)" : "";
  const head =
    `${id.padEnd(18)} narration ${target.toFixed(1)}s  drove ${elapsed.toFixed(1)}s  ` +
    `clip ${(elapsed + pad).toFixed(1)}s${verdict}`;

  if (cast) {
    const shot = await cast.stop();
    await page.close();
    await context.close();

    const dest = path.join(outDir, `${id}.mp4`);
    const t = Date.now();
    console.log(head);
    // Assemble in the background; the next scene starts recording now.
    assembling.push(
      (async () => {
        const stats = await assemble(shot, {
          dest,
          fps: config.video.fps,
          encode: config.capture.intermediate,
          listDir: frameDir,
        });
        fs.rmSync(path.join(outDir, `${id}.webm`), { force: true });
        if (!config.capture.keepFrames) fs.rmSync(path.dirname(frameDir), { recursive: true, force: true });
        console.log(
          `${id.padEnd(18)} ${stats.frames} frames, avg ${stats.captureFps.toFixed(1)}fps, ` +
            `peak ${stats.peakFps}fps -> ${stats.width}x${stats.height}@${config.video.fps} ` +
            `${(stats.bytes / 1048576).toFixed(1)} MB in ${((Date.now() - t) / 1000).toFixed(1)}s  ${show(dest)}`,
        );
      })(),
    );
  } else {
    await page.close();
    await context.close();
    const written = fs.readdirSync(scratch).find((f) => f.endsWith(".webm"));
    if (!written) throw new Error(`playwright wrote no video for ${id}`);
    fs.renameSync(path.join(scratch, written), path.join(outDir, `${id}.webm`));
    fs.rmSync(path.join(outDir, `${id}.mp4`), { force: true });
    console.log(head);
  }
  fs.rmSync(scratch, { recursive: true, force: true });
}

await browser.close();

const encodes = await Promise.allSettled(assembling);
const failed = encodes.filter((r) => r.status === "rejected");
for (const r of failed) console.error(`  ! assembly: ${r.reason?.message ?? r.reason}`);
if (failed.length) process.exit(1);
console.log("\ncapture complete");
