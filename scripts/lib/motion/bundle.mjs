/**
 * AiEmcee Motion: the bundle. One esbuild pass turns the scenes (remotion/src)
 * and the runtime (remotion/engine) into a page the renderer loads.
 *
 *   "remotion"      resolves to remotion/engine/runtime.tsx: the scenes keep
 *                   their imports, the runtime is ours
 *   process.env     the browser has none; the page provides the film's values
 *                   (tokens) before the bundle runs, so one bundle serves
 *                   every project
 *   fonts, images   imported files are emitted beside the bundle
 *
 * Bundles are cached by the code hash in remotion/out/.motion/<hash>/.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { REMOTION_DIR } from "../remotion.mjs";

const SCENES = REMOTION_DIR;
const RUNTIME = path.join(SCENES, "engine", "runtime.tsx");

async function esbuild() {
  // esbuild lives with the scenes' dependencies.
  const req = createRequire(path.join(SCENES, "package.json"));
  return import(pathToFileURL(req.resolve("esbuild")).href);
}

const HTML = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="bundle.css">
<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}#root{position:absolute;inset:0}</style>
</head><body><div id="root"></div>
<script>
  // The film's values for process.env, set by the renderer in the URL hash.
  try { window.__AIEMCEE_ENV = JSON.parse(decodeURIComponent(location.hash.slice(1)) || "{}"); } catch { window.__AIEMCEE_ENV = {}; }
</script>
<script src="bundle.js"></script>
</body></html>
`;

/**
 * src/local.tsx holds per-film scenes and is private; a fresh checkout has only
 * the example. AIEMCEE_LOCAL=off builds without it: the engine as published.
 */
function localRegistry() {
  const own = path.join(SCENES, "src", "local.tsx");
  const off = process.env.AIEMCEE_LOCAL === "off";
  return fs.existsSync(own) && !off ? own : path.join(SCENES, "src", "local.example.tsx");
}

/** The one esbuild configuration: renders and the preview studio build the same page. */
function buildOptions(outdir, { minify = true } = {}) {
  return {
    entryPoints: { bundle: path.join(SCENES, "src", "index.ts") },
    outdir,
    absWorkingDir: SCENES,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "chrome120",
    jsx: "automatic",
    minify,
    sourcemap: minify ? false : "inline",
    alias: { remotion: RUNTIME },
    // Your own scenes (src/local.tsx, git-ignored) when present, else the empty
    // example. A plugin, because tsconfig "paths" (which TypeScript needs) would
    // otherwise win over an alias and always pick local.tsx.
    plugins: [localPlugin()],
    loader: { ".woff2": "file", ".woff": "file", ".png": "file", ".jpg": "file", ".svg": "file", ".webp": "file", ".json": "json" },
    assetNames: "assets/[name]-[hash]",
    define: { "process.env.NODE_ENV": minify ? '"production"' : '"development"' },
    // The scenes read process.env.REMOTION_AIEMCEE_TOKENS; give them a process.
    banner: { js: "var process = { env: Object.assign({ NODE_ENV: 'production' }, window.__AIEMCEE_ENV || {}) };" },
    logLevel: "error",
  };
}

function localPlugin() {
  return {
    name: "aiemcee-local",
    setup(b) {
      b.onResolve({ filter: /^@local$/ }, () => ({ path: localRegistry() }));
    },
  };
}

function finish(dir) {
  fs.writeFileSync(path.join(dir, "index.html"), HTML);
  if (!fs.existsSync(path.join(dir, "bundle.css"))) fs.writeFileSync(path.join(dir, "bundle.css"), "");
}

/**
 * A bundle that rebuilds itself whenever a scene or the runtime changes, for
 * the preview studio. `onBuild(errors)` runs after each rebuild.
 */
export async function motionWatch(dir, onBuild) {
  fs.mkdirSync(dir, { recursive: true });
  const { context } = await esbuild();
  const ctx = await context({
    ...buildOptions(dir, { minify: false }),
    plugins: [
      localPlugin(),
      {
        name: "aiemcee-notify",
        setup(b) {
          b.onEnd((r) => {
            if (!r.errors.length) finish(dir);
            onBuild(r.errors);
          });
        },
      },
    ],
  });
  await ctx.watch();
  return ctx;
}

/** Builds (or reuses) the bundle for `code`; returns its directory. */
export async function motionBundle(code, { log = console.log } = {}) {
  const root = path.join(SCENES, "out", ".motion");
  // The same code builds two bundles: with your local.tsx, and without it (AIEMCEE_LOCAL=off).
  const dir = path.join(root, code.slice(0, 16) + (localRegistry().endsWith("local.example.tsx") ? "-pub" : ""));
  if (fs.existsSync(path.join(dir, "index.html"))) return dir;

  const started = Date.now();
  const tmp = path.join(root, `.tmp-${process.pid}-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  const { build } = await esbuild();
  await build(buildOptions(tmp));
  finish(tmp);
  try {
    fs.renameSync(tmp, dir);
  } catch {
    // A sibling process built the same bundle first.
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // Keep the three newest bundles.
  const old = fs
    .readdirSync(root)
    .filter((d) => !d.startsWith("."))
    .map((d) => ({ d, t: fs.statSync(path.join(root, d)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
    .slice(3);
  for (const { d } of old) fs.rmSync(path.join(root, d), { recursive: true, force: true });
  log(`bundle   ${((Date.now() - started) / 1000).toFixed(1)}s  -> remotion/out/.motion/${code.slice(0, 16)}`);
  return dir;
}
