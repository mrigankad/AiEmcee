/**
 * The Wayam AI avatar: a living orb in the Wayam gradient, with two eyes.
 *
 * Everything is a pure function of time and voice level, so it renders
 * deterministically frame by frame:
 *
 *   body    a blob whose outline breathes (a few slow sine harmonics around
 *           the circle) and wobbles harder, and squashes a little, as it speaks
 *   eyes    each one a single stroked curve. Length, angle, bend and weight
 *           are enough to express every mood, and interpolating them morphs
 *           one mood smoothly into the next: upright capsules (neutral) turn
 *           into arcs (happy) or narrow and tilt in (focused). Blinks flatten
 *           them vertically, on a fixed, irregular schedule.
 *   voice   rings pulse out from the rim with the loudness of what was said a
 *           moment ago, so speech reads as sound leaving the orb
 *
 * Drawn in an SVG with a -100..100 viewBox; the orb's radius is 64 units, and
 * the rest is room for glow and rings.
 */
import React from "react";

import { avatarColors } from "../theme";

export type Mood = "neutral" | "happy" | "curious" | "focused";

/** One eye: a stroked quadratic curve. Angles in degrees, lengths in units. */
type Eye = { len: number; angle: number; bend: number; weight: number; dy: number };
type Face = { left: Eye; right: Eye };

const FACES: Record<Mood, Face> = {
  neutral: {
    left: { len: 15, angle: 90, bend: 0, weight: 12, dy: 0 },
    right: { len: 15, angle: 90, bend: 0, weight: 12, dy: 0 },
  },
  happy: {
    left: { len: 17, angle: 0, bend: 10, weight: 6.5, dy: 2 },
    right: { len: 17, angle: 0, bend: 10, weight: 6.5, dy: 2 },
  },
  curious: {
    left: { len: 11, angle: 90, bend: 0, weight: 11, dy: 2 },
    right: { len: 19, angle: 90, bend: 0, weight: 13, dy: -2 },
  },
  focused: {
    left: { len: 9, angle: 70, bend: 0, weight: 12, dy: 1 },
    right: { len: 9, angle: 110, bend: 0, weight: 12, dy: 1 },
  },
};

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixEye = (a: Eye, b: Eye, t: number): Eye => ({
  len: mix(a.len, b.len, t),
  angle: mix(a.angle, b.angle, t),
  bend: mix(a.bend, b.bend, t),
  weight: mix(a.weight, b.weight, t),
  dy: mix(a.dy, b.dy, t),
});

/** Blend between two moods; `t` = 0 is `from`, 1 is `to`. */
export function faceFor(from: Mood, to: Mood, t: number): Face {
  return {
    left: mixEye(FACES[from].left, FACES[to].left, t),
    right: mixEye(FACES[from].right, FACES[to].right, t),
  };
}

