/**
 * The motion preview studio: every composition, scrubbable and playable in a
 * browser, rebuilt on save. It replaces Remotion Studio.
 *
 *   node scripts/motion-studio.mjs [--project dir] [--port 3123]
 *   npm run studio
 *
 * It renders with the same runtime and frame server as `compose`, so what you
 * see is what renders. The Film composition shows the project's last compose
 * (its staged timeline); run compose once to preview a project's full film.
 */
import fs from "node:fs";
import path from "node:path";

import { loadConfig, PROJECT_NAME, IS_PROJECT } from "./lib/config.mjs";
import { motionWatch } from "./lib/motion/bundle.mjs";
import { startHost } from "./lib/motion/host.mjs";
import { REMOTION_DIR } from "./lib/remotion.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const PORT = Number(opt("--port", 3123));

const { config } = await loadConfig();
const dir = path.join(REMOTION_DIR, "out", ".motion", "studio");
const publicDir = path.join(REMOTION_DIR, "public");
const timelineFile = path.join(publicDir, ...(IS_PROJECT ? ["projects", PROJECT_NAME] : ["film"]), "timeline.json");

// Live reload: each rebuild tells every open studio page.
const clients = new Set();
let lastError = null;
let ready;
const firstBuild = new Promise((r) => (ready = r));
await motionWatch(dir, (errors) => {
  lastError = errors.length ? errors.map((e) => `${e.location?.file ?? ""}:${e.location?.line ?? ""} ${e.text}`).join("\n") : null;
  console.log(lastError ? `build failed\n${lastError}` : `built ${new Date().toLocaleTimeString()}`);
  for (const res of clients) res.write(`event: ${lastError ? "error" : "reload"}\ndata: ${JSON.stringify(lastError ?? "")}\n\n`);
  ready();
});
await firstBuild;

const env = { REMOTION_AIEMCEE_TOKENS: JSON.stringify(config.tokens ?? {}) };
// Read per request, so editing the page needs only a browser refresh.
const studioPage = () => fs.readFileSync(new URL("./lib/motion/studio.html", import.meta.url), "utf8").replace("__ENV__", JSON.stringify(env).replace(/</g, "\\u003c"));

const host = await startHost({
  bundleDir: dir,
  publicDir,
  port: PORT,
  async routes(req, res, url) {
    if (url.pathname === "/" || url.pathname === "/studio") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.end(studioPage());
      return true;
    }
    if (url.pathname === "/__timeline") {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(fs.existsSync(timelineFile) ? fs.readFileSync(timelineFile) : "null");
      return true;
    }
    if (url.pathname === "/__reload") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" });
      res.write(`event: hello\ndata: ${JSON.stringify(lastError ?? "")}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return true;
    }
    return false;
  },
});

console.log(`\nmotion studio  ${host.url}\nproject        ${IS_PROJECT ? PROJECT_NAME : "(engine film)"}\nscenes         remotion/src (rebuilds on save)`);
