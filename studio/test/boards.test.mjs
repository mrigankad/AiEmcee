// node --test studio/test/
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { applyOps, applyToProject, boardErrors, deepMerge, editSequence, findSequence, loadCatalog, placeholderLine, readBoards, syncNarration } from "../lib/boards.mjs";
import { configSource, createProject, draftBoards, slugify } from "../lib/projects.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMPLATE = path.join(ROOT, "projects", "_template");
const catalog = loadCatalog();
const draft = () => draftBoards(catalog);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "aiemcee-boards-"));

test("every catalog example is a valid board", () => {
  for (const t of catalog.templates) assert.deepEqual(boardErrors({ id: `x-${t.id}`, template: t.id, props: t.example, status: "draft" }, catalog), []);
});

test("validation: unknown template and style, required props, list ranges", () => {
  assert.match(boardErrors({ id: "a", template: "nope", props: {} }, catalog).join(), /unknown template/);
  assert.match(boardErrors({ id: "a", template: "hero", style: "nope", props: { headline: "x" } }, catalog).join(), /unknown style/);
  assert.match(boardErrors({ id: "a", template: "hero", props: {} }, catalog).join(), /headline/);
  const steps = (n) => Array.from({ length: n }, (_, i) => ({ label: `s${i}` }));
  assert.match(boardErrors({ id: "a", template: "pipeline", props: { steps: steps(2) } }, catalog).join(), /3 to 6/);
  assert.deepEqual(boardErrors({ id: "a", template: "pipeline", props: { steps: steps(6) } }, catalog), []);
  assert.match(boardErrors({ id: "a", template: "pipeline", props: { steps: steps(7) } }, catalog).join(), /3 to 6/);
  assert.match(boardErrors({ id: "a", template: "stack", props: { layers: steps(6) } }, catalog).join(), /2 to 5/);
  assert.match(boardErrors({ id: "a", template: "metrics", props: { metrics: [] } }, catalog).join(), /1 to 4/);
  assert.match(boardErrors({ id: "a", template: "metrics", props: { metrics: [{ value: "x", label: "l" }] } }, catalog).join(), /numeric/);
  assert.match(boardErrors({ id: "a", template: "endcard", props: {} }, catalog).join(), /title/);
  assert.match(boardErrors({ id: "a", template: "hero", status: "done", props: { headline: "x" } }, catalog).join(), /status/);
  assert.match(boardErrors({ id: "../x", template: "hero", props: { headline: "x" } }, catalog).join(), /id must/);
});

test("deepMerge: objects merge, arrays replace, null deletes", () => {
  assert.deepEqual(deepMerge({ a: 1, b: { c: 2, d: 3 }, l: [1, 2] }, { b: { c: 9 }, l: [5], a: null }), { b: { c: 9, d: 3 }, l: [5] });
});

test("ops: add / update / move / remove", () => {
  const doc = draft();
  const { doc: a, added } = applyOps(doc, [{ op: "add", board: { template: "metrics" }, index: 1 }], catalog);
  assert.equal(a.boards[1].id, "06-metrics");
  assert.deepEqual(a.boards[1].props, catalog.templates.find((t) => t.id === "metrics").example);
  assert.equal(a.boards[1].status, "draft");
  assert.deepEqual(added, ["06-metrics"]);
  assert.equal(doc.boards.length, 5, "input is not mutated");

  const { doc: b } = applyOps(a, [{ op: "update", id: "01-hero", patch: { props: { headline: "New" }, style: "swiss", status: "approved" } }], catalog);
  assert.equal(b.boards[0].props.headline, "New");
  assert.equal(b.boards[0].props.kicker, "Introducing");
  assert.equal(b.boards[0].style, "swiss");

  const { doc: c } = applyOps(b, [{ op: "update", id: "02-pipeline", patch: { props: { steps: [{ label: "a" }, { label: "b" }, { label: "c" }] } } }], catalog);
  assert.equal(c.boards.find((x) => x.id === "02-pipeline").props.steps.length, 3, "arrays replace");

  const { doc: d } = applyOps(c, [{ op: "move", id: "05-endcard", index: 0 }], catalog);
  assert.equal(d.boards[0].id, "05-endcard");

  const { doc: e, removed } = applyOps(d, [{ op: "remove", id: "03-stack" }], catalog);
  assert.ok(!e.boards.some((x) => x.id === "03-stack"));
  assert.deepEqual(removed, ["03-stack"]);
});

test("ops are atomic: one bad op applies none", () => {
  const doc = draft();
  assert.throws(() => applyOps(doc, [{ op: "remove", id: "01-hero" }, { op: "update", id: "02-pipeline", patch: { props: { steps: [] } } }], catalog), (e) => e.status === 400 && /op 1/.test(e.message));
  assert.throws(() => applyOps(doc, [{ op: "add", board: { id: "01-hero", template: "hero" } }], catalog), /already exists/);
  assert.throws(() => applyOps(doc, [{ op: "update", id: "01-hero", patch: { template: "endcard" } }], catalog), /title/);
  assert.throws(() => applyOps(doc, [{ op: "update", id: "01-hero", patch: { id: "x" } }], catalog), /cannot patch/);
  assert.throws(() => applyOps(doc, [{ op: "jump" }], catalog), /unknown op/);
  assert.throws(() => applyOps(doc, [], catalog), /non-empty/);
});

test("placeholder narration and narration sync", () => {
  const doc = draft();
  const lines = doc.boards.map(placeholderLine);
  for (const l of lines) assert.ok(l.id && l.text.length > 5 && typeof l.title === "string");
  assert.match(lines[1].text, /Read, Plan, Run and Prove/);
  const capture = { id: "00-app", text: "A capture." };
  const { doc: next, added, removed } = applyOps(doc, [{ op: "add", board: { id: "02b-hero", template: "hero", props: { headline: "Hi" } }, index: 2 }, { op: "remove", id: "04-metrics" }], catalog);
  const synced = syncNarration([capture, ...lines], next, { added, removed });
  assert.deepEqual(synced.map((l) => l.id), ["00-app", "01-hero", "02-pipeline", "02b-hero", "03-stack", "05-endcard"]);
});

