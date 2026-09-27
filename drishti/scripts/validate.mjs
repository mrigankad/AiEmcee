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
import { AVATAR_MODES, AVATAR_MOODS, avatarFor, normaliseTransition, resolveTone, TRANSITIONS } from "./lib/timeline.mjs";

const problems = [];
const notes = [];

const { config, narration } = await loadConfig();

/* Ids must be unique — a duplicate silently overwrites a scene's duration. */
const seen = new Set();
for (const line of narration) {
  if (seen.has(line.id)) problems.push(`narration.json defines "${line.id}" more than once`);
  seen.add(line.id);
  if (!line.text?.trim()) problems.push(`${line.id} has no text`);
  const presets = config.tts.delivery?.presets;
  if (line.delivery && presets && !presets[line.delivery]) {
    problems.push(`${line.id} delivery "${line.delivery}" is not a preset in tts.delivery: ${Object.keys(presets).join(", ")}`);
  }
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
  } else if (scene.from === "clip") {
    if (!scene.clip?.src) {
      problems.push(`"${scene.id}" is a clip scene with no clip.src`);
    } else if (!fs.existsSync(at(scene.clip.src))) {
      // Source recordings are large and git-ignored, like the intro sting, so a
      // fresh clone will not have them yet: worth saying, not a broken project.
      notes.push(`"${scene.id}" clip source not found: ${scene.clip.src} (npm run clip will fail until it is there)`);
    }
    if (scene.clip?.end != null && scene.clip.end <= (scene.clip.start ?? 0)) {
      problems.push(`"${scene.id}" clip.end must be after clip.start`);
    }
  } else {
    problems.push(`"${scene.id}" has an unknown \`from\`: ${JSON.stringify(scene.from)}`);
  }
}

for (const id of Object.keys(SCENES)) {
  if (!inSequence.has(id)) notes.push(`scenes.mjs has choreography for "${id}", which is not in the sequence`);
}

