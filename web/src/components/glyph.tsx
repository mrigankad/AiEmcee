import { createElement, type SVGProps } from "react";

// A copy of assets/glyphs/emcee-glyphs.json, refreshed by scripts/sync-glyphs.mjs before dev and build.
import set from "@/lib/emcee-glyphs.json";

type Part = { el: string; tone?: "ink" | "accent"; fill?: boolean; [attr: string]: unknown };
const GLYPHS = set.glyphs as unknown as Record<string, Part[]>;

export type GlyphName = keyof typeof set.glyphs;
export const GLYPH_NAMES = Object.keys(GLYPHS) as GlyphName[];

/**
 * One Emcee Glyph on its 24px grid. Ink parts take `currentColor`, accent parts
 * take `accent` (the studio's action orange unless the caller passes the style's).
 */
export function Glyph({
  name,
  size = 16,
  accent = "var(--color-action)",
  strokeWidth = set.stroke,
  className = "",
  title,
  ...rest
}: { name: GlyphName; size?: number; accent?: string; strokeWidth?: number; title?: string } & Omit<SVGProps<SVGSVGElement>, "name">) {
  const parts = GLYPHS[name] ?? [];
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${set.grid} ${set.grid}`}
      fill="none"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={`shrink-0 ${className}`}
      {...rest}
    >
      {title && <title>{title}</title>}
      {parts.map(({ el, tone, fill, ...attrs }, i) => {
        const color = tone === "accent" ? accent : "currentColor";
        return createElement(el, { key: i, ...attrs, stroke: fill ? "none" : color, fill: fill ? color : "none" });
      })}
    </svg>
  );
}
