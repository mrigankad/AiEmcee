/**
 * AiEmcee Studio backend: one local process over the same engine as the CLI.
 * Plan and rationale: docs/13-backend.md.
 *
 *   node bin/aiemcee.mjs studio [--port 4810] [--projects projects]
 *
 * Projects
 *   GET  /api/status                               providers, projects dir, auth mode
 *   GET  /api/projects                             projects with a video.config.mjs
 *   GET  /api/projects/:p                          narration, durations, films, review sheets
 *   GET  /api/projects/:p/files/:name              one source file (narration.json, scenes.mjs, video.config.mjs, design.tokens.json)
 *   PUT  /api/projects/:p/files/:name              { text } validated, snapshotted first
 *   PUT  /api/projects/:p/narration                { text } (kept for the first studio UI)
 *   POST /api/projects/:p/upload                   { name, data: base64 } -> assets/uploads/
 * Versions
 *   GET  /api/projects/:p/versions                 list
 *   POST /api/projects/:p/versions                 { label } manual snapshot
 *   GET  /api/projects/:p/versions/:v/diff[?against=w]
 *   POST /api/projects/:p/versions/:v/restore
 *   POST /api/projects/:p/undo                     restore the newest "before" snapshot
 * Comments
 *   GET  /api/projects/:p/comments
 *   POST /api/projects/:p/comments                 { text, at, scene, x, y, author }
 *   PATCH /api/projects/:p/comments/:id            { status | text | reply }
 * Jobs
 *   POST /api/jobs                                 { project, stage, flags, priority }
 *   GET  /api/jobs                                 this session's jobs
 *   GET  /api/projects/:p/jobs                     persisted history
 *   POST /api/jobs/:id/cancel
 *   GET  /api/jobs/:id/events                      one job's log (SSE)
 *   POST /api/projects/:p/preview                 { scene } draft of one scene -> out/preview-<scene>.mp4
 * Review and publishing
 *   GET  /api/projects/:p/approvals                decisions, newest last
 *   POST /api/projects/:p/approvals                { film, decision: approved|changes, note }   approver+
 *   GET  /api/projects/:p/shares                   live share links
 *   POST /api/projects/:p/shares                   { film, title, cta: { label, url }, leadForm }   owner, gated
 *   DELETE /api/projects/:p/shares/:id             revoke
 *   GET  /api/projects/:p/shares/:id/analytics     views, viewers, retention per scene, CTA, leads
 *   GET  /api/projects/:p/leads                    captured leads
 * Public (no token): /s/:id page, /s/:id/video, /poster, /captions.vtt, POST /s/:id/events, POST /s/:id/lead
 * Users
 *   GET  /api/me  ·  GET/POST/DELETE /api/users     owner only; also: aiemcee studio user add <name> <role>
 * Live
 *   GET  /api/events                               every job, version, comment and file change (SSE)
 * Rasa
 *   POST /api/chat                                 { project, provider, history, message, images } -> NDJSON
 * Media
 *   GET  /files/:p/<out|assets>/...                with Range support
 *
 * Binds to 127.0.0.1. Once there are users (or AIEMCEE_STUDIO_TOKEN is set),
 * /api needs "Authorization: Bearer <token>" (or ?token= for EventSource) and
 * each call needs a role (lib/auth.mjs); only then may --host open it wider.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chatTurn, providerStatus } from "./agent.mjs";
import { decide, gateOn, listApprovals, status as approvalStatus } from "./lib/approvals.mjs";
import { createAuth, needs, ROLES } from "./lib/auth.mjs";
import { addComment, listComments, updateComment } from "./lib/comments.mjs";
import { publish, subscribe } from "./lib/events.mjs";
import { createQueue } from "./lib/jobs.mjs";
import { createShares } from "./lib/shares.mjs";
import { readJson, SOURCE_FILES, stateDir } from "./lib/store.mjs";
import { diff, listVersions, restore, snapshot, undo } from "./lib/versions.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const BIN = path.join(ROOT, "bin", "aiemcee.mjs");

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const PORT = Number(opt("--port", 4810));
// Projects: --projects, else ./projects where the studio was started, else the engine's own.
const PROJECTS = path.resolve(opt("--projects", fs.existsSync(path.resolve("projects")) ? path.resolve("projects") : path.join(ROOT, "projects")));
const HOST = opt("--host", "127.0.0.1");
const auth = createAuth(PROJECTS, process.env.AIEMCEE_STUDIO_TOKEN || null);

// aiemcee studio user add <name> <role> | user remove <name> | user list
const userAt = args.findIndex((a, i) => a === "user" && !args[i - 1]?.startsWith("--"));
if (userAt >= 0) {
  const [action, name, role] = args.slice(userAt + 1);
  try {
    if (action === "add") console.log(`${name} (${role})\ntoken  ${auth.addUser(name, role)}\nShown once. Send it to them privately.`);
    else if (action === "remove") (auth.removeUser(name), console.log(`removed ${name}`));
    else if (action === "list") for (const u of auth.listUsers()) console.log(`${u.name.padEnd(24)} ${u.role}`);
    else console.log(`usage: aiemcee studio user add <name> <${ROLES.join("|")}> | user remove <name> | user list`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  process.exit(0);
}

/* ---------------------------------------------------------------- */
/* Projects                                                          */
/* ---------------------------------------------------------------- */
function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function projectDir(name) {
  // A name, not a path: no "..", no dot-names, nothing outside the projects folder.
  if (!/^[\w][\w.-]*$/.test(String(name)) || String(name).includes("..")) throw httpError(400, "bad project name");
  const dir = path.join(PROJECTS, name);
  if (path.dirname(dir) !== PROJECTS) throw httpError(400, "bad project name");
  if (!fs.existsSync(path.join(dir, "video.config.mjs"))) throw httpError(404, `no project ${name}`);
  return dir;
}

