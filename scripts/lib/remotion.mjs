/**
 * Where the scenes live: the remotion/ package (React compositions in src/,
 * the AiEmcee Motion runtime in engine/, shared art in public/). The folder
 * keeps its historical name so existing projects and their staged media keep
 * working; nothing in it depends on Remotion any more. The renderer is
 * scripts/lib/motion/.
 */
import fs from "node:fs";
import path from "node:path";

import { engineAt } from "./config.mjs";

export const REMOTION_DIR = engineAt("remotion");

/** Throws with the fix when the scene package's dependencies are missing. */
export function assertScenesInstalled() {
  for (const dep of ["react", "react-dom", "esbuild"]) {
    if (!fs.existsSync(path.join(REMOTION_DIR, "node_modules", dep))) {
      throw new Error(`the scenes' dependencies are not installed (${dep}). Run:  npm --prefix remotion install`);
    }
  }
}
