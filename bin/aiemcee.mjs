#!/usr/bin/env node
/**
 * AiEmcee CLI.
 *
 *   npx @mrigankad/aiemcee init [dir]
 *
 * Scaffolds a complete video project: the pipeline scripts, the Remotion
 * compositions, the docs, and the four files you actually edit.
 *
 * The scaffold is a standalone project, not a consumer of this package. It
 * depends on playwright and remotion directly and has no runtime link back
 * here, so upgrading the CLI never breaks a video you already made.
 */
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

/** Never copied, by path from the package root: staged render media. */
const SKIP_PATHS = new Set([path.join("remotion", "public", "film")]);

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
        studio: "npm --prefix remotion run studio",
        setup: "npm install && npm --prefix remotion install && npx playwright install chromium",
      },
      dependencies: { playwright: "^1.49.0" },
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
      if (SKIP_PATHS.has(path.relative(PKG_ROOT, path.join(src, entry)))) continue;
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

    npm run build       narrate -> motion -> capture -> compose

  Read docs/01-quickstart.md first. It is worth the ten minutes.
`);
}

function help() {
  console.log(`
  AiEmcee ${pkg.version}
  Narrated product demo videos, generated end to end from a text file.

  Usage
    npx @mrigankad/aiemcee init [dir]     scaffold a new video project

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
    console.error(`\n  Unknown command: ${command}\n  Try: npx @mrigankad/aiemcee init\n`);
    process.exit(1);
}
