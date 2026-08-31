/**
 * The small vocabulary every composition is built from.
 *
 * Keeping motion in four primitives is deliberate: a video where everything
 * enters the same way reads as one designed piece, whereas a video where each
 * section invents its own animation reads as a template.
 */
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import { fontDisplay, fontSans } from "../fonts";
import { theme } from "../theme";

/** The full-frame surface. Every composition starts with one. */
export function Page({
  children,
  transparent = false,
}: {
  children: React.ReactNode;
  /** Lower thirds render over live footage, so their background must be clear. */
  transparent?: boolean;
}) {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: transparent ? "transparent" : theme.page,
        fontFamily: fontSans,
        color: theme.text,
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

/**
 * The house entrance: rise 18px while fading in, on a spring.
 *
 * `delay` is in frames. Stagger siblings by 4–8 frames — enough to read as
 * sequence, little enough that it still feels like one gesture.
 */
export function FadeUp({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const rise = spring({
    frame: frame - delay,
    fps,
    config: { damping: 18, mass: 0.7, stiffness: 120 },
  });

  const opacity = interpolate(frame, [delay, delay + 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        transform: `translateY(${interpolate(rise, [0, 1], [18, 0])}px)`,
        opacity,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** A brand-gradient line that draws left to right. Progress, crawls, traces. */
export function Trace({
  progress,
  width,
  height = 2,
}: {
  progress: number;
  width: number | string;
  height?: number;
}) {
  const p = Math.max(0, Math.min(1, progress));

  return (
    <div
      style={{
        height,
        width,
        background: theme.muted,
        borderRadius: 999,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height,
          width: `${p * 100}%`,
          background: `linear-gradient(90deg, ${theme.brandLight}, ${theme.brandDeep})`,
          borderRadius: 999,
        }}
      />
    </div>
  );
}

/** Small uppercase display type. The only place the display face is used at size. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: fontDisplay,
        fontSize: 13,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: theme.tertiary,
      }}
    >
      {children}
    </div>
  );
}

/** The standard white panel: containers, cards, code strips. */
export function Card({
  children,
  active = false,
  style,
}: {
  children: React.ReactNode;
  /** Lit cards take a brand-tinted border instead of a neutral one. */
  active?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: theme.container,
        border: `1px solid ${active ? "rgba(255,123,28,0.45)" : theme.muted}`,
        borderRadius: 16,
        boxShadow: active ? "0 0 0 1px rgba(255,123,28,0.15)" : "none",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
