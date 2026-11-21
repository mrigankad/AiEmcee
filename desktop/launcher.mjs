/**
 * AiEmcee desktop launcher. Bundled by desktop/build.mjs into AiEmcee.exe (a
 * Node single executable); also runs as plain `node desktop/launcher.mjs`.
 *
 *   1. one instance: a second launch asks the first to reopen its window, then exits
 *   2. finds the app files and a Node runtime, and makes sure ffmpeg and
 *      Playwright's Chromium are present (downloading them on first run)
 *   3. starts the studio server on a free port (and the built web UI, if any)
 *   4. waits for health, opens an Edge --app window (Chrome, then the default
 *      browser, as fallbacks)
 *   5. when the window closes, stops the servers and exits
 *
 * State lives in %LOCALAPPDATA%\AiEmcee: logs\, tools\ffmpeg\, browser-profile\.
 * See docs/16-desktop-and-memory.md.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const IS_WIN = process.platform === "win32";
const DATA = process.env.AIEMCEE_DESKTOP_HOME ?? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".local", "share"), "AiEmcee");
const LOGS = path.join(DATA, "logs");
const TOOLS = path.join(DATA, "tools");
fs.mkdirSync(LOGS, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const logFile = path.join(LOGS, `launcher-${stamp}.log`);
const logFd = fs.openSync(logFile, "a");

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(msg);
  fs.writeSync(logFd, `${line}\n`);
}
function fail(msg) {
  log(`error: ${msg}`);
  log(`log: ${logFile}`);
  if (IS_WIN && process.stdin.isTTY) {
    console.log("\nPress Enter to close.");
    try {
      fs.readSync(0, Buffer.alloc(1));
    } catch {
      /* no console */
    }
  }
  process.exit(1);
}

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

/* ---------------------------------------------------------------- */
/* Single instance                                                   */
/* ---------------------------------------------------------------- */
const PIPE = IS_WIN ? "\\\\.\\pipe\\aiemcee-desktop" : path.join(DATA, "desktop.sock");
let reopen = null; // set once the window is up

function claimInstance() {
  return new Promise((resolve) => {
    const server = net.createServer((sock) => {
      sock.on("data", (d) => {
        if (String(d).startsWith("open")) {
          log("another launch: reopening the window");
          reopen?.();
        }
        sock.end();
      });
    });
    server.once("error", () => {
      // Someone holds it: ask them to show their window.
      const c = net.connect(PIPE, () => c.end("open\n"));
      c.on("error", () => {
        // A stale socket file (POSIX only): remove and retry once.
        if (!IS_WIN) fs.rmSync(PIPE, { force: true });
        resolve(IS_WIN ? null : claimInstance());
      });
      c.on("close", () => resolve(null));
    });
    server.listen(PIPE, () => resolve(server));
  });
}

/* ---------------------------------------------------------------- */
/* App files and runtime                                             */
/* ---------------------------------------------------------------- */
/** The app folder: --app, AIEMCEE_APP, <exe dir>/app, or the repo the exe sits in. */
function findApp() {
  const exeDir = path.dirname(process.execPath);
  const here = typeof __filename === "string" ? path.dirname(__filename) : path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
  const candidates = [opt("--app"), process.env.AIEMCEE_APP, path.join(exeDir, "app"), exeDir, path.dirname(exeDir), path.resolve(here, "..")].filter(Boolean);
  for (const dir of candidates) if (fs.existsSync(path.join(dir, "bin", "aiemcee.mjs")) && fs.existsSync(path.join(dir, "studio", "server.mjs"))) return path.resolve(dir);
  return null;
}

/**
 * A real node.exe for the servers and stages. The exe itself cannot be one: a
 * single executable always runs its embedded launcher, whatever its arguments,
 * and the engine spawns process.execPath for every stage and `--check`.
 */
function findNode(app) {
  const exeDir = path.dirname(process.execPath);
  const isSea = (() => {
    try {
      return require("node:sea").isSea();
    } catch {
      return false;
    }
  })();
  const candidates = [process.env.AIEMCEE_NODE, path.join(exeDir, "runtime", IS_WIN ? "node.exe" : "node"), path.join(app, "runtime", IS_WIN ? "node.exe" : "node"), isSea ? null : process.execPath].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  // Node on PATH.
  const which = spawnSync(IS_WIN ? "where" : "which", ["node"], { encoding: "utf8", windowsHide: true });
  const found = which.status === 0 ? which.stdout.split(/\r?\n/).find(Boolean) : null;
  return found ?? null;
}