/**
 * One project's card for the Films screen. Reading it means listing out/,
 * stating every film and parsing the timeline, so it is cached per project
 * and re-read when out/ or the timeline changes (every compose rewrites the
 * timeline, which also catches a film overwritten in place), or after 10 s.
 */
const cards = new Map(); // name -> { key, at, card }
const mtime = (p) => (fs.existsSync(p) ? fs.statSync(p).mtimeMs : 0);

function projectCard(name) {
  const out = path.join(PROJECTS, name, "out");
  const timeline = path.join(PROJECTS, name, "work", "timeline.json");
  const key = `${mtime(out)}|${mtime(timeline)}`;
  const hit = cards.get(name);
  if (hit && hit.key === key && Date.now() - hit.at < 10_000) return hit.card;

  const all = fs.existsSync(out) ? fs.readdirSync(out) : [];
  const films = all
    .filter((f) => f.endsWith(".mp4") && !f.startsWith("preview-"))
    .map((f) => ({ f, t: fs.statSync(path.join(out, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  const latest = films[0];
  const posterName = latest?.f.replace(/\.mp4$/, ".jpg");
  const poster = latest && all.includes(posterName) ? `/files/${name}/out/${posterName}` : null;
  const t = readJson(timeline, null);
  const card = { name, films: films.length, updated: latest?.t ?? 0, poster, seconds: t?.total ? +Number(t.total).toFixed(1) : null };
  cards.set(name, { key, at: Date.now(), card });
  return card;
}

function listProjects() {
  if (!fs.existsSync(PROJECTS)) return [];
  return fs
    .readdirSync(PROJECTS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(PROJECTS, e.name, "video.config.mjs")))
    .map((e) => projectCard(e.name))
    .sort((a, b) => b.updated - a.updated || a.name.localeCompare(b.name));
}

function projectInfo(name) {
  const dir = projectDir(name);
  const read = (rel) => (fs.existsSync(path.join(dir, rel)) ? fs.readFileSync(path.join(dir, rel), "utf8") : null);
  const out = path.join(dir, "out");
  const files = fs.existsSync(out) ? fs.readdirSync(out) : [];
  const films = files
    .filter((f) => f.endsWith(".mp4"))
    .map((f) => {
      const poster = f.replace(/\.mp4$/, ".jpg");
      return {
        name: f,
        url: `/files/${name}/out/${f}`,
        poster: files.includes(poster) ? `/files/${name}/out/${poster}` : null,
        mtime: fs.statSync(path.join(out, f)).mtimeMs,
      };
    })
    .sort((a, b) => b.mtime - a.mtime);
  const sheets = ["review", "review-draft"]
    .filter((d) => fs.existsSync(path.join(out, d, "contact-sheet.jpg")))
    .map((d) => ({ name: d, url: `/files/${name}/out/${d}/contact-sheet.jpg` }));
  const durations = read("tts/durations.json");
  // The scene strip: where each scene starts and what kind it is, from the last build.
  const t = readJson(path.join(dir, "work", "timeline.json"), null);
  const timeline = t
    ? {
        fps: t.fps,
        seconds: +Number(t.total).toFixed(2),
        segments: t.segments.map((s) => ({ id: s.id, start: s.start, kind: s.kind, transition: s.transition?.type ?? s.transition ?? null, title: s.lowerThird?.title ?? null, focus: Array.isArray(s.focus) ? s.focus.length : s.focus ? 1 : 0 })),
      }
    : null;
  return { name, narration: read("narration.json"), durations: durations ? JSON.parse(durations) : null, films, sheets, timeline };
}

/** Validates a source file before it is written: JSON must parse, modules must pass `node --check`. */
function validateSource(name, text) {
  if (name.endsWith(".json")) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw httpError(400, `${name}: ${err.message}`);
    }
    if (name === "narration.json" && (!Array.isArray(parsed) || parsed.some((l) => typeof l?.id !== "string" || typeof l?.text !== "string"))) {
      throw httpError(400, "narration.json must be an array of { id, text }");
    }
    return;
  }
  const tmp = path.join(os.tmpdir(), `aiemcee-check-${process.pid}-${Date.now()}.mjs`);
  fs.writeFileSync(tmp, text);
  try {
    execFileSync(process.execPath, ["--check", tmp], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (err) {
    const detail = err.stderr?.toString().split("\n").slice(1, 5).join("\n").trim();
    throw httpError(400, `${name} has a syntax error\n${detail}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function writeSource(project, name, text, by = "you") {
  if (!SOURCE_FILES.includes(name)) throw httpError(400, `not a source file: ${name}`);
  validateSource(name, text);
  const dir = projectDir(project);
  const file = path.join(dir, name);
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === text) return { changed: false };
  const version = snapshot(dir, { label: `before editing ${name}`, kind: "before", by });
  fs.writeFileSync(file, text);
  publish("file", { project, name, by });
  return { changed: true, version: version.id };
}

/* ---------------------------------------------------------------- */
/* Jobs                                                              */
/* ---------------------------------------------------------------- */
const queue = createQueue({ bin: BIN, cwd: ROOT, resolveProject: projectDir });
const shares = createShares(PROJECTS, projectDir);

/* ---------------------------------------------------------------- */
/* HTTP                                                              */
/* ---------------------------------------------------------------- */
async function body(req, limit = 40 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw httpError(413, "body too large");
    chunks.push(c);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, "body is not valid JSON");
  }
}

const json = (res, data, status = 200) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
};

const TYPES = { ".html": "text/html; charset=utf-8", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".json": "application/json", ".srt": "text/plain", ".mp3": "audio/mpeg", ".wav": "audio/wav" };

function sendFile(req, res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw httpError(404, "not found");
  const size = fs.statSync(file).size;
  const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  // Uploads are user content: an SVG or HTML file served inline could run
  // script on the studio's origin. Sandbox everything under assets/.
  const extra = /[\\/]assets[\\/]/.test(file) ? { "content-security-policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'", "x-content-type-options": "nosniff" } : {};
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
  if (range && (range[1] || range[2])) {
    let start;
    let end;
    if (range[1]) {
      start = Number(range[1]);
      end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    } else {
      // bytes=-N: the last N bytes.
      start = Math.max(0, size - Number(range[2]));
      end = size - 1;
    }
    if (start >= size || start > end || size === 0) {
      res.writeHead(416, { "content-range": `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, { "content-type": type, "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${size}`, "content-length": end - start + 1, "cache-control": "no-cache", ...extra });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "content-type": type, "accept-ranges": "bytes", "content-length": size, "cache-control": "no-cache", ...extra });
    fs.createReadStream(file).pipe(res);
  }
}

/**
 * Cross-site protection. The studio can edit files and run the pipeline, and
 * in local mode every request is the owner, so a page on another site must not
 * be able to drive it: requests must come to a local host name (no DNS
 * rebinding), changes must come from the studio's own pages (Origin), and
 * every change must be JSON (a simple cross-site form post cannot be).
 */
function crossSiteCheck(req) {
  const host = String(req.headers.host ?? "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  const local = ["127.0.0.1", "localhost", "::1"].includes(host);
  if (!local && auth.mode() !== "token") throw httpError(403, "this studio answers on localhost only");
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
  const origin = req.headers.origin;
  if (origin) {
    let o;
    try {
      o = new URL(origin);
    } catch {
      throw httpError(403, "bad origin");
    }
    const sameHost = o.host === req.headers.host;
    const devApp = ["127.0.0.1", "localhost", "[::1]"].includes(o.hostname) && local;
    const allowed = (process.env.AIEMCEE_STUDIO_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!sameHost && !devApp && !allowed.includes(origin)) throw httpError(403, `requests from ${origin} are not allowed`);
  }
  // A cross-site form can send text/plain or form data without a preflight,
  // but never application/json: requiring it closes that door, body or not.
  if (!String(req.headers["content-type"] ?? "").startsWith("application/json")) throw httpError(415, "send JSON (content-type: application/json)");
}


async function route(req, res) {
  const url = new URL(req.url, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const m = req.method;
  crossSiteCheck(req);

  if (m === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) return sendFile(req, res, path.join(HERE, "public", "index.html"));

  /* Public share pages -------------------------------------------- */
  if (parts[0] === "s" && parts[1]) {
    const id = parts[1];
    if (m === "GET" && !parts[2]) {
      const html = shares.page(id);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
      return res.end(html);
    }
    if (m === "GET" && parts[2] === "video") return sendFile(req, res, shares.filmFile(id));
    if (m === "GET" && parts[2] === "poster") return sendFile(req, res, shares.posterFile(id));
    if (m === "GET" && parts[2] === "captions.vtt") {
      const vtt = shares.captions(id);
      res.writeHead(200, { "content-type": "text/vtt; charset=utf-8" });
      return res.end(vtt);
    }
    if (m === "POST" && parts[2] === "events") {
      shares.record(id, await body(req, 4096));
      res.writeHead(204);
      return res.end();
    }
    if (m === "POST" && parts[2] === "lead") return json(res, shares.lead(id, await body(req, 8192)));
    throw httpError(404, "not found");
  }

  const user = auth.who(req, url);
  if (parts[0] === "api" || parts[0] === "files") {
    if (!user) throw httpError(401, "missing or wrong studio token");
    const role = parts[0] === "files" ? "viewer" : needs(m, parts);
    if (!auth.can(user, role)) throw httpError(403, `needs the ${role} role`);
  }

  if (m === "GET" && url.pathname === "/api/status") return json(res, { providers: providerStatus(), projectsDir: PROJECTS, auth: auth.mode() });
  if (m === "GET" && url.pathname === "/api/me") return json(res, user);
  if (url.pathname === "/api/users") {
    if (m === "GET") return json(res, auth.listUsers());
    if (m === "POST") {
      const { name, role } = await body(req);
      try {
        return json(res, { name, role, token: auth.addUser(String(name), String(role)) }, 201);
      } catch (err) {
        throw httpError(400, err.message);
      }
    }
  }
  if (m === "DELETE" && parts[0] === "api" && parts[1] === "users" && parts[2]) {
    try {
      auth.removeUser(parts[2]);
    } catch (err) {
      throw httpError(404, err.message);
    }
    return json(res, { removed: parts[2] });
  }
  if (m === "GET" && url.pathname === "/api/projects") return json(res, listProjects());
  if (m === "GET" && url.pathname === "/api/events") return subscribe(req, res);

  /* Projects ------------------------------------------------------ */
  if (parts[0] === "api" && parts[1] === "projects" && parts[2]) {
    const name = parts[2];
    const sub = parts[3];
    if (m === "GET" && !sub) return json(res, projectInfo(name));

    if (sub === "files" && parts[4]) {
      const file = parts[4];
      if (!SOURCE_FILES.includes(file)) throw httpError(400, `not a source file: ${file}`);
      if (m === "GET") {
        const full = path.join(projectDir(name), file);
        return json(res, { name: file, text: fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null });
      }
      if (m === "PUT") {
        const { text } = await body(req);
        if (typeof text !== "string") throw httpError(400, "text is required");
        return json(res, writeSource(name, file, text, user.name));
      }
    }
    if (m === "PUT" && sub === "narration") {
      const { text } = await body(req);
      const parsed = JSON.parse(text);
      return json(res, writeSource(name, "narration.json", `${JSON.stringify(parsed, null, 2)}\n`, user.name));
    }
    if (m === "POST" && sub === "upload") {
      const { name: file, data } = await body(req);
      const safe = path.basename(String(file)).replace(/[^\w.-]+/g, "-");
      if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(safe)) throw httpError(400, "images only: png, jpg, webp, gif, svg");
      const dir = path.join(projectDir(name), "assets", "uploads");
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, `${Date.now().toString(36)}-${safe}`);
      fs.writeFileSync(dest, Buffer.from(String(data), "base64"));
      const rel = path.relative(projectDir(name), dest).split(path.sep).join("/");
      return json(res, { path: rel, url: `/files/${name}/${rel}` });
    }

    if (sub === "versions") {
      const dir = projectDir(name);
      if (m === "GET" && !parts[4]) return json(res, listVersions(dir).reverse());
      if (m === "POST" && !parts[4]) {
        const { label } = await body(req);
        return json(res, snapshot(dir, { label, kind: "manual", by: user.name }));
      }
      if (m === "GET" && parts[5] === "diff") {
        const against = url.searchParams.get("against");
        return json(res, diff(dir, parts[4], against));
      }
      if (m === "POST" && parts[5] === "restore") return json(res, restore(dir, parts[4], { by: user.name }));
    }
    if (m === "POST" && sub === "undo") return json(res, undo(projectDir(name), { by: user.name }));

    if (sub === "comments") {
      const dir = projectDir(name);
      if (m === "GET" && !parts[4]) return json(res, listComments(dir));
      if (m === "POST" && !parts[4]) return json(res, addComment(dir, { ...(await body(req)), author: user.name }), 201);
      if (m === "PATCH" && parts[4]) return json(res, updateComment(dir, parts[4], { ...(await body(req)), author: user.name }));
    }

    if (m === "GET" && sub === "jobs") return json(res, queue.history(name));

    if (m === "POST" && sub === "preview") {
      const { scene } = await body(req);
      return json(res, queue.pub(queue.enqueue(name, "compose", ["--preview", String(scene)], { priority: "high", by: user.name })));
    }

    if (sub === "approvals") {
      const dir = projectDir(name);
      if (m === "GET") return json(res, listApprovals(dir));
      if (m === "POST") return json(res, decide(dir, await body(req), user), 201);
    }

    if (sub === "shares") {
      if (m === "GET" && !parts[4]) return json(res, shares.list(name));
      if (m === "POST" && !parts[4]) {
        const input = await body(req);
        const dir = projectDir(name);
        const film = path.basename(String(input.film));
        if (gateOn(dir, auth.mode() === "token") && approvalStatus(dir, film) !== "approved") throw httpError(409, `${film} is not approved yet; ask an approver first`);
        return json(res, shares.create(name, input, user), 201);
      }
      if (m === "DELETE" && parts[4]) {
        if (shares.get(parts[4]).project !== name) throw httpError(404, "no such share");
        return json(res, shares.revoke(parts[4]));
      }
      if (m === "GET" && parts[5] === "analytics") {
        if (shares.get(parts[4]).project !== name) throw httpError(404, "no such share");
        return json(res, shares.analytics(parts[4]));
      }
    }
    if (m === "GET" && sub === "leads") return json(res, readJson(path.join(stateDir(projectDir(name)), "leads.json"), []));
  }

  /* Jobs ---------------------------------------------------------- */
  if (url.pathname === "/api/jobs" && m === "POST") {
    const { project, stage, flags, priority } = await body(req);
    return json(res, queue.pub(queue.enqueue(project, stage, flags ?? [], { priority: priority ?? "high", by: user.name })));
  }
  if (url.pathname === "/api/jobs" && m === "GET") return json(res, queue.list());
  if (m === "POST" && parts[0] === "api" && parts[1] === "jobs" && parts[3] === "cancel") return json(res, queue.cancel(Number(parts[2])));

  if (m === "GET" && parts[0] === "api" && parts[1] === "jobs" && parts[3] === "events") {
    const job = queue.get(Number(parts[2]));
    if (!job) throw httpError(404, "no such job");
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send("job", queue.pub(job));
    if (job.log) send("log", job.log);
    if (!["queued", "running"].includes(job.status)) return res.end();
    job.listeners.add(send);
    job.done.then(() => {
      job.listeners.delete(send);
      res.end();
    });
    req.on("close", () => job.listeners.delete(send));
    return;
  }

  /* Rasa ---------------------------------------------------------- */
  if (m === "POST" && url.pathname === "/api/chat") {
    const { project, provider, history = [], message, images = [] } = await body(req);
    const dir = projectDir(project);
    const files = images.map((rel) => {
      const full = path.resolve(dir, rel);
      if (!full.startsWith(path.join(dir, "assets") + path.sep)) throw httpError(400, "images must be project uploads");
      return full;
    });
    // Every Rasa turn can be undone in one step: snapshot first.
    const before = snapshot(dir, { label: `before: ${String(message).slice(0, 80)}`, kind: "before", by: "rasa" });
    res.writeHead(200, { "content-type": "application/x-ndjson", "cache-control": "no-cache, no-transform" });
    const emit = (e) => res.write(`${JSON.stringify(e)}\n`);
    emit({ type: "snapshot", version: before.id });
    const runStage = async (stage, flags) => {
      const job = queue.enqueue(project, stage, flags, { priority: "high", by: "rasa" });
      emit({ type: "job", job: queue.pub(job) });
      return job.done;
    };
    try {
      await chatTurn({ provider, project: dir, history, user: message, images: files, runStage, emit });
    } catch (err) {
      emit({ type: "error", text: err.message });
    }
    emit({ type: "done" });
    publish("file", { project, name: "*", by: "rasa" });
    return res.end();
  }

  /* Media --------------------------------------------------------- */
  if (m === "GET" && parts[0] === "files" && parts[1]) {
    const dir = projectDir(parts[1]);
    const rel = parts.slice(2).join("/");
    if (!/^(out|assets)\//.test(rel)) throw httpError(403, "only out/ and assets/ are served");
    const full = path.resolve(dir, rel);
    if (!full.startsWith(dir + path.sep)) throw httpError(403, "outside the project");
    return sendFile(req, res, full);
  }

  throw httpError(404, "not found");
}

const server = http.createServer((req, res) => {
  route(req, res).catch((err) => {
    if (res.headersSent) return res.end();
    json(res, { error: err.message }, err.status ?? (err instanceof SyntaxError ? 400 : 500));
  });
});

// The studio can write project files and run the pipeline: it leaves
// localhost only when every API call needs a token.
if (HOST !== "127.0.0.1" && HOST !== "localhost" && auth.mode() !== "token") {
  console.error("--host needs users first: aiemcee studio user add <name> owner");
  process.exit(1);
}
server.listen(PORT, HOST, () => {
  console.log(`AiEmcee Studio  http://${HOST}:${PORT}\nprojects        ${PROJECTS}\nauth            ${auth.mode() === "token" ? `tokens, ${auth.listUsers().length} users` : "localhost only"}`);
  for (const p of providerStatus()) console.log(`  ${p.label.padEnd(15)} ${p.ready ? "ready" : "no key"}  ${p.model}`);
});
