/**
 * The polish gate: stills for review, and the poster frame.
 *
 * Before anyone watches the film, look at it frozen. /brag's rule, kept here:
 * check a settled frame of every scene *and* a frame from the middle of every
 * transition, every title and every focus move — that is where overflow,
 * collisions, muddy double exposures and low contrast hide.
 *
 * Writes out/review/: one JPEG per moment, index.json describing each, and
 * contact-sheet.jpg with all of them tiled and labelled.
 */
import fs from "node:fs";
import path from "node:path";

import { ff } from "./ffmpeg.mjs";

const TILE_W = 400;
const TILE_H = 225;
const COLS = 4;

/** Every moment worth freezing, in film seconds. */
export function reviewMoments(timeline) {
  const moments = [];
  const push = (t, kind, id, note = "") =>
    moments.push({ t: +Math.max(0, Math.min(timeline.total - 0.05, t)).toFixed(3), kind, id, note });

  for (const seg of timeline.segments) {
    if (seg.lead > 0) push(seg.start - seg.lead / 2, "transition", seg.id, seg.transition.type);
    push(seg.start + Math.min(2.2, seg.slot * 0.5), "settled", seg.id);
    if (seg.lowerThird) push(seg.start + seg.lowerThird.at + 1.1, "title", seg.id, seg.lowerThird.title);
    for (const f of seg.focus) {
      const settled = Math.min(f.until - 0.2, f.at + timeline.tone.focus.ease + 0.35);
      push(seg.start - seg.lead + settled, "focus", seg.id, f.label ?? "");
    }
  }
  return moments.sort((a, b) => a.t - b.t);
}

/** Extracts every review moment from the rendered (silent) film, and tiles them. */
export function writeReview({ film, timeline, outDir }) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const moments = reviewMoments(timeline);
  moments.forEach((m, i) => {
    m.file = `${String(i + 1).padStart(3, "0")}-${m.kind}-${m.id}.jpg`;
    ff(["-ss", m.t.toFixed(3), "-i", film, "-frames:v", "1", "-q:v", "3", "-y", path.join(outDir, m.file)]);
  });
  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(moments, null, 2));

  // Sequential copies for the tiler; labelled so a sheet reads on its own.
  const tiles = path.join(outDir, ".tiles");
  fs.mkdirSync(tiles, { recursive: true });
  moments.forEach((m, i) => {
    const label = `${m.t.toFixed(1)}s  ${m.kind}  ${m.id}`.replace(/[':\\]/g, "");
    ff([
      "-i", path.join(outDir, m.file),
      "-vf",
      `scale=${TILE_W}:${TILE_H},drawbox=y=0:w=iw:h=26:color=black@0.62:t=fill,` +
        `drawtext=text='${label}':x=8:y=6:fontsize=15:fontcolor=white`,
      "-y", path.join(tiles, `${String(i).padStart(3, "0")}.png`),
    ]);
  });
  const rows = Math.ceil(moments.length / COLS);
  const sheet = path.join(outDir, "contact-sheet.jpg");
  ff([
    "-framerate", "1",
    "-i", path.join(tiles, "%03d.png"),
    "-vf", `tile=${COLS}x${rows}:padding=6:margin=6:color=0x202020`,
    "-frames:v", "1",
    "-q:v", "3",
    "-y", sheet,
  ]);
  fs.rmSync(tiles, { recursive: true, force: true });

  return { sheet, count: moments.length };
}

/**
 * Where the poster frame comes from: `poster: { scene, at }` in the config
 * (seconds after that scene's narration starts), else the first focus move's
 * settled frame, else the first titled scene with its title fully in.
 */
export function posterTime(config, timeline) {
  const segs = timeline.segments;
  if (config.poster?.scene) {
    const seg = segs.find((s) => s.id === config.poster.scene);
    if (!seg) throw new Error(`poster.scene "${config.poster.scene}" is not in the sequence`);
    return seg.start + (config.poster.at ?? Math.min(2.5, seg.slot / 2));
  }
  const focused = segs.find((s) => s.focus.length);
  if (focused) {
    const f = focused.focus[0];
    return focused.start - focused.lead + Math.min(f.until - 0.2, f.at + timeline.tone.focus.ease + 0.4);
  }
  const titled = segs.find((s) => s.lowerThird);
  if (titled) return titled.start + titled.lowerThird.at + 1.2;
  return Math.min(timeline.total / 3, 8);
}
