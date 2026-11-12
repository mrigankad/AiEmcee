/**
 * Review comments, pinned to a moment (`at`, seconds) and optionally a point
 * on the frame (`x`, `y`, 0..1). Stored in <project>/.aiemcee/comments.json.
 */
import crypto from "node:crypto";
import path from "node:path";

import { publish } from "./events.mjs";
import { readJson, stateDir, writeJson } from "./store.mjs";

const STATUSES = new Set(["open", "resolved", "rasa"]);
const file = (project) => path.join(stateDir(project), "comments.json");

export const listComments = (project) => readJson(file(project), []);

export function addComment(project, input) {
  const text = String(input.text ?? "").trim();
  if (!text) throw Object.assign(new Error("comment text is required"), { status: 400 });
  const num = (v, lo, hi) => (v == null || v === "" ? null : Math.min(hi, Math.max(lo, Number(v))));
  const comment = {
    id: crypto.randomUUID().slice(0, 8),
    author: String(input.author ?? "you").slice(0, 80),
    text: text.slice(0, 4000),
    at: num(input.at, 0, 36000),
    scene: input.scene ? String(input.scene).slice(0, 80) : null,
    x: num(input.x, 0, 1),
    y: num(input.y, 0, 1),
    version: input.version ?? null,
    status: "open",
    createdAt: new Date().toISOString(),
  };
  const all = listComments(project);
  all.push(comment);
  writeJson(file(project), all);
  publish("comment", { project: path.basename(project), action: "created", comment });
  return comment;
}

export function updateComment(project, id, patch) {
  const all = listComments(project);
  const c = all.find((x) => x.id === id);
  if (!c) throw Object.assign(new Error(`no comment ${id}`), { status: 404 });
  if (patch.status != null) {
    if (!STATUSES.has(patch.status)) throw Object.assign(new Error(`bad status ${patch.status}`), { status: 400 });
    c.status = patch.status;
  }
  if (patch.text != null) c.text = String(patch.text).slice(0, 4000);
  if (patch.reply != null) (c.replies ??= []).push({ author: String(patch.author ?? "you"), text: String(patch.reply).slice(0, 4000), at: new Date().toISOString() });
  c.updatedAt = new Date().toISOString();
  writeJson(file(project), all);
  publish("comment", { project: path.basename(project), action: "updated", comment: c });
  return c;
}
