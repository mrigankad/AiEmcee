/**
 * Board previews: one PNG of a board at time t
 * (GET /api/projects/:p/boards/:id/still.png?t=).
 *
 * Drawn on AiEmcee Motion (scripts/lib/motion/) from the preview composition
 * `tpl-<style>-<template>` with the board's props as input props, then cached
 * in <project>/.aiemcee/stills/<hash>.png, the hash covering everything the
 * picture depends on (template, style, props, t and the scene code), so an
 * unchanged board is never drawn twice.
 *
 * Memory: Chromium is the expensive part, so there is one browser with one
 * page, stills render one at a time through a serial queue, each with a
 * timeout, and the browser closes after a minute idle (an 8 GB laptop is
 * also running the studio, the app being filmed and maybe a render).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { stateDir } from "./store.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const lib = (p) => import(pathToFileURL(path.join(ROOT, "scripts", "lib", p)).href);

const TIMEOUT = Number(process.env.AIEMCEE_STILL_TIMEOUT_MS ?? 90_000); // the first still also builds the bundle
const IDLE = 60_000;
const KEEP = 400; // cached stills per project

const unavailable = (message) => Object.assign(new Error(message), { status: 503 });

/** The composition id for a board. Agent A registers these in remotion/src (docs/15). */
export const compositionId = (style, template) => `tpl-${style}-${template}`;

let motion = null; // { m, code, page, cdp }
let idleTimer = null;
let tail = Promise.resolve();

/** The scene code's hash, re-walked at most every 5 s (it reads every file under remotion/src). */
let hashed = { at: 0, code: null };
async function sceneCode() {
  if (Date.now() - hashed.at > 5000) {
    const { codeHash } = await lib("fast.mjs");
    hashed = { at: Date.now(), code: codeHash() };
  }
  return hashed.code;
}

async function openOnce() {
  const code = await sceneCode();
  if (motion && motion.code === code) return motion;
  if (motion) await closeMotion();
  const { motionBundle } = await lib("motion/bundle.mjs");
  const { openMotion } = await lib("motion/render.mjs");
  const bundleDir = await motionBundle(code, { log: () => {} });
  const m = await openMotion({ bundleDir, publicDir: path.join(ROOT, "remotion", "public"), width: 1920, height: 1080, pages: 1, browsers: 1, frameFormat: "png" });
  motion = { m, code, page: m.pages[0] };
  return motion;
}

async function closeMotion() {
  const m = motion;
  motion = null;
  await m?.m.close().catch(() => {});
}

function withTimeout(promise, ms, what) {
  let t;
  return Promise.race([promise, new Promise((_, reject) => (t = setTimeout(() => reject(Object.assign(new Error(`${what} timed out after ${ms / 1000}s`), { status: 504 })), ms)))]).finally(() => clearTimeout(t));
}

async function draw({ id, props, t }) {
  const { page: p } = await openOnce();
  let config;
  try {
    config = await p.page.evaluate(([id, props]) => window.__motion.init(id, props), [id, props]);
  } catch (err) {
    // TODO(agent A): remove once every tpl-<style>-<template> composition is registered.
    if (/no composition/.test(err.message)) throw unavailable(`preview composition ${id} is not available yet`);
    throw err;
  }
  p.mounted = null; // this module mounts directly; make the renderer remount next time
  const vp = p.page.viewportSize();
  if (!vp || vp.width !== config.width || vp.height !== config.height) await p.page.setViewportSize({ width: config.width, height: config.height });
  const frame = Math.max(0, Math.min(config.durationInFrames - 1, Math.round(t * config.fps)));
  await p.page.evaluate((f) => window.__motion.seek(f), frame);
  if (p.errors.length) throw new Error(p.errors.splice(0).join("\n"));
  const { data } = await p.cdp.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: config.width, height: config.height, scale: 1 }, captureBeyondViewport: false });
  return Buffer.from(data, "base64");
}

/** Runs `fn` after every earlier still: one at a time. */
function serial(fn) {
  const run = tail.then(fn, fn);
  tail = run.catch(() => {});
  return run;
}

/**
 * The PNG file for `board` at `t` seconds, drawn if not cached.
 * `style` is the resolved style (board -> boards.json -> config -> catalog default).
 */
export async function boardStill(dir, { board, style, t = 3 }) {
  const id = compositionId(style, board.template);
  const props = { ...(board.props ?? {}) };
  const key = crypto.createHash("sha1").update(JSON.stringify({ template: board.template, style, props, t, code: await sceneCode() })).digest("hex").slice(0, 24);
  const cache = path.join(stateDir(dir), "stills");
  const file = path.join(cache, `${key}.png`);
  if (fs.existsSync(file)) return file;

  return serial(async () => {
    if (fs.existsSync(file)) return file; // drawn while this request waited
    clearTimeout(idleTimer);
    try {
      const png = await withTimeout(draw({ id, props, t }), TIMEOUT, `still of ${board.id}`);
      fs.mkdirSync(cache, { recursive: true });
      fs.writeFileSync(`${file}.tmp`, png);
      fs.renameSync(`${file}.tmp`, file);
      prune(cache);
      return file;
    } catch (err) {
      // A timed-out or crashed page is not trusted again.
      if (err.status !== 503) await closeMotion();
      throw err;
    } finally {
      idleTimer = setTimeout(closeMotion, IDLE);
      idleTimer.unref?.();
    }
  });
}

function prune(cache) {
  const files = fs.readdirSync(cache).filter((f) => f.endsWith(".png"));
  if (files.length <= KEEP) return;
  const byAge = files.map((f) => ({ f, t: fs.statSync(path.join(cache, f)).mtimeMs })).sort((a, b) => a.t - b.t);
  for (const { f } of byAge.slice(0, files.length - KEEP)) fs.rmSync(path.join(cache, f), { force: true });
}

export const closeStills = closeMotion;
