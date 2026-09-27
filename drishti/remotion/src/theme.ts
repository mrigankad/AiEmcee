/**
 * Design tokens for the motion graphics.
 *
 * Read from ../../design.tokens.json rather than declared here, so the
 * compositions and the ffmpeg pipeline can never disagree about frame size,
 * frame rate or brand colour. Change the JSON, not this file.
 */
import tokens from "../../design.tokens.json";

export const theme = tokens.color;
export const cursor = tokens.cursor;

export const W = tokens.video.width;
export const H = tokens.video.height;
export const FPS = tokens.video.fps;

/** Seconds to frames, so composition lengths read in the same unit as narration. */
export const sec = (seconds: number) => Math.round(seconds * FPS);

type BrandStop = "brand" | "brandLight" | "brandDeep";

/**
 * A brand stop at an arbitrary alpha.
 *
 * Exists so no composition ever writes an rgba() literal. A hardcoded brand
 * colour survives a rebrand and quietly renders the old palette, which is
 * exactly the bug this file is meant to prevent.
 */
export function brandAlpha(alpha: number, stop: BrandStop = "brand") {
  const n = parseInt(theme[stop].replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** The Wayam AI avatar's palette, from the Wayam mark. */
export const avatarColors = tokens.avatar;
