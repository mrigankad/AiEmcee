import data from "./glyphs.json";

/** Emcee Glyphs, copied from assets/glyphs/emcee-glyphs.json (the web app's root is web/). */
type Part = { el: string; tone?: string; fill?: boolean; [k: string]: unknown };
const GLYPHS = data.glyphs as unknown as Record<string, Part[]>;
export const GLYPH_NAMES = Object.keys(GLYPHS);

export function BoardGlyph({ name, size = 16, accent = "var(--color-action)", className = "" }: { name: string; size?: number; accent?: string; className?: string }) {
  const parts = GLYPHS[name] ?? [];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth={data.stroke} className={className} aria-hidden>
      {parts.map(({ el, tone, fill, ...attrs }, i) => {
        const color = tone === "accent" ? accent : "currentColor";
        const El = el as "path";
        return <El key={i} {...(attrs as object)} stroke={fill ? "none" : color} fill={fill ? color : "none"} />;
      })}
    </svg>
  );
}
