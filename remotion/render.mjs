/**
 * Renders motion scenes on their own, for previewing and sharing single
 * scenes. The film does not need this: `npm run compose` renders every motion
 * scene and lower third inline, inside the Film composition, at exactly its
 * narration slot.
 *
 *   npm run motion              every motion scene in the sequence
 *   npm run motion -- Problem   one composition, while you iterate
 *
 * Output: remotion/out/<composition>.mp4
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");

const { default: config } = await import(pathToFileURL(path.join(repo, "video.config.mjs")).href);
const { ENTRY, rel, remotion } = await import(pathToFileURL(path.join(repo, "scripts", "lib", "remotion.mjs")).href);

const outDir = path.join(here, "out");
fs.mkdirSync(outDir, { recursive: true });

const only = process.argv.slice(2).find((a) => !a.startsWith("--"));

const compositions = [
  ...new Set(config.sequence.filter((s) => s.from === "motion").map((s) => s.composition)),
];
if (config.outro && !config.outro.src) compositions.push(config.outro.composition);
if (only === "LowerThird") compositions.push("LowerThird");

for (const id of compositions) {
  if (only && only !== id) continue;
  const dest = path.join(outDir, `${id.toLowerCase()}.mp4`);
  console.log(`clip   ${id} -> out/${path.basename(dest)}`);
  remotion(["render", ENTRY, id, rel(dest)]);
}

if (!compositions.length) console.log("nothing to render — no motion scenes in the sequence");
else console.log("\nremotion render complete");
