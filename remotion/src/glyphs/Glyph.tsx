/**
 * Emcee Glyphs in a film.
 *
 * The icon data is assets/glyphs/emcee-glyphs.json: each glyph is a short list
 * of SVG elements on a 24x24 grid. "ink" parts take the style's stroke colour,
 * "accent" parts the accent; "fill" parts are filled instead of stroked.
 *
 *   <Glyph name="secure" size={96} stroke="#16181D" accent="#C9480A" />   standalone <svg>
 *   <GlyphG name="secure" x={40} y={40} size={96} ... />                  a <g> inside an <svg>
 *
 * Draw-on, two ways:
 *   draw={0..1}       drawn by the glyph itself from the prop (dash offset on a
 *                     normalised path length; fill parts fade in over the last third)
 *   className hooks   every part carries `glyph-part` plus `glyph-ink` / `glyph-accent`
 *                     and `glyph-stroke` / `glyph-fill`, so a GSAP DrawSVG tween on
 *                     q(".my-icon .glyph-stroke") draws it on the film clock. Leave
 *                     `draw` unset then: pathLength would rescale DrawSVG's dashes.
 */
import React from "react";

import data from "../../../assets/glyphs/emcee-glyphs.json";

type Part = {
  el: "path" | "rect" | "circle" | "ellipse" | "line" | "polyline" | "polygon";
  tone?: "ink" | "accent";
  fill?: boolean;
  opacity?: number;
  [attr: string]: unknown;
};

const GLYPHS = (data as unknown as { glyphs: Record<string, Part[]> }).glyphs;
const GRID = (data as { grid?: number }).grid ?? 24;
const STROKE = (data as { stroke?: number }).stroke ?? 1.75;

/** Every glyph name in the set. */
export const GLYPH_NAMES: string[] = Object.keys(GLYPHS);
export const hasGlyph = (name: string | undefined | null): name is string => !!name && name in GLYPHS;

export type GlyphProps = {
  name: string;
  /** Rendered size in px (the 24-unit grid is scaled to it). Default 48. */
  size?: number;
  /** Ink colour. Default currentColor. */
  stroke?: string;
  /** Accent colour for "accent" parts. Default: the ink colour. */
  accent?: string;
  /** Stroke width in grid units (24 = the whole glyph). Default 1.75. */
  strokeWidth?: number;
  /** 0..1 draw-on progress. Omit for a fully drawn glyph. */
  draw?: number;
  className?: string;
  style?: React.CSSProperties;
  opacity?: number;
};

const SKIP = new Set(["el", "tone", "fill", "opacity"]);

function Parts({ name, stroke = "currentColor", accent, strokeWidth = STROKE, draw }: GlyphProps) {
  const parts = GLYPHS[name] ?? GLYPHS.film ?? [];
  const d = draw == null ? null : Math.max(0, Math.min(1, draw));
  return (
    <>
      {parts.map((p, i) => {
        const colour = p.tone === "accent" ? accent ?? stroke : stroke;
        const attrs: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(p)) if (!SKIP.has(k)) attrs[k] = v;
        const cls = `glyph-part glyph-${p.tone === "accent" ? "accent" : "ink"} glyph-${p.fill ? "fill" : "stroke"}`;
        const base = p.opacity ?? 1;
        if (p.fill) {
          const o = d == null ? base : base * Math.max(0, Math.min(1, (d - 0.66) / 0.34));
          return React.createElement(p.el, { key: i, ...attrs, className: cls, fill: colour, stroke: "none", opacity: o });
        }
        const dash = d == null ? {} : { pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - d };
        return React.createElement(p.el, {
          key: i,
          ...attrs,
          ...dash,
          className: cls,
          fill: "none",
          stroke: colour,
          strokeWidth,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          opacity: base,
        });
      })}
    </>
  );
}

/** A glyph as a <g>, for use inside an <svg>. (x, y) is its top-left corner. */
export function GlyphG({ x = 0, y = 0, size = 48, className, style, opacity, ...rest }: GlyphProps & { x?: number; y?: number }) {
  const k = size / GRID;
  return (
    <g className={className} style={style} opacity={opacity} transform={`translate(${x} ${y}) scale(${k})`}>
      <Parts size={size} {...rest} />
    </g>
  );
}

/** A glyph as its own <svg> element. */
export function Glyph({ size = 48, className, style, opacity, ...rest }: GlyphProps) {
  return (
    <svg
      className={className}
      style={{ display: "block", overflow: "visible", ...style }}
      opacity={opacity}
      width={size}
      height={size}
      viewBox={`0 0 ${GRID} ${GRID}`}
    >
      <Parts size={size} {...rest} />
    </svg>
  );
}
