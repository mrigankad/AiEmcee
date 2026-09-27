/**
 * The film's sound: narration, a music bed that ducks under it, and sound
 * effects on the edit's cues, mixed as one piece.
 *
 * Everything is placed by absolute time from the timeline (adelay), not by
 * concatenation, so a cue can never slip because an earlier file was a frame
 * long. The narration is still the metronome: it is placed at exactly the
 * seconds the picture was cut to.
 *
 * The mix, in the /brag spirit: effects sit under the music and never over the
 * voice, repeated small sounds stay in the background, and the whole track is
 * loudness-normalised (two-pass EBU R128) so it plays at the same level as
 * everything else on the platform it is posted to.
 */
import fs from "node:fs";
import path from "node:path";

import { at } from "./config.mjs";
import { ff, probe } from "./ffmpeg.mjs";

const RATE = 48000;

/** dB gain per cue role. Relative to a sample peaking near 0 dBFS. */
const ROLE_GAIN = { transition: -19, lowerThird: -15, focus: -17, outro: -11 };

/** Loudness targets. Streaming platforms normalise to about -14 to -16 LUFS. */
const TARGET = { I: -16, TP: -1.5, LRA: 11 };

const db = (v) => Math.pow(10, v / 20).toFixed(4);

/* ------------------------------------------------------------------ */
/* Synthesised sounds                                                  */
/* ------------------------------------------------------------------ */

/**
 * A soft air whoosh sized to a transition: band-limited pink noise that swells
 * across the transition and decays just past the cut. Seeded, so every build
 * sounds the same.
 */
export function synthWhoosh(lead, dest) {
  const swell = Math.max(0.2, lead * 0.85);
  const len = swell + 0.38;
  ff([
    "-f", "lavfi",
    "-i", `anoisesrc=color=pink:amplitude=0.9:duration=${len.toFixed(3)}:seed=7:sample_rate=${RATE}`,
    "-af",
    [
      "highpass=f=220",
      "lowpass=f=2600",
      "equalizer=f=900:t=q:w=1.2:g=4",
      `afade=t=in:d=${swell.toFixed(3)}:curve=qua`,
      `afade=t=out:st=${swell.toFixed(3)}:d=0.38:curve=exp`,
      "aecho=0.8:0.4:35:0.25",
      "aformat=channel_layouts=stereo",
    ].join(","),
    "-y", dest,
  ]);
  return dest;
}

/**
 * A warm ambient pad: four seventh chords, five seconds each, crossfaded, with
 * detuned voices for width and a lowpass so it never competes with speech.
 * A bed, not a song — it is there so the gaps between lines are not dead air.
 */
