#!/usr/bin/env node
/**
 * AiEmcee CLI.
 *
 *   node bin/aiemcee.mjs <stage> --project projects/<name> [--only <sceneId>] [stage flags]
 *
 *   stages   doctor | validate | narrate | clip | capture | compose | film
 *            film = narrate -> clip -> capture -> compose
 *
 *   node bin/aiemcee.mjs batch --projects "projects/uc-*" [--fast | --draft]
 *            [--jobs 1] [--stages narrate,compose] [--force]
 *
 * Renders many films with the fast engine, skipping every one whose delivered
 * film is already up to date with all its inputs.
 *
 * Every stage runs the shared engine script (scripts/<stage>.mjs) with the
 * project directory as the root for config, narration, tts, raw, work, out
 * and assets. Without --project the repo root's own film is built.
 *
 *   npx @mrigankad/aiemcee init [dir]
 *
 * Scaffolds a complete video project: the pipeline scripts, the scenes and
 * the AiEmcee Motion engine, the docs, and the four files you actually edit.
 *
 * The scaffold is a standalone project, not a consumer of this package. It
 * depends on playwright, react and esbuild directly and has no runtime link back
 * here, so upgrading the CLI never breaks a video you already made.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, "package.json"), "utf8"));

/** Copied into the scaffold. Shipped inline because npm strips .gitignore from tarballs. */
const GITIGNORE = `# Dependencies
node_modules/

# Generated media — everything here rebuilds from source. Never commit it.
raw/
tts/
work/
out/
remotion/out/
remotion/public/film/

# Large source media you drop in yourself (logo stings, music beds).
# Delete these two lines if your intro asset is small enough to track.
assets/*.mp4
assets/*.mov
assets/*.mp3
assets/*.wav
assets/music/

# Personal Claude Code settings. The shared /emcee skill in .claude/skills/ is tracked.
.claude/settings.local.json

# Logs and OS noise
*.log
.DS_Store
Thumbs.db
`;

/**
 * What lands in a new project. Paths are relative to the package root; a
 * trailing entry that does not exist is skipped rather than failing, so the
 * CLI works from both a published tarball and a dev checkout.
 */
const SCAFFOLD = [
  "design.tokens.json",
  "narration.json",
  "scenes.mjs",
  "video.config.mjs",
  "scripts",
  "remotion",
  "docs",
  "examples",
  "assets",
  ".claude/skills",
];

/** Never copied, even when present inside a scaffolded directory. */
const SKIP = new Set(["node_modules", "out", "raw", "work", "tts", ".git"]);

/**
 * Never copied, by path from the package root. Staged render media, and
 * anything that is the maintainer's own rather than the engine's: the private
 * scene registry, per-film scene folders and per-film art (see .gitignore).
 */
const SKIP_PATHS = new Set([path.join("remotion", "public", "film"), path.join("remotion", "public", "projects"), path.join("remotion", "src", "local.tsx")]);
const ENGINE_PUBLIC = new Set(["README.md", "mark.svg"]);

function skipped(rel) {
  if (SKIP_PATHS.has(rel)) return true;
  const parts = rel.split(path.sep);
  // remotion/src/compositions/<folder>/: per-film scenes. The engine's are files directly in compositions/.
  if (parts[0] === "remotion" && parts[1] === "src" && parts[2] === "compositions" && parts.length === 4 && fs.statSync(path.join(PKG_ROOT, rel)).isDirectory()) return true;
  // remotion/public/<anything but the engine's own>: per-film art.
  if (parts[0] === "remotion" && parts[1] === "public" && parts.length === 3 && !ENGINE_PUBLIC.has(parts[2])) return true;
  return false;
}

function projectPackageJson(name) {
  return `${JSON.stringify(
    {
      name,
      version: "0.1.0",
      private: true,
      type: "module",
      description: `Demo video for ${name}, built with AiEmcee.`,
      engines: { node: ">=20" },
      scripts: {
        doctor: "node scripts/doctor.mjs",
        narrate: "node scripts/narrate.mjs",
        motion: "node remotion/render.mjs",
        validate: "node scripts/validate.mjs",
        capture: "node scripts/capture.mjs",
        clip: "node scripts/clip.mjs",
        compose: "node scripts/compose.mjs",
        build: "npm run narrate && npm run clip && npm run capture && npm run compose",
        studio: "node scripts/motion-studio.mjs",
        setup: "npm install && npm --prefix remotion install && npx playwright install chromium",
      },
      dependencies: { playwright: "1.62.1" },
    },
    null,
    2,
  )}\n`;
}

