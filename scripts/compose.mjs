/**
 * Assembles the finished film.
 *
 * The rule that makes this work is unchanged: every scene owns exactly
 * `narration + gap` seconds, and both the picture and the sound are built from
 * those same numbers. The whole film is one composition (remotion/src/film), so scenes
 * can transition into each other, titles can animate, and the camera can move
 * inside product footage.
 *
 *   timeline   config + durations.json -> work/timeline.json (the one clock)
 *   stage      footage into remotion/public/<film | projects/<name>>/media/
 *   picture    AiEmcee Motion renders the Film, silent, PNG frames -> work/film.mp4
 *   sound      narration + ducked music bed + effects, loudness-normalised
 *   master     mux, poster baked in as frame 0 -> out/<name>.mp4 + .jpg
 *   review     stills of every scene, transition, title and focus move
 *
 *   node scripts/compose.mjs [--project dir]
 *     --sound-only   reuse work/film.mp4; remix and remaster
 *     --master 4k    render the composition at 2x (3840x2160) -> out/<name>-4k.mp4
 *     --fast         the fast engine (scripts/lib/fast.mjs): cached, parallel
 *                    chunks, JPEG frames, x264 veryfast/faster. Same output path.
 *     --draft        fast engine at 720p and draft quality -> out/<name>-draft.mp4
 *     --if-changed   with --fast/--draft: do nothing when the delivered film
 *                    is already up to date with every input (used by `batch`)
 *     --preview <scene>   draft of one scene and its two seams only, with its slice
 *                    of the soundtrack -> out/preview-<scene>.mp4 (no master, no review)
 *   `render.mode: "fast" | "draft"` in the config makes the fast engine the default.
 */
import fs from "node:fs";
import path from "node:path";

import { at, ensureDir, IS_PROJECT, loadConfig, loadDurations, PROJECT_NAME, resetDir, show } from "./lib/config.mjs";
import { describeVideo, ff, ffprobeJson, probe } from "./lib/ffmpeg.mjs";
import { REMOTION_DIR } from "./lib/remotion.mjs";
import { posterTime, writeReview } from "./lib/review.mjs";
import { mixSoundtrackAsync } from "./lib/sound-worker.mjs";
import { buildTimeline } from "./lib/timeline.mjs";
import { filmKey, pickMode, profileFor, renderFast, TO_BT709 } from "./lib/fast.mjs";

const args = process.argv.slice(2);
const soundOnly = args.includes("--sound-only");
const masterArg = args.find((a) => a.startsWith("--master"));
const master4k =
  (masterArg === "--master" ? args[args.indexOf(masterArg) + 1] : masterArg?.split("=")[1])?.toLowerCase() === "4k";

const ifChanged = args.includes("--if-changed");
const composeStarted = Date.now();

const { config, narrationById } = await loadConfig();
const previewAt = args.indexOf("--preview");
const previewId = previewAt >= 0 ? args[previewAt + 1] : null;
const mode = previewId ? "draft" : pickMode(args, config);
const profile = mode ? profileFor(mode, config) : null;
const durations = loadDurations(config);

// A full compose rebuilds everything in work/ except capture frames; --sound-only keeps the picture.
const workDir = ensureDir(at(config.paths.work));
const soundDir = resetDir(path.join(workDir, "sound"));
const outFile = mode === "draft"
  ? at(config.output).replace(/\.mp4$/i, "-draft.mp4")
  : master4k ? at(config.output).replace(/\.mp4$/i, "-4k.mp4") : at(config.output);
ensureDir(path.dirname(outFile));

const film = path.join(workDir, mode === "draft" ? "film-draft.mp4" : master4k ? "film-4k.mp4" : "film.mp4");
const pixfmt = ["-pix_fmt", "yuv420p", "-movflags", "+faststart"];

/* ---------------------------------------------------------------- */
/* Timeline                                                          */
/* ---------------------------------------------------------------- */
// Each project stages into its own folder of the shared public dir, so two
// films never overwrite each other's media.
const base = IS_PROJECT ? `projects/${PROJECT_NAME}` : "film";
const { timeline, media } = buildTimeline(config, durations, narrationById, { base });
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

