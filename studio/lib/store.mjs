/**
 * Per-project state that is not the film itself: <project>/.aiemcee/.
 * Plain JSON, written atomically (temp file + rename) so a crash mid-write
 * never leaves a half file behind.
 */
import fs from "node:fs";
import path from "node:path";

/** The four files that define a film. Everything the studio edits is one of these. */
export const SOURCE_FILES = ["narration.json", "scenes.mjs", "video.config.mjs", "design.tokens.json"];

export function stateDir(project) {
  const dir = path.join(project, ".aiemcee");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(tmp, file);
}
