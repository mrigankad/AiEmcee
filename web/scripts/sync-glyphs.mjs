// Copies the Emcee Glyphs (source of truth: ../assets/glyphs/emcee-glyphs.json)
// into src/lib so the app can import them; Turbopack's root is this folder.
// Runs before dev and build. Edit the source, never the copy.
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../../assets/glyphs/emcee-glyphs.json", import.meta.url));
const dst = fileURLToPath(new URL("../src/lib/emcee-glyphs.json", import.meta.url));
if (existsSync(src)) copyFileSync(src, dst);
else if (!existsSync(dst)) throw new Error(`Emcee Glyphs not found at ${src}`);
