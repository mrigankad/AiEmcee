/**
 * Turns narration.json into one MP3 per scene, plus durations.json.
 *
 * durations.json is the metronome for the whole pipeline: capture.mjs holds
 * each clip until it outlasts its line, and compose.mjs cuts every clip to
 * exactly narration + gap. Audio leads, picture follows — which is why this
 * script runs first and why nothing downstream works without it.
 *
 * Each line is *directed*, not just read (scripts/lib/delivery.mjs): spoken a
 * sentence at a time with prosody from its intent and its place in the line,
 * joined with deliberate pauses, and mastered. Beside each MP3:
 *
 *   <id>.srt        one cue per sentence, exact, for the avatar's captions
 *   <id>.take.json  everything that produced the take; the cache key
 *
 *   npm run narrate                 regenerate anything whose take changed
 *   npm run narrate -- 05-cta       only this scene
 *   npm run narrate -- --all        force a rebuild of every line
 *   npm run narrate -- --jobs 6     lines in flight at once (default tts.parallel, 4)
 *   npm run narrate -- --audition   the first line (or a given id) in several
 *                                   voices, to out/voice-audition/, to choose by ear
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

import { at, ensureDir, loadConfig, resetDir } from "./lib/config.mjs";
import { masterChain, prosodyFor, splitLine, spokenText } from "./lib/delivery.mjs";
import { ff, ffAsync, pool, probe } from "./lib/ffmpeg.mjs";

const execFileAsync = promisify(execFile);

const { config, narration } = await loadConfig();

const args = process.argv.slice(2);
const force = args.includes("--all");
const audition = args.includes("--audition");
const jobsAt = args.indexOf("--jobs");
const jobs = Math.max(1, Number(jobsAt >= 0 ? args[jobsAt + 1] : config.tts.parallel ?? 4) || 4);
const only = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--jobs");

const ttsDir = ensureDir(at(config.paths.tts));
const tts = config.tts;
const pauses = { sentence: 0.2, beat: 0.55, ...tts.pauses };
const HEAD = 0.06;
const TAIL = 0.12;

/** One request to edge-tts: one sentence, one prosody. */
async function speak(text, voice, prosody, dest) {
  // The edge-tts service intermittently answers with no audio; retry with backoff.
  for (let attempt = 1; ; attempt++) {
    try {
      return await speakOnce(text, voice, prosody, dest);
    } catch (err) {
      if (attempt >= 6) throw err;
      console.warn(`  edge-tts returned no audio, retry ${attempt}/5`);
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
}

async function speakOnce(text, voice, prosody, dest) {
  await execFileAsync(
    "edge-tts",
    [
      "--voice", voice,
      // `=`-joined, not space-separated: edge-tts parses arguments with
      // argparse, which reads a bare "-3%" as an option rather than as the
      // value of --rate. Slowing a voice down fails outright without this.
      `--rate=${prosody.rate}`,
      `--pitch=${prosody.pitch}`,
      `--volume=${prosody.volume}`,
      "--text", text,
      "--write-media", dest,
    ],
    { windowsHide: true },
  );
  if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) throw new Error("edge-tts wrote no audio");
}

/** Mono 48k WAV of silence, for the pauses between sentences. */
function gapWav(seconds, dest) {
  ff(["-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=48000", "-t", seconds.toFixed(3), "-y", dest]);
  return dest;
}

/**
 * Speaks one line sentence by sentence, joins the takes with directed pauses,
 * masters it, and writes the MP3 and its sentence cues.
 */
async function renderLine(line, voice, mp3, srt) {
  const parts = splitLine(line.text, pauses);
  const work = resetDir(path.join(ttsDir, ".parts", line.id));
  const intent = line.delivery ?? "explain";

  const pieces = [gapWav(HEAD, path.join(work, "head.wav"))];
  const cues = [];
  let t = HEAD;

  // Every sentence of the line is spoken at once; they are joined in order below.
  const takes = await Promise.all(parts.map(async (part, i) => {
    const raw = path.join(work, `${i}.mp3`);
    const wav = path.join(work, `${i}.wav`);
    await speak(part.text, voice, prosodyFor(tts, intent, i, parts.length, part.text), raw);
    // Trim the engine's own lead-in and tail, so the pauses are ours.
    await ffAsync([
      "-i", raw,
      "-af",
      "silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.02," +
        "areverse,silenceremove=start_periods=1:start_threshold=-48dB:start_silence=0.04,areverse",
      "-ar", "48000", "-ac", "1", "-y", wav,
    ]);
    return wav;
  }));

  parts.forEach((part, i) => {
    const wav = takes[i];
    const d = probe(wav);
    pieces.push(wav);
    cues.push({ start: t, end: t + d, text: part.text });
    t += d;
    if (part.pauseAfter > 0) {
      pieces.push(gapWav(part.pauseAfter, path.join(work, `gap-${i}.wav`)));
      t += part.pauseAfter;
    }
  });
  pieces.push(gapWav(TAIL, path.join(work, "tail.wav")));

  const list = path.join(work, "list.txt");
  fs.writeFileSync(list, pieces.map((p) => `file '${p.split(path.sep).join("/")}'`).join("\n"));
  const joined = path.join(work, "joined.wav");
  ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-y", joined]);
  ff(["-i", joined, "-af", masterChain(tts.master), "-ar", "48000", "-ac", "1", "-c:a", "libmp3lame", "-b:a", "192k", "-y", mp3]);

  if (srt) fs.writeFileSync(srt, toSrt(cues));
  fs.rmSync(work, { recursive: true, force: true });
}

function toSrt(cues) {
  const stamp = (s) => {
    const ms = Math.round(s * 1000);
    const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
    const sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
    return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, "0")}`;
  };
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join("\n");
}

/** Everything that shapes a take. If it is unchanged, the MP3 is reused. */
function takeKey(line, voice) {
  return JSON.stringify({
    v: 2,
    text: line.text,
    voice,
    rate: tts.rate,
    pitch: tts.pitch,
    volume: tts.volume,
    intent: line.delivery ?? "explain",
    preset: tts.delivery?.presets?.[line.delivery ?? "explain"] ?? null,
    contour: tts.delivery?.contour ?? null,
    pauses,
    master: tts.master ?? null,
  });
}

/* ------------------------------------------------------------------ */
/* Audition: one line, several voices                                  */
/* ------------------------------------------------------------------ */
if (audition) {
  const line = narration.find((n) => n.id === only) ?? narration[0];
  const voices = tts.audition ?? [
    "en-US-AndrewMultilingualNeural",
    "en-US-BrianMultilingualNeural",
    "en-US-AvaMultilingualNeural",
    "en-US-EmmaMultilingualNeural",
  ];
  const outDir = resetDir(at(path.dirname(config.output), "voice-audition"));
  for (const voice of voices) {
    const dest = path.join(outDir, `${line.id}-${voice.replace(/^en-\w+-|Neural$/g, "")}.mp3`);
    await renderLine(line, voice, dest, null);
    console.log(`audition  ${voice.padEnd(34)} ${probe(dest).toFixed(2)}s  -> ${path.relative(at(), dest)}`);
  }
  console.log(`\nListen, then set tts.voice in video.config.mjs and run \`npm run narrate\`.`);
  process.exit(0);
}

