/** Tiny static server for the smoke fixture: node projects/_smoke/site/serve.mjs [port] */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] ?? 4317);

http
  .createServer((req, res) => {
    const name = req.url === "/" ? "index.html" : path.basename(req.url.split("?")[0]);
    const file = path.join(dir, name);
    if (!name.endsWith(".html") || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(fs.readFileSync(file));
  })
  .listen(port, "127.0.0.1", () => console.log(`smoke site on http://127.0.0.1:${port}`));
