/**
 * Records one video file per captured scene by driving your running app.
 *
 * Every scene gets its own browser context, which is what produces one video
 * file per scene rather than one long take — and lets the compositor line each
 * clip up against its own narration track.
 *
 * Record against a PRODUCTION build. A dev server can render an error overlay,
 * a hydration warning or a hot-reload toast at any moment, and there is no way
 * to get that out of the footage afterwards.
 *
 *   npm run capture             every scene in the sequence
 *   npm run capture -- 05-cta   just one, while you iterate on it
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { at, ensureDir, loadConfig, loadDurations, resetDir } from "./lib/config.mjs";
import { Scene, cursorInitScript } from "./lib/scene.mjs";

const { config } = await loadConfig();
const durations = loadDurations(config);
const { SCENES } = await import(pathToFileURL(at(config.paths.scenes)).href);

const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
const outDir = ensureDir(at(config.paths.raw));

const planned = config.sequence.filter((s) => s.from === "capture" && (!only || s.id === only));

if (!planned.length) {
  // Asking for a scene that is not there is a mistake. Having no captured
  // scenes at all is a legitimate shape of film — every product scene may be
  // a clip — so `npm run build` must pass straight through it.
  if (only) {
    console.error(`no captured scene called "${only}"`);
    process.exit(1);
  }
  console.log("no captured scenes in the sequence — nothing to record");
  process.exit(0);
}

for (const scene of planned) {
  if (!SCENES[scene.id]) {
    throw new Error(`scenes.mjs has no choreography for "${scene.id}"`);
  }
}

console.log(`recording ${planned.length} scene(s) against ${config.capture.baseUrl}\n`);

// Imported here, not at the top, so a film made entirely of clips and motion
// never needs Playwright or a downloaded browser installed at all.
const { chromium } = await import("playwright");

const browser = await chromium.launch({ args: config.capture.launchArgs });
const initScript = cursorInitScript(config.tokens, config.capture.hide);

for (const entry of planned) {
  const id = entry.id;
  const target = durations[id];
  if (!target) throw new Error(`no narration duration for ${id} — run \`npm run narrate\``);

  // Playwright writes the video into a directory with a generated name, so
  // each scene records into a scratch dir that is emptied and then collapsed
  // to a single predictable file.
  const scratch = resetDir(path.join(outDir, id));

  const context = await browser.newContext({
    viewport: config.capture.viewport,
    deviceScaleFactor: config.capture.deviceScaleFactor,
    reducedMotion: "no-preference",
    recordVideo: { dir: scratch, size: config.capture.viewport },
  });
  await context.addInitScript(initScript);

  const page = await context.newPage();
  // Application logs and errors are the app's business, not the recording's.
  page.on("console", () => {});
  page.on("pageerror", () => {});

  const scene = new Scene(page, config);
  const started = Date.now();

  try {
    await SCENES[id](scene);
  } catch (err) {
    // A missed selector should cost one scene, not the whole run. The clip is
    // still written, so you can watch it and see exactly where it went wrong.
    console.warn(`  ! ${id}: ${err.message.split("\n")[0]}`);
  }

  // Hold the final frame until the clip outlasts its narration. Without this
  // the compositor would have to freeze-frame the tail, which looks dead.
  const elapsed = (Date.now() - started) / 1000;
  const pad = Math.max(config.timing.minPad, target + config.timing.tailPad - elapsed);
  await new Promise((r) => setTimeout(r, pad * 1000));

  await page.close();
  await context.close();

  const written = fs.readdirSync(scratch).find((f) => f.endsWith(".webm"));
  if (!written) throw new Error(`playwright wrote no video for ${id}`);
  fs.renameSync(path.join(scratch, written), path.join(outDir, `${id}.webm`));
  fs.rmSync(scratch, { recursive: true, force: true });

  const verdict = elapsed > target + config.timing.tailPad ? "  (choreography overran)" : "";
  console.log(
    `${id.padEnd(18)} narration ${target.toFixed(1)}s  drove ${elapsed.toFixed(1)}s  ` +
      `clip ${(elapsed + pad).toFixed(1)}s${verdict}`,
  );
}

await browser.close();
console.log("\ncapture complete");