test("sequence edits: add after the previous board, remove plain entries, skip the rest", () => {
  const src = `export default {\n  sequence: [\n    { id: "00-app", from: "capture", focus: [{ at: 1 }] }, // "]"\n    { id: "01-hero", from: "board" },\n  ],\n};\n`;
  assert.ok(findSequence(src));
  const doc = { boards: [{ id: "01-hero" }, { id: "02-x" }] };
  const a = editSequence(src, doc, { added: ["02-x"], removed: [] });
  assert.match(a.src, /\{ id: "01-hero", from: "board" \},\n {4}\{ id: "02-x", from: "board" \},\n {2}\],/);
  const b = editSequence(a.src, doc, { added: [], removed: ["01-hero"] });
  assert.ok(!b.src.includes("01-hero"));
  const c = editSequence(src, doc, { added: [], removed: ["00-app"] });
  assert.equal(c.src, src);
  assert.match(c.skipped[0], /by hand/);
  // Appending to an array with no board entries, last entry without a trailing comma.
  const d = editSequence(`x({\n  sequence: [\n    { id: "a", from: "capture" }\n  ],\n});\n`, { boards: [{ id: "n" }] }, { added: ["n"] });
  assert.match(d.src, /\{ id: "a", from: "capture" \},\n {4}\{ id: "n", from: "board" \},\n {2}\]/);
  assert.equal(findSequence("const sequence = []; x({ sequence: [], other: { sequence: [] } })"), null, "two keys: no guess");
});

test("projects: slugify and config source", () => {
  assert.equal(slugify("  My Launch Film! "), "my-launch-film");
  assert.equal(slugify("Café déjà"), "cafe-deja");
  const src = configSource(fs.readFileSync(path.join(TEMPLATE, "video.config.mjs"), "utf8"), { slug: "x", style: "swiss", baseUrl: "http://localhost:5173", ids: ["01-hero", "02-pipeline"] });
  assert.match(src, /name: "x",/);
  assert.match(src, /style: "swiss",/);
  assert.match(src, /\?\? "http:\/\/localhost:5173"/);
  assert.match(src, /sequence: \[\n {4}\{ id: "01-hero", from: "board" \},\n {4}\{ id: "02-pipeline", from: "board" \},\n {2}\],/);
  assert.ok(!src.includes("01-hello"));
});

test("projects: scaffold into a temp dir, then edit its boards end to end", () => {
  const dir = tmp();
  try {
    const made = createProject({ projectsDir: dir, templateDir: TEMPLATE, catalog, name: "Demo Film", title: "Acme", style: "glass", brief: "A launch." });
    assert.deepEqual(made, { name: "demo-film" });
    const p = path.join(dir, "demo-film");
    const boards = readBoards(p);
    assert.deepEqual(boards.boards.map((b) => b.id), ["01-hero", "02-pipeline", "03-stack", "04-metrics", "05-endcard"]);
    assert.equal(boards.style, "glass");
    assert.equal(boards.boards[4].props.title, "Acme");
    const narration = JSON.parse(fs.readFileSync(path.join(p, "narration.json"), "utf8"));
    assert.deepEqual(narration.map((l) => l.id), boards.boards.map((b) => b.id));
    assert.ok(narration.every((l) => typeof l.text === "string" && l.text));
    assert.throws(() => createProject({ projectsDir: dir, templateDir: TEMPLATE, catalog, name: "demo film" }), (e) => e.status === 409);
    assert.throws(() => createProject({ projectsDir: dir, templateDir: TEMPLATE, catalog, name: "x", style: "nope" }), (e) => e.status === 400);
    assert.throws(() => createProject({ projectsDir: dir, templateDir: TEMPLATE, catalog, name: "!!!" }), (e) => e.status === 400);

    const r = applyToProject(p, [{ op: "add", board: { template: "metrics", props: { headline: "More", metrics: [{ value: 5, label: "x" }] } }, index: 4 }, { op: "remove", id: "03-stack" }], { catalog });
    assert.deepEqual(r.boards.boards.map((b) => b.id), ["01-hero", "02-pipeline", "04-metrics", "06-metrics", "05-endcard"]);
    assert.deepEqual(r.sync, { narration: true, sequence: true, skipped: [] });
    const cfg = fs.readFileSync(path.join(p, "video.config.mjs"), "utf8");
    assert.match(cfg, /"04-metrics", from: "board" \},\n {4}\{ id: "06-metrics", from: "board" \},/);
    assert.ok(!cfg.includes("03-stack"));
    const lines = JSON.parse(fs.readFileSync(path.join(p, "narration.json"), "utf8"));
    assert.deepEqual(lines.map((l) => l.id), r.boards.boards.map((b) => b.id));
    const log = fs.readFileSync(path.join(p, ".aiemcee", "board-ops.jsonl"), "utf8").trim().split("\n");
    assert.equal(log.length, 1);
    const versions = fs.readdirSync(path.join(p, ".aiemcee", "versions"));
    assert.equal(versions.length, 1);
    assert.ok(fs.existsSync(path.join(p, ".aiemcee", "versions", versions[0], "boards.json")), "snapshot holds boards.json for undo");
    assert.throws(() => applyToProject(p, [{ op: "remove", id: "zz" }], { catalog }), (e) => e.status === 400);
    assert.equal(readBoards(p).boards.length, 5, "a refused op list writes nothing");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