function copy(src, dest) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (SKIP.has(entry)) continue;
      if (skipped(path.relative(PKG_ROOT, path.join(src, entry)))) continue;
      copy(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }

  fs.copyFileSync(src, dest);
}

function init(argv) {
  const target = path.resolve(argv[0] ?? "my-video");
  const name = path.basename(target).toLowerCase().replace(/[^a-z0-9-]+/g, "-");

  if (fs.existsSync(target) && fs.readdirSync(target).length) {
    console.error(`\n  ${path.relative(process.cwd(), target) || target} exists and is not empty.\n`);
    process.exit(1);
  }

  fs.mkdirSync(target, { recursive: true });

  let copied = 0;
  for (const entry of SCAFFOLD) {
    const src = path.join(PKG_ROOT, entry);
    if (!fs.existsSync(src)) continue;
    copy(src, path.join(target, entry));
    copied++;
  }

  fs.writeFileSync(path.join(target, "package.json"), projectPackageJson(name));
  fs.writeFileSync(path.join(target, ".gitignore"), GITIGNORE);

  const where = path.relative(process.cwd(), target) || ".";

  console.log(`
  Created ${name} in ${where}  (${copied} scaffold entries)

  Next:

    cd ${where}
    npm run setup      installs deps and Chromium
    npm run doctor     checks ffmpeg, edge-tts and the browser

  Then edit these four files:

    narration.json      the script — one entry per scene
    video.config.mjs    your app's URL and the running order
    scenes.mjs          what the browser does in each recorded scene
    design.tokens.json  colours, fonts, frame size

  Start your app in production mode, then:

    npm run build       narrate -> clip -> capture -> compose

  Read docs/01-quickstart.md first. It is worth the ten minutes.
`);
}


/** Runs engine stages for a project. Flags other than --project/--only pass through. */
function stage(command, argv) {
  let project = null;
  let only = null;
  const pass = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--project") project = argv[++i];
    else if (a.startsWith("--project=")) project = a.slice(10);
    else if (a === "--only") only = argv[++i];
    else if (a.startsWith("--only=")) only = a.slice(7);
    else pass.push(a);
  }
  if (project && !fs.existsSync(path.join(path.resolve(project), "video.config.mjs"))) {
    console.error(`
  ${project} has no video.config.mjs (copy projects/_template to start one)
`);
    process.exit(1);
  }

  const env = { ...process.env };
  if (project) env.AIEMCEE_PROJECT = path.resolve(project);
  else delete env.AIEMCEE_PROJECT;

  const stages = command === "film" ? ["narrate", "clip", "capture", "compose"] : [command];
  for (const name of stages) {
    // A scene id narrows narrate/clip/capture; compose always builds the whole film.
    const scoped = only && name !== "compose" && name !== "doctor" && name !== "validate" ? [only] : [];
    // Stage flags (e.g. --master 4k, --all) go only to the stage they belong to in a film run.
    const flags = command === "film" ? (name === "compose" ? pass : []) : pass;
    console.log(`
== ${name}${project ? `  (${project})` : ""}`);
    const run = spawnSync(process.execPath, [path.join(PKG_ROOT, "scripts", `${name}.mjs`), ...scoped, ...flags], {
      stdio: "inherit",
      env,
    });
    if (run.status !== 0) process.exit(run.status ?? 1);
  }
}

/** "projects/uc-*,projects/mfg-01" -> project dirs that have a video.config.mjs. */
function expandProjects(spec) {
  const found = [];
  for (const part of spec.split(",").map((p) => p.trim()).filter(Boolean)) {
    const abs = path.resolve(part);
    if (!part.includes("*")) {
      found.push(abs);
      continue;
    }
    const dir = path.dirname(abs);
    const glob = path.basename(abs).split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`^${glob.join(".*")}$`, "i");
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      if (re.test(name) && fs.existsSync(path.join(dir, name, "video.config.mjs"))) found.push(path.join(dir, name));
    }
  }
  return [...new Set(found)];
}

/** Runs one engine stage for a project, its output to <project>/work/batch-<stage>.log. */
function runStage(project, name, flags, env) {
  fs.mkdirSync(path.join(project, "work"), { recursive: true });
  const log = path.join(project, "work", `batch-${name}.log`);
  const out = fs.openSync(log, "w");
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(PKG_ROOT, "scripts", `${name}.mjs`), ...flags], {
      stdio: ["ignore", out, out],
      env: { ...env, AIEMCEE_PROJECT: project },
    });
    child.on("close", (code) => {
      fs.closeSync(out);
      resolve({ code, log, text: fs.readFileSync(log, "utf8") });
    });
  });
}

