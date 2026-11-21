/**
 * Builds dist/AiEmcee.exe: a Node single executable application (SEA) that
 * runs desktop/launcher.mjs. No Electron, no signing.
 *
 *   node desktop/build.mjs              exe + runtime\node.exe (finds the app in the repo above dist\)
 *   node desktop/build.mjs --with-app   also copies the app into dist\app (a portable folder to zip)
 *
 * Steps: esbuild bundles the launcher to one CommonJS file -> node
 * --experimental-sea-config writes the blob -> a copy of node.exe gets the
 * icon (rcedit) -> postject injects the blob. See docs/16-desktop-and-memory.md.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const dist = path.join(repo, "dist");
const build = path.join(dist, "build");
const withApp = process.argv.includes("--with-app");
const IS_WIN = process.platform === "win32";
const exe = path.join(dist, IS_WIN ? "AiEmcee.exe" : "AiEmcee");
fs.mkdirSync(build, { recursive: true });

const step = (s) => console.log(`\n== ${s}`);
const npx = (args) => {
  const r = spawnSync(IS_WIN ? "npx.cmd" : "npx", ["--yes", ...args], { stdio: "inherit", shell: IS_WIN });
  if (r.status !== 0) throw new Error(`npx ${args.join(" ")} failed (${r.status})`);
};

// 1. Bundle the launcher (esbuild is a dependency of the scene package).
step("bundle launcher");
const esbuild = createRequire(path.join(repo, "remotion", "package.json"))("esbuild");
const main = path.join(build, "launcher.cjs");
await esbuild.build({
  entryPoints: [path.join(here, "launcher.mjs")],
  outfile: main,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  logLevel: "warning",
  // import.meta is only used outside a bundle, behind a __filename check.
  logOverride: { "empty-import-meta": "silent" },
});
console.log(`${path.relative(repo, main)}  ${(fs.statSync(main).size / 1024).toFixed(1)} KB`);

// 2. The icon: remotion/public/mark.svg drawn at 16-256 px into a PNG-entry .ico.
step("icon");
const ico = path.join(here, "aiemcee.ico");
if (!fs.existsSync(ico) || process.argv.includes("--icon")) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const svg = fs.readFileSync(path.join(repo, "remotion", "public", "mark.svg"), "utf8");
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = [];
  for (const s of sizes) {
    await page.setViewportSize({ width: s, height: s });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg style="width:${s}px;height:${s}px;display:block;border-radius:${Math.round(s * 0.2)}px" `)}</body></html>`);
    pngs.push(await page.screenshot({ omitBackground: true }));
  }
  await browser.close();
  // ICONDIR + one ICONDIRENTRY per size, then the PNG payloads (Vista+ reads PNG entries).
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(s >= 256 ? 0 : s, e);
    head.writeUInt8(s >= 256 ? 0 : s, e + 1);
    head.writeUInt16LE(1, e + 4); // planes
    head.writeUInt16LE(32, e + 6); // bpp
    head.writeUInt32LE(pngs[i].length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += pngs[i].length;
  });
  fs.writeFileSync(ico, Buffer.concat([head, ...pngs]));
}
console.log(`${path.relative(repo, ico)}  ${(fs.statSync(ico).size / 1024).toFixed(1)} KB`);

// 3. The SEA blob.
step("sea blob");
const blob = path.join(build, "sea-prep.blob");
const seaConfig = path.join(build, "sea-config.json");
fs.writeFileSync(seaConfig, JSON.stringify({ main, output: blob, disableExperimentalSEAWarning: true, useCodeCache: false }, null, 2));
execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit" });

// 4. A copy of this node binary, with the icon and the blob.
step("executable");
fs.rmSync(exe, { force: true });
fs.copyFileSync(process.execPath, exe);
if (IS_WIN) {
  try {
    // node.exe is Authenticode-signed; editing it invalidates that signature,
    // which is fine for an unsigned build (SmartScreen will ask once).
    // rcedit is a library (no bin): install it beside the build and call it.
    const tools = path.join(build, "tools");
    if (!fs.existsSync(path.join(tools, "node_modules", "rcedit"))) {
      const r = spawnSync(IS_WIN ? "npm.cmd" : "npm", ["install", "--prefix", tools, "--no-save", "--no-audit", "--no-fund", "rcedit@4"], { stdio: "inherit", shell: IS_WIN });
      if (r.status !== 0) throw new Error("npm install rcedit failed");
    }
    const mod = createRequire(path.join(tools, "package.json"))("rcedit");
    const rcedit = mod.rcedit ?? mod.default ?? mod;
    await rcedit(exe, { icon: ico, "version-string": { ProductName: "AiEmcee", FileDescription: "AiEmcee", CompanyName: "AiEmcee", OriginalFilename: "AiEmcee.exe" } });
    console.log("icon and version info set");
  } catch (err) {
    console.warn(`icon not set (${err.message}); the exe keeps Node's icon`);
  }
}
npx([
  "postject@1.0.0-alpha.6",
  exe,
  "NODE_SEA_BLOB",
  blob,
  "--sentinel-fuse",
  "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  ...(process.platform === "darwin" ? ["--macho-segment-name", "NODE_SEA"] : []),
]);
console.log(`${path.relative(repo, exe)}  ${(fs.statSync(exe).size / 1048576).toFixed(1)} MB`);

// 5. The runtime the servers and stages run on: a plain node next to the exe
//    (the exe itself always runs the launcher, whatever its arguments).
step("runtime");
const runtime = path.join(dist, "runtime");
fs.mkdirSync(runtime, { recursive: true });
fs.copyFileSync(process.execPath, path.join(runtime, path.basename(process.execPath)));
console.log(`${path.relative(repo, runtime)}\\${path.basename(process.execPath)}  Node ${process.version}`);

// 6. Optionally, the app itself: the npm package's files plus installed dependencies.
if (withApp) {
  step("app");
  const app = path.join(dist, "app");
  fs.rmSync(app, { recursive: true, force: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
  const skip = (rel) =>
    /(^|[\\/])(\.git|out|work|raw|tts|\.cache|\.next[\\/]cache)([\\/]|$)/.test(rel) || /^remotion[\\/]public[\\/](film|projects)([\\/]|$)/.test(rel) || /\.(mp4|mov|wav)$/i.test(rel);
  const copy = (rel) => {
    const src = path.join(repo, rel);
    if (!fs.existsSync(src)) return;
    fs.cpSync(src, path.join(app, rel), { recursive: true, filter: (s) => !skip(path.relative(repo, s)) });
  };
  for (const entry of pkg.files.filter((f) => !f.startsWith("!"))) copy(entry);
  for (const extra of ["package.json", "node_modules", "remotion/node_modules", "web"]) copy(extra);
  console.log(`${path.relative(repo, app)}  (zip dist\\ to ship: AiEmcee.exe, runtime\\, app\\)`);
}

console.log(`\nbuilt ${path.relative(repo, exe)}. Run it; logs go to %LOCALAPPDATA%\\AiEmcee\\logs.`);
