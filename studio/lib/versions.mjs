/**
 * Versions: copies of a project's source files, taken before Rasa writes and
 * after every successful render. Stored in <project>/.aiemcee/versions/NNN/
 * with a meta.json. Undo restores the newest "before" snapshot.
 */
import fs from "node:fs";
import path from "node:path";

import { publish } from "./events.mjs";
import { readJson, SOURCE_FILES, stateDir, writeJson } from "./store.mjs";

const KEEP = 100;

const root = (project) => {
  const dir = path.join(stateDir(project), "versions");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

export function listVersions(project) {
  const dir = root(project);
  return fs
    .readdirSync(dir)
    .filter((d) => /^\d+$/.test(d))
    .sort()
    .map((d) => ({ id: Number(d), ...readJson(path.join(dir, d, "meta.json"), {}) }));
}

/** Copies the current source files into a new version. Returns its meta. */
export function snapshot(project, { label, kind = "manual", by = "you", job = null } = {}) {
  const dir = root(project);
  const versions = listVersions(project);
  const id = (versions.at(-1)?.id ?? 0) + 1;
  const dest = path.join(dir, String(id).padStart(4, "0"));
  fs.mkdirSync(dest, { recursive: true });
  const files = [];
  for (const name of SOURCE_FILES) {
    const src = path.join(project, name);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dest, name));
      files.push(name);
    }
  }
  const meta = { id, label: label ?? `version ${id}`, kind, by, job, files, createdAt: new Date().toISOString() };
  writeJson(path.join(dest, "meta.json"), meta);

  // Keep the newest KEEP versions.
  for (const old of versions.slice(0, Math.max(0, versions.length + 1 - KEEP))) {
    fs.rmSync(path.join(dir, String(old.id).padStart(4, "0")), { recursive: true, force: true });
  }
  publish("version", { project: path.basename(project), action: "created", version: meta });
  return meta;
}

function versionDir(project, id) {
  const dir = path.join(root(project), String(Number(id)).padStart(4, "0"));
  if (!fs.existsSync(dir)) throw Object.assign(new Error(`no version ${id}`), { status: 404 });
  return dir;
}

/** Restores a version's files over the current ones, after snapshotting the current state. */
export function restore(project, id, { by = "you" } = {}) {
  const dir = versionDir(project, id);
  const meta = readJson(path.join(dir, "meta.json"), {});
  snapshot(project, { label: `before restoring version ${id}`, kind: "before", by });
  for (const name of meta.files ?? []) fs.copyFileSync(path.join(dir, name), path.join(project, name));
  publish("version", { project: path.basename(project), action: "restored", version: meta });
  return meta;
}

/** Undo: restore the newest snapshot taken before a change ("before" kind). */
export function undo(project, { by = "you" } = {}) {
  const last = listVersions(project).filter((v) => v.kind === "before").at(-1);
  if (!last) throw Object.assign(new Error("nothing to undo"), { status: 409 });
  const dir = versionDir(project, last.id);
  for (const name of last.files ?? []) fs.copyFileSync(path.join(dir, name), path.join(project, name));
  // Mark it used so the next undo goes one further back.
  writeJson(path.join(dir, "meta.json"), { ...last, kind: "undone", undoneBy: by, undoneAt: new Date().toISOString() });
  publish("version", { project: path.basename(project), action: "undone", version: last });
  return last;
}

/** Line diff of each file in version `id` against the current source (or against version `against`). */
export function diff(project, id, against = null) {
  const a = versionDir(project, id);
  const b = against == null ? project : versionDir(project, against);
  const out = {};
  for (const name of SOURCE_FILES) {
    const left = fs.existsSync(path.join(a, name)) ? fs.readFileSync(path.join(a, name), "utf8") : "";
    const right = fs.existsSync(path.join(b, name)) ? fs.readFileSync(path.join(b, name), "utf8") : "";
    if (left !== right) out[name] = lineDiff(left, right);
  }
  return out;
}

/**
 * A line diff: [{ op: " " | "-" | "+", line }], changes with 2 lines of context.
 *
 * The lines both versions share at the start and the end are matched first,
 * in linear time; only the changed middle goes through the LCS table, which
 * is O(n·m) in that middle. A typical edit (a few lines in a script or
 * config) therefore costs O(n), and only a middle over 4M cells is refused.
 */
export function lineDiff(left, right) {
  const A = left.split("\n");
  const B = right.split("\n");
  let head = 0;
  while (head < A.length && head < B.length && A[head] === B[head]) head++;
  let tail = 0;
  while (tail < A.length - head && tail < B.length - head && A[A.length - 1 - tail] === B[B.length - 1 - tail]) tail++;
  const a = A.slice(head, A.length - tail);
  const b = B.slice(head, B.length - tail);
  const n = a.length;
  const m = b.length;
  if (n * m > 4_000_000) return [{ op: "!", line: "files too large to diff" }];

  // dp[i][j]: the LCS length of a[i..] and b[j..], one flat typed array.
  const w = m + 1;
  const dp = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    }
  }
  const ops = A.slice(0, head).map((line) => ({ op: " ", line }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ op: " ", line: a[i] });
      i++;
      j++;
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) ops.push({ op: "-", line: a[i++] });
    else ops.push({ op: "+", line: b[j++] });
  }
  while (i < n) ops.push({ op: "-", line: a[i++] });
  while (j < m) ops.push({ op: "+", line: b[j++] });
  for (const line of A.slice(A.length - tail)) ops.push({ op: " ", line });
  // Keep only changes plus 2 lines of context around them.
  const keep = new Set();
  ops.forEach((o, k) => {
    if (o.op !== " ") for (let d = -2; d <= 2; d++) keep.add(k + d);
  });
  return ops.filter((_, k) => keep.has(k));
}
