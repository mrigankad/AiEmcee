/**
 * Assembles the finished film.
 *
 * The rule that makes this work is unchanged: every scene owns exactly
 * `narration + gap` seconds, and both the picture and the sound are built from
 * those same numbers. What changed is where the picture is made. Instead of
 * cutting clips with ffmpeg and stream-joining them, the whole film is one
 * Remotion composition, so scenes can transition into each other, titles can
 * animate, and the camera can move inside product footage.
 *
 *   timeline   config + durations.json -> work/timeline.json (the one clock)
 *   stage      footage + timeline into remotion/public/film/
 *   picture    Remotion renders the Film, silent -> work/film.mp4
 *   sound      narration + ducked music bed + effects, loudness-normalised
 *   master     mux, poster baked in as frame 0 -> out/<name>.mp4 + .jpg
 *   review     stills of every scene, transition, title and focus move
 *
 *   npm run compose                  everything
 *   npm run compose -- --sound-only  reuse work/film.mp4; remix and remaster
 */
import fs from "node:fs";
import path from "node:path";

import { at, ensureDir, loadConfig, loadDurations, resetDir } from "./lib/config.mjs";
import { ff, probe } from "./lib/ffmpeg.mjs";
import { ENTRY, REMOTION_DIR, rel, remotion } from "./lib/remotion.mjs";
import { posterTime, writeReview } from "./lib/review.mjs";
import { mixSoundtrack } from "./lib/sound.mjs";
import { buildTimeline } from "./lib/timeline.mjs";

const soundOnly = process.argv.includes("--sound-only");

const { config, narrationById } = await loadConfig();
const durations = loadDurations(config);

// A full compose rebuilds everything in work/; --sound-only keeps the picture.
const workDir = soundOnly ? ensureDir(at(config.paths.work)) : resetDir(at(config.paths.work));
const soundDir = resetDir(path.join(workDir, "sound"));
const outFile = at(config.output);
ensureDir(path.dirname(outFile));

const film = path.join(workDir, "film.mp4");
const pixfmt = ["-pix_fmt", "yuv420p", "-movflags", "+faststart"];

/* ---------------------------------------------------------------- */
/* Timeline                                                          */
/* ---------------------------------------------------------------- */
const { timeline, media } = buildTimeline(config, durations, narrationById);
fs.writeFileSync(path.join(workDir, "timeline.json"), JSON.stringify(timeline, null, 2));

console.log(`tone     ${timeline.tone.name} — ${timeline.tone.about}`);
for (const seg of timeline.segments) {
  const tr = seg.lead > 0 ? `${seg.transition.type} ${seg.lead.toFixed(2)}s` : "cut";
  const extras = [
    seg.lowerThird ? `title "${seg.lowerThird.kicker}"` : null,
    seg.focus.length ? `${seg.focus.length} focus` : null,
  ].filter(Boolean);
  console.log(
    `  ${seg.id.padEnd(17)} ${seg.start.toFixed(2).padStart(7)}s  +${seg.slot.toFixed(2)}s  ` +
      `${tr.padEnd(12)} ${extras.join(", ")}`,
  );
}

/* ---------------------------------------------------------------- */
/* Picture                                                           */
/* ---------------------------------------------------------------- */
if (!soundOnly) {
  const stageDir = resetDir(path.join(REMOTION_DIR, "public", "film"));
  ensureDir(path.join(stageDir, "media"));
  for (const { from, to } of media) {
    const dest = path.join(REMOTION_DIR, "public", to);
    try {
      fs.linkSync(from, dest); // same volume: instant, no copy
    } catch {
      fs.copyFileSync(from, dest);
    }
  }
  fs.writeFileSync(path.join(stageDir, "timeline.json"), JSON.stringify(timeline));

  console.log(`\npicture  rendering ${timeline.total.toFixed(2)}s at ${timeline.fps}fps -> work/film.mp4`);
  const started = Date.now();
  remotion(["render", ENTRY, "Film", rel(film), "--codec=h264", "--crf=16", "--muted"]);
  console.log(`picture  done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
} else if (!fs.existsSync(film)) {
  throw new Error("--sound-only needs a previous render at work/film.mp4");
}

/* ---------------------------------------------------------------- */
/* Sound                                                             */
/* ---------------------------------------------------------------- */
const mix = mixSoundtrack({ config, timeline, workDir: soundDir, dest: path.join(soundDir, "mix.wav") });
console.log(
  `\nsound    ${timeline.audio.narration.length} lines, ${mix.effects} effects` +
    `${mix.music ? ", music bed (ducked)" : ""}  ->  ${mix.loudness.toFixed(1)} LUFS`,
);

/* ---------------------------------------------------------------- */
/* Master, with the poster baked in as frame 0                       */
/* ---------------------------------------------------------------- */
const posterFile = outFile.replace(/\.mp4$/i, ".jpg");
const posterAt = posterTime(config, timeline);
ff(["-ss", posterAt.toFixed(3), "-i", film, "-frames:v", "1", "-q:v", "2", "-y", posterFile]);

// Replace frame 0 rather than adding one, so duration and sync are untouched.
// Every platform's idle thumbnail is then the strongest settled frame, not a
// black fade-in.
const bake = config.poster?.bake !== false;
ff([
  "-i", film,
  "-i", mix.file,
  ...(bake ? ["-i", posterFile] : []),
  ...(bake
    ? ["-filter_complex", "[0:v][2:v]overlay=enable='eq(n,0)'[v]", "-map", "[v]"]
    : ["-map", "0:v"]),
  "-map", "1:a",
  ...config.encode.final,
  ...pixfmt,
  ...config.encode.audio,
  "-shortest",
  "-y", outFile,
]);

/* ---------------------------------------------------------------- */
/* Review                                                            */
/* ---------------------------------------------------------------- */
const reviewDir = at(path.dirname(config.output), "review");
const review = writeReview({ film, timeline, outDir: reviewDir });

const picture = probe(film);
const drift = Math.abs(picture - mix.duration);

console.log(
  `\nvideo    ${picture.toFixed(2)}s` +
    `\naudio    ${mix.duration.toFixed(2)}s` +
    `\ndrift    ${drift.toFixed(3)}s${drift > 0.1 ? "   <- check the timeline" : ""}` +
    `\nfinal    ${probe(outFile).toFixed(2)}s  ->  ${config.output}` +
    `\nposter   ${posterAt.toFixed(2)}s  ->  ${path.relative(at(), posterFile).split(path.sep).join("/")}` +
    `${bake ? " (baked as frame 0)" : ""}` +
    `\nreview   ${review.count} stills  ->  ${path.relative(at(), review.sheet).split(path.sep).join("/")}`,
);
