/**
 * Fonts ship inside the bundle (the @fontsource packages: local woff2, no
 * network), and the motion runtime waits for every face below before it draws
 * the first frame, so a frame is never captured with a fallback font.
 *
 * The family is chosen by name from the (project-merged) tokens: fonts.sans
 * and fonts.display. Every family a project can name must be listed below; an
 * unknown name falls back to the engine default. Only the listed weights load:
 * any other weight is synthesised by the browser, as it always was. Add a
 * family: import its latin-<weight>.css files and add it to FAMILIES. All
 * families here are SIL OFL 1.1.
 */
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/inter-tight/latin-400.css";
import "@fontsource/inter-tight/latin-500.css";
import "@fontsource/inter-tight/latin-600.css";
import "@fontsource/inter-tight/latin-700.css";
import "@fontsource/urbanist/latin-600.css";
import "@fontsource/urbanist/latin-700.css";
import "@fontsource/urbanist/latin-800.css";
import "@fontsource/figtree/latin-400.css";
import "@fontsource/figtree/latin-500.css";
import "@fontsource/figtree/latin-600.css";
import "@fontsource/figtree/latin-700.css";
import "@fontsource/michroma/latin-400.css";

import { preloadFonts } from "../engine/fonts";
import { tokens } from "./theme";

const FAMILIES: Record<string, string[]> = {
  Geist: ["400", "600"],
  "Inter Tight": ["400", "500", "600", "700"],
  Urbanist: ["600", "700", "800"],
  Figtree: ["400", "500", "600", "700"],
  Michroma: ["400"],
};

const pick = (name: string | undefined, fallback: string) => (name && FAMILIES[name] ? name : fallback);

export const fontSans = pick(tokens.fonts?.sans, "Geist");
export const fontDisplay = pick(tokens.fonts?.display, "Michroma");
export const fontMono = tokens.fonts?.mono ?? "ui-monospace, SFMono-Regular, Menlo, monospace";

preloadFonts(Object.entries(FAMILIES).flatMap(([family, weights]) => weights.map((w) => `${w} 16px "${family}"`)));