async function batch(argv) {
  const value = (flag, fallback) => {
    const i = argv.findIndex((a) => a === flag || a.startsWith(`${flag}=`));
    if (i < 0) return fallback;
    return argv[i].includes("=") ? argv[i].split("=").slice(1).join("=") : argv[i + 1];
  };
  const spec = value("--projects", null);
  if (!spec) {
    console.error('\n  batch needs --projects, e.g. --projects "projects/uc-*"\n');
    process.exit(1);
  }
  const projects = expandProjects(spec);
  if (!projects.length) {
    console.error(`\n  no projects match ${spec}\n`);
    process.exit(1);
  }
  const mode = argv.includes("--draft") ? "--draft" : "--fast";
  const force = argv.includes("--force");
  const stages = value("--stages", "compose").split(",").map((s) => s.trim()).filter(Boolean);
  // Each compose already fills every core (render pages, x264), so films run
  // one at a time by default; measured, two at once finished no sooner.
  const jobs = Math.max(1, Number(value("--jobs", 1)));
  const env = { ...process.env, AIEMCEE_CPU_SHARE: String(jobs) };

  console.log(`\n== batch  ${projects.length} films, ${mode.slice(2)}, ${jobs} at a time, stages: ${stages.join(" -> ")}\n`);
  const started = Date.now();
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < projects.length) {
      const project = projects[next++];
      const label = path.relative(process.cwd(), project) || project;
      const t = Date.now();
      let status = "done";
      let detail = "";
      for (const name of stages) {
        const flags = name === "compose" ? [mode, ...(force ? [] : ["--if-changed"])] : [];
        const run = await runStage(project, name, flags, env);
        if (run.code !== 0) {
          status = "FAILED";
          detail = `${name}, see ${path.relative(process.cwd(), run.log)}`;
          break;
        }
        if (name === "compose") {
          if (/^up to date/m.test(run.text)) status = "up to date";
          else detail = (/^picture  done in .*$/m.exec(run.text)?.[0] ?? "").replace("picture  done in ", "picture ");
        }
      }
      const secs = (Date.now() - t) / 1000;
      results.push({ label, status, secs });
      console.log(`  ${status.padEnd(10)} ${label.padEnd(36)} ${secs.toFixed(0).padStart(5)}s  ${detail}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, projects.length) }, worker));

  const failed = results.filter((r) => r.status === "FAILED").length;
  const skipped = results.filter((r) => r.status === "up to date").length;
  console.log(
    `\n  ${results.length - failed - skipped} rendered, ${skipped} up to date, ${failed} failed  ` +
      `in ${((Date.now() - started) / 60000).toFixed(1)} min\n`,
  );
  if (failed) process.exit(1);
}

function help() {
  console.log(`
  AiEmcee ${pkg.version}
  Narrated product demo videos, generated end to end from a text file.

  Usage
    node bin/aiemcee.mjs <stage> --project projects/<name> [--only <sceneId>]
      stages: doctor, validate, narrate, clip, capture, compose, film
      compose flags: --sound-only, --master 4k, --fast, --draft, --if-changed
    node bin/aiemcee.mjs batch --projects "projects/uc-*" [--fast|--draft] [--jobs 1]
      [--stages narrate,compose] [--force]    many films, skipping up-to-date ones
    node bin/aiemcee.mjs studio [--port 4810] [--projects projects] [--host 0.0.0.0]
    node bin/aiemcee.mjs studio user add <name> <viewer|approver|editor|owner>
                                          the web studio: player, script, jobs, chat
    npx @mrigankad/aiemcee init [dir]     scaffold a standalone video project

  Options
    -v, --version
    -h, --help

  Docs   https://github.com/mrigankad/AiEmcee
`);
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "init":
    init(rest);
    break;
  case "batch":
    await batch(rest);
    break;
  case "studio":
    await import(new URL("../studio/server.mjs", import.meta.url).href);
    break;
  case "film":
  case "doctor":
  case "validate":
  case "narrate":
  case "clip":
  case "capture":
  case "compose":
    stage(command, rest);
    break;
  case "-v":
  case "--version":
    console.log(pkg.version);
    break;
  case undefined:
  case "-h":
  case "--help":
    help();
    break;
  default:
    console.error(`\n  Unknown command: ${command}\n  Try: node bin/aiemcee.mjs --help\n`);
    process.exit(1);
}
