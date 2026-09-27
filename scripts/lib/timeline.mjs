/**
 * Builds the film's timeline: one JSON document that both the picture (the
 * Remotion `Film` composition) and the sound (scripts/lib/mix.mjs) are cut
 * from.
 *
 * This is the metronome rule, kept intact. Every scene still owns exactly
 * `narration + gap` seconds, measured from tts/durations.json. What is new is
 * that transitions, titles, focus moves and sound cues are placed on that same
 * clock, so none of them can push the edit out of sync with the voice.
 *
 * Transitions sit *before* a scene's slot, in the silent gap that closes the
 * previous one: the incoming scene starts `lead` seconds early, underneath the
 * tail of the outgoing one. The voice for a scene therefore always lands on a
 * fully settled picture.
 */
import fs from "node:fs";

import { at } from "./config.mjs";
import { probe } from "./ffmpeg.mjs";
import { spokenText } from "./delivery.mjs";
import { envelope, fallbackCues, readSrt, timeWords } from "./voice.mjs";

export const TONES = JSON.parse(fs.readFileSync(at("remotion", "src", "film", "tones.json"), "utf8"));
delete TONES.$comment;

export const TRANSITIONS = ["cut", "fade", "dip", "zoom", "push", "wipe"];

export const AVATAR_MODES = ["host", "corner", "off"];
export const AVATAR_MOODS = ["neutral", "happy", "curious", "focused"];

/**
 * A scene's avatar mode: `"host"`, `"corner"` or `"off"`, or
 * `{ mode, mood }`. Footage defaults to the corner presenter; motion scenes
 * carry their own type, so the avatar steps out of their way.
 */
export function avatarFor(entry) {
  const value = entry.avatar;
  const mode = typeof value === "string" ? value : value?.mode ?? (entry.from === "motion" ? "off" : "corner");
  const mood = (typeof value === "object" && value?.mood) || (mode === "host" ? "happy" : "neutral");
  return { mode, mood };
}

/** The tone preset named in the config, with `direction` overrides merged over it. */
export function resolveTone(config) {
  const name = config.direction?.tone ?? "polished";
  const base = TONES[name];
  if (!base) {
    throw new Error(`unknown tone "${name}" — one of: ${Object.keys(TONES).join(", ")}`);
  }
  const over = config.direction ?? {};
  return {
    name,
    ...base,
    ...(over.transition ? { transition: normaliseTransition(over.transition, base.transition) } : {}),
    focus: { ...base.focus, ...over.focus },
    grade: { ...base.grade, ...over.grade },
    lowerThird: { ...base.lowerThird, ...over.lowerThird },
    sfx: { ...base.sfx, ...over.sfx },
    push: over.push ?? base.push,
  };
}

/** `"wipe"` or `{ type: "wipe", duration: 0.5 }` -> the object form. */
export function normaliseTransition(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "string") {
    return { type: value, duration: value === "cut" ? 0 : fallback.duration || 0.5 };
  }
  const type = value.type ?? fallback.type;
  return { type, duration: type === "cut" ? 0 : value.duration ?? (fallback.duration || 0.5) };
}

/** Where a sequence entry's footage lives on disk. Motion scenes have none. */
export function footageFor(config, entry) {
  if (entry.from === "clip") return at(config.paths.raw, `${entry.id}.mp4`);
  if (entry.from === "capture") return at(config.paths.raw, `${entry.id}.webm`);
  return null;
}

/**
 * @returns {{ timeline: object, media: Array<{ from: string, to: string }> }}
 *   `timeline` is written for Remotion to read; `media` lists every file the
 *   film needs staged into remotion/public, by its published name.
 */
