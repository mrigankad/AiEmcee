/**
 * Fonts are loaded through @remotion/google-fonts rather than a <link>, because
 * the renderer screenshots frames headlessly and will happily capture a frame
 * before a network font has arrived. This makes loading part of the bundle.
 *
 * Swapping a typeface: change the two import paths and the names in
 * design.tokens.json, and every composition follows.
 */
import { loadFont as loadDisplay } from "@remotion/google-fonts/Michroma";
import { loadFont as loadSans } from "@remotion/google-fonts/Geist";

const display = loadDisplay("normal", {
  subsets: ["latin"],
  weights: ["400"],
  ignoreTooManyRequestsWarning: true,
});

const sans = loadSans("normal", {
  subsets: ["latin"],
  weights: ["400", "600"],
  ignoreTooManyRequestsWarning: true,
});

export const fontDisplay = display.fontFamily;
export const fontSans = sans.fontFamily;
export const fontMono = "ui-monospace, SFMono-Regular, Menlo, monospace";
