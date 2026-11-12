/**
 * Approvals: a reviewer approves a film, or asks for changes. A film can be
 * shared only once its latest decision is "approved" (the publish gate),
 * unless the project turns the gate off with { "gate": false } in
 * .aiemcee/approvals-config.json.
 */
import fs from "node:fs";
import path from "node:path";

import { publish } from "./events.mjs";
import { readJson, stateDir, writeJson } from "./store.mjs";

const file = (project) => path.join(stateDir(project), "approvals.json");
export const listApprovals = (project) => readJson(file(project), []);

export function decide(project, { film, decision, note = "" }, user) {
  if (!film || !fs.existsSync(path.join(project, "out", path.basename(film)))) throw Object.assign(new Error(`no film ${film}`), { status: 404 });
  if (!["approved", "changes"].includes(decision)) throw Object.assign(new Error("decision must be approved or changes"), { status: 400 });
  const entry = { film: path.basename(film), decision, note: String(note).slice(0, 2000), by: user.name, role: user.role, at: new Date().toISOString() };
  const all = listApprovals(project);
  all.push(entry);
  writeJson(file(project), all);
  publish("approval", { project: path.basename(project), ...entry });
  return entry;
}

export function status(project, film) {
  const last = listApprovals(project).filter((a) => a.film === film).at(-1);
  return last?.decision ?? "pending";
}

/** On by default once the studio has users; a project can override either way. */
export function gateOn(project, byDefault = true) {
  return readJson(path.join(stateDir(project), "approvals-config.json"), { gate: byDefault }).gate !== false;
}
