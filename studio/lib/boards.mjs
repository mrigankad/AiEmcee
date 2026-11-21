/**
 * Boards: a film's scenes as data (projects/<film>/boards.json). Spec:
 * docs/15-styles-and-boards.md.
 *
 * Every change is a list of ops (add | update | remove | move). A list is
 * validated against the style catalog and applied as a whole or not at all,
 * so the studio, the chat agent and the film never see half an edit. After a
 * change the two other files that name scenes follow:
 *
 *   narration.json     every board needs a line (the narration sets its length):
 *                      adding a board adds a placeholder line, removing one removes it
 *   video.config.mjs   the sequence gets / loses a `{ id, from: "board" }` entry.
 *                      The config is code, so it is only edited when the change is
 *                      unambiguous (see editSequence); otherwise it is left alone and
 *                      reported, and boards.json stays the source of truth for
 *                      from: "board" entries (scripts/lib/timeline.mjs reads it).
 *
 * The pure parts (validate, applyOps, deepMerge, sync helpers) take no paths,
 * so they are tested without a project; applyToProject does the file work.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { publish } from "./events.mjs";
import { readJson, stateDir, writeJson } from "./store.mjs";
import { snapshot } from "./versions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CATALOG_FILE = path.join(ROOT, "remotion", "src", "templates", "catalog.json");

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

/** The style catalog, re-read when it changes on disk (agent A edits it while the studio runs). */
let cached = null;
export function loadCatalog(file = CATALOG_FILE) {
  const at = fs.statSync(file).mtimeMs;
  if (cached?.file !== file || cached.at !== at) cached = { file, at, catalog: JSON.parse(fs.readFileSync(file, "utf8")) };
  return cached.catalog;
}

export const emptyBoards = () => ({ version: 1, boards: [] });

/* ---------------------------------------------------------------- */
/* Validation                                                        */
/* ---------------------------------------------------------------- */
const STATUSES = ["draft", "approved"];
const ID = /^[\w][\w.-]{0,63}$/;

/** Required props per template: [prop, check, message]. Lists carry their length range. */
const RULES = {
  hero: [["headline", (v) => text(v), "needs a headline"]],
  pipeline: [["steps", (v) => list(v, 3, 6, labelled), "needs 3 to 6 steps, each with a label"]],
  stack: [["layers", (v) => list(v, 2, 5, labelled), "needs 2 to 5 layers, each with a label"]],
  metrics: [["metrics", (v) => list(v, 1, 4, (m) => m && Number.isFinite(Number(m.value)) && text(m.label)), "needs 1 to 4 metrics, each with a numeric value and a label"]],
  endcard: [["title", (v) => text(v), "needs a title"]],
};
const text = (v) => typeof v === "string" && v.trim().length > 0;
const labelled = (x) => x && text(x.label);
const list = (v, min, max, each) => Array.isArray(v) && v.length >= min && v.length <= max && v.every(each);

/** Problems with one board, as strings; [] when it is valid. */
export function boardErrors(board, catalog) {
  const errs = [];
  if (!board || typeof board !== "object" || Array.isArray(board)) return ["a board must be an object"];
  const who = board.id ? `board ${board.id}` : "board";
  if (!ID.test(String(board.id ?? ""))) errs.push(`${who}: id must be letters, digits, . _ - (got ${JSON.stringify(board.id)})`);
  const tpl = catalog.templates.find((t) => t.id === board.template);
  if (!tpl) errs.push(`${who}: unknown template ${JSON.stringify(board.template)} (one of ${catalog.templates.map((t) => t.id).join(", ")})`);
  if (board.style != null && !catalog.styles.some((s) => s.id === board.style)) errs.push(`${who}: unknown style ${JSON.stringify(board.style)} (one of ${catalog.styles.map((s) => s.id).join(", ")})`);
  if (board.status != null && !STATUSES.includes(board.status)) errs.push(`${who}: status must be draft or approved`);
  if (board.notes != null && typeof board.notes !== "string") errs.push(`${who}: notes must be text`);
  const props = board.props ?? {};
  if (typeof props !== "object" || Array.isArray(props)) errs.push(`${who}: props must be an object`);
  else if (tpl) for (const [key, ok, msg] of RULES[tpl.id] ?? []) if (!ok(props[key])) errs.push(`${who}: ${tpl.id} ${msg} (props.${key})`);
  return errs;
}

