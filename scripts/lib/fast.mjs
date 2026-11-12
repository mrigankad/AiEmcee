/**
 * The fast picture engine: `compose --fast` / `--draft`, or `render.mode` in the config.
 *
 * The default engine renders the whole Film in one pass: PNG frames, crf 12,
 * then a slow x264 master on top. Correct, and slow. This one renders the same
 * Film composition, frame for frame, but in pieces:
 *
 *   plan     the film is cut into chunks on the timeline's own seams: each
 *            scene's settled body, and each transition between two scenes
 *   key      every chunk is keyed by a hash of what it can show: its scenes
 *            (with times made relative to the chunk), their media files, the
 *            titles and avatar inside it, the tone, the scene and engine code, the
 *            render profile. Timing shifts elsewhere in the film do not change it.
 *   reuse    a chunk whose key is already in work/chunks/ is not rendered again,
 *            so changing one scene re-renders that scene and its two seams
 *   render   missing chunks render on AiEmcee Motion (scripts/lib/motion/):
 *            one esbuild bundle, one Chromium, a page per core; every chunk is
 *            cut into pieces so all pages stay busy; JPEG frames, x264 veryfast.
 *            A still scene with nothing drawn over it skips the browser
 *            entirely and is drawn by ffmpeg (scripts/lib/stills.mjs)
 *   join     chunks are MPEG-TS, so they concatenate with a stream copy
 *
 * The output is work/film.mp4, exactly what the default engine writes, so the
 * sound, master and review steps downstream do not know the difference.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureDir, posix } from "./config.mjs";
import { ff } from "./ffmpeg.mjs";
import { motionBundle } from "./motion/bundle.mjs";
import { openMotion, pagePool, renderSplit, selectComposition } from "./motion/render.mjs";
import { assertScenesInstalled, REMOTION_DIR } from "./remotion.mjs";
import { renderStillChunk } from "./stills.mjs";

/**
 * Render profiles. `render.fast` / `render.draft` in a project config merge over these.
 *   crf / x264Preset   the chunk encode (a light mezzanine: the master re-encodes once)
 *   final              the master encode, in place of `encode.final`
 *   scale              of the composition size (draft: 1280x720 for a 1080p film)
 */
export const PROFILES = {
  fast: {
    imageFormat: "jpeg",
    jpegQuality: 90,
    crf: 14,
    x264Preset: "veryfast",
    scale: 1,
    final: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-profile:v", "high"],
  },
  draft: {
    imageFormat: "jpeg",
    jpegQuality: 72,
    crf: 23,
    x264Preset: "ultrafast",
    scale: 2 / 3,
    final: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "25", "-profile:v", "high"],
  },
};

/** `--fast` / `--draft` on the command line win; then `render.mode`; else null (the default engine). */
export function pickMode(args, config) {
  if (args.includes("--draft")) return "draft";
  if (args.includes("--fast")) return "fast";
  const mode = config.render?.mode;
  return mode === "fast" || mode === "draft" ? mode : null;
}

export function profileFor(mode, config) {
  if (mode === "master") return masterProfile(config);
  const over = config.render?.[mode] ?? {};
  return { mode, ...PROFILES[mode], ...over };
}

/**
 * The default engine (no --fast / --draft): the quality path, now on the same
 * chunked renderer. Lossless PNG frames, `render.crf` (12) and a slower x264
 * preset make a near-lossless mezzanine; the master's own `encode.final` then
 * makes the delivered file, exactly as before. Chunks are cached like the fast
 * engine's, so a master re-render after a one-scene change redraws one scene.
 */
export function masterProfile(config) {
  const r = config.render ?? {};
  return {
    mode: "master",
    imageFormat: r.imageFormat === "jpeg" ? "jpeg" : "png",
    jpegQuality: 95,
    crf: r.crf ?? 12,
    x264Preset: r.x264Preset ?? "medium",
    scale: 1,
    ...(r.master ?? {}),
  };
}

/* ---------------------------------------------------------------- */
/* Hashing                                                           */
/* ---------------------------------------------------------------- */
const sha = (value) => crypto.createHash("sha1").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");

function walk(dir, skip = () => false, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (skip(full)) continue;
    if (entry.isDirectory()) walk(full, skip, out);
    else out.push(full);
  }
  return out;
}

/** The picture code: the scenes, the motion runtime and renderer, plus the installed versions. */
export function codeHash() {
  const h = crypto.createHash("sha1");
  const files = [...walk(path.join(REMOTION_DIR, "src")), ...walk(path.join(REMOTION_DIR, "engine")), ...walk(fileURLToPath(new URL("./motion/", import.meta.url)))];
  for (const file of files.sort()) {
    h.update(path.relative(REMOTION_DIR, file));
    h.update(fs.readFileSync(file));
  }
  h.update(fs.readFileSync(path.join(REMOTION_DIR, "package.json")));
  return h.digest("hex");
}

