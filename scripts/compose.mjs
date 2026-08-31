/**
 * Assembles the finished film from captures, Remotion clips and narration.
 *
 * The rule that makes this work: every scene is cut to exactly
 * `narration + gap` seconds, and the audio track is built from the same
 * numbers in the same order. Two timelines built from one source of truth
 * cannot drift, so no per-scene sync fixing is ever needed.
 *
 * Pipeline per scene:
 *   normalise  scale + fps + pad/trim to the exact target length
 *   title      optional lower third composited over the top
 *   concat     stream-copy join, which is why every clip must match exactly
 *   mux        narration laid over the silent cut, with fades top and tail
 */
import fs from "node:fs";
import path from "node:path";

import { at, ensureDir, loadConfig, loadDurations, posix, resetDir } from "./lib/config.mjs";
import { ff, probe, silence, toWav } from "./lib/ffmpeg.mjs";

const { config } = await loadConfig();
const durations = loadDurations(config);

const { width: W, height: H, fps: FPS } = config.video;
const { gap, endHold, introTail, fadeIn, fadeOut } = config.timing;

const workDir = resetDir(at(config.paths.work));
const outFile = at(config.output);
ensureDir(path.dirname(outFile));

const pixfmt = ["-pix_fmt", "yuv420p", "-movflags", "+faststart"];
const INTERMEDIATE = [...config.encode.intermediate, ...pixfmt];

/**
 * Force a clip to exactly `target` seconds at the pipeline's frame size and
 * rate. Short clips hold their last frame (tpad); long clips are trimmed.
 * Uniformity here is what lets the concat step stream-copy instead of
 * re-encoding every scene a second time.
 */
function normalise(src, dst, target, label) {
  const have = probe(src);
  const pad =
    have < target
      ? `,tpad=stop_mode=clone:stop_duration=${(target - have + 0.5).toFixed(2)}`
      : "";

  ff([
    "-i", src,
    "-vf", `scale=${W}:${H}:flags=lanczos,fps=${FPS},format=yuv420p${pad}`,
    "-t", target.toFixed(3),
    "-an",
    ...INTERMEDIATE,
    "-y", dst,
  ]);

  console.log(`${label.padEnd(18)} ${have.toFixed(1)}s -> ${target.toFixed(1)}s`);
  return dst;
}

/** Composite a transparent lower-third PNG over a clip, fading it in and out. */
function overlayTitle(src, png, dst) {
  const hold = 2.5;
  ff([
    "-i", src,
    "-loop", "1", "-t", String(hold), "-i", png,
    "-filter_complex",
    "[1:v]format=rgba," +
      "fade=t=in:st=0.35:d=0.25:alpha=1," +
      `fade=t=out:st=${(hold - 0.35).toFixed(2)}:d=0.3:alpha=1[lt];` +
      "[0:v][lt]overlay=0:0:format=auto:eof_action=pass",
    "-t", probe(src).toFixed(3),
    ...INTERMEDIATE,
    "-y", dst,
  ]);
  return dst;
}

/** Where a sequence entry's source clip lives on disk. */
function sourceFor(entry) {
  if (entry.from === "motion") {
    if (!entry.composition) throw new Error(`${entry.id}: motion scene needs a "composition"`);
    return at(config.paths.motion, `${entry.composition.toLowerCase()}.mp4`);
  }
  return at(config.paths.raw, `${entry.id}.webm`);
}

const videoParts = [];
const audioParts = [];

/* ---------------------------------------------------------------- */
/* Intro sting — keeps its own audio, then a beat of silence          */
/* ---------------------------------------------------------------- */
if (config.intro) {
  const src = at(config.intro.src);
  if (!fs.existsSync(src)) throw new Error(`intro asset missing: ${config.intro.src}`);

  const have = probe(src);
  videoParts.push(normalise(src, path.join(workDir, "00-intro.mp4"), have + introTail, "00-intro"));
  audioParts.push(toWav(src, path.join(workDir, "00-intro.wav"), have));
  audioParts.push(silence(introTail, path.join(workDir, "00-intro-gap.wav")));
}