export function buildTimeline(config, durations, narrationById = new Map()) {
  const tone = resolveTone(config);
  const { gap, introTail, endHold, fadeIn, fadeOut } = config.timing;
  const ltHold = tone.lowerThird.hold;
  const ltIn = config.timing.lowerThirdIn ?? 0.32;

  const segments = [];
  const narration = [];
  const sfx = [];
  const media = [];
  let t = 0;

  const cue = (role, time, extra = {}) => {
    const name = tone.sfx[role];
    if (name && config.sound?.sfx !== false) sfx.push({ role, name, at: +time.toFixed(3), ...extra });
  };

  const stage = (src, name) => {
    media.push({ from: src, to: `film/media/${name}` });
    return `film/media/${name}`;
  };

  /* Intro sting: plays with its own audio, then a beat of held frame. */
  let intro = null;
  if (config.intro) {
    const src = at(config.intro.src);
    if (!fs.existsSync(src)) throw new Error(`intro asset missing: ${config.intro.src}`);
    const length = probe(src);
    const slot = length + introTail;
    segments.push({
      id: "00-intro",
      kind: "video",
      src: stage(src, `00-intro${extOf(src)}`),
      srcDuration: length,
      start: 0,
      slot,
      lead: 0,
      transition: { type: "cut", duration: 0 },
      look: "lock",
      focus: [],
    });
    intro = { file: src, at: 0, duration: length };
    t = slot;
  }

  config.sequence.forEach((entry, index) => {
    const line = durations[entry.id];
    if (line == null) throw new Error(`no narration duration for ${entry.id} — run \`npm run narrate\``);
    const slot = line + gap;

    const first = index === 0 && !intro;
    const transition = first
      ? { type: "cut", duration: 0 }
      : normaliseTransition(entry.transition, tone.transition);
    const lead = transition.duration;

    const segment = {
      id: entry.id,
      start: +t.toFixed(4),
      slot: +slot.toFixed(4),
      lead,
      transition,
      look: entry.clip?.look ?? entry.look ?? "push",
      focus: (entry.focus ?? []).map((f) => ({ spotlight: true, ...f })),
      lowerThird: entry.lowerThird
        ? { ...entry.lowerThird, at: ltIn, hold: entry.lowerThird.hold ?? ltHold }
        : null,
    };

    if (entry.from === "motion") {
      segment.kind = "motion";
      segment.composition = entry.composition;
    } else {
      const file = footageFor(config, entry);
      if (!fs.existsSync(file)) {
        const how = entry.from === "clip" ? "npm run clip" : "npm run capture";
        throw new Error(`missing footage for ${entry.id}: run \`${how}\``);
      }
      segment.kind = "video";
      segment.src = stage(file, `${entry.id}${extOf(file)}`);
      segment.srcDuration = probe(file);
    }

    segment.avatar = avatarFor(entry);
    segments.push(segment);
    narration.push({ id: entry.id, at: segment.start, duration: line });

    if (lead > 0) cue("transition", segment.start - lead, { transition: transition.type, lead });
    if (segment.lowerThird) cue("lowerThird", segment.start + ltIn);
    // Focus times are in footage seconds, and footage starts `lead` early.
    for (const f of segment.focus) cue("focus", segment.start - lead + f.at);

    t += slot;
  });

  /* End card: no narration, so the last line has room to land. */
  if (config.outro) {
    const tr = normaliseTransition(config.outro.transition, tone.transition);
    const segment = {
      id: "zz-outro",
      start: +t.toFixed(4),
      slot: endHold,
      lead: tr.duration,
      transition: tr,
      look: "lock",
      focus: [],
      lowerThird: null,
    };
    if (config.outro.src) {
      const src = at(config.outro.src);
      if (!fs.existsSync(src)) throw new Error(`outro asset missing: ${config.outro.src}`);
      segment.kind = "video";
      segment.src = stage(src, `zz-outro${extOf(src)}`);
      segment.srcDuration = probe(src);
    } else {
      segment.kind = "motion";
      segment.composition = config.outro.composition;
    }
    segments.push(segment);
    if (tr.duration > 0) cue("transition", segment.start - tr.duration, { transition: tr.type, lead: tr.duration });
    cue("outro", segment.start + 0.15);
    t += endHold;
  }

  for (const seg of segments) seg.avatar ??= { mode: "off", mood: "neutral" };

  const timeline = {
    version: 1,
    fps: config.video.fps,
    width: config.video.width,
    height: config.video.height,
    total: +t.toFixed(4),
    fadeIn,
    fadeOut,
    tone,
    segments,
    audio: { intro, narration, sfx },
    avatar: buildAvatar(config, narration, narrationById, t),
  };

  return { timeline, media };
}

/**
 * The avatar's voice data on the film's clock: one envelope for the whole
 * film (so the orb speaks exactly when the narration does), and every caption
 * sentence at its absolute time.
 */
function buildAvatar(config, narration, narrationById, total) {
  const opts = config.avatar;
  if (!opts || opts.enabled === false) return null;

  const fps = config.video.fps;
  const env = new Array(Math.ceil(total * fps) + 1).fill(0);
  const cues = [];

  for (const line of narration) {
    const mp3 = at(config.paths.tts, `${line.id}.mp3`);
    const offset = Math.round(line.at * fps);
    envelope(mp3, fps).forEach((v, i) => {
      if (offset + i < env.length) env[offset + i] = Math.max(env[offset + i], v);
    });

    const srt = readSrt(at(config.paths.tts, `${line.id}.srt`));
    const text = spokenText(narrationById.get(line.id)?.text ?? "");
    const local = srt ? timeWords(srt) : text ? fallbackCues(text, line.duration) : [];
    for (const cue of local) {
      const shift = (x) => +(x + line.at).toFixed(3);
      cues.push({
        id: line.id,
        start: shift(cue.start),
        end: shift(cue.end),
        text: cue.text,
        words: cue.words.map((w) => ({ w: w.w, start: shift(w.start), end: shift(w.end) })),
      });
    }
  }

  return {
    size: opts.size ?? 124,
    captions: opts.captions !== false,
    envelope: env,
    cues,
  };
}

function extOf(file) {
  const m = /\.[a-z0-9]+$/i.exec(file);
  return m ? m[0].toLowerCase() : ".mp4";
}