/* ---------------------------------------------------------------- */
/* Tools: ffmpeg and Chromium                                        */
/* ---------------------------------------------------------------- */
function works(cmd, args, env) {
  try {
    execFileSync(cmd, args, { stdio: "ignore", windowsHide: true, env });
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest) {
  log(`downloading ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length") || 0);
  const out = fs.createWriteStream(dest);
  let got = 0;
  let last = 0;
  for await (const chunk of res.body) {
    out.write(chunk);
    got += chunk.length;
    if (Date.now() - last > 250) {
      last = Date.now();
      process.stdout.write(`\r  ${(got / 1048576).toFixed(1)} MB${total ? ` of ${(total / 1048576).toFixed(1)} MB (${Math.round((got / total) * 100)}%)` : ""}   `);
    }
  }
  await new Promise((r) => out.end(r));
  process.stdout.write(`\r  ${(got / 1048576).toFixed(1)} MB done${" ".repeat(30)}\n`);
}

/** ffmpeg on PATH, else %LOCALAPPDATA%\AiEmcee\tools\ffmpeg, downloaded on first run. Returns a PATH entry or null. */
async function ensureFfmpeg(env) {
  const local = path.join(TOOLS, "ffmpeg", "bin");
  if (fs.existsSync(path.join(local, IS_WIN ? "ffmpeg.exe" : "ffmpeg"))) return local;
  if (works("ffmpeg", ["-version"], env) && works("ffprobe", ["-version"], env)) return null;
  if (!IS_WIN) throw new Error("ffmpeg is not installed: install it with your package manager");
  log("first run: ffmpeg is missing, fetching it (about 100 MB)");
  const tmp = path.join(TOOLS, "ffmpeg-download");
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  const zip = path.join(tmp, "ffmpeg.zip");
  await download(process.env.AIEMCEE_FFMPEG_URL ?? "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip", zip);
  log("unpacking ffmpeg");
  // tar.exe ships with Windows 10 1803+ and reads zip.
  execFileSync("tar", ["-xf", zip, "-C", tmp], { stdio: "inherit", windowsHide: true });
  const top = fs.readdirSync(tmp).find((d) => fs.existsSync(path.join(tmp, d, "bin", "ffmpeg.exe")));
  if (!top) throw new Error("the ffmpeg download has no bin/ffmpeg.exe");
  fs.rmSync(path.join(TOOLS, "ffmpeg"), { recursive: true, force: true });
  fs.renameSync(path.join(tmp, top), path.join(TOOLS, "ffmpeg"));
  fs.rmSync(tmp, { recursive: true, force: true });
  return local;
}

/** Playwright's Chromium (and headless shell), installed by Playwright's own CLI when missing. */
function ensureChromium(node, app, env) {
  const probe = spawnSync(node, ["-e", "const p=require('playwright').chromium.executablePath();process.stdout.write(require('fs').existsSync(p)?'yes':'no')"], { cwd: app, env, encoding: "utf8", windowsHide: true });
  if (probe.stdout === "yes") return;
  if (probe.status !== 0) throw new Error(`Playwright is not installed in ${app} (run npm ci there): ${probe.stderr.split("\n")[0]}`);
  log("first run: Playwright's Chromium is missing, installing it (about 150 MB)");
  const cli = path.join(app, "node_modules", "playwright", "cli.js");
  const run = spawnSync(node, [cli, "install", "chromium"], { cwd: app, env, stdio: "inherit", windowsHide: false });
  if (run.status !== 0) throw new Error("could not install Chromium (npx playwright install chromium)");
}

/* ---------------------------------------------------------------- */
/* Servers                                                           */
/* ---------------------------------------------------------------- */
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function get(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on("error", () => resolve(0));
    req.on("timeout", () => (req.destroy(), resolve(0)));
  });
}

async function waitHealthy(url, child, seconds) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    if (child.exitCode !== null) return false;
    const code = await get(url);
    if (code >= 200 && code < 400) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const children = [];
function start(name, cmd, args, opts) {
  const out = fs.openSync(path.join(LOGS, `${name}-${stamp}.log`), "a");
  fs.writeSync(out, `\n=== ${new Date().toISOString()} ${cmd} ${args.join(" ")}\n`);
  const child = spawn(cmd, args, { ...opts, stdio: ["ignore", out, out], windowsHide: true });
  children.push(child);
  child.on("exit", (code) => log(`${name} exited (${code})`));
  return child;
}

function stopAll() {
  for (const c of children) {
    if (c.exitCode !== null) continue;
    if (IS_WIN) spawnSync("taskkill", ["/pid", String(c.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    else c.kill("SIGTERM");
  }
}

/* ---------------------------------------------------------------- */
/* The window                                                        */
/* ---------------------------------------------------------------- */
function findBrowser() {
  if (process.env.AIEMCEE_BROWSER) return process.env.AIEMCEE_BROWSER;
  const pf = [process.env["ProgramFiles(x86)"], process.env.ProgramFiles, process.env.LOCALAPPDATA].filter(Boolean);
  const rel = [
    ["Microsoft", "Edge", "Application", "msedge.exe"],
    ["Google", "Chrome", "Application", "chrome.exe"],
  ];
  if (IS_WIN) for (const r of rel) for (const base of pf) if (fs.existsSync(path.join(base, ...r))) return path.join(base, ...r);
  for (const name of ["microsoft-edge", "google-chrome", "chromium"]) if (spawnSync("which", [name]).status === 0) return name;
  return null;
}

function openWindow(url) {
  const browser = findBrowser();
  if (!browser) {
    log(`no Edge or Chrome found: opening ${url} in the default browser`);
    if (IS_WIN) spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    else spawn(process.platform === "darwin" ? "open" : "xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    return null;
  }
  const profile = path.join(DATA, "browser-profile");
  log(`opening ${url} in ${path.basename(browser)} --app`);
  return spawn(browser, [`--app=${url}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--window-size=1440,900"], { stdio: "ignore" });
}

/* ---------------------------------------------------------------- */
/* Main                                                              */
/* ---------------------------------------------------------------- */
async function main() {
  console.log("AiEmcee\n");
  const lock = await claimInstance();
  if (!lock) {
    log("AiEmcee is already running: asked it to show its window");
    return process.exit(0);
  }

  const app = findApp();
  if (!app) fail(`could not find the app files (bin/aiemcee.mjs). Put them in ${path.join(path.dirname(process.execPath), "app")} or pass --app <dir>`);
  const node = findNode(app);
  if (!node) fail("no Node runtime: put node.exe in runtime\\ next to AiEmcee.exe, or install Node 20+");
  log(`app      ${app}\nnode     ${node}\nlogs     ${LOGS}`);

  const env = { ...process.env, FORCE_COLOR: "0" };
  if (has("--lean")) env.AIEMCEE_PROFILE = "lean";
  if (has("--standard")) env.AIEMCEE_PROFILE = "standard";
  try {
    const ffBin = await ensureFfmpeg(env);
    if (ffBin) {
      const key = Object.keys(env).find((k) => k.toUpperCase() === "PATH") ?? "PATH";
      env[key] = `${ffBin}${path.delimiter}${env[key] ?? ""}`;
    }
    ensureChromium(node, app, env);
  } catch (err) {
    fail(err.message);
  }

  const projects = opt("--projects") ?? process.env.AIEMCEE_PROJECTS ?? (fs.existsSync(path.join(app, "projects")) ? path.join(app, "projects") : path.join(os.homedir(), "Documents", "AiEmcee"));
  fs.mkdirSync(projects, { recursive: true });

  const studioPort = await freePort();
  const studioUrl = `http://127.0.0.1:${studioPort}`;
  const studio = start("studio", node, [path.join(app, "bin", "aiemcee.mjs"), "studio", "--port", String(studioPort), "--projects", projects], { cwd: app, env });
  log(`studio   starting on ${studioUrl}`);
  if (!(await waitHealthy(`${studioUrl}/api/status`, studio, 60))) {
    stopAll();
    fail(`the studio did not start: see ${path.join(LOGS, `studio-${stamp}.log`)}`);
  }

  // The web UI: `next start` when web/ has been built (it proxies the engine
  // to the studio); otherwise the studio's own built-in page.
  let url = studioUrl;
  const next = path.join(app, "web", "node_modules", "next", "dist", "bin", "next");
  if (!has("--studio-ui") && fs.existsSync(path.join(app, "web", ".next", "BUILD_ID")) && fs.existsSync(next)) {
    const webPort = await freePort();
    const web = start("web", node, [next, "start", "-p", String(webPort), "-H", "127.0.0.1"], { cwd: path.join(app, "web"), env: { ...env, AIEMCEE_STUDIO_URL: studioUrl, NODE_ENV: "production" } });
    log(`web      starting on http://127.0.0.1:${webPort}`);
    if (await waitHealthy(`http://127.0.0.1:${webPort}/`, web, 90)) url = `http://127.0.0.1:${webPort}`;
    else log("web UI did not start; using the studio's built-in page");
  }

  let quitting = false;
  const quit = (why) => {
    if (quitting) return;
    quitting = true;
    log(`shutting down (${why})`);
    stopAll();
    lock.close();
    setTimeout(() => process.exit(0), 300);
  };
  process.on("SIGINT", () => quit("Ctrl+C"));
  process.on("SIGTERM", () => quit("SIGTERM"));
  process.on("SIGHUP", () => quit("console closed"));
  studio.on("exit", () => quit("studio stopped"));

  const watch = (win) => {
    if (!win) {
      log("close this console window (or press Ctrl+C) to stop AiEmcee");
      return;
    }
    const opened = Date.now();
    win.on("exit", () => {
      // Edge hands a URL to an already-running browser on the same profile and
      // exits at once; then there is no window to watch, so the console decides.
      if (Date.now() - opened < 4000) log("the browser handed the window off; close this console (or Ctrl+C) to stop AiEmcee");
      else if (!has("--keep")) quit("window closed");
    });
  };
  reopen = () => watch(openWindow(url));
  if (has("--no-window")) log(`ready: ${url} (no window: --no-window)`);
  else reopen();
  log(`ready    ${url}`);
}

main().catch((err) => fail(err.stack ?? err.message));
