/**
 * Preflight. Every dependency this pipeline shells out to, checked in one go,
 * with the fix printed next to whatever is missing.
 *
 *   npm run doctor
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";

import { at, loadConfig } from "./lib/config.mjs";

const require = createRequire(import.meta.url);
const rows = [];

function check(label, fn, fix) {
  try {
    rows.push({ ok: true, label, detail: fn() ?? "" });
  } catch (err) {
    rows.push({ ok: false, label, detail: err.message.split("\n")[0], fix });
  }
}

const run = (cmd, args) =>
  execFileSync(cmd, args, { stdio: ["ignore", "pipe", "ignore"] }).toString();

check(
  "node >= 20",
  () => {
    const major = Number(process.versions.node.split(".")[0]);
    if (major < 20) throw new Error(`found v${process.versions.node}`);
    return `v${process.versions.node}`;
  },
  "install Node 20 or newer from nodejs.org",
);

check(
  "ffmpeg",
  () => run("ffmpeg", ["-version"]).split(/\s+/)[2],
  "winget install Gyan.FFmpeg  |  brew install ffmpeg  |  apt install ffmpeg",
);

check(
  "ffprobe",
  () => run("ffprobe", ["-version"]).split(/\s+/)[2],
  "ships with ffmpeg — put the whole bin directory on PATH",
);

check(
  "edge-tts",
  () => run("edge-tts", ["--version"]).trim().split(/\s+/).pop(),
  "pip install edge-tts   (then reopen your terminal so PATH updates)",
);

check(
  "playwright chromium",
  () => {
    // Importing playwright is not enough — the browser binary is a separate
    // download, and its absence only shows up when capture.mjs already ran.
    const { chromium } = require("playwright");
    const exe = chromium.executablePath();
    if (!fs.existsSync(exe)) throw new Error("browser binary not downloaded");
    return "installed";
  },
  "npm install && npx playwright install chromium",
);

check(
  "remotion dependencies",
  () => {
    if (!fs.existsSync(at("remotion", "node_modules", "remotion"))) {
      throw new Error("remotion/node_modules is empty");
    }
    return "installed";
  },
  "npm --prefix remotion install",
);

try {
  const { config, narration } = await loadConfig();
  const captured = config.sequence.filter((s) => s.from === "capture").length;
  const motion = config.sequence.filter((s) => s.from === "motion").length;
  const titles = config.sequence.filter((s) => s.lowerThird).length;
  rows.push({
    ok: true,
    label: "project config",
    detail:
      `${narration.length} narration lines, ${captured} captured + ${motion} motion scenes` +
      (titles ? `, ${titles} lower third(s)` : ""),
  });
} catch (err) {
  rows.push({
    ok: false,
    label: "project config",
    detail: err.message.split("\n")[0],
    fix: "see docs/03-writing-narration.md",
  });
}

const pad = Math.max(...rows.map((r) => r.label.length));
console.log();
for (const row of rows) {
  console.log(`  ${row.ok ? "ok  " : "--  "}${row.label.padEnd(pad)}   ${row.detail}`);
  if (!row.ok) console.log(`      ${" ".repeat(pad)}   fix: ${row.fix}`);
}

const failed = rows.filter((r) => !r.ok).length;
console.log(
  failed
    ? `\n${failed} problem(s) to fix before building.\n`
    : "\nAll good. Run `npm run build`.\n",
);
process.exit(failed ? 1 : 0);
