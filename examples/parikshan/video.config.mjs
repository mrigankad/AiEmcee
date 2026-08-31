/**
 * The Parikshan demo, as shipped: thirteen scenes, eight lower thirds, two
 * explainers, a logo sting and an end card. About three minutes.
 *
 * Copy this to the repo root as video.config.mjs to build it, along with
 * narration.json and scenes.mjs from this directory.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const tokens = JSON.parse(fs.readFileSync(path.join(root, "design.tokens.json"), "utf8"));

export default {
  name: "parikshan-demo",
  video: tokens.video,
  tokens,

  tts: {
    voice: "en-US-AndrewMultilingualNeural",
    rate: "+0%",
    pitch: "+0Hz",
    volume: "+0%",
  },

  capture: {
    // A production build on 3100. Not the dev server — a hot-reload toast in
    // scene nine would mean re-recording scene nine.
    baseUrl: process.env.BASE_URL ?? "http://localhost:3100",
    viewport: { width: tokens.video.width, height: tokens.video.height },
    deviceScaleFactor: 1,
    launchArgs: ["--force-color-profile=srgb", "--disable-lcd-text", "--hide-scrollbars"],
    hide: ["nextjs-portal", "[data-nextjs-dialog-overlay]", "[data-nextjs-toast]"],
    settleAfterNavigation: 0.9,
  },

  timing: {
    gap: 0.45,
    tailPad: 0.9,
    minPad: 0.6,
    introTail: 0.35,
    endHold: 3.2,
    fadeIn: 0.5,
    fadeOut: 0.8,
  },

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

  /** A pre-made logo animation, spliced in with its own audio. */
  intro: { src: "assets/wayam-ai-logo-reveal.mp4" },

  outro: { composition: "EndCard" },

  /**
   * Note the shape of the film:
   *   1  hook          the promise, acted out
   *   2  problem       motion — an argument, not a UI
   *   3  onboarding    how easy it is to start
   *   3b pipeline      motion — the whole loop, placed AFTER the product has
   *                    been seen moving, so the diagram means something
   *   4-11 capabilities  one idea each, titled
   *   12 cta           closes the loop back to scene one
   */
  sequence: [
    { id: "01-hook", from: "capture" },
    { id: "02-problem", from: "motion", composition: "Problem" },
    { id: "03-onboarding", from: "capture" },
    { id: "03b-pipeline", from: "motion", composition: "Pipeline" },
    {
      id: "04-discovery",
      from: "capture",
      lowerThird: { kicker: "Discovery", title: "The AI explores your app" },
    },
    {
      id: "05-map",
      from: "capture",
      lowerThird: { kicker: "Application map", title: "Every screen, every endpoint" },
    },
    {
      id: "06-plan",
      from: "capture",
      lowerThird: { kicker: "Test plan", title: "You approve before any code" },
    },
    {
      id: "07-prd",
      from: "capture",
      lowerThird: { kicker: "PRD analysis", title: "Requirements, traced to tests" },
    },
    {
      id: "08-code",
      from: "capture",
      lowerThird: { kicker: "Playwright", title: "Real code you own" },
    },
    {
      id: "09-run",
      from: "capture",
      lowerThird: { kicker: "Cloud runs", title: "Chromium, Firefox, WebKit" },
    },
    {
      id: "10-triage",
      from: "capture",
      lowerThird: { kicker: "Triage", title: "Heal, then quarantine" },
    },
    {
      id: "11-analytics",
      from: "capture",
      lowerThird: { kicker: "Quality gates", title: "Coverage, CI, Slack, Jira" },
    },
    { id: "12-cta", from: "capture" },
  ],

  output: "out/parikshan-demo.mp4",

  encode: {
    intermediate: ["-c:v", "libx264", "-preset", "medium", "-crf", "20"],
    final: ["-c:v", "libx264", "-preset", "slow", "-crf", "19"],
    audio: ["-c:a", "aac", "-b:a", "192k"],
  },
};
