/**
 * Delivery: how a line is said, not just what.
 *
 * edge-tts gives one rate and one pitch per request and no speaking styles, so
 * a whole line said in one request comes out in one flat register. That flat
 * register is what makes TTS sound generic. Here each sentence is its own
 * request, with its own prosody:
 *
 *   intent    the line's job in the film (hook, problem, explain, feature,
 *             payoff, close) picks a base pace and pitch from `tts.delivery`
 *   contour   within the line, the first sentence opens with a lift, the last
 *             one lands a little lower and slower, questions rise
 *   pauses    sentences are joined with a set gap instead of the engine's own,
 *             and a `[beat]` in the script inserts a longer dramatic pause
 *
 * The joined line then goes through a short mastering chain, so it sounds
 * recorded rather than synthesised, and every line sits at the same loudness.
 */

/** Signed number out of "+4%", "-2Hz", "+0%". */
const num = (v) => parseFloat(String(v ?? "0").replace(/[^\d.+-]/g, "")) || 0;
const pct = (n) => `${n >= 0 ? "+" : ""}${Math.round(n)}%`;
const hz = (n) => `${n >= 0 ? "+" : ""}${Math.round(n)}Hz`;

export const BEAT = "[beat]";

/**
 * Splits a line into sentences to be spoken separately. Each part carries the
 * pause that follows it: a normal sentence gap, or a beat.
 */
export function splitLine(text, pauses) {
  const parts = [];
  for (const [i, chunk] of text.split(BEAT).entries()) {
    const sentences = chunk
      .trim()
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (i > 0 && parts.length) parts[parts.length - 1].pauseAfter = pauses.beat;
    for (const s of sentences) parts.push({ text: s, pauseAfter: pauses.sentence });
  }
  if (parts.length) parts[parts.length - 1].pauseAfter = 0;
  return parts;
}

/** The caption-safe text of a line: markers removed, spacing tidied. */
export const spokenText = (text) => text.replaceAll(BEAT, " ").replace(/\s+/g, " ").trim();

/**
 * Prosody for sentence `i` of `n`: global base + intent + contour.
 * Returns edge-tts-ready strings.
 */
export function prosodyFor(tts, intent, i, n, sentence) {
  const preset = tts.delivery?.presets?.[intent] ?? {};
  const contour = tts.delivery?.contour ?? { open: { pitch: 2 }, land: { pitch: -3, rate: -3 }, question: { pitch: 4 } };

  let rate = num(tts.rate) + num(preset.rate);
  let pitch = num(tts.pitch) + num(preset.pitch);
  if (n > 1 && i === 0) {
    rate += num(contour.open?.rate);
    pitch += num(contour.open?.pitch);
  }
  if (n > 1 && i === n - 1) {
    rate += num(contour.land?.rate);
    pitch += num(contour.land?.pitch);
  }
  if (sentence.trim().endsWith("?")) pitch += num(contour.question?.pitch);

  return { rate: pct(rate), pitch: hz(pitch), volume: tts.volume ?? "+0%" };
}

/**
 * The voice's mastering chain: clear the rumble, a little warmth low down, a
 * presence lift where consonants live, tame the esses that lift exaggerates,
 * gentle compression so quiet words carry, then a fixed loudness per line.
 */
export function masterChain(master = {}) {
  if (master === false) return "loudnorm=I=-18:TP=-2:LRA=7";
  const warmth = master.warmth ?? 2;
  const presence = master.presence ?? 2.5;
  return [
    "highpass=f=75",
    `equalizer=f=180:t=q:w=1:g=${warmth}`,
    `equalizer=f=3200:t=q:w=1.3:g=${presence}`,
    "deesser=i=0.4:m=0.5:f=0.5",
    "acompressor=threshold=-21dB:ratio=2.6:attack=6:release=140:makeup=2",
    "loudnorm=I=-18:TP=-2:LRA=7",
  ].join(",");
}