/**
 * Shared public assets (layered art, logos) by path, size and mtime. Staged
 * film media under public/projects and public/film is keyed per chunk instead.
 * `render.publicDeps: ["mfg-01-art", "brand"]` narrows this to the folders a
 * film actually reads, so regenerating another film's art keeps its cache.
 */
export function publicHash(deps = null) {
  const pub = path.join(REMOTION_DIR, "public");
  const roots = deps?.length ? deps.map((d) => path.join(pub, d)) : [pub];
  const skip = (full) => {
    const r = path.relative(pub, full).split(path.sep)[0];
    return r === "projects" || r === "film";
  };
  const h = crypto.createHash("sha1");
  for (const root of roots) {
    for (const file of walk(root, skip).sort()) {
      const st = fs.statSync(file);
      h.update(`${path.relative(pub, file)}|${st.size}|${st.mtimeMs}\n`);
    }
  }
  return h.digest("hex");
}

/** A media file by content-ish identity: size and mtime (cheap, and changes on every rewrite). */
const fileStamp = (file) => {
  const st = fs.statSync(file);
  return `${st.size}|${st.mtimeMs}`;
};

/* ---------------------------------------------------------------- */
/* Plan                                                              */
/* ---------------------------------------------------------------- */
/**
 * Chunks, in order, covering [0, total) with no gaps. Uses the Film's own
 * frame maths (remotion/src/film/Film.tsx), so a seam is exactly where the
 * Film puts it.
 */
export function planChunks(timeline, maxFrames = 300) {
  const { fps, segments } = timeline;
  const f = (s) => Math.round(s * fps);
  const total = f(timeline.total);
  const chunks = [];
  segments.forEach((seg, i) => {
    const next = segments[i + 1];
    const a = i === 0 ? 0 : f(seg.start);
    const b = next ? f(next.start - next.lead) : total;
    // Long bodies split into pieces, counted from the body's own start, so they
    // render side by side and a change to the scene's tail keeps its head cached.
    for (let p = a, k = 0; p < b; p += maxFrames, k++) {
      const pb = Math.min(b, p + maxFrames);
      chunks.push({ name: b - a > maxFrames ? `${seg.id}#${k}` : seg.id, kind: "body", seg: i, a: p, b: pb });
    }
    if (next) {
      const ja = Math.max(b, a);
      const jb = f(next.start);
      if (jb > ja) chunks.push({ name: `${seg.id}~${next.id}`, kind: "join", seg: i, a: ja, b: jb });
    }
  });
  return chunks;
}

/** Everything a chunk's frames can depend on, with times made relative to the chunk. */
function chunkView(timeline, chunk, mediaStamp) {
  const { fps, segments } = timeline;
  const f = (s) => Math.round(s * fps);
  const total = f(timeline.total);
  const { a, b } = chunk;
  const rel = (frames) => frames - a;

  const scenes = [];
  segments.forEach((seg, i) => {
    const next = segments[i + 1];
    const from = f(seg.start - seg.lead);
    const until = next ? f(next.start) : total;
    if (until <= a || from >= b) return;
    const { start, slot, lowerThird, ...rest } = seg;
    scenes.push({
      ...rest,
      from: rel(from),
      until: rel(until),
      startF: rel(f(seg.start)),
      slotF: Math.round(slot * fps),
      exit: next ? { type: next.transition.type, leadF: f(next.lead), at: rel(f(next.start)) } : null,
      media: seg.src ? mediaStamp(seg.src) : null,
    });
  });

  const titles = segments
    .filter((seg) => seg.lowerThird)
    .map((seg) => ({ ...seg.lowerThird, from: f(seg.start + seg.lowerThird.at), dur: f(seg.lowerThird.hold) }))
    .filter((t) => t.from < b && t.from + t.dur > a)
    .map((t) => ({ ...t, from: rel(t.from) }));

  const fadeInF = f(timeline.fadeIn);
  const fadeOutF = f(timeline.fadeOut);
  const fades = {
    in: a < fadeInF ? { fadeInF, a } : null,
    out: b > total - fadeOutF ? { fadeOutF, end: rel(total) } : null,
  };

  // The avatar reads the whole film's modes and voice; keyed on its slice, rebased.
  let avatar = null;
  if (timeline.avatar) {
    const shift = a / fps;
    avatar = {
      size: timeline.avatar.size,
      captions: timeline.avatar.captions,
      envelope: timeline.avatar.envelope.slice(a, b),
      cues: timeline.avatar.cues
        .filter((c) => c.end * fps > a - fps * 2 && c.start * fps < b + fps * 2)
        .map((c) => ({ ...c, start: c.start - shift, end: c.end - shift, words: c.words.map((w) => ({ w: w.w, start: w.start - shift, end: w.end - shift })) })),
      modes: segments.map((s) => [s.avatar.mode, s.avatar.mood, rel(f(s.start - s.lead)), rel(f(s.start))]),
    };
  }

  return { length: b - a, scenes, titles, fades, avatar };
}

