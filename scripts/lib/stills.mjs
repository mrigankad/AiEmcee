/**
 * Still scenes drawn by ffmpeg alone: an image, a slow zoom and pan, and the
 * film's fade, with no browser involved.
 *
 * The camera is the one remotion/src/film/Still.tsx draws (same easing, same
 * clamping), so a still chunk can come from either engine and match. The image
 * is scaled once to cover a 2x canvas and looped in memory; zoompan crops that
 * supersampled canvas straight to the delivered size, so its whole-pixel steps
 * are half a pixel in the frame. (A 2x zoompan output then scaled down is
 * smoother still but 6x slower; 1x is fast and visibly wobbles.)
 *
 * Used by scripts/lib/fast.mjs for body chunks that show a still and nothing
 * else (no title, avatar or transition).
 */
import { spawn } from "node:child_process";

const SS = 2;

/** ffmpeg expression for the still camera at progress `p` (an expression itself). */
function cameraExprs(move, p) {
  const e = move.ease === "linear" ? `(${p})` : `(0.5-0.5*cos(PI*(${p})))`;
  const [z0, z1] = move.zoom;
  const [[x0, y0], [x1, y1]] = move.pan;
  const s = `(${z0}+${z1 - z0}*${e})`;
  const half = `(0.5/${s})`;
  const cx = `clip(${x0}+${x1 - x0}*${e},${half},1-${half})`;
  const cy = `clip(${y0}+${y1 - y0}*${e},${half},1-${half})`;
  return { z: s, x: `(${cx}-${half})*iw`, y: `(${cy}-${half})*ih` };
}

/**
 * Renders frames [chunk.a, chunk.b) of a still scene to an MPEG-TS file.
 * @returns {Promise<void>}
 */
export function renderStillChunk({ chunk, timeline, scene, src, width: W, height: H, profile, dest }) {
  const { fps } = timeline;
  const n = chunk.b - chunk.a;
  // Progress runs over the scene's Sequence (lead included), as in Still.tsx.
  const span = Math.max(1, scene.until - scene.from);
  const offset = -scene.from; // the chunk's first frame, in Sequence frames
  const { z, x, y } = cameraExprs(scene.move, `(on+${offset})/${span}`);

  const total = Math.round(timeline.total * fps);
  const fadeInF = Math.round(timeline.fadeIn * fps);
  const fadeOutF = Math.round(timeline.fadeOut * fps);
  const fades = [];
  if (fadeInF > 0 && chunk.a < fadeInF) fades.push(`fade=t=in:s=0:n=${fadeInF - chunk.a}`);
  if (fadeOutF > 0 && chunk.b > total - fadeOutF) fades.push(`fade=t=out:s=${Math.max(0, total - fadeOutF - chunk.a)}:n=${fadeOutF}`);

  const graph = [
    `scale=${W * SS}:${H * SS}:force_original_aspect_ratio=increase:flags=lanczos:out_color_matrix=bt601:out_range=pc`,
    `crop=${W * SS}:${H * SS}`,
    "format=yuv420p",
    `loop=loop=${n}:size=1:start=0`,
    `zoompan=z='${z}':x='${x}':y='${y}':d=1:s=${W}x${H}:fps=${fps}`,
    ...fades,
  ].join(",");

  const args = [
    "-hide_banner", "-loglevel", "error",
    "-i", src,
    "-vf", graph,
    "-frames:v", String(n),
    "-r", String(fps),
    "-c:v", "libx264", "-preset", profile.x264Preset, "-crf", String(profile.crf),
    "-pix_fmt", "yuv420p",
    // Match the motion engine's JPEG-fed chunks exactly: BT.601 full range. The master
    // converts the joined film to BT.709 limited range once (compose.mjs).
    "-color_range", "pc", "-colorspace", "bt470bg",
    "-an", "-f", "mpegts", "-y", dest,
  ];

  return new Promise((resolve, reject) => {
    const run = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    run.stderr.on("data", (d) => (err += d));
    run.on("error", reject);
    run.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg still failed for ${chunk.name}\n${err}`))));
  });
}
