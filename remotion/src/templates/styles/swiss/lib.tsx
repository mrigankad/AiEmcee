/**
 * Small helpers shared by the swiss, glass, hand-drawn and dark-cinematic
 * styles: a glyph renderer for Emcee Glyphs, deterministic text fitting, a
 * seeded random source and number formatting for count-ups. Kept local so
 * these styles do not depend on the shared kit's timing.
 */
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import glyphData from "../../../../../assets/glyphs/emcee-glyphs.json";

export const W = 1920;
export const H = 1080;

type Part = {
  el: string;
  tone?: "ink" | "accent";
  fill?: boolean;
  [k: string]: unknown;
};
const GLYPHS = (glyphData as unknown as { glyphs: Record<string, Part[]> }).glyphs;
const FALLBACK: Part[] = [
  { el: "circle", cx: 12, cy: 12, r: 8 },
  { el: "circle", cx: 12, cy: 12, r: 2, tone: "accent", fill: true },
];

export function hasGlyph(name?: string) {
  return !!name && !!GLYPHS[name];
}

/**
 * Draws an Emcee Glyph. `className` goes on every element (use it to target
 * strokes for DrawSVG). `wobble` displaces nothing; styles that want a hand
 * line pass their own filter.
 */
export function GlyphSvg({
  name,
  size = 48,
  stroke = "#16181D",
  accent = "#E5231B",
  strokeWidth,
  className,
  style,
  filter,
}: {
  name?: string;
  size?: number;
  stroke?: string;
  accent?: string;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  filter?: string;
}) {
  const parts = (name && GLYPHS[name]) || FALLBACK;
  const sw = strokeWidth ?? 1.75;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ overflow: "visible", display: "block", ...style }}>
      <g filter={filter}>
        {parts.map((p, i) => {
          const { el, tone, fill, ...attrs } = p;
          const color = tone === "accent" ? accent : stroke;
          const common = {
            key: i,
            className,
            fill: fill ? color : "none",
            stroke: fill ? "none" : color,
            strokeWidth: sw,
            strokeLinecap: "round" as const,
            strokeLinejoin: "round" as const,
            ...(attrs as Record<string, string | number>),
          };
          return React.createElement(el, common);
        })}
      </g>
    </svg>
  );
}

/** mulberry32: a deterministic random source from a seed. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * The largest font size (<= max) at which `text` wraps into `boxW` x `boxH`,
 * estimated from an average glyph width (em). Deterministic: no DOM measuring.
 */
export function fitSize(
  text: string,
  boxW: number,
  boxH: number,
  max: number,
  { charW = 0.56, lineH = 1.05, min = 14, maxLines = 99 }: { charW?: number; lineH?: number; min?: number; maxLines?: number } = {},
) {
  const words = (text || " ").split(/\s+/).filter(Boolean);
  for (let fs = max; fs > min; fs -= 2) {
    const cw = fs * charW;
    const space = cw * 0.6;
    let lines = 1;
    let x = 0;
    let ok = true;
    for (const w of words) {
      const ww = w.length * cw;
      if (ww > boxW) {
        ok = false;
        break;
      }
      if (x === 0) x = ww;
      else if (x + space + ww <= boxW) x += space + ww;
      else {
        lines++;
        x = ww;
      }
    }
    if (ok && lines <= maxLines && lines * fs * lineH <= boxH) return fs;
  }
  return min;
}

export function formatNumber(v: number, decimals = 0) {
  const fixed = v.toFixed(decimals);
  const [i, d] = fixed.split(".");
  const withSep = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return d ? `${withSep}.${d}` : withSep;
}

/** A count-up tween target: writes the formatted value into `el`. */
export function countTo(el: Element, m: { value: number; prefix?: string; suffix?: string; decimals?: number }) {
  const o = { v: 0 };
  const write = () => {
    el.textContent = `${m.prefix ?? ""}${formatNumber(o.v, m.decimals ?? 0)}${m.suffix ?? ""}`;
  };
  write();
  return { o, write };
}

export const metricText = (m: { value: number; prefix?: string; suffix?: string; decimals?: number }) =>
  `${m.prefix ?? ""}${formatNumber(m.value, m.decimals ?? 0)}${m.suffix ?? ""}`;

/** A mark is a public file if it has an extension, else a glyph name. */
export const isFile = (mark?: string) => !!mark && /\.[a-z0-9]{2,4}$/i.test(mark);

/**
 * The 1920x1080 design space, scaled to fit the composition. The ref goes on
 * the design-space element: pass it as the GSAP scope.
 */
export const Stage = React.forwardRef<HTMLDivElement, { bg: string; children?: React.ReactNode; style?: React.CSSProperties; font?: string }>(
  function Stage({ bg, children, style, font }, ref) {
    const { width, height } = useVideoConfig();
    const s = Math.min(width / W, height / H);
    return (
      <AbsoluteFill style={{ background: bg, overflow: "hidden" }}>
        <div
          ref={ref}
          style={{
            position: "absolute",
            left: (width - W * s) / 2,
            top: (height - H * s) / 2,
            width: W,
            height: H,
            transform: `scale(${s})`,
            transformOrigin: "0 0",
            overflow: "hidden",
            fontFamily: font,
            ...style,
          }}
        >
          {children}
        </div>
      </AbsoluteFill>
    );
  },
);

/** Stable key for rebuilding the timeline when props change. */
export const depKey = (p: unknown) => JSON.stringify(p ?? {});