/** Deterministic pseudo-random in 0..1, for the blink schedule. */
const hash = (n: number) => {
  const x = Math.sin(n * 78.233 + 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

/** 0 = open, 1 = shut. Blinks every ~2.6–4.4s, each one 0.17s long. */
export function blinkAt(t: number) {
  const period = 3.5;
  const n = Math.floor(t / period);
  for (const i of [n - 1, n]) {
    const start = i * period + hash(i) * 1.8;
    const p = (t - start) / 0.17;
    if (p >= 0 && p <= 1) return p < 0.5 ? p * 2 : (1 - p) * 2;
  }
  return 0;
}

/** Closed blob outline through `points`, smoothed with Catmull-Rom -> Bézier. */
function smoothClosed(points: [number, number][]) {
  const n = points.length;
  let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return `${d}Z`;
}

function bodyPath(t: number, level: number) {
  const R = 64;
  const pts: [number, number][] = [];
  const wobble = 1 + level * 1.8;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const r =
      R *
      (1 +
        0.012 * wobble * Math.sin(3 * a + t * 0.9) +
        0.008 * wobble * Math.sin(5 * a - t * 1.3 + 1) +
        0.01 * wobble * Math.sin(2 * a + t * 0.6 + 2));
    // Speaking widens the orb a touch and lowers it: the squash of a breath out.
    pts.push([Math.cos(a) * r * (1 + 0.03 * level), Math.sin(a) * r * (1 - 0.025 * level)]);
  }
  return smoothClosed(pts);
}

function eyePath(e: Eye, cx: number, cy: number) {
  const rad = (e.angle * Math.PI) / 180;
  const hx = (Math.cos(rad) * e.len) / 2;
  const hy = (Math.sin(rad) * e.len) / 2;
  // Bend pushes the control point perpendicular to the stroke, towards "up".
  const px = Math.sin(rad) * e.bend;
  const py = -Math.cos(rad) * e.bend;
  const ax = cx - hx;
  const ay = cy + e.dy - hy;
  const bx = cx + hx;
  const by = cy + e.dy + hy;
  return `M${ax.toFixed(2)},${ay.toFixed(2)} Q${(cx + px * 2).toFixed(2)},${(cy + e.dy + py * 2).toFixed(2)} ${bx.toFixed(2)},${by.toFixed(2)}`;
}

export function WayamOrb({
  size,
  t,
  level,
  voice,
  face,
  look = [0, 0],
  id = "orb",
}: {
  /** Diameter of the orb itself, in px. */
  size: number;
  /** Seconds, for idle motion and blinks. */
  t: number;
  /** Voice level now, 0..1. */
  level: number;
  /** Voice level `secondsAgo` in the past, for the rings. */
  voice: (secondsAgo: number) => number;
  face: Face;
  /** Where the eyes look, -1..1 on each axis. */
  look?: [number, number];
  /** Unique per instance, for SVG gradient ids. */
  id?: string;
}) {
  const [g0, g1, g2, g3] = avatarColors.gradient;
  const box = size * (200 / 128);
  const float = Math.sin(t * 1.6) * 2.2;
  const tilt = Math.sin(t * 0.9) * 2.5;

  // A blink squashes each eye vertically about its own centre, so every
  // mood blinks the same way instead of rotating through another mood.
  const blink = 1 - 0.88 * blinkAt(t);
  const { left, right } = face;
  const lx = look[0] * 7;
  const ly = look[1] * 5 - level * 2.5;

  // Rings leave the rim every 0.42s and live 1.3s; each carries the loudness
  // of the moment it left, so silence sends none.
  const period = 0.42;
  const life = 1.3;
  const rings = [];
  const phase = t % period;
  for (let i = 0; i < Math.ceil(life / period); i++) {
    const age = phase + i * period;
    const strength = voice(age);
    if (strength < 0.08 || age > life) continue;
    const p = age / life;
    rings.push({ r: 66 + p * 30, o: strength * (1 - p) * 0.55, w: 2.2 * (1 - p) + 0.6 });
  }

  return (
    <svg width={box} height={box} viewBox="-100 -100 200 200" style={{ overflow: "visible", display: "block" }}>
      <defs>
        <radialGradient id={`${id}-body`} cx="0.34" cy="0.3" r="0.82" fx="0.3" fy="0.24">
          <stop offset="0%" stopColor={g0} />
          <stop offset="38%" stopColor={g1} />
          <stop offset="72%" stopColor={g2} />
          <stop offset="100%" stopColor={g3} />
        </radialGradient>
        <linearGradient id={`${id}-depth`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="45%" stopColor={avatarColors.ink} stopOpacity="0" />
          <stop offset="100%" stopColor={avatarColors.ink} stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id={`${id}-spec`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      {/* Glow: the orb lights its surroundings, more so when it speaks. */}
      <circle cx="0" cy={float + 6} r="62" fill={g1} opacity={0.28 + level * 0.3} filter={`url(#${id}-soft)`} />

      {rings.map((ring, i) => (
        <circle key={i} cx="0" cy={float} r={ring.r} fill="none" stroke={g2} strokeWidth={ring.w} opacity={ring.o} />
      ))}

      <g transform={`translate(0 ${float}) rotate(${tilt})`}>
        <path d={bodyPath(t, level)} fill={`url(#${id}-body)`} />
        <path d={bodyPath(t, level)} fill={`url(#${id}-depth)`} />
        <path d={bodyPath(t, level)} fill="none" stroke={`url(#${id}-rim)`} strokeWidth="1.6" />
        <ellipse cx={-22 + lx * 0.3} cy={-30} rx="20" ry="11" fill="#fff" opacity="0.32" transform="rotate(-32 -22 -30)" filter={`url(#${id}-spec)`} />

        <g stroke={avatarColors.eye} strokeLinecap="round" fill="none">
          <g transform={`translate(0 ${-6 + ly}) scale(1 ${blink}) translate(0 ${6 - ly})`}>
            <path d={eyePath(left, -19 + lx, -6 + ly)} strokeWidth={left.weight} />
            <path d={eyePath(right, 19 + lx, -6 + ly)} strokeWidth={right.weight} />
          </g>
        </g>
      </g>
    </svg>
  );
}
