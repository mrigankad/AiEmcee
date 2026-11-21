/**
 * Smoke test for the style templates.
 *
 * Checks that remotion/src/templates/registry.ts registers every style in
 * catalog.json (and nothing else), then mounts every `tpl-<style>-<template>`
 * preview composition with the catalog's example props and draws frames 0 and
 * 180 on AiEmcee Motion, failing on any page error.
 *
 *   node scripts/templates.test.mjs                     every style x template
 *   node scripts/templates.test.mjs iso-clay            one style (or iso-clay/hero)
 *   node scripts/templates.test.mjs --stills out/tpl    also save each frame as PNG
 *   node scripts/templates.test.mjs --frames 0,60,180   other frames
 *
 * One page, one frame at a time: it is a check, not a render, and stays light.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { codeHash } from "./lib/fast.mjs";
import { motionBundle } from "./lib/motion/bundle.mjs";
import { openMotion } from "./lib/motion/render.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const tdir = path.join(repo, "remotion", "src", "templates");
const catalog = JSON.parse(fs.readFileSync(path.join(tdir, "catalog.json"), "utf8"));

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const stillsDir = opt("--stills") ? path.resolve(opt("--stills")) : null;
const frames = (opt("--frames") ?? "0,180").split(",").map(Number);
const only = args.find((a, i) => !a.startsWith("--") && !["--stills", "--frames"].includes(args[i - 1]));

const problems = [];

/* Registry vs catalog, from the source: every catalog style imported, no stray ones. */
const registry = fs.readFileSync(path.join(tdir, "registry.ts"), "utf8");
const imported = new Set([...registry.matchAll(/from "\.\/styles\/([\w-]+)\/index"/g)].map((m) => m[1]));
for (const s of catalog.styles) {
  if (!imported.has(s.id)) problems.push(`registry.ts does not import style "${s.id}"`);
  if (!fs.existsSync(path.join(tdir, "styles", s.id, "index.tsx"))) problems.push(`missing styles/${s.id}/index.tsx`);
}
for (const id of imported) if (!catalog.styles.some((s) => s.id === id)) problems.push(`registry.ts imports "${id}", which is not in catalog.json`);

// Styles still missing are reported above and skipped here, so the rest are still checked.
const registered = (style) => imported.has(style) && fs.existsSync(path.join(tdir, "styles", style, "index.tsx"));
for (const p of problems) console.log(`  PROBLEM  ${p}`);

const todo = catalog.styles.flatMap((s) => catalog.templates.map((t) => ({ style: s.id, template: t.id })))
  .filter(({ style, template }) => !only || only === style || only === `${style}/${template}`)
  .filter(({ style }) => registered(style));


const bundleDir = await motionBundle(codeHash());
const motion = await openMotion({ bundleDir, publicDir: path.join(repo, "remotion", "public"), width: 1920, height: 1080, pages: 1, frameFormat: "png" });
if (stillsDir) fs.mkdirSync(stillsDir, { recursive: true });

try {
  const p = motion.pages[0];
  for (const { style, template } of todo) {
    const id = `tpl-${style}-${template}`;
    try {
      const config = await p.page.evaluate((id) => window.__motion.init(id, {}), id);
      if (config.width !== 1920 || config.height !== 1080) await p.page.setViewportSize({ width: config.width, height: config.height });
      for (const f of frames) {
        await p.page.evaluate((f) => window.__motion.seek(f), f);
        if (p.errors.length) throw new Error(`frame ${f}: ${p.errors.splice(0).join("\n    ")}`);
        if (stillsDir) {
          const { data } = await p.cdp.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: config.width, height: config.height, scale: 1 } });
          fs.writeFileSync(path.join(stillsDir, `${id}-${f}.png`), Buffer.from(data, "base64"));
        }
      }
      console.log(`  ok       ${id}`);
    } catch (err) {
      problems.push(`${id}: ${err.message}`);
      console.log(`  FAIL     ${id}\n    ${err.message}`);
      p.errors.splice(0);
    }
  }
} finally {
  await motion.close();
}

console.log(problems.length ? `\n  ${problems.length} problem(s)\n` : `\n  ${todo.length} template(s) render\n`);
process.exit(problems.length ? 1 : 0);
