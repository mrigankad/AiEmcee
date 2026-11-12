/**
 * TEMPLATE. Copy this folder to projects/<your-film>/ and edit.
 *
 *   cp -r projects/_template projects/my-film
 *   node bin/aiemcee.mjs doctor --project projects/my-film
 *   node bin/aiemcee.mjs film   --project projects/my-film
 *
 * This file only holds what differs from the engine defaults in
 * scripts/lib/defaults.mjs. Objects merge deeply; arrays replace.
 * All paths are relative to this folder.
 *
 * Defaults you get for free:
 *   film      1920x1080 @ 60 fps (design.tokens.json `video` to change)
 *   capture   HQ screencast: 1920x1080 CSS px at deviceScaleFactor 2
 *             (3840x2160 physical), PNG frames, lossless 60 fps intermediate
 *   render    Remotion, PNG frames, H.264 CRF 12
 *   master    x264 slow CRF 14, High profile, yuv420p, AAC 320k, faststart
 *   tone      "polished"; avatar off; generated music pad; Wayam AI intro sting
 */
import { defineProject } from "../../scripts/lib/defaults.mjs";

export default defineProject(import.meta.url, {
  /** Output file name: out/<name>.mp4 */
  name: "my-film",

  /** Narration voice (edge-tts). Audition: node bin/aiemcee.mjs narrate --project <dir> --audition */
  tts: { voice: "en-US-AndrewMultilingualNeural" },

  capture: {
    /** Your app, running as a production build. */
    baseUrl: process.env.BASE_URL ?? "http://localhost:3000",
    // viewport: { width: 1920, height: 1080 },
    // deviceScaleFactor: 2,
    // mode: "recordVideo",   // old, soft Playwright recorder; compatibility only
  },

  /** Logo sting before scene one (copy the file into ./assets). null to open cold. */
  intro: { src: "assets/wayam-ai-logo-reveal.mp4" },

  // direction: { tone: "polished" },            // polished | default | cinematic | app-store | deadpan
  // sound: { music: { src: "assets/music/bed.mp3", volume: -12 } },
  // avatar: { enabled: true },
  // poster: { scene: "01-hook", at: 2.0 },
  // render: { crf: 12 },                         // the silent picture
  // encode: { final: ["-c:v", "libx264", "-preset", "slow", "-crf", "14", "-profile:v", "high"] },

  /**
   * The running order. Every id must exist in narration.json.
   *   from: "capture"  driven live by scenes.mjs
   *   from: "motion"   a Remotion composition (remotion/src/scenes.ts registry)
   *   from: "clip"     cut from a recording: clip: { src, start, end, speed }
   * focus: [{ at, until, box: [x, y, w, h] (0..1 of the frame), zoom (<= 2 stays native), label }]
   */
  sequence: [
    {
      id: "01-hello",
      from: "capture",
      lowerThird: { kicker: "Product", title: "What this scene shows" },
      focus: [{ at: 2.0, until: 5.0, box: [0.1, 0.1, 0.4, 0.3], zoom: 1.6, label: "The part that matters" }],
    },
  ],
});
