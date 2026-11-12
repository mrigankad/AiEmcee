/**
 * Renders motion scenes on their own, for previewing and sharing single
 * scenes. The film does not need this: `npm run compose` renders every motion
 * scene and lower third inline, inside the Film composition, at exactly its
 * narration slot.
 *
 *   npm run motion              every motion scene in the sequence
 *   npm run motion -- Problem   one composition, while you iterate
 *
 * Output: remotion/out/<composition>.mp4, rendered on AiEmcee Motion.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const lib = (p) => import(pathToFileURL(path.join(repo, "scripts", "lib", p)).href);

// --project / AIEMCEE_PROJECT pick the film, exactly as for the pipeline scripts.
const { loadConfig } = await lib("config.mjs");
const { codeHash } = await lib("fast.mjs");
const { ff } = await lib("ffmpeg.mjs");
const { motionBundle } = await lib("motion/bundle.mjs");
const { openMotion, pagePool, renderSplit, selectComposition } = await lib("motion/render.mjs");
const { config } = await loadConfig();

const outDir = path.join(here, "out");
fs.mkdirSync(outDir, { recursive: true });

const only = process.argv.slice(2).find((a) => !a.startsWith("--") && !a.includes(path.sep) && !a.includes("/"));

const compositions = [...new Set(config.sequence.filter((s) => s.from === "motion").map((s) => s.composition))];
if (config.outro && !config.outro.src) compositions.push(config.outro.composition);
if (only === "LowerThird") compositions.push("LowerThird");
const todo = compositions.filter((id) => !only || only === id);

if (!todo.length) {
  console.log(only ? `no motion scene "${only}" in the sequence` : "nothing to render — no motion scenes in the sequence");
  process.exit(0);
}

const bundleDir = await motionBundle(codeHash());
const pages = Math.max(2, Math.round((os.availableParallelism?.() ?? os.cpus().length) / 2));
// Pages start at 1920x1080 and fit themselves to each composition as it mounts.
const motion = await openMotion({
  bundleDir,
  publicDir: path.join(here, "public"),
  env: { REMOTION_AIEMCEE_TOKENS: JSON.stringify(config.tokens ?? {}) },
  width: 1920,
  height: 1080,
  pages,
  gl: config.render?.gl ?? null,
});
try {
  const take = pagePool(motion);
  for (const id of todo) {
    const started = Date.now();
    const comp = await selectComposition(motion, id, {});
    const dest = path.join(outDir, `${id.toLowerCase()}.mp4`);
    const ts = `${dest}.ts`;
    await renderSplit(motion, {
      id,
      props: {},
      a: 0,
      b: comp.durationInFrames,
      dest: ts,
      encode: { fps: comp.fps, crf: 16, preset: "medium", imageFormat: "png" },
      take,
    });
    ff(["-i", ts, "-c", "copy", "-movflags", "+faststart", "-y", dest]);
    fs.rmSync(ts, { force: true });
    console.log(`clip   ${id.padEnd(24)} ${comp.durationInFrames}f  ${((Date.now() - started) / 1000).toFixed(1)}s  -> remotion/out/${path.basename(dest)}`);
  }
} finally {
  await motion.close();
}
console.log("\nmotion render complete");
