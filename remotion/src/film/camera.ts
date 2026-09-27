/**
 * The virtual camera over product footage, as pure maths.
 *
 * Shared by Footage (which moves the picture) and the avatar layer (which needs
 * to know where a focus box is on screen, so the presenter can step aside).
 */
import { Easing } from "remotion";

import type { Focus, Tone, VideoSegment } from "./types";

export const ease = Easing.bezier(0.45, 0, 0.2, 1);
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** How much a focus beat is "on" at footage time `t`: 0 -> 1 -> 0, eased. */
function weight(f: Focus, t: number, rampIn: number) {
  const rampOut = rampIn * 0.8;
  const up = clamp((t - f.at) / rampIn, 0, 1);
  const down = clamp((f.until - t) / rampOut, 0, 1);
  return ease(Math.min(up, down));
}

function zoomFor(f: Focus, zoomMax: number) {
  if (f.zoom != null) return f.zoom;
  const [, , w, h] = f.box;
  // Fit the box to ~78% of the frame, never zooming past the tone's ceiling.
  return clamp(0.78 / Math.max(w, h), 1, zoomMax);
}

export type Camera = {
  /** Scale, and the footage point (0..1) at the centre of the screen. */
  s: number;
  cx: number;
  cy: number;
  /** The focus beat in play, and how far in it is (0..1). */
  active: Focus | null;
  k: number;
};

/** The camera at footage time `t` (seconds since the segment appeared). */
export function cameraAt(segment: VideoSegment, tone: Tone, t: number, plain: boolean): Camera {
  const visible = segment.lead + segment.slot;
  const push = plain || segment.look === "lock" ? 0 : tone.push;
  const progress = clamp(t / visible, 0, 1);
  const s0 = 1 + push * ease(progress);
  // Drift sideways across whatever the push has made spare.
  const c0x = 0.5 + (progress - 0.5) * (1 - 1 / s0) * 0.9;
  const c0y = 0.5;

  let active: Focus | null = null;
  let k = 0;
  for (const f of segment.focus) {
    const w = weight(f, t, tone.focus.ease);
    if (w > k) {
      k = w;
      active = f;
    }
  }

  let s = s0;
  let cx = c0x;
  let cy = c0y;
  if (active) {
    const [bx, by, bw, bh] = active.box;
    s = lerp(s0, zoomFor(active, tone.focus.zoomMax), k);
    cx = lerp(c0x, bx + bw / 2, k);
    cy = lerp(c0y, by + bh / 2, k);
  }
  // Never let the camera show past the edge of the footage.
  cx = clamp(cx, 0.5 / s, 1 - 0.5 / s);
  cy = clamp(cy, 0.5 / s, 1 - 0.5 / s);

  return { s, cx, cy, active, k };
}

/** Where the active focus box is on screen, in pixels, padded. */
export function focusRect(cam: Camera, W: number, H: number, pad = 10) {
  if (!cam.active) return null;
  const [bx, by, bw, bh] = cam.active.box;
  return {
    x: W / 2 + (bx - cam.cx) * W * cam.s - pad,
    y: H / 2 + (by - cam.cy) * H * cam.s - pad,
    w: bw * W * cam.s + pad * 2,
    h: bh * H * cam.s + pad * 2,
  };
}