/** Throws 400 listing every problem in a whole boards.json. */
export function validateDoc(doc, catalog) {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.boards)) throw badRequest("boards.json must be { version: 1, boards: [] }");
  const errs = [];
  if (doc.style != null && !catalog.styles.some((s) => s.id === doc.style)) errs.push(`unknown film style ${JSON.stringify(doc.style)}`);
  const seen = new Set();
  for (const b of doc.boards) {
    errs.push(...boardErrors(b, catalog));
    if (seen.has(b?.id)) errs.push(`board ${b.id}: id is used twice`);
    seen.add(b?.id);
  }
  if (errs.length) throw badRequest(errs.join("\n"));
}

/* ---------------------------------------------------------------- */
/* Ops                                                               */
/* ---------------------------------------------------------------- */
const plain = (v) => v && typeof v === "object" && !Array.isArray(v);

/** Objects merge key by key; arrays and everything else replace. `null` deletes a key. */
export function deepMerge(base, patch) {
  if (!plain(patch)) return structuredClone(patch);
  const out = plain(base) ? structuredClone(base) : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = plain(v) && plain(out[k]) ? deepMerge(out[k], v) : structuredClone(v);
  }
  return out;
}

/** The next free "NN-<template>" id. */
export function nextId(boards, template) {
  const nums = boards.map((b) => Number(/^(\d+)-/.exec(b.id)?.[1] ?? 0));
  const n = Math.max(boards.length, ...nums, 0) + 1;
  const taken = new Set(boards.map((b) => b.id));
  for (let k = n; ; k++) {
    const id = `${String(k).padStart(2, "0")}-${template}`;
    if (!taken.has(id)) return id;
  }
}

const PATCHABLE = ["template", "style", "props", "status", "notes"];

/**
 * Applies `ops` to `doc` without touching it. Returns { doc, added, removed }
 * (board ids), or throws 400 naming the first op that is wrong; nothing is
 * applied then. The result is validated as a whole, so an update that changes
 * a template must bring that template's required props.
 */