const scale = (master4k ? 2 : 1) * (profile?.scale ?? 1);
const stampFile = path.join(workDir, `stamp-${mode ?? "default"}${master4k ? "-4k" : ""}.json`);
const stampFor = async () => {
  const { key } = await renderFast({ config, timeline, media, film, workDir, profile, scale, dryRun: true });
  return filmKey({ pictureKey: key, config, timeline, profile, outFile, ttsDir: at(config.paths.tts) });
};
if (ifChanged && mode) {
  const stamp = await stampFor();
  const prev = fs.existsSync(stampFile) ? JSON.parse(fs.readFileSync(stampFile, "utf8")).key : null;
  if (prev === stamp && fs.existsSync(outFile)) {
    console.log(`\nup to date  ${show(outFile)}  (nothing changed since the last ${mode} render)`);
    process.exit(0);
  }
}

/* ---------------------------------------------------------------- */
/* Sound, started now on its own thread: it reads only the timeline,   */
/* so it mixes while the picture renders instead of after it.          */
/* ---------------------------------------------------------------- */
const soundStarted = Date.now();
let soundSeconds = null;
const mixing = mixSoundtrackAsync({ config, timeline, workDir: soundDir, dest: path.join(soundDir, "mix.wav") }).then((m) => {
  soundSeconds = (Date.now() - soundStarted) / 1000;
  return m;
});
mixing.catch(() => {}); // surfaced where it is awaited

/* ---------------------------------------------------------------- */
/* Picture                                                           */
/* ---------------------------------------------------------------- */
let renderSeconds = null;
let fastResult = null;
if (!soundOnly) {
  const stageDir = resetDir(path.join(REMOTION_DIR, "public", ...base.split("/")));
  ensureDir(path.join(stageDir, "media"));
  for (const { from, to } of media) {
    const dest = path.join(REMOTION_DIR, "public", to);
    try {
      fs.linkSync(from, dest); // same volume: instant, no copy
    } catch {
      fs.copyFileSync(from, dest);
    }
  }
  // The scene preview reads film/timeline.json; renders get the timeline as
  // props and the project's tokens through the page's environment (lib/motion).
  fs.writeFileSync(path.join(stageDir, "timeline.json"), JSON.stringify(timeline));

  if (mode) {
    console.log(
      `\npicture  ${mode} engine: ${timeline.total.toFixed(2)}s at ${timeline.fps}fps, ` +
        `${Math.round(timeline.width * scale)}x${Math.round(timeline.height * scale)}, ${profile.imageFormat} q${profile.jpegQuality}, ` +
        `crf ${profile.crf} ${profile.x264Preset} -> ${show(film)}`,
    );
    if (previewId) {
      const k = timeline.segments.findIndex((sg) => sg.id === previewId);
      if (k < 0) throw new Error(`--preview: no scene "${previewId}" in the sequence`);
      const select = (c) => c.seg === k || (c.kind === "join" && c.seg === k - 1);
      const clip = path.join(workDir, `preview-${previewId}.mp4`);
      const r = await renderFast({ config, timeline, media, film: clip, workDir, profile, scale, select });
      const picked = r.chunks.filter(select);
      const from = picked[0].a / timeline.fps;
      const dur = picked.reduce((t, c) => t + (c.b - c.a), 0) / timeline.fps;
      const mixed = await mixing;
      const dest = at(path.dirname(config.output), `preview-${previewId}.mp4`);
      ff(["-i", clip, "-ss", from.toFixed(3), "-t", dur.toFixed(3), "-i", mixed.file, "-map", "0:v", "-map", "1:a",
        "-c:v", "copy", ...config.encode.audio, "-shortest", "-movflags", "+faststart", "-y", dest]);
      console.log(`
preview  ${previewId}  ${from.toFixed(2)}s +${dur.toFixed(2)}s  ${r.rendered} rendered, ${r.reused} reused  ${((Date.now() - composeStarted) / 1000).toFixed(1)}s  ->  ${show(dest)}`);
      process.exit(0);
    }
    fastResult = await renderFast({ config, timeline, media, film, workDir, profile, scale });
    renderSeconds = fastResult.seconds;
    console.log(`picture  done in ${renderSeconds.toFixed(0)}s (${fastResult.rendered} rendered, ${fastResult.reused} reused)`);
  } else {
    const master = profileFor("master", config);
    console.log(
      `\npicture  rendering ${timeline.total.toFixed(2)}s at ${timeline.fps}fps, ` +
        `${timeline.width * scale}x${timeline.height * scale}, ${master.imageFormat} frames, crf ${master.crf} ${master.x264Preset} -> ${show(film)}`,
    );
    const result = await renderFast({ config, timeline, media, film, workDir, profile: master, scale });
    renderSeconds = result.seconds;
    console.log(`picture  done in ${renderSeconds.toFixed(0)}s (${result.rendered} rendered, ${result.reused} reused)`);
  }
} else if (!fs.existsSync(film)) {
  throw new Error(`--sound-only needs a previous render at ${show(film)}`);
}