/* ---------------------------------------------------------------- */
/* Scenes                                                            */
/* ---------------------------------------------------------------- */
for (const entry of config.sequence) {
  const src = sourceFor(entry);
  if (!fs.existsSync(src)) {
    const how = entry.from === "motion" ? "npm run motion" : "npm run capture";
    throw new Error(`missing clip for ${entry.id}: ${path.relative(at(), src)}\n  run \`${how}\``);
  }

  const target = durations[entry.id] + gap;
  let dst = normalise(src, path.join(workDir, `${entry.id}.mp4`), target, entry.id);

  if (entry.lowerThird) {
    const png = at(config.paths.motion, `lt-${entry.id}.png`);
    if (!fs.existsSync(png)) {
      throw new Error(`lower third not rendered for ${entry.id} — run \`npm run motion\``);
    }
    const titled = overlayTitle(dst, png, path.join(workDir, `${entry.id}-titled.mp4`));
    fs.renameSync(titled, dst);
    console.log(`${"".padEnd(18)} + lower third "${entry.lowerThird.kicker}"`);
  }

  videoParts.push(dst);
  audioParts.push(toWav(at(config.paths.tts, `${entry.id}.mp3`), path.join(workDir, `${entry.id}.wav`)));
  audioParts.push(silence(gap, path.join(workDir, `${entry.id}-gap.wav`)));
}

/* ---------------------------------------------------------------- */
/* End card — silent by design, so the last line can land            */
/* ---------------------------------------------------------------- */
if (config.outro) {
  const src = at(config.paths.motion, `${config.outro.composition.toLowerCase()}.mp4`);
  if (!fs.existsSync(src)) throw new Error(`end card not rendered — run \`npm run motion\``);

  videoParts.push(normalise(src, path.join(workDir, "zz-endcard.mp4"), endHold, "zz-endcard"));
  audioParts.push(silence(endHold, path.join(workDir, "zz-endcard.wav")));
}

/* ---------------------------------------------------------------- */
/* Join, then mux                                                    */
/* ---------------------------------------------------------------- */
const writeList = (files, dest) => {
  fs.writeFileSync(dest, files.map((f) => `file '${posix(f)}'`).join("\n"));
  return dest;
};

const narrationWav = path.join(workDir, "narration.wav");
ff([
  "-f", "concat", "-safe", "0",
  "-i", writeList(audioParts, path.join(workDir, "audio.txt")),
  "-c", "copy", "-y", narrationWav,
]);

const silentCut = path.join(workDir, "silent.mp4");
ff([
  "-f", "concat", "-safe", "0",
  "-i", writeList(videoParts, path.join(workDir, "video.txt")),
  "-c", "copy", "-y", silentCut,
]);

const total = probe(silentCut);

ff([
  "-i", silentCut,
  "-i", narrationWav,
  "-vf", `fade=t=in:st=0:d=${fadeIn},fade=t=out:st=${(total - fadeOut).toFixed(2)}:d=${fadeOut}`,
  "-af", `afade=t=in:st=0:d=0.4,afade=t=out:st=${(total - 1.0).toFixed(2)}:d=1.0`,
  ...config.encode.final,
  ...pixfmt,
  ...config.encode.audio,
  // Guards against a rounding-level mismatch between the two timelines
  // becoming a frame of black or a tail of silence.
  "-shortest",
  "-y", outFile,
]);

const drift = Math.abs(probe(narrationWav) - total);

console.log(
  `\nvideo   ${total.toFixed(2)}s` +
    `\naudio   ${probe(narrationWav).toFixed(2)}s` +
    `\ndrift   ${drift.toFixed(3)}s${drift > 0.15 ? "   <- check for a missing scene" : ""}` +
    `\nfinal   ${probe(outFile).toFixed(2)}s  ->  ${config.output}`,
);
