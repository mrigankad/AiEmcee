/**
 * Hand lines for the hand-drawn style. Every path is generated from a seed
 * (never Math.random), so a frame always draws the same wobble.
 */
import React from "react";
import { seeded } from "../swiss/lib";

type Pt = [number, number];

/** Catmull-Rom through the points, as cubic Béziers. */
function smooth(pts: Pt[]) {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d;
}

/** A hand line from a to b: a slight bow plus small jitter. */
export function line(a: Pt, b: Pt, seed: number, amp = 2.2) {
  const r = seeded(seed);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.round(len / 90));
  const nx = -(b[1] - a[1]) / (len || 1);
  const ny = (b[0] - a[0]) / (len || 1);
  const bow = (r() - 0.5) * Math.min(10, len * 0.02);
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const off = Math.sin(t * Math.PI) * bow + (i === 0 || i === n ? 0 : (r() - 0.5) * amp);
    pts.push([a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + ny * off]);
  }
  return smooth(pts);
}

/** A hand box: four strokes that overshoot their corners a little, as one path. */
export function box(x: number, y: number, w: number, h: number, seed: number) {
  const r = seeded(seed);
  const o = () => 4 + r() * 6;
  const j = () => (r() - 0.5) * 4;
  return [
    line([x - o(), y + j()], [x + w + o() * 0.4, y + j()], seed + 1),
    line([x + w + j(), y - o() * 0.4], [x + w + j(), y + h + o()], seed + 2),
    line([x + w + o() * 0.5, y + h + j()], [x - o() * 0.3, y + h + j()], seed + 3),
    line([x + j(), y + h + o() * 0.3], [x + j(), y - o() * 0.6], seed + 4),
  ].join(" ");
}

/** An ellipse scribbled around a point, overshooting its start: the "circled" note. */
export function loop(cx: number, cy: number, rx: number, ry: number, seed: number, turns = 1.12) {
  const r = seeded(seed);
  const start = -Math.PI * (0.6 + r() * 0.2);
  const n = 28;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = start + t * turns * Math.PI * 2;
    const k = 1 + (r() - 0.5) * 0.05 + t * 0.06;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return smooth(pts);
}

/** A loose underline: a long gentle swoosh. */
export function underline(x: number, y: number, w: number, seed: number) {
  const r = seeded(seed);
  const pts: Pt[] = [];
  const n = Math.max(3, Math.round(w / 120));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([x + w * t, y + Math.sin(t * Math.PI * 0.9) * -4 + (r() - 0.5) * 3 + t * 5]);
  }
  return smooth(pts);
}

/** An arrow from a to b, curved by `bend`, with a two-stroke head. */
export function arrow(a: Pt, b: Pt, seed: number, bend = 0.18) {
  const r = seeded(seed);
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const c: Pt = [mx - dy * bend + (r() - 0.5) * 4, my + dx * bend + (r() - 0.5) * 4];
  const shaft = `M${a[0]} ${a[1]} Q${c[0].toFixed(1)} ${c[1].toFixed(1)} ${b[0]} ${b[1]}`;
  const ang = Math.atan2(b[1] - c[1], b[0] - c[0]);
  const hl = 20;
  const h1: Pt = [b[0] - Math.cos(ang - 0.45) * hl, b[1] - Math.sin(ang - 0.45) * hl];
  const h2: Pt = [b[0] - Math.cos(ang + 0.45) * hl, b[1] - Math.sin(ang + 0.45) * hl];
  return { shaft, head: `M${h1[0].toFixed(1)} ${h1[1].toFixed(1)} L${b[0]} ${b[1]} L${h2[0].toFixed(1)} ${h2[1].toFixed(1)}` };
}

/** A paper-grain displacement filter that roughens every stroke a touch. */
export function RoughDefs({ id = "hd-rough", scale = 2.4 }: { id?: string; scale?: number }) {
  return (
    <defs>
      <filter id={id} x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={7} result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale={scale} xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  );
}
