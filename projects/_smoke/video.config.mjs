/**
 * Smoke film for the engine: one captured scene of the local fixture in
 * ./site (serve it with `node projects/_smoke/site/serve.mjs`), one motion
 * scene. Exercises narrate -> capture (screencast, 4K) -> compose at 1080p60,
 * including a 2x focus move onto 12px text.
 */
import { defineProject } from "../../scripts/lib/defaults.mjs";

export default defineProject(import.meta.url, {
  name: "smoke",
  capture: { baseUrl: process.env.BASE_URL ?? "http://127.0.0.1:4317" },
  intro: null,
  sound: { music: null, sfx: true },
  sequence: [
    {
      id: "01-ui",
      from: "capture",
      look: "lock",
      lowerThird: { kicker: "Smoke", title: "12px text at 2x" },
      // box: [x, y, w, h] as fractions of the frame; the 12px card is top left.
      focus: [{ at: 4.0, until: 9.0, box: [0.02, 0.07, 0.42, 0.24], zoom: 2, label: "Zoomed 2x" }],
    },
    { id: "02-motion", from: "motion", composition: "Problem" },
  ],
});
