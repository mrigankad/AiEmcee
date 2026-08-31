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
