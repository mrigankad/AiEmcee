/**
 * RE-DOMS — the solar module chain-of-custody film.
 *
 * The product footage is not captured live. RE-DOMS is not running on this
 * machine, so every product scene is cut out of the existing screen recording
 * in `Redoms/` by scripts/clip.mjs (`from: "clip"`). The argument scenes are
 * Remotion. The metronome rule is unchanged: narration is measured first, and
 * both the picture and the audio are built from those same numbers.
 *
 * To move to live capture later: start RE-DOMS in production mode on
 * capture.baseUrl, write choreography in scenes.mjs, and flip the scene's
 * `from` to "capture". Nothing else here has to change.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(fs.readFileSync(path.join(root, "design.tokens.json"), "utf8"));

/** The source recording every clip scene is cut from. */
const DEMO = "Redoms/REDOMS Demo.mp4";

export default {
  name: "redoms-demo",
  video: tokens.video,
  tokens,

  /* ------------------------------------------------------------------ */
  /* Narration                                                           */
  /* ------------------------------------------------------------------ */
  tts: {
    // Energetic launch delivery. Every line is spoken a sentence at a time
    // (scripts/lib/delivery.mjs): base prosody here, plus the line's
    // `delivery` intent from narration.json, plus a contour within the line.
    // Audition voices by ear: `npm run narrate -- --audition`.
    voice: "en-US-BrianMultilingualNeural",
    rate: "+6%",
    pitch: "+2Hz",
    volume: "+0%",

    delivery: {
      presets: {
        hook: { rate: "-2%", pitch: "+3Hz" },     // big claim: room to land
        problem: { rate: "-4%", pitch: "-3Hz" },  // weight, still moving
        explain: { rate: "+0%", pitch: "+1Hz" },
        feature: { rate: "+3%", pitch: "+2Hz" },  // brisk, bright
        payoff: { rate: "-1%", pitch: "+4Hz" },   // lift
        close: { rate: "-5%", pitch: "+2Hz" },    // slower, sign-off
      },
      // Within a line: open with a lift, land the last sentence, raise questions.
      contour: {
        open: { pitch: "+2Hz" },
        land: { rate: "-3%", pitch: "-3Hz" },
        question: { pitch: "+4Hz" },
      },
    },

    // Seconds between sentences, and for a [beat] written in the script.
    pauses: { sentence: 0.18, beat: 0.5 },

    // Voice mastering: warmth and presence in dB. `master: false` for loudness only.
    master: { warmth: 2, presence: 3 },
  },

  /* ------------------------------------------------------------------ */
  /* Screen capture — unused while every product scene is a clip          */
  /* ------------------------------------------------------------------ */
  capture: {
    baseUrl: process.env.BASE_URL ?? "http://localhost:3000",
    viewport: { width: tokens.video.width, height: tokens.video.height },
    deviceScaleFactor: 1,
    launchArgs: ["--force-color-profile=srgb", "--disable-lcd-text", "--hide-scrollbars"],
    hide: ["nextjs-portal", "[data-nextjs-dialog-overlay]", "[data-nextjs-toast]"],
    settleAfterNavigation: 0.9,
  },

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */
  timing: {
    gap: 0.52,
    tailPad: 0.9,
    minPad: 0.6,
    introTail: 0.48,
    endHold: 4.2,
    fadeIn: 0.55,
    fadeOut: 0.95,
  },

  /* ------------------------------------------------------------------ */
  /* Direction — how the film looks and moves                            */
  /* ------------------------------------------------------------------ */
  /**
   * The tone sets default transitions, camera push, focus zoom, grade and
   * sound cues. One of: polished, default, cinematic, app-store, deadpan
   * (remotion/src/film/tones.json). Any field can be overridden here, e.g.
   * `transition: { type: "zoom", duration: 0.4 }` or `push: 0`.
   * A scene can set its own `transition` too.
   */
  direction: {
    tone: "polished",
  },

  /* ------------------------------------------------------------------ */
  /* Sound design                                                        */
  /* ------------------------------------------------------------------ */
  /**
   * music:  { src: "assets/music/bed.mp3" } for your own licensed track, or
   *         { generate: "pad" } for a synthesised ambient bed. Normalised to
   *         -16 LUFS, then `volume` dB, and ducked under the narration.
   *         Set to null for narration only.
   * sfx:    false to drop the effects the tone cues on transitions, titles
   *         and focus moves. `sfxGain` trims them all, in dB.
   */
  sound: {
    music: { generate: "pad", volume: -12 },
    sfx: true,
    sfxGain: 0,
  },

  /* ------------------------------------------------------------------ */
  /* Avatar — the Wayam AI presenter                                     */
  /* ------------------------------------------------------------------ */
  /**
   * An orb in the Wayam gradient that speaks the narration (it moves with the
   * voice) and shows what it says as captions. Each scene sets `avatar`:
   *   "host"    large, left of centre, over a blurred frame, big captions
   *   "corner"  small presenter bottom right, captions beside it (default
   *             for footage)
   *   "off"     out of the way (default for motion scenes)
   * or { mode, mood } with mood one of neutral, happy, curious, focused.
   * Set `enabled: false` to drop it from the film.
   */
  avatar: {
    enabled: true,
    size: 124,
    captions: true,
  },

  /**
   * The poster: the strongest settled frame, saved next to the video and
   * baked in as its frame 0, so every platform's thumbnail shows it.
   * `at` is seconds after the scene's narration starts.
   */
  poster: { scene: "07-scanning", at: 5.4 },

  paths: {
    narration: "narration.json",
    scenes: "scenes.mjs",
    tts: "tts",
    raw: "raw",
    motion: "remotion/out",
    work: "work",
    out: "out",
    assets: "assets",
  },

  /**
   * The Wayam AI logo sting, kept with its own audio. It plays before scene
   * one, then `timing.introTail` of silence lets it land before the narration
   * starts. Set to null to open cold on the product.
   */
  intro: { src: "assets/wayam-ai-logo-reveal.mp4" },

  /**
   * The real RE-DOMS logo animation, lifted from the tail of the source
   * recording. A rebuilt end card would be a worse version of a mark the
   * brand already animates.
   */
  outro: { src: "assets/redoms-endcard.mp4" },

  /* ------------------------------------------------------------------ */
  /* The film                                                            */
  /* ------------------------------------------------------------------ */
  /**
   *   1  hook            aerial of the modules — the scale of the problem
   *   1b workspace       the product, one project on the list
   *   2  problem         motion — the spreadsheet status quo
   *   3  loop            motion — the whole chain of custody, once
   *   4–8 capabilities   one idea each, titled
   *   9  cta             returns to the workspace
   *
   * `clip.start` / `clip.end` are seconds into the source recording. Windows
   * skip burned-in title cards and empty states in the original demo.
   * `look: "lock"` disables the slow push-in used on product UI.
   */
  sequence: [
    {
      id: "01-hook",
      from: "clip",
      avatar: { mode: "host", mood: "happy" },
      clip: { src: DEMO, start: 0.12, end: 6.05, speed: 0.66, look: "lock" },
      lowerThird: { kicker: "RE-DOMS", title: "Every module, on the record" },
    },
    {
      id: "01b-workspace",
      from: "clip",
      clip: { src: DEMO, start: 23.5, end: 36.8 },
      lowerThird: { kicker: "Workspace", title: "One project, every module" },
    },
    { id: "02-problem", from: "motion", composition: "Problem" },
    // One accent in the edit: the chain of custody arrives on a brand wipe.
    { id: "03-loop", from: "motion", composition: "Pipeline", transition: "wipe" },
    {
      id: "04-traceability",
      from: "clip",
      avatar: { mode: "corner", mood: "curious" },
      clip: { src: DEMO, start: 43.0, end: 56.3, speed: 0.93 },
      lowerThird: { kicker: "Traceability", title: "Any serial, its whole history" },
      focus: [
        { at: 0.4, until: 3.8, box: [0.18, 0.18, 0.68, 0.11] },
        { at: 4.8, until: 7.7, box: [0.36, 0.34, 0.3, 0.34], label: "Electroluminescence image, from the line" },
        { at: 8.1, until: 10.7, box: [0.03, 0.885, 0.95, 0.09], zoom: 1, label: "Flash test · junction box · pallet" },
      ],
    },
    {
      id: "05-pdi",
      from: "clip",
      avatar: { mode: "corner", mood: "focused" },
      clip: { src: DEMO, start: 56.8, end: 70.35, speed: 0.95 },
      lowerThird: { kicker: "PDI verification", title: "Every lot, against the file" },
      focus: [
        { at: 7.6, until: 10.1, box: [0.455, 0.595, 0.12, 0.25], label: "Every serial in the lot" },
        { at: 10.3, until: 12.45, box: [0.76, 0.87, 0.15, 0.06], label: "18,705 modules in one lot" },
      ],
    },
    {
      id: "06-inspections",
      from: "clip",
      avatar: { mode: "corner", mood: "focused" },
      // Starts past the card list, so the inspection form lands inside the line.
      clip: { src: DEMO, start: 75.5, end: 86.2, speed: 0.93 },
      lowerThird: { kicker: "Inspections", title: "The shop floor, on the record" },
      focus: [
        { at: 9.2, until: 11.2, box: [0.33, 0.55, 0.62, 0.35], label: "Every stage, against its specification" },
      ],
    },
    {
      id: "07-scanning",
      from: "clip",
      avatar: { mode: "corner", mood: "happy" },
      clip: { src: DEMO, start: 86.7, end: 96.6 },
      lowerThird: { kicker: "Table-wise scanning", title: "Which module, in which row" },
      focus: [
        { at: 4.0, until: 7.1, box: [0.05, 0.17, 0.455, 0.27], zoom: 1.56, label: "Panel by panel, into its position" },
      ],
    },
    {
      id: "08-summary",
      from: "clip",
      // Ends before the burned-in "Module reconciliation" truck card at ~118.8s.
      clip: { src: DEMO, start: 114.7, end: 118.7, speed: 0.48 },
      lowerThird: { kicker: "Graphical summary", title: "The project, in live numbers" },
      focus: [
        { at: 4.2, until: 7.1, box: [0.08, 0.22, 0.78, 0.36], zoom: 1.25, label: "Planned against verified" },
      ],
    },
    {
      id: "09-cta",
      from: "clip",
      avatar: { mode: "host", mood: "happy" },
      clip: { src: DEMO, start: 23.5, end: 38.0 },
    },
  ],

  output: "out/redoms-demo.mp4",

  encode: {
    intermediate: ["-c:v", "libx264", "-preset", "medium", "-crf", "20"],
    final: ["-c:v", "libx264", "-preset", "slow", "-crf", "19"],
    audio: ["-c:a", "aac", "-b:a", "192k"],
  },
};
