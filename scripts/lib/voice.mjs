/**
 * What the avatar needs to know about the voice: how loud it is on every
 * frame (so it can visibly speak), and which words are being said when (so
 * its captions can follow along).
 *
 *   envelope  per-frame level, 0..1, from the narration MP3 itself
 *   cues      sentences with exact start/end times from edge-tts (.srt), each
 *             split into words timed by their share of the sentence's letters
 *
 * Sentence times come from the voice engine and are exact. Word times inside a
 * sentence are an estimate, which is plenty for a highlight that moves with
 * the voice. Nothing here is hand-timed, so a rewritten line re-times itself.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const RATE = 6000;

/** Decodes any audio file to mono float32 samples at RATE. */
function samples(file) {
  const buf = execFileSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", file, "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}

/**
 * Per-frame loudness, mapped from dBFS to 0..1 and smoothed with a fast attack
 * and a slower release, the way a meter (or a face) follows speech: it opens
 * on a syllable at once and relaxes between them instead of flickering.
 */
export function envelope(file, fps, { floorDb = -46, ceilDb = -14 } = {}) {
  const pcm = samples(file);
  const per = RATE / fps;
  const frames = Math.ceil(pcm.length / per);
  const out = new Array(frames);
  let level = 0;

  for (let f = 0; f < frames; f++) {
    const a = Math.floor(f * per);
    const b = Math.min(pcm.length, Math.floor((f + 1) * per));
    let sum = 0;
    for (let i = a; i < b; i++) sum += pcm[i] * pcm[i];
    const rms = Math.sqrt(sum / Math.max(1, b - a));
    const db = 20 * Math.log10(rms + 1e-9);
    const target = Math.max(0, Math.min(1, (db - floorDb) / (ceilDb - floorDb)));
    level = target > level ? level + (target - level) * 0.7 : level + (target - level) * 0.28;
    out[f] = Math.round(level * 100) / 100;
  }
  return out;
}

/** Parses an .srt into [{ start, end, text }], times in seconds. */
export function readSrt(file) {
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, "utf8").replace(/\r/g, "");
  const toSec = (t) => {
    const [h, m, rest] = t.split(":");
    const [s, ms] = rest.split(",");
    return +h * 3600 + +m * 60 + +s + +ms / 1000;
  };
  return text
    .split(/\n\n+/)
    .map((block) => {
      const lines = block.trim().split("\n");
      const timing = lines.find((l) => l.includes("-->"));
      if (!timing) return null;
      const [a, b] = timing.split("-->").map((x) => toSec(x.trim()));
      const words = lines.slice(lines.indexOf(timing) + 1).join(" ").trim();
      return words ? { start: a, end: b, text: words } : null;
    })
    .filter(Boolean);
}

/**
 * Splits each sentence into words and gives every word a slice of the
 * sentence's time in proportion to its length (plus a little for the pause a
 * comma or full stop implies).
 */
export function timeWords(cues) {
  return cues.map((cue) => {
    const words = cue.text.split(/\s+/).filter(Boolean);
    const weight = (w) => w.replace(/[^\p{L}\p{N}]/gu, "").length + 1.5 + (/[,.;:!?]$/.test(w) ? 2 : 0);
    const total = words.reduce((n, w) => n + weight(w), 0);
    const span = cue.end - cue.start;
    let t = cue.start;
    return {
      ...cue,
      words: words.map((w) => {
        const d = (weight(w) / total) * span;
        const word = { w, start: +t.toFixed(3), end: +(t + d).toFixed(3) };
        t += d;
        return word;
      }),
    };
  });
}

/**
 * Cues for a line that has no .srt (an older cache): the whole line as one
 * sentence, spoken across the line's duration.
 */
export function fallbackCues(text, duration) {
  return timeWords([{ start: 0.05, end: Math.max(0.1, duration - 0.1), text }]);
}