/* Motion scenes are looked up by the Film in the scenes.ts registry. */
const registry = fs.readFileSync(at("remotion", "src", "scenes.ts"), "utf8");
const registered = new Set([...registry.matchAll(/^\s+(\w+): \{ component:/gm)].map((m) => m[1]));

const needed = new Set(config.sequence.filter((s) => s.from === "motion").map((s) => s.composition));
if (config.outro && !config.outro.src) needed.add(config.outro.composition);

for (const id of needed) {
  if (id && !registered.has(id)) problems.push(`motion scene "${id}" is not in the MOTION registry in remotion/src/scenes.ts`);
}

/* Direction: tone, transitions, focus moves. */
let tone = null;
try {
  tone = resolveTone(config);
} catch (err) {
  problems.push(err.message);
}

/* Line lengths, if narration has run; focus moves are checked against them. */
const durationsFile = at(config.paths.tts, "durations.json");
const spoken = fs.existsSync(durationsFile) ? JSON.parse(fs.readFileSync(durationsFile, "utf8")) : null;

const clipsHave = (scene) => scene.from === "clip" || scene.from === "capture";

for (const scene of config.sequence) {
  if (scene.transition != null) {
    const type = typeof scene.transition === "string" ? scene.transition : scene.transition.type;
    if (!TRANSITIONS.includes(type)) {
      problems.push(`"${scene.id}" transition "${type}" is not one of: ${TRANSITIONS.join(", ")}`);
    }
  }
  const lead = tone ? normaliseTransition(scene.transition, tone.transition).duration : 0;
  if (lead > config.timing.gap + 0.05) {
    notes.push(`"${scene.id}" transition (${lead}s) is longer than the gap (${config.timing.gap}s) — it will run under the end of the previous line`);
  }
  if (scene.from === "clip" && lead > config.timing.tailPad) {
    notes.push(`"${scene.id}" transition (${lead}s) is longer than timing.tailPad — the clip may hold its last frame`);
  }

  const focus = scene.focus ?? [];
  if (focus.length && !clipsHave(scene)) {
    problems.push(`"${scene.id}" has focus moves, but only clip or capture footage can be focused`);
  }
  let prevUntil = -Infinity;
  for (const [i, f] of focus.entries()) {
    const where = `"${scene.id}" focus ${i + 1}`;
    const [x, y, w, h] = f.box ?? [];
    if (![x, y, w, h].every(Number.isFinite)) {
      problems.push(`${where} needs box: [x, y, w, h] as fractions of the frame`);
      continue;
    }
    if (w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > 1.001 || y + h > 1.001) {
      problems.push(`${where} box [${f.box.join(", ")}] falls outside the frame`);
    }
    if (!(f.until > f.at)) problems.push(`${where} must end after it starts (at ${f.at}, until ${f.until})`);
    // The scene is on screen for lead + narration + gap seconds of footage.
    const line = spoken?.[scene.id];
    if (line != null && f.until > lead + line + config.timing.gap + 0.01) {
      problems.push(
        `${where} runs to ${f.until}s, but the scene only shows ${(lead + line + config.timing.gap).toFixed(2)}s of footage`,
      );
    }
    if (f.at < prevUntil) problems.push(`${where} starts before the previous focus move ends`);
    if (tone && f.until - f.at < tone.focus.ease * 1.8 + 0.5) {
      notes.push(`${where} is ${(f.until - f.at).toFixed(1)}s — too short to ease in, settle and read`);
    }
    prevUntil = f.until;
  }
}

/* Avatar: a known mode and mood on every scene that sets one. */
if (config.avatar && config.avatar.enabled !== false) {
  for (const scene of config.sequence) {
    if (scene.avatar == null) continue;
    const { mode, mood } = avatarFor(scene);
    if (!AVATAR_MODES.includes(mode)) {
      problems.push(`"${scene.id}" avatar mode "${mode}" is not one of: ${AVATAR_MODES.join(", ")}`);
    }
    if (!AVATAR_MOODS.includes(mood)) {
      problems.push(`"${scene.id}" avatar mood "${mood}" is not one of: ${AVATAR_MOODS.join(", ")}`);
    }
  }
  const missingSrt = narration.filter((n) => !fs.existsSync(at(config.paths.tts, `${n.id}.srt`)));
  if (missingSrt.length && fs.existsSync(at(config.paths.tts))) {
    notes.push(
      `no subtitle timing for ${missingSrt.map((n) => n.id).join(", ")} — captions fall back to an estimate; ` +
        "run `npm run narrate -- --all` once",
    );
  }
}

if (config.poster?.scene && !inSequence.has(config.poster.scene)) {
  problems.push(`poster.scene "${config.poster.scene}" is not in the sequence`);
}

/* Sound: the bed and every effect the tone cues. */
const music = config.sound?.music;
if (music?.src && !fs.existsSync(at(music.src))) problems.push(`music bed not found: ${music.src}`);
if (music && !music.src && music.generate !== "pad") problems.push('sound.music needs `src` or `generate: "pad"`');
if (tone && config.sound?.sfx !== false) {
  for (const name of new Set(Object.values(tone.sfx).filter(Boolean))) {
    if (name === "whoosh") continue;
    const found = [".ogg", ".wav", ".mp3"].some((ext) => fs.existsSync(at(config.paths.assets, "sfx", `${name}${ext}`)));
    if (!found) problems.push(`sound effect "${name}" (tone ${tone.name}) not found in ${config.paths.assets}/sfx/`);
  }
}

/* An intro asset that does not exist fails at the very last step otherwise. */
if (config.intro && !fs.existsSync(at(config.intro.src))) {
  notes.push(`intro asset not found: ${config.intro.src} (compose will fail until it is there)`);
}
if (config.outro?.src && !fs.existsSync(at(config.outro.src))) {
  notes.push(`outro asset not found: ${config.outro.src} (compose will fail until it is there)`);
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
const clips = config.sequence.filter((s) => s.from === "clip").length;
const titles = config.sequence.filter((s) => s.lowerThird).length;

console.log(
  `\n  ${narration.length} narration lines, ${config.sequence.length} scenes ` +
    `(${captured} captured, ${clips} clip, ${motion} motion), ${titles} lower third(s)`,
);
console.log(problems.length ? `  ${problems.length} problem(s)\n` : "  valid\n");

process.exit(problems.length ? 1 : 0);
