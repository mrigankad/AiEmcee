/**
 * Loads a project's video.config.mjs + narration.json and resolves its paths.
 *
 * Two roots:
 *   ENGINE   the repo root: scripts/, remotion/, shared assets (sfx, mark.svg).
 *   ROOT     the project being built. Every config path (narration, tts, raw,
 *            work, out, assets, intro/outro, clip sources) resolves here.
 *
 * The project is chosen by `--project <dir>` / `--project=<dir>` on the command
 * line or the AIEMCEE_PROJECT environment variable (bin/aiemcee.mjs sets it).
 * With neither, the project is the repo root itself, which keeps the original
 * single-film layout (root video.config.mjs) working unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function projectFromArgs() {
  const argv = process.argv;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--project" && argv[i + 1]) {
      const value = argv[i + 1];
      // Removed so scripts that read a positional scene id never see the dir.
      argv.splice(i, 2);
      return value;
    }
    if (argv[i].startsWith("--project=")) {
      const value = argv[i].slice("--project=".length);
      argv.splice(i, 1);
      return value;
    }
  }
  return null;
}

const requested = projectFromArgs() ?? process.env.AIEMCEE_PROJECT ?? null;

/** The project directory every config path is relative to. */
export const ROOT = requested ? path.resolve(requested) : ENGINE;

/** True when building a project directory, false for the legacy root film. */
export const IS_PROJECT = path.resolve(ROOT) !== path.resolve(ENGINE);

/** A short, filesystem-safe name for the project, used to stage its media. */
export const PROJECT_NAME = IS_PROJECT
  ? path.basename(ROOT).toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
  : null;

/** Absolute path from a project-relative one. */
export const at = (...parts) => path.resolve(ROOT, ...parts);

/** Absolute path inside the engine (remotion/, shared assets). */
export const engineAt = (...parts) => path.join(ENGINE, ...parts);

/** ffmpeg concat lists need forward slashes, even on Windows. */
export const posix = (file) => path.resolve(file).split(path.sep).join("/");

/** A path for log lines: relative to the cwd, forward slashes. */
export const show = (file) => path.relative(process.cwd(), file).split(path.sep).join("/") || ".";

export async function loadConfig() {
  const configFile = at("video.config.mjs");
  if (!fs.existsSync(configFile)) throw new Error(`no video.config.mjs in ${ROOT}`);
  const mod = await import(pathToFileURL(configFile).href);
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
    throw new Error("durations.json missing — run `narrate` first");
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * An asset by project-relative path, falling back to the engine's shared copy
 * (assets/sfx/*, for example) when the project does not carry its own.
 */
export function assetAt(...parts) {
  const own = at(...parts);
  if (fs.existsSync(own)) return own;
  const shared = engineAt(...parts);
  return fs.existsSync(shared) ? shared : own;
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