export function applyOps(doc, ops, catalog) {
  if (!Array.isArray(ops) || !ops.length) throw badRequest("ops must be a non-empty array");
  const next = structuredClone(doc ?? emptyBoards());
  next.version ??= 1;
  next.boards ??= [];
  const added = [];
  const removed = [];
  const at = (id, k) => {
    const i = next.boards.findIndex((b) => b.id === id);
    if (i < 0) throw badRequest(`op ${k}: no board ${JSON.stringify(id)}`);
    return i;
  };
  const clampIndex = (index, len, k) => {
    if (index == null) return len;
    if (!Number.isInteger(index)) throw badRequest(`op ${k}: index must be an integer`);
    return Math.max(0, Math.min(len, index));
  };

  ops.forEach((o, k) => {
    if (!plain(o)) throw badRequest(`op ${k}: must be an object`);
    if (o.op === "add") {
      if (!plain(o.board)) throw badRequest(`op ${k}: add needs a board`);
      const tpl = catalog.templates.find((t) => t.id === o.board.template);
      const board = {
        id: o.board.id ?? (tpl ? nextId(next.boards, tpl.id) : undefined),
        template: o.board.template,
        ...(o.board.style != null ? { style: o.board.style } : {}),
        // No props: start from the catalog example, so a bare { template } is a valid board.
        props: structuredClone(o.board.props ?? tpl?.example ?? {}),
        status: o.board.status ?? "draft",
        ...(o.board.notes != null ? { notes: o.board.notes } : {}),
      };
      if (next.boards.some((b) => b.id === board.id)) throw badRequest(`op ${k}: board ${board.id} already exists`);
      const errs = boardErrors(board, catalog);
      if (errs.length) throw badRequest(`op ${k}: ${errs.join("; ")}`);
      next.boards.splice(clampIndex(o.index, next.boards.length, k), 0, board);
      added.push(board.id);
    } else if (o.op === "update") {
      const i = at(o.id, k);
      if (!plain(o.patch)) throw badRequest(`op ${k}: update needs a patch`);
      const extra = Object.keys(o.patch).filter((f) => !PATCHABLE.includes(f));
      if (extra.length) throw badRequest(`op ${k}: cannot patch ${extra.join(", ")} (only ${PATCHABLE.join(", ")})`);
      const b = next.boards[i];
      const merged = { ...b };
      for (const f of PATCHABLE) {
        if (!(f in o.patch)) continue;
        if (f === "props") merged.props = deepMerge(b.props ?? {}, o.patch.props ?? {});
        else if (o.patch[f] === null) delete merged[f];
        else merged[f] = o.patch[f];
      }
      const errs = boardErrors(merged, catalog);
      if (errs.length) throw badRequest(`op ${k}: ${errs.join("; ")}`);
      next.boards[i] = merged;
    } else if (o.op === "remove") {
      const i = at(o.id, k);
      next.boards.splice(i, 1);
      if (added.includes(o.id)) added.splice(added.indexOf(o.id), 1);
      else removed.push(o.id);
    } else if (o.op === "move") {
      const i = at(o.id, k);
      const [b] = next.boards.splice(i, 1);
      next.boards.splice(clampIndex(o.index, next.boards.length, k), 0, b);
    } else if (o.op === "style") {
      // The film's style: boards without their own style follow it. clearOverrides drops theirs too.
      if (!catalog.styles.some((s) => s.id === o.style)) throw badRequest(`op ${k}: unknown style ${JSON.stringify(o.style)}`);
      next.style = o.style;
      if (o.clearOverrides) for (const b of next.boards) delete b.style;
    } else throw badRequest(`op ${k}: unknown op ${JSON.stringify(o.op)} (add, update, remove, move, style)`);
  });
  validateDoc(next, catalog);
  return { doc: next, added, removed };
}

/* ---------------------------------------------------------------- */
/* Narration                                                         */
/* ---------------------------------------------------------------- */
const sentence = (s) => {
  const t = String(s ?? "").trim();
  return !t ? "" : /[.!?]$/.test(t) ? t : `${t}.`;
};
const joinList = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** A first line of narration from a board's props: valid for narrate, meant to be rewritten. */
export function placeholderLine(board) {
  const p = board.props ?? {};
  const title = p.headline ?? p.title ?? board.id;
  let text;
  if (board.template === "hero") text = [sentence(p.headline), sentence(p.sub)].join(" ");
  else if (board.template === "pipeline") text = `${sentence(p.headline)} ${sentence(joinList((p.steps ?? []).map((s) => s.label)))}`;
  else if (board.template === "stack") text = `${sentence(p.headline)} ${sentence(joinList((p.layers ?? []).map((l) => l.label)))}`;
  else if (board.template === "metrics") {
    const nums = (p.metrics ?? []).map((m) => `${Number(m.value).toFixed(m.decimals ?? 0)}${m.suffix ?? ""} ${m.label}`.trim());
    text = `${sentence(p.headline)} ${sentence(joinList(nums))}`;
  } else if (board.template === "endcard") text = [sentence(p.title), sentence(p.tagline)].join(" ");
  else text = sentence(title);
  return { id: board.id, title: String(title), delivery: board.template === "endcard" ? "close" : board.template === "hero" ? "hook" : "explain", text: text.replace(/\s+/g, " ").trim() || sentence(title) };
}

/**
 * narration.json after boards were added or removed. Lines of other scenes
 * (captures, clips) stay where they are; an added board's line goes after the
 * line of the board before it, or after the last line.
 */
