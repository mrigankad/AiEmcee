/**
 * Your own scenes go in src/local.tsx (git-ignored): copy this file there and
 * fill it in. It keeps per-film and per-client compositions out of the engine
 * and out of the repository. Put their code in compositions/<name>/ (also
 * git-ignored) and their art in public/<name>/.
 *
 *   LOCAL_MOTION        id -> component + props: a sequence entry
 *                       { from: "motion", composition: "<id>" } renders it
 *   LocalCompositions   <Composition> entries, to preview scenes on their own
 *
 * The bundler and TypeScript resolve "@local" to local.tsx when it exists, and
 * to this file otherwise.
 */
import type { Entry } from "./scenes";

export const LOCAL_MOTION: Record<string, Entry> = {};

export function LocalCompositions() {
  return null;
}
