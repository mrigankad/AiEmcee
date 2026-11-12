/**
 * Engine defaults for every film under projects/.
 *
 * A project's video.config.mjs is only its differences:
 *
 *   import { defineProject } from "../../scripts/lib/defaults.mjs";
 *   export default defineProject(import.meta.url, {
 *     name: "my-film",
 *     capture: { baseUrl: "http://localhost:3000" },
 *     sequence: [ ... ],
 *   });
 *
 * Objects merge deeply over the defaults below; arrays (sequence, launchArgs,
 * hide, encode argument lists) replace. Paths stay relative to the project
 * directory; scripts/lib/config.mjs resolves them there.
 *
 * Tokens: the engine's design.tokens.json, then the project's own
 * design.tokens.json (if any) merged over it, then `tokens` from the overrides.
 * `video` comes from the merged tokens, defaulting to 1920x1080 at 60 fps.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const isPlain = (v) => v && typeof v === "object" && !Array.isArray(v);

/** Deep merge: plain objects merge, everything else (arrays included) replaces. */
export function merge(base, over) {
  if (!isPlain(base) || !isPlain(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = merge(base[k], v);
  return out;
}

const readJson = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {});

/** The frame every new film is made in. Footage is captured at 2x this. */
export const VIDEO = { width: 1920, height: 1080, fps: 60 };

export const DEFAULTS = {
  name: "film",

  tts: {
    voice: "en-US-AndrewMultilingualNeural",
    rate: "+4%",
    pitch: "+0Hz",
    volume: "+0%",
    delivery: {
      presets: {
        hook: { rate: "-2%", pitch: "+3Hz" },
        problem: { rate: "-4%", pitch: "-3Hz" },
        explain: { rate: "+0%", pitch: "+1Hz" },
        feature: { rate: "+3%", pitch: "+2Hz" },
        payoff: { rate: "-1%", pitch: "+4Hz" },
        close: { rate: "-5%", pitch: "+2Hz" },
      },
      contour: {
        open: { pitch: "+2Hz" },
        land: { rate: "-3%", pitch: "-3Hz" },
        question: { pitch: "+4Hz" },
      },
    },
    pauses: { sentence: 0.18, beat: 0.5 },
    master: { warmth: 2, presence: 3 },
  },

  /**
   * Screen capture. `mode`:
   *   "screencast"   (default) CDP Page.startScreencast at viewport x
   *                  deviceScaleFactor, every frame timestamped and written
   *                  losslessly, then assembled to constant-fps lossless
   *                  H.264. Sharp enough to zoom 2x on 12px UI text.
   *   "recordVideo"  Playwright's built-in recorder (VP8 webm, 1x, soft).
   *                  Kept for compatibility only.
   */
  capture: {
    mode: "screencast",
    baseUrl: process.env.BASE_URL ?? "http://localhost:3000",
    viewport: { width: VIDEO.width, height: VIDEO.height },
    deviceScaleFactor: 2,
    /**
     * Screencast frame format. "png" is lossless and, measured at 3840x2160 on
     * flat UI, as fast as JPEG (~30-33 fps either way). "jpeg" (+ quality) is
     * smaller for photographic pages but rings around text and is 4:2:0.
     */
    format: "png",
    quality: 95,
    launchArgs: ["--force-color-profile=srgb", "--disable-lcd-text", "--hide-scrollbars"],
    hide: ["nextjs-portal", "[data-nextjs-dialog-overlay]", "[data-nextjs-toast]"],
    settleAfterNavigation: 0.9,
    /**
     * Lossless intermediate the screencast frames are assembled into. A
     * keyframe every second (-g 60) keeps seeks cheap: the motion engine's
     * frame server starts a decoder at each render piece, and a seek decodes
     * from the previous keyframe.
     */
    intermediate: ["-c:v", "libx264", "-preset", "veryfast", "-qp", "0", "-pix_fmt", "yuv444p", "-g", "60"],
    /** Keep work/<scene>/frames after assembly (for debugging). */
    keepFrames: false,
  },

  timing: {
    gap: 0.52,
    tailPad: 0.9,
    minPad: 0.6,
    introTail: 0.48,
    endHold: 4.2,
    fadeIn: 0.55,
    fadeOut: 0.95,
  },

  direction: { tone: "polished" },

  sound: { music: { generate: "pad", volume: -12 }, sfx: true, sfxGain: 0 },

  avatar: { enabled: false, size: 124, captions: true },

  paths: {
    narration: "narration.json",
    scenes: "scenes.mjs",
    tts: "tts",
    raw: "raw",
    motion: "out/motion",
    work: "work",
    out: "out",
    assets: "assets",
  },

  // An intro sting is per film: set intro: { src: "assets/<your-sting>.mp4" } in the project.
  intro: null,
  outro: null,
  poster: null,

  sequence: [],

  /**
   * Picture render (AiEmcee Motion) and master (ffmpeg). docs/14-motion-engine.md.
   *   render.crf / imageFormat   the default (master) profile's chunks: crf 12, "png" or "jpeg"
   *   render.pages               render pages; default about half the hardware threads
   *   render.gl                  Chromium's graphics: unset or "angle" = hardware (D3D11 on
   *                              Windows); "software" = SwiftShader; anything else -> --use-gl
   *   render.fast / draft / master   per-profile overrides (crf, x264Preset, jpegQuality, scale, pages)
   *   encode.final               the delivered master
   */
  render: { crf: 12, imageFormat: "png" },

  encode: {
    intermediate: ["-c:v", "libx264", "-preset", "medium", "-crf", "16"],
    final: ["-c:v", "libx264", "-preset", "slow", "-crf", "14", "-profile:v", "high"],
    audio: ["-c:a", "aac", "-b:a", "320k"],
  },
};

/**
 * Builds a project's config from the engine defaults.
 * @param {string} metaUrl  the project's `import.meta.url`
 * @param {object} overrides
 */
export function defineProject(metaUrl, overrides = {}) {
  const dir = path.dirname(fileURLToPath(metaUrl));
  const tokens = merge(
    merge(merge(readJson(path.join(ENGINE, "design.tokens.json")), { video: VIDEO }), readJson(path.join(dir, "design.tokens.json"))),
    overrides.tokens ?? {},
  );
  delete tokens.$comment;

  const config = merge(DEFAULTS, { ...overrides, tokens });
  config.video = merge(tokens.video, overrides.video ?? {});
  config.output ??= `out/${config.name}.mp4`;
  config.projectDir = dir;
  return config;
}