export function syncNarration(lines, doc, { added = [], removed = [] }) {
  let out = (Array.isArray(lines) ? lines : []).filter((l) => !removed.includes(l.id));
  for (const id of added) {
    if (out.some((l) => l.id === id)) continue; // an existing line keeps its words
    const i = doc.boards.findIndex((b) => b.id === id);
    const before = doc.boards.slice(0, i).reverse().find((b) => out.some((l) => l.id === b.id));
    const at = before ? out.findIndex((l) => l.id === before.id) + 1 : out.length;
    out = [...out.slice(0, at), placeholderLine(doc.boards[i]), ...out.slice(at)];
  }
  return out;
}

/* ---------------------------------------------------------------- */
/* video.config.mjs sequence                                         */
/* ---------------------------------------------------------------- */

/**
 * Finds the `sequence: [ ... ]` array in a config's source: { open, close }
 * offsets of its brackets, or null. Skips strings, template literals and
 * comments while matching brackets; a config with two `sequence:` keys (a
 * spread, a variable) is not guessed at.
 */
export function findSequence(src) {
  const keys = [...src.matchAll(/(^|[\s,{])sequence\s*:\s*\[/g)];
  if (keys.length !== 1) return null;
  const open = keys[0].index + keys[0][0].length - 1;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "/") i = src.indexOf("\n", i) < 0 ? src.length : src.indexOf("\n", i);
    else if (c === "/" && src[i + 1] === "*") i = src.indexOf("*/", i + 2) + 1 || src.length;
    else if (c === '"' || c === "'" || c === "`") {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
    } else if (c === "[" || c === "{" || c === "(") depth++;
    else if (c === "]" || c === "}" || c === ")") {
      depth--;
      if (depth === 0) return c === "]" ? { open, close: i } : null;
    }
  }
  return null;
}

const entryLine = (id) => `{ id: ${JSON.stringify(id)}, from: "board" },`;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A one-line `{ id: "<id>", from: "board" }` entry, the only shape this file edits. */
const entryRe = (id) => new RegExp(`^([ \\t]*)\\{\\s*id:\\s*["']${escapeRe(id)}["']\\s*,\\s*from:\\s*["']board["']\\s*\\},?[ \\t]*\\r?\\n`, "m");

/** The sequence array's source for a list of entries, at the config's usual indent. */
export function sequenceSource(ids, indent = "  ") {
  if (!ids.length) return "[]";
  return `[\n${ids.map((id) => `${indent}  ${entryLine(id)}`).join("\n")}\n${indent}]`;
}

/**
 * Adds and removes `{ id, from: "board" }` entries in a config's source.
 * Returns { src, skipped: [reasons] }. An entry is removed only when it is
 * that exact one-liner; one is added after the previous board's entry, or at
 * the end of the array. Anything else is skipped and reported, never guessed.
 */