/**
 * A chunk can skip the browser when it shows one still scene and nothing else:
 * no title, no avatar, no transition edge (body chunks never contain one).
 */
function nativeStill(timeline, chunk, view) {
  if (chunk.kind !== "body" || view.scenes.length !== 1 || view.titles.length || view.avatar) return null;
  const scene = view.scenes[0];
  if (scene.kind !== "still") return null;
  return { scene, segment: timeline.segments[chunk.seg] };
}

/** Up to `limit` of `jobs` at a time. */
async function pool(items, limit, run) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await run(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Renders (or reuses) every chunk and joins them into `film`.
 * @returns {{ seconds: number, rendered: number, reused: number, native: number, key: string, chunks: object[] }}
 */
export async function renderFast({ config, timeline, media, film, workDir, profile, scale = 1, dryRun = false, select = null }) {
  const started = Date.now();
  const cacheDir = ensureDir(path.join(workDir, "chunks", profile.mode));
  const fromByStaged = new Map(media.map((m) => [m.to, m.from]));
  const mediaStamp = (staged) => fileStamp(fromByStaged.get(staged) ?? path.join(REMOTION_DIR, "public", staged));

  const code = codeHash();
  const shared = {
    v: 1,
    code,
    // The ffmpeg still renderer is code too.
    stills: sha(fs.readFileSync(new URL("./stills.mjs", import.meta.url))),
    pub: publicHash(config.render?.publicDeps),
    tokens: config.tokens ?? {},
    fps: timeline.fps,
    width: timeline.width,
    height: timeline.height,
    tone: timeline.tone,
    gl: config.render?.gl ?? null,
    profile: { ...profile, final: undefined },
    scale,
  };
  const sharedKey = sha(shared);

  const chunks = planChunks(timeline, profile.pieceFrames ?? 300).map((chunk) => {
    const view = chunkView(timeline, chunk, mediaStamp);
    // ffmpeg's still chunks are JPEG-path (BT.601 full range); a PNG render's
    // chunks are BT.709 limited, and joined chunks must match, so PNG draws stills too.
    const native = config.render?.nativeStills === false || profile.imageFormat === "png" ? null : nativeStill(timeline, chunk, view);
    const key = sha([sharedKey, view, native ? "ffmpeg" : "motion"]).slice(0, 20);
    return { ...chunk, key, native, file: path.join(cacheDir, `${key}.ts`) };
  });
  const key = sha([sharedKey, chunks.map((c) => c.key)]);
  if (dryRun) return { key, chunks };

  // A preview renders and joins only the selected chunks (one scene and its seams).
  const use = select ? chunks.filter(select) : chunks;
  if (!use.length) throw new Error("nothing selected to render");
  const todo = use.filter((c) => !fs.existsSync(c.file));
  const native = todo.filter((c) => c.native);
  const remote = todo.filter((c) => !c.native);
  const W = Math.round(timeline.width * scale);
  const H = Math.round(timeline.height * scale);

  console.log(
    `chunks   ${use.length}${select ? ` of ${chunks.length}` : ""} (${use.length - todo.length} cached, ${remote.length} motion, ${native.length} ffmpeg still)`,
  );

  // Batch runs share the machine: AIEMCEE_CPU_SHARE films at once split the cores.
  const cores = Math.max(1, Math.floor((os.availableParallelism?.() ?? os.cpus().length) / Number(process.env.AIEMCEE_CPU_SHARE || 1)));
  // Render pages. Each page also drives an ffmpeg decoder and encoder, so the
  // machine saturates near half its threads: measured on 12 threads, 4-6 pages
  // beat 8. `render.pages` (or the profile's `pages`) overrides.
  const tabs = profile.pages ?? config.render?.pages ?? profile.concurrency ?? config.render?.fastConcurrency ?? Math.max(2, Math.round(cores / 2));

  const stillJob = async (c) => {
    const t = Date.now();
    await renderStillChunk({ chunk: c, timeline, scene: c.native.scene, src: fromByStaged.get(c.native.segment.src), width: W, height: H, profile, dest: `${c.file}.part.ts` });
    fs.renameSync(`${c.file}.part.ts`, c.file);
    console.log(`  still  ${c.name.padEnd(28)} ${String(c.b - c.a).padStart(5)}f  ${((Date.now() - t) / 1000).toFixed(1)}s`);
  };
  // ffmpeg stills run alongside the browser, two at a time (each is multithreaded).
  const stills = pool(native, 2, stillJob);

  if (remote.length) {
    const t0 = Date.now();
    assertScenesInstalled();
    const bundleDir = await motionBundle(code);
    // Never more pages than there is work for.
    const frames = remote.reduce((t, c) => t + (c.b - c.a), 0);
    const pages = Math.max(1, Math.min(tabs, Math.ceil(frames / 30)));
    const motion = await openMotion({
      bundleDir,
      publicDir: path.join(REMOTION_DIR, "public"),
      env: { REMOTION_AIEMCEE_TOKENS: JSON.stringify(config.tokens ?? {}) },
      width: timeline.width,
      height: timeline.height,
      scale,
      pages,
      gl: config.render?.gl ?? null,
    });
    console.log(`motion   ${pages} pages ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    try {
      const props = { timeline };
      await selectComposition(motion, "Film", props);
      const take = pagePool(motion);
      const encode = { fps: timeline.fps, crf: profile.crf, preset: profile.x264Preset, imageFormat: profile.imageFormat, jpegQuality: profile.jpegQuality };
      // Pieces sized so the whole todo list spreads evenly over the pages.
      const target = Math.max(30, Math.ceil(frames / pages));
      const order = [...remote].sort((x, y) => y.b - y.a - (x.b - x.a));
      await Promise.all(
        order.map(async (c) => {
          const t = Date.now();
          const tmp = `${c.file}.part.ts`;
          await renderSplit(motion, { id: "Film", props, a: c.a, b: c.b, dest: tmp, encode, pieces: Math.ceil((c.b - c.a) / target), take });
          fs.renameSync(tmp, c.file);
          const s = (Date.now() - t) / 1000;
          console.log(`  render ${c.name.padEnd(28)} ${String(c.b - c.a).padStart(5)}f  ${s.toFixed(1)}s`);
        }),
      );
      const s = (Date.now() - t0) / 1000;
      console.log(`motion   ${frames} frames in ${s.toFixed(1)}s = ${(frames / s).toFixed(1)} fps`);
    } finally {
      await motion.close();
    }
  }
  await stills;

  // Join: a stream copy. Each TS chunk carries its own parameter sets, and the
  // list pins every chunk to its exact frame count, so nothing drifts.
  const list = path.join(cacheDir, "concat.txt");
  fs.writeFileSync(
    list,
    use.map((c) => `file '${posix(c.file)}'\nduration ${((c.b - c.a) / timeline.fps).toFixed(6)}`).join("\n") + "\n",
  );
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", "-y", film]);

  // Keep the cache to what this film can use, across both profiles' dirs.
  // A preview only sees part of the film, so it never prunes the cache.
  const live = new Set(chunks.map((c) => path.basename(c.file)));
  for (const name of select ? [] : fs.readdirSync(cacheDir)) {
    if (name.endsWith(".ts") && !live.has(name)) fs.rmSync(path.join(cacheDir, name), { force: true });
  }

  return {
    seconds: (Date.now() - started) / 1000,
    rendered: todo.length,
    reused: use.length - todo.length,
    native: native.length,
    key,
    chunks,
    homogeneous: chunks.every((c) => !c.native),
  };
}

/**
 * Chunks carry JPEG frames as BT.601 full range (yuvj420p, tagged so);
 * the master converts to the BT.709 limited range every delivered film uses.
 * Its own colorSpace: "bt709" option shifts saturated colours, so it is not used.
 */
export const TO_BT709 = "scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv";

/** A key for the whole delivered film: picture chunks, sound inputs, master settings. */
export function filmKey({ pictureKey, config, timeline, profile, outFile, ttsDir, extra = {} }) {
  const tts = walk(ttsDir).filter((f) => /\.(mp3|wav|srt|json)$/i.test(f)).sort().map((f) => `${path.basename(f)}|${fileStamp(f)}`);
  return sha({
    pictureKey,
    audio: timeline.audio,
    sound: config.sound,
    timing: config.timing,
    encode: config.encode,
    poster: config.poster ?? null,
    final: profile.final,
    tts,
    outFile,
    ...extra,
  });
}
