/**
 * The one file you edit to point this pipeline at your own product.
 *
 * Everything downstream — narration, motion graphics, screen capture and the
 * final ffmpeg assembly — reads from here. Nothing else needs to change to
 * make a video about a different app.
 *
 * See docs/02-architecture.md for how each field is consumed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(fs.readFileSync(path.join(root, "design.tokens.json"), "utf8"));

export default {
  /** Shown in CLI output and used to name the final file. */
  name: "demo",

  /** Frame size and rate. Sourced from design.tokens.json so Remotion agrees. */
  video: tokens.video,

  /** Colors, fonts and the virtual-cursor look. Also from design.tokens.json. */
  tokens,

  /* ------------------------------------------------------------------ */
  /* Narration                                                           */
  /* ------------------------------------------------------------------ */
  tts: {
    /** `edge-tts --list-voices` for the full catalogue. */
    voice: "en-US-AndrewMultilingualNeural",
    /** Percentage strings, e.g. "-6%" to slow down, "+0%" for natural. */
    rate: "+0%",
    pitch: "+0Hz",
    volume: "+0%",
  },

  /* ------------------------------------------------------------------ */
  /* Screen capture                                                      */
  /* ------------------------------------------------------------------ */
  capture: {
    /**
     * Point this at a PRODUCTION build, not a dev server. Dev overlays,
     * hydration warnings and hot-reload toasts cannot appear in a production
     * build, so they can never land in the footage.
     */
    baseUrl: process.env.BASE_URL ?? "http://localhost:3000",

    /** Must match video.width/height, or compose.mjs has to rescale. */
    viewport: { width: tokens.video.width, height: tokens.video.height },

    /** 1 keeps files small; 2 gives a retina-crisp capture at 4x the bytes. */
    deviceScaleFactor: 1,

    /** Flags that keep colour and text rendering deterministic across machines. */
    launchArgs: ["--force-color-profile=srgb", "--disable-lcd-text", "--hide-scrollbars"],

    /** CSS selectors force-hidden in every scene. Framework error portals, cookie bars. */
    hide: [
      "nextjs-portal",
      "[data-nextjs-dialog-overlay]",
      "[data-nextjs-toast]",
      "#cookie-banner",
    ],

    /** Seconds to settle after a navigation, before choreography starts. */
    settleAfterNavigation: 0.9,
  },

  /* ------------------------------------------------------------------ */
  /* Timing                                                              */
  /* ------------------------------------------------------------------ */
  timing: {
    /** Silence appended after each scene's narration. The breathing room. */
    gap: 0.45,
    /** Extra seconds a clip must outlast its narration, so audio never clips. */
    tailPad: 0.9,
    /** Floor on the hold at the end of a scene, even if it already overran. */
    minPad: 0.6,
    /** Beat of silence after the intro sting, before scene one. */
    introTail: 0.35,
    /** How long the end card holds. */
    endHold: 3.2,
    /** Opening and closing fades on the finished film. */
    fadeIn: 0.5,
    fadeOut: 0.8,
  },

  /* ------------------------------------------------------------------ */
  /* Files                                                               */
  /* ------------------------------------------------------------------ */
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
   * Optional logo sting spliced in before scene one. Its own audio is kept.
   * Set to null to start cold on the first scene.
   */
  intro: null, // e.g. { src: "assets/logo-reveal.mp4" }

  /** Remotion composition used as the closing card. Set to null to skip. */
  outro: { composition: "EndCard" },

  /* ------------------------------------------------------------------ */
  /* The film                                                            */
  /* ------------------------------------------------------------------ */
  /**
   * Order of the finished video. Every `id` must exist in narration.json.
   *
   *   from: "capture" — driven by the matching function in scenes.mjs
   *   from: "motion"  — rendered by Remotion from `composition`
   *
   * `lowerThird` overlays an animated title card on a captured scene. It is
   * rendered as a transparent still by remotion/render.mjs, then composited.
   */
  sequence: [
    { id: "01-hook", from: "capture" },
    { id: "02-problem", from: "motion", composition: "Problem" },
    { id: "03-onboarding", from: "capture" },
    { id: "03b-pipeline", from: "motion", composition: "Pipeline" },
    {
      id: "04-feature",
      from: "capture",
      lowerThird: { kicker: "Discovery", title: "The AI explores your app" },
    },
    { id: "05-cta", from: "capture" },
  ],

  /** Final artefact. Extension decides the container; keep it .mp4. */
  output: "out/demo.mp4",

  /** Encoder settings. Raise crf for smaller files, lower it for cleaner text. */
  encode: {
    intermediate: ["-c:v", "libx264", "-preset", "medium", "-crf", "20"],
    final: ["-c:v", "libx264", "-preset", "slow", "-crf", "19"],
    audio: ["-c:a", "aac", "-b:a", "192k"],
  },
};