export function editSequence(src, doc, { added = [], removed = [] }) {
  const skipped = [];
  let out = src;
  for (const id of removed) {
    const m = entryRe(id).exec(out);
    if (m) out = out.slice(0, m.index) + out.slice(m.index + m[0].length);
    else if (new RegExp(`id:\\s*["']${escapeRe(id)}["']`).test(out)) skipped.push(`${id}: its sequence entry is not a plain { id, from: "board" } line; remove it by hand`);
  }
  for (const id of added) {
    if (new RegExp(`id:\\s*["']${escapeRe(id)}["']`).test(out)) continue; // already in the sequence
    const seq = findSequence(out);
    if (!seq) {
      skipped.push(`${id}: could not find one sequence: [ ... ] in video.config.mjs; add { id: "${id}", from: "board" } by hand`);
      continue;
    }
    const i = doc.boards.findIndex((b) => b.id === id);
    const prev = doc.boards.slice(0, i).reverse().map((b) => entryRe(b.id).exec(out)).find(Boolean);
    if (prev) {
      const at = prev.index + prev[0].length;
      out = `${out.slice(0, at)}${prev[1]}${entryLine(id)}\n${out.slice(at)}`;
      continue;
    }
    // At the end: indent like the closing bracket's line, one level in.
    const lineStart = out.lastIndexOf("\n", seq.close) + 1;
    const closeIndent = /^[ \t]*/.exec(out.slice(lineStart))[0];
    const body = out.slice(seq.open + 1, seq.close);
    if (!body.trim()) {
      out = `${out.slice(0, seq.open)}${sequenceSource([id], closeIndent)}${out.slice(seq.close + 1)}`;
      continue;
    }
    // Make sure the last entry ends with a comma before appending.
    let before = out.slice(0, seq.close).replace(/[ \t]*$/, "");
    const tail = before.replace(/(\s|\/\/[^\n]*)*$/, "");
    if (!/[,[]$/.test(tail)) before = `${tail},${before.slice(tail.length)}`;
    if (!before.endsWith("\n")) before += "\n";
    out = `${before}${closeIndent}  ${entryLine(id)}\n${closeIndent}${out.slice(seq.close)}`;
  }
  return { src: out, skipped };
}

/** `node --check` on module source; returns null or the error. */
function checkModule(src) {
  const tmp = path.join(os.tmpdir(), `aiemcee-boards-${process.pid}-${Date.now()}.mjs`);
  fs.writeFileSync(tmp, src);
  try {
    execFileSync(process.execPath, ["--check", tmp], { stdio: ["ignore", "ignore", "pipe"] });
    return null;
  } catch (err) {
    return err.stderr?.toString().split("\n").slice(1, 4).join(" ").trim() || "syntax error";
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/* ---------------------------------------------------------------- */
/* Project files                                                     */
/* ---------------------------------------------------------------- */
export const boardsFile = (dir) => path.join(dir, "boards.json");
export const readBoards = (dir) => readJson(boardsFile(dir), null) ?? emptyBoards();

/**
 * Applies ops to a project: validates, snapshots (one undo step), writes
 * boards.json and, when boards came or went, narration.json and the config's
 * sequence, appends the ops to .aiemcee/board-ops.jsonl and publishes a
 * `boards` event. Returns { boards, sync: { narration, sequence, skipped } }.
 */
export function applyToProject(dir, ops, { by = "you", catalog = loadCatalog() } = {}) {
  const { doc, added, removed } = applyOps(readBoards(dir), ops, catalog);
  const project = path.basename(dir);
  const sync = { narration: false, sequence: false, skipped: [] };

  // Work out every new file first: a bad config edit must not leave boards.json written alone.
  const writes = [];
  if (added.length || removed.length) {
    const narrationPath = path.join(dir, "narration.json");
    const lines = readJson(narrationPath, []);
    const nextLines = syncNarration(lines, doc, { added, removed });
    if (JSON.stringify(nextLines) !== JSON.stringify(lines)) {
      writes.push(() => writeJson(narrationPath, nextLines));
      sync.narration = true;
    }
    const configPath = path.join(dir, "video.config.mjs");
    if (fs.existsSync(configPath)) {
      const src = fs.readFileSync(configPath, "utf8");
      const edit = editSequence(src, doc, { added, removed });
      sync.skipped.push(...edit.skipped);
      if (edit.src !== src) {
        const err = checkModule(edit.src);
        if (err) sync.skipped.push(`video.config.mjs left unchanged: the sequence edit would not parse (${err})`);
        else {
          writes.push(() => fs.writeFileSync(configPath, edit.src));
          sync.sequence = true;
        }
      }
    }
  }

  snapshot(dir, { label: `before boards: ${ops.map((o) => `${o.op} ${o.id ?? o.board?.id ?? o.board?.template ?? ""}`.trim()).join(", ").slice(0, 80)}`, kind: "before", by });
  writeJson(boardsFile(dir), doc);
  for (const w of writes) w();
  fs.appendFileSync(path.join(stateDir(dir), "board-ops.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), by, ops, added, removed })}\n`);
  publish("boards", { project, boards: doc, ops, by, sync });
  return { boards: doc, sync };
}
