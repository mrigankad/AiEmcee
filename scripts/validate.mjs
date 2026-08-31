/**
 * Validates the project without touching ffmpeg, edge-tts or a browser.
 *
 * Everything here is a mistake that would otherwise surface twenty minutes
 * into a build — a sequence entry with no choreography, a lower third on a
 * motion scene, a composition nobody registered. Cheap to check, expensive
 * to discover late, which is why CI runs this on every push.
 *
 *   npm run validate
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { at, loadConfig } from "./lib/config.mjs";

const problems = [];
const notes = [];

const { config, narration } = await loadConfig();

/* Ids must be unique — a duplicate silently overwrites a scene's duration. */
const seen = new Set();
for (const line of narration) {
  if (seen.has(line.id)) problems.push(`narration.json defines "${line.id}" more than once`);
  seen.add(line.id);
  if (!line.text?.trim()) problems.push(`${line.id} has no text`);
}

const inSequence = new Set(config.sequence.map((s) => s.id));
for (const line of narration) {
  if (!inSequence.has(line.id)) {
    notes.push(`${line.id} is written but not in the sequence — it will not appear`);
  }
}

/* Every captured scene needs a function in scenes.mjs. */
const scenesFile = at(config.paths.scenes);
const { SCENES } = await import(pathToFileURL(scenesFile).href);

for (const scene of config.sequence) {
  if (scene.from === "capture") {
    if (!SCENES[scene.id]) problems.push(`no choreography in scenes.mjs for "${scene.id}"`);
  } else if (scene.from === "motion") {
    if (!scene.composition) problems.push(`"${scene.id}" is a motion scene with no composition`);
    if (scene.lowerThird) {
      problems.push(`"${scene.id}" is a motion scene — put its title in the composition, not a lower third`);
    }
  } else {
    problems.push(`"${scene.id}" has an unknown \`from\`: ${JSON.stringify(scene.from)}`);
  }
}

for (const id of Object.keys(SCENES)) {
  if (!inSequence.has(id)) notes.push(`scenes.mjs has choreography for "${id}", which is not in the sequence`);
}

/* Compositions referenced by the sequence must be registered in Root.tsx. */
const root = fs.readFileSync(at("remotion", "src", "Root.tsx"), "utf8");
const registered = new Set([...root.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));

const needed = new Set(config.sequence.filter((s) => s.from === "motion").map((s) => s.composition));
if (config.outro) needed.add(config.outro.composition);
if (config.sequence.some((s) => s.lowerThird)) needed.add("LowerThird");

for (const id of needed) {
  if (id && !registered.has(id)) problems.push(`composition "${id}" is not registered in remotion/src/Root.tsx`);
}

/* An intro asset that does not exist fails at the very last step otherwise. */
if (config.intro && !fs.existsSync(at(config.intro.src))) {
  notes.push(`intro asset not found: ${config.intro.src} (compose will fail until it is there)`);
}

/* Capture viewport and render frame size must agree, or every clip is rescaled. */
if (
  config.capture.viewport.width !== config.video.width ||
  config.capture.viewport.height !== config.video.height
) {
  notes.push(
    `capture viewport ${config.capture.viewport.width}x${config.capture.viewport.height} ` +
      `differs from video ${config.video.width}x${config.video.height} — every clip will be rescaled`,
  );
}

for (const note of notes) console.log(`  note     ${note}`);
for (const problem of problems) console.log(`  PROBLEM  ${problem}`);

const captured = config.sequence.filter((s) => s.from === "capture").length;
const motion = config.sequence.filter((s) => s.from === "motion").length;
const titles = config.sequence.filter((s) => s.lowerThird).length;

console.log(
  `\n  ${narration.length} narration lines, ${config.sequence.length} scenes ` +
    `(${captured} captured, ${motion} motion), ${titles} lower third(s)`,
);
console.log(problems.length ? `  ${problems.length} problem(s)\n` : "  valid\n");

process.exit(problems.length ? 1 : 0);