/* ---------------------------------------------------------------- */
/* Sound                                                             */
/* ---------------------------------------------------------------- */
const mix = await mixing;
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
const bake = config.poster?.bake !== false;
// Fast engine, no poster to bake, every chunk from one encoder: the picture is already final.
const copyVideo = Boolean(mode && !bake && (fastResult?.homogeneous ?? false));
// The fast engine's picture is BT.601 full range (the JPEG frame path); convert it once, here.
const filmStream = ffprobeJson(film).streams.find((st) => st.codec_type === "video");
const fullRange = filmStream?.color_range === "pc" || filmStream?.pix_fmt === "yuvj420p";
const toBt709 = fullRange ? `,${TO_BT709}` : "";
const masterStarted = Date.now();
ff([
  "-i", film,
  "-i", mix.file,
  ...(bake ? ["-i", posterFile] : []),
  ...(bake
    ? ["-filter_complex", `[0:v][2:v]overlay=enable='eq(n,0)'${toBt709}[v]`, "-map", "[v]"]
    : toBt709 && !copyVideo
      ? ["-filter_complex", `[0:v]${TO_BT709}[v]`, "-map", "[v]"]
      : ["-map", "0:v"]),
  "-map", "1:a",
  ...(copyVideo
    ? ["-c:v", "copy", "-movflags", "+faststart"]
    : [
        ...(mode ? profile.final : config.encode.final),
        "-r", String(timeline.fps),
        ...pixfmt,
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
      ]),
  ...config.encode.audio,
  "-shortest",
  "-y", outFile,
]);
const masterSeconds = (Date.now() - masterStarted) / 1000;

/* ---------------------------------------------------------------- */
/* Review                                                            */
/* ---------------------------------------------------------------- */
const reviewStarted = Date.now();
const reviewDir = at(path.dirname(config.output), mode === "draft" ? "review-draft" : "review");
const review = writeReview({ film, timeline, outDir: reviewDir });
const reviewSeconds = (Date.now() - reviewStarted) / 1000;

if (mode) {
  fs.writeFileSync(stampFile, JSON.stringify({ key: await stampFor(), at: new Date().toISOString(), out: show(outFile) }));
}

const picture = probe(film);
const drift = Math.abs(picture - mix.duration);
const info = describeVideo(outFile);

console.log(
  `\nvideo    ${picture.toFixed(2)}s` +
    `\naudio    ${mix.duration.toFixed(2)}s` +
    `\ndrift    ${drift.toFixed(3)}s${drift > 0.1 ? "   <- check the timeline" : ""}` +
    `\nfinal    ${show(outFile)}` +
    `\nmaster   ${info.text}` +
    `\ntimes    ${renderSeconds != null ? `render ${renderSeconds.toFixed(1)}s, ` : ""}sound ${soundSeconds.toFixed(1)}s (in parallel), ` +
      `master ${copyVideo ? "copy" : "encode"} ${masterSeconds.toFixed(1)}s, review ${reviewSeconds.toFixed(1)}s, ` +
      `total ${((Date.now() - composeStarted) / 1000).toFixed(1)}s` +
    `\nposter   ${posterAt.toFixed(2)}s  ->  ${show(posterFile)}${bake ? " (baked as frame 0)" : ""}` +
    `\nreview   ${review.count} stills  ->  ${show(review.sheet)}`,
);