export function synthPad(dest, workDir) {
  // Fmaj7 -> Am7 -> Cmaj7 -> G6: slow, unresolved, neutral.
  const chords = [
    [87.31, 174.61, 220.0, 261.63, 329.63],
    [110.0, 220.0, 261.63, 329.63, 392.0],
    [65.41, 196.0, 246.94, 261.63, 329.63],
    [98.0, 196.0, 246.94, 293.66, 329.63],
  ];
  const each = 5.0;

  const voice = (hz, detune, gain) =>
    `${gain}*sin(2*PI*${(hz * detune).toFixed(3)}*t)+${(gain * 0.22).toFixed(3)}*sin(4*PI*${(hz * detune).toFixed(3)}*t)`;

  const parts = chords.map((notes, i) => {
    const expr = (detunes) =>
      notes.map((hz, n) => voice(hz, detunes[n % detunes.length], n === 0 ? 0.09 : 0.055)).join("+");
    const L = expr([1, 1.0031, 0.9978, 1.0017, 0.9985]);
    const R = expr([1, 0.9972, 1.0024, 0.9981, 1.0029]);
    const file = path.join(workDir, `pad-${i}.wav`);
    ff([
      "-f", "lavfi",
      "-i", `aevalsrc=${L}|${R}:s=${RATE}:d=${each}`,
      "-af", `afade=t=in:d=1.4:curve=qsin,afade=t=out:st=${each - 1.6}:d=1.6:curve=qsin`,
      "-y", file,
    ]);
    return file;
  });

  ff([
    ...parts.flatMap((p) => ["-i", p]),
    "-filter_complex",
    "[0][1]acrossfade=d=1.2[a];[a][2]acrossfade=d=1.2[b];[b][3]acrossfade=d=1.2," +
      "lowpass=f=1500,tremolo=f=0.18:d=0.18,aecho=0.8:0.7:90|160:0.28|0.18[out]",
    "-map", "[out]",
    "-y", dest,
  ]);
  return dest;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Measures integrated loudness, then applies a linear gain to hit `I`. */
function loudnorm(src, dest, target = TARGET) {
  const spec = `I=${target.I}:TP=${target.TP}:LRA=${target.LRA}`;
  const out = ff(["-i", src, "-af", `loudnorm=${spec}:print_format=json`, "-f", "null", "-"], { stderr: true });
  const json = JSON.parse(out.slice(out.lastIndexOf("{"), out.lastIndexOf("}") + 1));
  ff([
    "-i", src,
    "-af",
    `loudnorm=${spec}:measured_I=${json.input_i}:measured_TP=${json.input_tp}` +
      `:measured_LRA=${json.input_lra}:measured_thresh=${json.input_thresh}` +
      `:offset=${json.target_offset}:linear=true,aresample=${RATE}`,
    "-y", dest,
  ]);
  return { dest, input: +json.input_i, output: +json.output_i };
}

/** Finds a named effect in assets/sfx, whatever its extension. */
function sfxFile(config, name) {
  for (const ext of [".ogg", ".wav", ".mp3"]) {
    const file = at(config.paths.assets, "sfx", `${name}${ext}`);
    if (fs.existsSync(file)) return file;
  }
  throw new Error(`sound effect "${name}" not found in ${config.paths.assets}/sfx/`);
}

/** Resolves the music bed to a loudness-normalised WAV, or null for none. */
function prepareMusic(config, workDir) {
  const music = config.sound?.music;
  if (!music) return null;

  let src;
  if (music.src) {
    src = at(music.src);
    if (!fs.existsSync(src)) throw new Error(`music bed not found: ${music.src}`);
  } else if (music.generate === "pad") {
    src = synthPad(path.join(workDir, "pad.wav"), workDir);
  } else {
    throw new Error('sound.music needs either `src` (a file) or `generate: "pad"`');
  }
  // Normalise first, so `volume` means the same thing for every track.
  return loudnorm(src, path.join(workDir, "music-norm.wav"), { I: -16, TP: -1.5, LRA: 11 }).dest;
}

/* ------------------------------------------------------------------ */
/* The mix                                                             */
/* ------------------------------------------------------------------ */

/**
 * Mixes the film's soundtrack from the timeline. Returns stats worth printing.
 */
export function mixSoundtrack({ config, timeline, workDir, dest }) {
  const total = timeline.total;
  const inputs = [];
  const chains = [];
  const add = (file, opts = []) => {
    inputs.push(...opts, "-i", file);
    return inputs.filter((a) => a === "-i").length - 1;
  };
  const place = (idx, seconds, label, extra = "") => {
    const ms = Math.max(0, Math.round(seconds * 1000));
    chains.push(
      `[${idx}:a]aresample=${RATE},aformat=channel_layouts=stereo${extra},adelay=${ms}:all=1[${label}]`,
    );
    return `[${label}]`;
  };

  /* Voice: the intro sting's own audio, then every narration line. */
  const voice = [];
  if (timeline.audio.intro) {
    const { file, duration } = timeline.audio.intro;
    voice.push(place(add(file, ["-t", duration.toFixed(3)]), 0, "intro"));
  }
  for (const line of timeline.audio.narration) {
    voice.push(place(add(at(config.paths.tts, `${line.id}.mp3`)), line.at, `n_${line.id.replace(/\W/g, "_")}`));
  }
  chains.push(
    `${voice.join("")}amix=inputs=${voice.length}:normalize=0:duration=longest,` +
      `apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)},asplit=2[voice][key]`,
  );

  /* Effects. */
  const effects = [];
  const whooshes = new Map();
  timeline.audio.sfx.forEach((cue, i) => {
    let file;
    if (cue.name === "whoosh") {
      const key = cue.lead.toFixed(2);
      if (!whooshes.has(key)) whooshes.set(key, synthWhoosh(cue.lead, path.join(workDir, `whoosh-${key}.wav`)));
      file = whooshes.get(key);
    } else {
      file = sfxFile(config, cue.name);
    }
    const gain = (ROLE_GAIN[cue.role] ?? -16) + (config.sound?.sfxGain ?? 0);
    effects.push(place(add(file), cue.at, `fx${i}`, `,volume=${db(gain)}`));
  });

  /* Music bed, ducked by the voice. */
  const musicFile = prepareMusic(config, workDir);
  let music = null;
  if (musicFile) {
    const m = config.sound.music;
    const startAt = m.startAt ?? (timeline.audio.intro ? timeline.audio.intro.duration : 0);
    const length = total - startAt;
    const idx = add(musicFile, ["-stream_loop", "-1"]);
    chains.push(
      `[${idx}:a]aresample=${RATE},aformat=channel_layouts=stereo,atrim=0:${length.toFixed(3)},` +
        `volume=${db(m.volume ?? -12)},` +
        `afade=t=in:d=${(m.fadeIn ?? 2.5).toFixed(2)},` +
        `afade=t=out:st=${Math.max(0, length - (m.fadeOut ?? 3)).toFixed(3)}:d=${(m.fadeOut ?? 3).toFixed(2)},` +
        `adelay=${Math.round(startAt * 1000)}:all=1[bed]`,
    );
    // Duck the bed whenever the voice is present: fast in, slow release, so
    // it breathes back up in the gaps between lines instead of pumping.
    chains.push(
      `[bed][key]sidechaincompress=threshold=${m.duckThreshold ?? 0.015}:ratio=${m.duckRatio ?? 8}` +
        `:attack=25:release=650:makeup=1[music]`,
    );
    music = "[music]";
  } else {
    chains.push("[key]anullsink");
  }

  const layers = ["[voice]", ...(music ? [music] : []), ...effects];
  chains.push(
    `${layers.join("")}amix=inputs=${layers.length}:normalize=0:duration=first,` +
      `afade=t=in:d=0.4,afade=t=out:st=${(total - 1).toFixed(3)}:d=1,` +
      `atrim=0:${total.toFixed(3)}[mix]`,
  );

  const pre = path.join(workDir, "mix-pre.wav");
  ff([...inputs, "-filter_complex", chains.join(";"), "-map", "[mix]", "-ar", String(RATE), "-y", pre]);

  const norm = loudnorm(pre, dest);
  return {
    file: dest,
    duration: probe(dest),
    effects: effects.length,
    music: Boolean(music),
    loudness: norm.output,
  };
}
