/** Loads video.config.mjs + narration.json and resolves paths against the repo root. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Absolute path from a repo-relative one. */
export const at = (...parts) => path.join(ROOT, ...parts);

/** ffmpeg concat lists need forward slashes, even on Windows. */
export const posix = (file) => path.resolve(file).split(path.sep).join("/");

export async function loadConfig() {
  const mod = await import(pathToFileURL(at("video.config.mjs")).href);
  const config = mod.default;

  const narrationFile = at(config.paths.narration);
  if (!fs.existsSync(narrationFile)) {
    throw new Error(`narration file not found: ${config.paths.narration}`);
  }
  const narration = JSON.parse(fs.readFileSync(narrationFile, "utf8"));

  const ids = new Set(narration.map((n) => n.id));
  for (const scene of config.sequence) {
    if (!ids.has(scene.id)) {
      throw new Error(
        `sequence references "${scene.id}" but narration.json has no entry with that id`,
      );
    }
  }

  return { config, narration, narrationById: new Map(narration.map((n) => [n.id, n])) };
}

/** durations.json is written by narrate.mjs and read by capture + compose. */
export function loadDurations(config) {
  const file = at(config.paths.tts, "durations.json");
  if (!fs.existsSync(file)) {
    throw new Error("durations.json missing — run `npm run narrate` first");
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function resetDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