/* ------------------------------------------------------------------ */
/* Narration                                                           */
/* ------------------------------------------------------------------ */
const durations = {};
let built = 0;
let reused = 0;

// Lines are independent until durations.json, so several are in flight at
// once. Results are logged in script order once all of them are done.
const results = await pool(narration, jobs, async (line) => {
  const mp3 = path.join(ttsDir, `${line.id}.mp3`);
  if (only && only !== line.id) {
    // Still needs a duration, so read the existing file rather than skipping.
    return fs.existsSync(mp3) ? { line, skip: true, seconds: round(probe(mp3)) } : null;
  }

  const txt = path.join(ttsDir, `${line.id}.txt`);
  const srt = path.join(ttsDir, `${line.id}.srt`);
  const take = path.join(ttsDir, `${line.id}.take.json`);
  const key = takeKey(line, tts.voice);

  const unchanged =
    !force &&
    fs.existsSync(mp3) &&
    fs.existsSync(srt) &&
    fs.existsSync(take) &&
    fs.readFileSync(take, "utf8") === key;

  if (!unchanged) {
    await renderLine(line, tts.voice, mp3, srt);
    fs.writeFileSync(take, key);
    fs.writeFileSync(txt, spokenText(line.text));
  }
  return { line, unchanged, seconds: round(probe(mp3)) };
});

for (const r of results) {
  if (!r) continue;
  durations[r.line.id] = r.seconds;
  if (r.skip) continue;
  if (r.unchanged) reused++;
  else built++;
  const words = spokenText(r.line.text).split(/\s+/).length;
  const wpm = Math.round((words / r.seconds) * 60);
  console.log(
    `${r.unchanged ? "cached" : "spoke "}  ${r.line.id.padEnd(18)} ${(r.line.delivery ?? "explain").padEnd(8)} ` +
      `${r.seconds.toFixed(2).padStart(6)}s  ${String(words).padStart(3)} words  ${wpm} wpm`,
  );
}

fs.rmSync(path.join(ttsDir, ".parts"), { recursive: true, force: true });
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
  `\n${built} synthesised, ${reused} cached (${jobs} in flight)\n` +
    `narration ${total.toFixed(1)}s + gaps ${gaps.toFixed(1)}s + cards ${extra.toFixed(1)}s ` +
    `= about ${fmt(total + gaps + extra)} of finished film`,
);

function round(n) {
  return Math.round(n * 1000) / 1000;
}

function fmt(seconds) {
  const whole = Math.round(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}
