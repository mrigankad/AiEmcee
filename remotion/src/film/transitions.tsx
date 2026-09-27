/**
 * Scene transitions, as pure functions of progress.
 *
 * Every transition is split into what happens to the scene arriving (`enter`)
 * and what happens to the scene leaving (`exit`), both driven by the same
 * progress value. The Film layers the incoming scene above the outgoing one.
 *
 * A plain crossfade between two busy UI frames makes a muddy double exposure,
 * so `dip` (the polished default) staggers instead: the old scene goes out to
 * the page colour, then the new one comes in.
 */
import React from "react";
import { Easing } from "remotion";

import { brandAlpha, theme } from "../theme";
import type { TransitionType } from "./types";

const inOut = Easing.bezier(0.65, 0, 0.35, 1);
const out = Easing.bezier(0.16, 1, 0.3, 1);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function enterStyle(type: TransitionType, p: number): React.CSSProperties {
  if (p >= 1) return {};
  if (p <= 0) return { opacity: 0 };

  switch (type) {
    case "cut":
      return {};
    case "fade":
      return { opacity: inOut(p) };
    case "dip":
      return { opacity: out(clamp01((p - 0.5) * 2)) };
    case "zoom": {
      const e = out(p);
      return { opacity: clamp01(p * 1.6), transform: `scale(${1.06 - 0.06 * e})` };
    }
    case "push":
      return { transform: `translateX(${(1 - inOut(p)) * 100}%)` };
    case "wipe":
      return { clipPath: `inset(0 ${(1 - inOut(p)) * 100}% 0 0)` };
  }
}

export function exitStyle(type: TransitionType, p: number): React.CSSProperties {
  if (p <= 0) return {};

  switch (type) {
    case "dip":
      return { opacity: 1 - inOut(clamp01(p * 2)) };
    case "zoom":
      return { transform: `scale(${1 - 0.035 * out(p)})`, filter: `brightness(${1 - 0.12 * p})` };
    case "push":
      return {
        transform: `translateX(${-inOut(p) * 28}%)`,
        filter: `brightness(${1 - 0.35 * inOut(p)})`,
      };
    case "wipe":
      return { filter: `brightness(${1 - 0.3 * inOut(p)})` };
    default:
      return {};
  }
}

/**
 * The lit edge that leads a wipe: a brand bar with a glow, riding the reveal.
 * Drawn above both scenes, and only while the wipe is moving.
 */
export function WipeEdge({ p }: { p: number }) {
  if (p <= 0 || p >= 1) return null;
  const x = inOut(p) * 100;
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: `${x}%`,
        width: 10,
        marginLeft: -5,
        background: `linear-gradient(180deg, ${theme.brandLight}, ${theme.brand}, ${theme.brandDeep})`,
        boxShadow: `0 0 36px 10px ${brandAlpha(0.45)}`,
      }}
    />
  );
}
