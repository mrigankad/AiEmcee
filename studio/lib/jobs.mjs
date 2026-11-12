/**
 * The job queue. Stages run through bin/aiemcee.mjs exactly as on the command
 * line, one at a time (a render already uses every core).
 *
 *   priority   high (a person waiting: drafts, chat) > normal > low (batch, CI)
 *   cancel     a queued job is dropped; a running one has its process tree killed
 *   history    each finished job is appended to <project>/.aiemcee/jobs.json (last 200)
 *   versions   a successful compose snapshots the source that produced the film
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

import { publish } from "./events.mjs";
import { readJson, stateDir, writeJson } from "./store.mjs";
import { snapshot } from "./versions.mjs";

const STAGES = new Set(["doctor", "validate", "narrate", "clip", "capture", "compose", "film"]);
const FLAGS = new Set(["--draft", "--fast", "--sound-only", "--all", "--if-changed"]);
const RANK = { high: 0, normal: 1, low: 2 };
const KEEP = 200;

export function createQueue({ bin, cwd, resolveProject }) {
  const jobs = [];
  let running = null;
  let nextId = 1;

  const pub = ({ listeners, done, resolve, log, child, ...j }) => j;

  function emit(job, event, data) {
    for (const send of job.listeners) send(event, data);
  }

  function append(job, text) {
    job.log += text;
    if (job.log.length > 400000) job.log = job.log.slice(-300000);
    emit(job, "log", text);
  }

  function finish(job, status, code) {
    job.status = status;
    job.code = code;
    job.seconds = job.started ? (Date.now() - job.started) / 1000 : 0;
    append(job, `\n[${status}${job.started ? ` in ${job.seconds.toFixed(1)}s` : ""}]\n`);
    emit(job, "status", status);
    job.resolve(job);
    publish("job", pub(job));

    // Bookkeeping must never stall the queue: a project deleted mid-render or
    // a full disk is logged, and the next job still runs.
    try {
      const dir = resolveProject(job.project);
      const file = path.join(stateDir(dir), "jobs.json");
      const history = readJson(file, []);
      history.push({ ...pub(job), tail: job.log.slice(-2000) });
      writeJson(file, history.slice(-KEEP));

      if (status === "done" && (job.stage === "compose" || job.stage === "film") && !job.flags.includes("--preview")) {
        const mode = job.flags.find((f) => f === "--draft" || f === "--fast")?.slice(2) ?? "master";
        job.version = snapshot(dir, { label: `render ${mode}`, kind: "render", by: job.by, job: job.id }).id;
      }
    } catch (err) {
      console.error(`job #${job.id}: could not record its history: ${err.message}`);
    }
  }

  function pump() {
    if (running) return;
    const next = jobs
      .filter((j) => j.status === "queued")
      .sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.id - b.id)[0];
    if (!next) return;
    running = next;
    next.status = "running";
    next.started = Date.now();
    emit(next, "status", "running");
    publish("job", pub(next));
    let child;
    try {
      child = spawn(process.execPath, [bin, next.stage, "--project", resolveProject(next.project), ...next.flags], {
        cwd,
        env: { ...process.env, FORCE_COLOR: "0" },
        windowsHide: true,
        // Its own process group on POSIX, so cancel can end ffmpeg and Chromium too.
        detached: process.platform !== "win32",
      });
    } catch (err) {
      append(next, `could not start: ${err.message}\n`);
      finish(next, "failed", null);
      running = null;
      return pump();
    }
    next.child = child;
    const done = (code) => {
      if (running !== next) return; // already handled (close after error)
      if (next.status === "running") finish(next, code === 0 ? "done" : "failed", code);
      running = null;
      pump();
    };
    child.stdout.on("data", (d) => append(next, d.toString()));
    child.stderr.on("data", (d) => append(next, d.toString()));
    child.on("error", (err) => {
      append(next, `\n${err.message}\n`);
      done(null);
    });
    child.on("close", done);
  }

  function enqueue(project, stage, flags = [], { priority = "normal", by = "you" } = {}) {
    if (!STAGES.has(stage)) throw Object.assign(new Error(`unknown stage ${stage}`), { status: 400 });
    if (!Array.isArray(flags) || flags.some((f) => typeof f !== "string")) throw Object.assign(new Error("flags must be a list of strings"), { status: 400 });
    // --preview takes a scene id: the one flag with a value.
    const SCENE = /^[\w.-]{1,80}$/;
    const bad = flags.find((f, i) => !FLAGS.has(f) && !(f === "--preview" && SCENE.test(flags[i + 1] ?? "")) && !(flags[i - 1] === "--preview" && SCENE.test(f)));
    if (bad) throw Object.assign(new Error(`flag not allowed: ${bad}`), { status: 400 });
    if (!(priority in RANK)) throw Object.assign(new Error(`bad priority ${priority}`), { status: 400 });
    resolveProject(project);
    const job = { id: nextId++, project, stage, flags, priority, by, status: "queued", code: null, log: "", listeners: new Set(), queued: Date.now() };
    job.done = new Promise((r) => (job.resolve = r));
    jobs.push(job);
    // Keep memory bounded: drop the oldest finished jobs (history is on disk).
    while (jobs.length > 100) {
      const k = jobs.findIndex((j) => j.status !== "queued" && j.status !== "running");
      if (k < 0) break;
      jobs.splice(k, 1);
    }
    publish("job", pub(job));
    pump();
    return job;
  }

  function cancel(id) {
    const job = jobs.find((j) => j.id === id);
    if (!job) throw Object.assign(new Error(`no job ${id}`), { status: 404 });
    if (job.status === "queued") {
      finish(job, "cancelled", null);
    } else if (job.status === "running") {
      // Mark it first so the child's close handler does not record a failure.
      finish(job, "cancelled", null);
      // The stage spawns ffmpeg and Chromium; kill the whole tree.
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(job.child.pid), "/t", "/f"], { windowsHide: true });
      else {
        try {
          process.kill(-job.child.pid, "SIGTERM"); // the whole process group
        } catch {
          job.child.kill("SIGTERM");
        }
      }
    } else {
      throw Object.assign(new Error(`job ${id} is already ${job.status}`), { status: 409 });
    }
    return pub(job);
  }

  return {
    enqueue,
    cancel,
    get: (id) => jobs.find((j) => j.id === id),
    list: () => jobs.map(pub).reverse(),
    history: (project) => readJson(path.join(stateDir(resolveProject(project)), "jobs.json"), []).reverse(),
    pub,
  };
}
