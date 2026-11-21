/**
 * Text that always fits its box.
 *
 * `fitText` finds the largest font size (from `max` down to `min`) at which the
 * text word-wraps into at most `maxLines` lines no wider than `maxWidth`,
 * measured with the real font on a canvas (the runtime has loaded every face
 * before the first frame). It returns the lines, so `FitText` renders them as
 * explicit rows: the layout is the measured one, never the browser's reflow.
 * At `min` it still wraps, and breaks over-long words, so nothing leaves its box.
 *
 * Each word is an inline-block span with `wordClassName`, for GSAP word reveals.
 */
import React from "react";

import { fontSans } from "../../fonts";

export type FitOptions = {
  maxWidth: number;
  maxLines?: number;
  max: number;
  min?: number;
  weight?: number;
  family?: string;
  /** In em, as CSS letter-spacing. */
  letterSpacing?: number;
};

export type Fitted = { fontSize: number; lines: string[] };

/** A CSS font-family value: a single family is quoted, a list is used as is. */
export const cssFamily = (f: string) => (f.includes(",") ? f : `"${f}", sans-serif`);

let ctx: CanvasRenderingContext2D | null | undefined;
function measurer() {
  if (ctx === undefined) {
    try {
      ctx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
    } catch {
      ctx = null;
    }
  }
  return ctx;
}

const cache = new Map<string, Fitted>();

/** Width of `text` in px at `size`. Falls back to an estimate without a canvas. */
export function measure(text: string, size: number, weight = 600, family = fontSans, letterSpacing = 0): number {
  const c = measurer();
  const extra = letterSpacing * size * Math.max(0, text.length - 1);
  if (!c) return text.length * size * (weight >= 600 ? 0.56 : 0.52) + extra;
  c.font = `${weight} ${size}px ${cssFamily(family)}`;
  return c.measureText(text).width + extra;
}

function wrap(words: string[], width: number, w: (s: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (!line || w(next) <= width) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Breaks any single word wider than `width` into pieces that fit. */
function breakLong(lines: string[], width: number, w: (s: string) => number): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (w(line) <= width) {
      out.push(line);
      continue;
    }
    let piece = "";
    for (const ch of line) {
      if (piece && w(piece + ch) > width) {
        out.push(piece);
        piece = ch.trimStart();
      } else piece += ch;
    }
    if (piece) out.push(piece);
  }
  return out;
}

export function fitText(text: string, o: FitOptions): Fitted {
  const { maxWidth, maxLines = 1, max, min = Math.max(12, Math.round(max * 0.45)), weight = 600, family = fontSans, letterSpacing = 0 } = o;
  const key = JSON.stringify([text, maxWidth, maxLines, max, min, weight, family, letterSpacing, !!measurer()]);
  const hit = cache.get(key);
  if (hit) return hit;
  const words = String(text ?? "").trim().split(/\s+/).filter(Boolean);
  let result: Fitted | null = null;
  for (let size = max; size >= min; size -= size > 40 ? 2 : 1) {
    const w = (s: string) => measure(s, size, weight, family, letterSpacing);
    const lines = wrap(words, maxWidth, w);
    if (lines.length <= maxLines && lines.every((l) => w(l) <= maxWidth)) {
      result = { fontSize: size, lines };
      break;
    }
  }
  if (!result) {
    const w = (s: string) => measure(s, min, weight, family, letterSpacing);
    result = { fontSize: min, lines: breakLong(wrap(words, maxWidth, w), maxWidth, w) };
  }
  cache.set(key, result);
  return result;
}

export type FitTextProps = FitOptions & {
  text: string;
  color?: string;
  lineHeight?: number;
  align?: "left" | "center" | "right";
  className?: string;
  /** Put on each word span (inline-block), e.g. "w" for q(".headline .w"). */
  wordClassName?: string;
  /** Put on each line row. */
  lineClassName?: string;
  style?: React.CSSProperties;
  /** Words to colour with `highlightColor` (exact match, punctuation ignored). */
  highlight?: string[];
  highlightColor?: string;
};

const bare = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

export function FitText(p: FitTextProps) {
  const { fontSize, lines } = fitText(p.text, p);
  const lh = p.lineHeight ?? 1.08;
  const hi = new Set((p.highlight ?? []).map(bare));
  return (
    <div
      className={p.className}
      style={{
        width: p.maxWidth,
        fontFamily: cssFamily(p.family ?? fontSans),
        fontWeight: p.weight ?? 600,
        fontSize,
        lineHeight: lh,
        letterSpacing: p.letterSpacing ? `${p.letterSpacing}em` : undefined,
        color: p.color,
        textAlign: p.align ?? "left",
        whiteSpace: "nowrap",
        ...p.style,
      }}
    >
      {lines.map((line, i) => (
        <div key={i} className={p.lineClassName}>
          {line.split(" ").map((word, j, all) => (
            <React.Fragment key={j}>
              <span
                className={p.wordClassName}
                style={{
                  display: "inline-block",
                  color: hi.has(bare(word)) ? p.highlightColor : undefined,
                }}
              >
                {word}
              </span>
              {j < all.length - 1 ? " " : null}
            </React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Height in px of a fitted block, for stacking text without measuring the DOM. */
export function fittedHeight(f: Fitted, lineHeight = 1.08): number {
  return f.lines.length * f.fontSize * lineHeight;
}
