/**
 * New films from the studio (POST /api/projects). A new film is the template
 * folder plus a first draft as boards: one board per catalog template with its
 * example props, a placeholder narration line each, and a sequence that plays
 * them (`from: "board"`). It renders as is, and every part is meant to be
 * rewritten, by hand or by the agent. Spec: docs/15-styles-and-boards.md.
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { findSequence, placeholderLine, sequenceSource, validateDoc } from "./boards.mjs";
import { writeJson } from "./store.mjs";

const badRequest = (message, status = 400) => Object.assign(new Error(message), { status });

/** "My Launch Film!" -> "my-launch-film". */
export function slugify(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** The first draft: one board per template, catalog examples, numbered 01-hero, 02-pipeline, ... */
export function draftBoards(catalog, { title, style, brief } = {}) {
  const boards = catalog.templates.map((t, i) => {
    const props = structuredClone(t.example ?? {});
    if (title && t.id === "endcard") props.title = title;
    return { id: `${String(i + 1).padStart(2, "0")}-${t.id}`, template: t.id, props, status: "draft" };
  });
  const doc = { version: 1, ...(style ? { style } : {}), ...(title ? { title } : {}), ...(brief ? { brief } : {}), boards };
  validateDoc(doc, catalog);
  return doc;
}

const copyDir = (src, dest) => fs.cpSync(src, dest, { recursive: true, filter: (s) => !/[\\/](node_modules|out|work|tts|raw|\.aiemcee)$/.test(s) });

/** Sets name, style, baseUrl and the sequence in the template's video.config.mjs source. */
export function configSource(src, { slug, style, baseUrl, ids }) {
  let out = src.replace(/(\n[ \t]*name:\s*)(["'])[^"']*\2,/, (_, a) => `${a}${JSON.stringify(slug)},`);
  if (style) out = out.replace(/(\n([ \t]*)name:\s*"[^"]*",[^\n]*\n)/, (_, line, indent) => `${line}\n${indent}/** Film style (remotion/src/templates/catalog.json); boards may override it. */\n${indent}style: ${JSON.stringify(style)},\n`);
  // A board film opens cold: the template's logo sting is not shipped with it.
  out = out.replace(/(\n[ \t]*intro:\s*)\{[^}\n]*\},/, (_, a) => `${a}null,`);
  if (baseUrl) out = out.replace(/(baseUrl:\s*process\.env\.BASE_URL\s*\?\?\s*)(["'])[^"']*\2/, (_, a) => `${a}${JSON.stringify(baseUrl)}`);
  const seq = findSequence(out);
  if (!seq) throw badRequest("the project template has no sequence: [ ... ] to fill", 500);
  const lineStart = out.lastIndexOf("\n", seq.close) + 1;
  const indent = /^[ \t]*/.exec(out.slice(lineStart))[0];
  return `${out.slice(0, seq.open)}${sequenceSource(ids, indent)}${out.slice(seq.close + 1)}`;
}

/**
 * Scaffolds <projectsDir>/<slug>/ from `templateDir`. Refuses an existing
 * folder. Returns { name }. Cleans up after itself if any step fails.
 */
export function createProject({ projectsDir, templateDir, catalog, name, title, style, brief, baseUrl }) {
  const slug = slugify(name ?? title);
  if (!slug || slug.startsWith("_")) throw badRequest("name: give the film a name with letters or digits");
  if (style != null && !catalog.styles.some((s) => s.id === style)) throw badRequest(`unknown style ${JSON.stringify(style)} (one of ${catalog.styles.map((s) => s.id).join(", ")})`);
  if (baseUrl != null) {
    try {
      if (!/^https?:$/.test(new URL(String(baseUrl)).protocol)) throw new Error();
    } catch {
      throw badRequest("baseUrl must be an http(s) URL");
    }
  }
  const dir = path.join(projectsDir, slug);
  if (fs.existsSync(dir)) throw badRequest(`a project called ${slug} already exists`, 409);
  if (!fs.existsSync(path.join(templateDir, "video.config.mjs"))) throw badRequest(`no project template at ${templateDir}`, 500);

  const doc = draftBoards(catalog, { title: title ? String(title) : null, style, brief: brief ? String(brief) : null });
  const ids = doc.boards.map((b) => b.id);
  let config = configSource(fs.readFileSync(path.join(templateDir, "video.config.mjs"), "utf8"), { slug, style, baseUrl, ids });
  // The template reaches the engine as ../../scripts/lib/defaults.mjs, which only holds inside the
  // repo's own projects/ folder. Anywhere else (studio --projects <dir>, the desktop app) point the
  // import at this engine's copy.
  const defaults = path.resolve(import.meta.dirname, "..", "..", "scripts", "lib", "defaults.mjs");
  const relative = path.relative(dir, defaults).split(path.sep).join("/");
  if (relative !== "../../scripts/lib/defaults.mjs") {
    config = config.replace(/(["'])\.\.\/\.\.\/scripts\/lib\/defaults\.mjs\1/, JSON.stringify(pathToFileURL(defaults).href));
  }

  fs.mkdirSync(projectsDir, { recursive: true });
  try {
    copyDir(templateDir, dir);
    fs.writeFileSync(path.join(dir, "video.config.mjs"), config);
    writeJson(path.join(dir, "boards.json"), doc);
    writeJson(path.join(dir, "narration.json"), doc.boards.map(placeholderLine));
    // A board film has no captured scenes yet; drop the template's example choreography.
    fs.writeFileSync(
      path.join(dir, "scenes.mjs"),
      '/** Choreography for `from: "capture"` scenes; see projects/_template/scenes.mjs. */\nexport const SCENES = {};\n',
    );
    if (brief) fs.writeFileSync(path.join(dir, "BRIEF.md"), `# ${title ?? slug}\n\n${String(brief).trim()}\n`);
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  return { name: slug };
}
