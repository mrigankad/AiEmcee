/**
 * Renders everything Remotion contributes to the film, driven by the sequence
 * in ../video.config.mjs:
 *
 *   from: "motion"  ->  remotion/out/<composition>.mp4
 *   lowerThird: {}  ->  remotion/out/lt-<sceneId>.png   (transparent still)
 *
 * There is no separate list to keep in sync. Add a motion scene to the
 * sequence and it renders; remove it and it stops.
 *
 *   npm run motion              everything the sequence asks for
 *   npm run motion -- Problem   one composition, while you iterate
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");

const { default: config } = await import(pathToFileURL(path.join(repo, "video.config.mjs")).href);

const outDir = path.join(here, "out");
fs.mkdirSync(outDir, { recursive: true });

const binDir = path.join(here, "node_modules", ".bin");
const exe = process.platform === "win32" ? "remotion.cmd" : "remotion";

if (!fs.existsSync(path.join(binDir, exe))) {
  console.error("remotion is not installed. Run:  npm --prefix remotion install");
  process.exit(1);
}

const only = process.argv.slice(2).find((a) => !a.startsWith("--"));

/**
 * A .cmd shim on Windows is a batch file, so it can only be launched through a
 * shell — and a shell does not quote the arguments Node hands it. Any space in
 * the checkout path would then split a path in half.
 *
 * So: nothing on the command line is allowed to contain a space. The bin
 * directory goes on PATH (an environment variable, which is immune to this),
 * and every path is passed relative to `here`.
 */
function remotion(args) {
  execFileSync(exe, [...args, "--log=error"], {
    cwd: here,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH}` },
  });
}

/** Paths handed to the CLI, relative to `here` and therefore space-free. */
const rel = (abs) => path.relative(here, abs).split(path.sep).join("/");
const entry = "src/index.ts";

/* ---------------------------------------------------------------- */
/* Motion clips                                                      */
/* ---------------------------------------------------------------- */
const compositions = [
  ...new Set(config.sequence.filter((s) => s.from === "motion").map((s) => s.composition)),
];
if (config.outro) compositions.push(config.outro.composition);

for (const id of compositions) {
  if (only && only !== id) continue;
  const dest = path.join(outDir, `${id.toLowerCase()}.mp4`);
  console.log(`clip   ${id} -> out/${path.basename(dest)}`);
  remotion(["render", entry, id, rel(dest)]);
}

/* ---------------------------------------------------------------- */
/* Lower thirds                                                      */
/* ---------------------------------------------------------------- */
const titled = config.sequence.filter((s) => s.lowerThird);

for (const scene of titled) {
  if (only && only !== "LowerThird") continue;

  const dest = path.join(outDir, `lt-${scene.id}.png`);
  // Props go through a file rather than an inline --props string: quoting a
  // JSON blob on a Windows command line is a reliable way to lose a character.
  const propsFile = path.join(outDir, `lt-${scene.id}.props.json`);
  fs.writeFileSync(propsFile, JSON.stringify(scene.lowerThird));

  console.log(`still  ${scene.id} -> out/${path.basename(dest)}  "${scene.lowerThird.kicker}"`);
  remotion([
    "still", entry, "LowerThird", rel(dest),
    // Grabbed past the fade-in so the still is at full opacity; the actual
    // fade is applied by ffmpeg in compose.mjs.
    "--frame=24",
    // PNG, because the card is composited over live footage and needs alpha.
    "--image-format=png",
    `--props=${rel(propsFile)}`,
  ]);
}

if (!compositions.length && !titled.length) {
  console.log("nothing to render — no motion scenes or lower thirds in the sequence");
} else {
  console.log("\nremotion render complete");
}
