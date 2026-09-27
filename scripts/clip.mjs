/**
 * Cuts scene footage out of an existing recording, instead of driving a live
 * app with Playwright.
 *
 * Use this when the product's footage already exists — a screen recording, an
 * older demo, a stakeholder's Loom — and re-recording it is not on the table.
 * A `from: "clip"` sequence entry names a source file and an in-point; this
 * writes the segment to `raw/<id>.mp4`, which is exactly where compose.mjs
 * looks for it. Nothing downstream knows the difference.
 *
 * The metronome rule still holds. Each clip is cut to `narration + gap + tailPad`
 * so compose.mjs always has enough footage to trim to the exact target, and
 * never has to freeze-frame the tail.
 *
 *   npm run clip            all clip scenes
 *   npm run clip -- 05-pdi  just that one
 */
import fs from "node:fs";
import path from "node:path";

import { at, ensureDir, loadConfig, loadDurations } from "./lib/config.mjs";
import { ff, probe } from "./lib/ffmpeg.mjs";

const { config } = await loadConfig();
const durations = loadDurations(config);

const { width: W, height: H, fps: FPS } = config.video;
const { gap, tailPad } = config.timing;

const only = process.argv[2];
const rawDir = ensureDir(at(config.paths.raw));

const scenes = config.sequence.filter((s) => s.from === "clip" && (!only || s.id === only));

if (!scenes.length) {
  console.log(only ? `no clip scene "${only}" in the sequence` : "no clip scenes in the sequence");
  process.exit(0);
}

for (const entry of scenes) {
  const { src, start = 0, end, speed = 1 } = entry.clip ?? {};
  if (!src) throw new Error(`${entry.id}: clip scene needs clip.src`);

  const source = at(src);
  if (!fs.existsSync(source)) throw new Error(`${entry.id}: clip source not found — ${src}`);

  /* How much footage compose.mjs will want, plus the pad that keeps it from
     ever running out and cloning a frame. */
  const need = durations[entry.id] + gap + tailPad;

  /* How much footage actually exists between the in and out points, and what
     that becomes once `speed` is applied. speed 0.8 = 25% more screen time. */
  const available = (end ?? probe(source)) - start;
  const yields = available / speed;

  if (yields < need - 0.05) {
    console.log(
      `  warn  ${entry.id}: ${available.toFixed(1)}s of source at ${speed}x yields ` +
        `${yields.toFixed(1)}s, but the line needs ${need.toFixed(1)}s`,
    );
  }

  /* Take only what is needed, from the source's own timeline. */
  const take = Math.min(available, need * speed);
  const dst = path.join(rawDir, `${entry.id}.mp4`);

  ff([
    "-ss", start.toFixed(3),
    "-t", take.toFixed(3),
    "-i", source,
    "-vf",
    `setpts=${(1 / speed).toFixed(4)}*PTS,scale=${W}:${H}:flags=lanczos,fps=${FPS},format=yuv420p`,
    "-an",
    ...config.encode.intermediate,
    "-pix_fmt", "yuv420p",
    "-y", dst,
  ]);

  const got = probe(dst);
  console.log(
    `cut   ${entry.id.padEnd(16)} ${start.toFixed(1)}s +${take.toFixed(1)}s` +
      `${speed === 1 ? "" : ` @${speed}x`}` +
      `  -> ${got.toFixed(1)}s   (line ${durations[entry.id].toFixed(1)}s)`,
  );
}
