/**
 * The 1920x1080 design space every template is laid out in.
 *
 * `Stage` scales that space to whatever size the film renders at (contain,
 * centred) and paints the ground across the whole frame, so a template never
 * reads useVideoConfig for layout. Its ref is the GSAP scope: pass the ref
 * from useGsapTimeline straight to it.
 */
import React from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";

export const DW = 1920;
export const DH = 1080;

/** Safe margins of the design space. */
export const SAFE = { x: 140, y: 110 };

export type StageProps = {
  /** CSS background of the whole frame (colour or gradient). */
  ground: string;
  /** Drawn behind the scaled design space, full frame (grids, vignettes). */
  backdrop?: React.ReactNode;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  fontFamily?: string;
  color?: string;
};

export const Stage = React.forwardRef<HTMLDivElement, StageProps>(function Stage(
  { ground, backdrop, children, style, fontFamily, color },
  ref,
) {
  const { width, height } = useVideoConfig();
  const k = Math.min(width / DW, height / DH);
  return (
    <AbsoluteFill style={{ background: ground, overflow: "hidden", fontFamily, color }}>
      {backdrop}
      <div
        ref={ref}
        style={{
          position: "absolute",
          left: (width - DW * k) / 2,
          top: (height - DH * k) / 2,
          width: DW,
          height: DH,
          transform: `scale(${k})`,
          transformOrigin: "0 0",
          ...style,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
});

/** A full-size SVG layer in design units. */
export function Layer({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <svg
      width={DW}
      height={DH}
      viewBox={`0 0 ${DW} ${DH}`}
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible", ...style }}
    >
      {children}
    </svg>
  );
}

/** An absolutely positioned HTML box in design units. */
export function Box({
  x,
  y,
  w,
  h,
  children,
  className,
  style,
}: {
  x: number;
  y: number;
  w: number;
  h?: number;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={className} style={{ position: "absolute", left: x, top: y, width: w, height: h, ...style }}>
      {children}
    </div>
  );
}

/** Centres of `n` evenly spaced slots between x0 and x1 (slot edges), and the slot width. */
export function slots(n: number, x0: number, x1: number): { centers: number[]; width: number } {
  const width = (x1 - x0) / Math.max(1, n);
  return { centers: Array.from({ length: n }, (_, i) => x0 + width * (i + 0.5)), width };
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Clamps a list to [min, max] items (props validation is the studio's job; this keeps a render alive). */
export function within<T>(list: T[] | undefined, min: number, max: number, pad: (i: number) => T): T[] {
  const out = (list ?? []).slice(0, max);
  while (out.length < min) out.push(pad(out.length));
  return out;
}
