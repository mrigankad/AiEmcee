/**
 * Design tokens for the motion graphics.
 *
 * The engine's ../../design.tokens.json is the base. When a project is
 * rendered (scripts/compose.mjs --project ...), its merged tokens arrive as
 * the REMOTION_AIEMCEE_TOKENS environment variable, which Remotion passes to
 * the page at runtime, and override the base field by field. So one shared
 * remotion/ bundle draws every project in its own brand.
 *
 * Composition size and frame rate inside the Film come from the timeline;
 * W/H/FPS here only size the standalone studio previews.
 */
import base from "../../design.tokens.json";

type Tokens = typeof base;

const isPlain = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

function merge<T>(a: T, b: unknown): T {
  if (!isPlain(a) || !isPlain(b)) return (b === undefined ? a : b) as T;
  const out: Record<string, unknown> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = merge((a as Record<string, unknown>)[k], v);
  return out as T;
}

function projectTokens(): unknown {
  try {
    // The scenes run in the browser: the motion bundle provides `process.env`
    // (the film's tokens), so read it from globalThis, not Node's types.
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    const raw = env?.REMOTION_AIEMCEE_TOKENS;
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export const tokens: Tokens = merge(base, projectTokens());

export const theme = tokens.color;
export const cursor = tokens.cursor;

/** Optional caption/lower-third surface (project tokens `overlay`); defaults keep the white card. */
const ov = ((tokens as unknown as { overlay?: Record<string, string> }).overlay ?? {});
export const overlay = {
  bg: ov.bg ?? "rgba(255,255,255,0.95)",
  card: ov.card ?? "#FFFFFF",
  text: ov.text ?? theme.text,
  label: ov.label ?? "#16181D",
  kicker: ov.kicker ?? theme.brandDeep,
  border: ov.border ?? theme.muted,
  mark: ov.mark ?? "mark.svg",
  scale: Number(ov.scale ?? 1),
};

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
