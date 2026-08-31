/**
 * Turns narration.json into one MP3 per scene, plus durations.json.
 *
 * durations.json is the metronome for the whole pipeline: capture.mjs holds
 * each clip until it outlasts its line, and compose.mjs cuts every clip to
 * exactly narration + gap. Audio leads, picture follows — which is why this
 * script runs first and why nothing downstream works without it.
 *
 *   npm run narrate           regenerate anything whose text changed
 *   npm run narrate -- 05-cta only this scene
 *   npm run narrate -- --all  force a rebuild of every line
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { at, ensureDir, loadConfig } from "./lib/config.mjs";
import { probe } from "./lib/ffmpeg.mjs";

const { config, narration } = await loadConfig();

const args = process.argv.slice(2);
const force = args.includes("--all");
const only = args.find((a) => !a.startsWith("--"));

const ttsDir = ensureDir(at(config.paths.tts));

function edgeTts(text, dest) {
  execFileSync(
    "edge-tts",
    [
      "--voice", config.tts.voice,
      "--rate", config.tts.rate,
      "--pitch", config.tts.pitch,
      "--volume", config.tts.volume,
      "--text", text,
      "--write-media", dest,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
}

const durations = {};
let built = 0;
let reused = 0;

for (const line of narration) {
  if (only && only !== line.id) {
    // Still needs a duration, so read the existing file rather than skipping.
    const existing = path.join(ttsDir, `${line.id}.mp3`);
    if (fs.existsSync(existing)) durations[line.id] = round(probe(existing));
    continue;
  }

  const mp3 = path.join(ttsDir, `${line.id}.mp3`);
  const txt = path.join(ttsDir, `${line.id}.txt`);

  // The .txt sidecar is the cache key: if the words are byte-identical to what
  // produced the existing MP3, there is nothing to re-synthesise.
  const unchanged =
    !force &&
    fs.existsSync(mp3) &&
    fs.existsSync(txt) &&
    fs.readFileSync(txt, "utf8") === line.text;

  if (unchanged) {
    reused++;
  } else {
    edgeTts(line.text, mp3);
    fs.writeFileSync(txt, line.text);
    built++;
  }

  const seconds = round(probe(mp3));
  durations[line.id] = seconds;

  const words = line.text.trim().split(/\s+/).length;
  const wpm = Math.round((words / seconds) * 60);
  console.log(
    `${unchanged ? "cached" : "spoke "}  ${line.id.padEnd(18)} ` +
      `${seconds.toFixed(2).padStart(6)}s  ${String(words).padStart(3)} words  ${wpm} wpm`,
  );
}

fs.writeFileSync(
  path.join(ttsDir, "durations.json"),
  `${JSON.stringify(durations, null, 2)}\n`,
);

const total = Object.values(durations).reduce((a, b) => a + b, 0);
const gaps = config.sequence.length * config.timing.gap;
const extra =
  (config.outro ? config.timing.endHold : 0) +
  (config.intro ? config.timing.introTail : 0);

console.log(
  `\n${built} synthesised, ${reused} cached\n` +
    `narration ${total.toFixed(1)}s + gaps ${gaps.toFixed(1)}s + cards ${extra.toFixed(1)}s ` +
    `= about ${fmt(total + gaps + extra)} of finished film`,
);

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function fmt(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}
