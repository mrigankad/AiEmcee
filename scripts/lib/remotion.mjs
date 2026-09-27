/**
 * Runs the Remotion CLI from the remotion/ project.
 *
 * A .cmd shim on Windows is a batch file, so it can only be launched through a
 * shell — and a shell does not quote the arguments Node hands it. Any space in
 * the checkout path would then split a path in half.
 *
 * So: nothing on the command line is allowed to contain a space. The bin
 * directory goes on PATH (an environment variable, which is immune to this),
 * and every path is passed relative to the remotion/ directory.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { at } from "./config.mjs";

export const REMOTION_DIR = at("remotion");
export const ENTRY = "src/index.ts";

const binDir = path.join(REMOTION_DIR, "node_modules", ".bin");
const exe = process.platform === "win32" ? "remotion.cmd" : "remotion";

export function assertRemotionInstalled() {
  if (!fs.existsSync(path.join(binDir, exe))) {
    throw new Error("remotion is not installed. Run:  npm --prefix remotion install");
  }
}

/** A path as the CLI should see it: relative to remotion/, forward slashes. */
export const rel = (abs) => path.relative(REMOTION_DIR, abs).split(path.sep).join("/");

export function remotion(args, { quiet = true } = {}) {
  assertRemotionInstalled();
  const bad = args.find((a) => a.includes(" "));
  if (bad) throw new Error(`remotion argument contains a space, which breaks on Windows: ${bad}`);

  execFileSync(exe, [...args, ...(quiet ? ["--log=error"] : [])], {
    cwd: REMOTION_DIR,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}` },
  });
}
