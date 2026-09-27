/**
 * The small vocabulary every composition is built from.
 *
 * Keeping motion in a handful of primitives is deliberate: a video where
 * everything enters the same way reads as one designed piece, whereas a video
 * where each section invents its own animation reads as a template.
 */
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import { useTone } from "../film/tone";
import { fontDisplay, fontSans } from "../fonts";
import { brandAlpha, theme } from "../theme";

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
      {transparent ? null : <Atmosphere />}
      <AbsoluteFill>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
}

/**
 * Datasheet ground: a faint technical grid, a slow brand wash, and grain.
 * Quiet enough that type stays the subject; enough that a motion scene does
 * not look like a slide on a flat grey.
 */
function Atmosphere() {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 450], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          width: 820,
          height: 820,
          right: -200,
          top: -280,
          borderRadius: 999,
          background: `radial-gradient(circle, ${brandAlpha(0.11)} 0%, transparent 66%)`,
          transform: `translate(${drift * 36}px, ${drift * 18}px)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 560,
          height: 560,
          left: -220,
          bottom: -240,
          borderRadius: 999,
          background: `radial-gradient(circle, ${brandAlpha(0.06)} 0%, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: [
            "linear-gradient(rgba(16,16,16,0.04) 1px, transparent 1px)",
            "linear-gradient(90deg, rgba(16,16,16,0.04) 1px, transparent 1px)",
          ].join(","),
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at center, black 38%, transparent 82%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 38%, transparent 82%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.04,
          mixBlendMode: "multiply",
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
          backgroundSize: "160px 160px",
        }}
      />
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
  const tone = useTone();

  const rise = spring({ frame: frame - delay, fps, config: tone.spring });

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

/**
 * A headline that sets itself word by word: each word rises out of a mask on
 * the tone's spring, 3 frames behind the one before.
 *
 * Kinetic, not flashy: the whole line is settled within about half a second,
 * so it is read at speaking pace rather than watched. `highlight` words take
 * the brand colour, for the one word a line is really about.
 */
export function KineticLine({
  text,
  delay = 0,
  stagger = 3,
  highlight = [],
}: {
  text: string;
  delay?: number;
  stagger?: number;
  highlight?: string[];
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const tone = useTone();
  const bareWord = (w: string) => w.replace(/[.,!?]$/, "").toLowerCase();
  const lit = new Set(highlight.map(bareWord));

  return (
    <span style={{ display: "block" }}>
      {text.split(" ").map((word, i) => {
        const p = spring({ frame: frame - delay - i * stagger, fps, config: tone.spring });
        const bare = bareWord(word);
        return (
          <span
            key={`${word}-${i}`}
            style={{
              display: "inline-block",
              overflow: "hidden",
              verticalAlign: "top",
              paddingBottom: "0.08em",
              marginRight: "0.26em",
            }}
          >
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${(1 - p) * 105}%)`,
                color: lit.has(bare) ? theme.brandDeep : undefined,
              }}
            >
              {word}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * A brand-gradient line that draws left to right, with a lit head riding the
 * leading edge.
 *
 * The head is what makes this read as something advancing rather than as a bar
 * that happens to be growing. It is hidden at both ends: before the line
 * starts there is nothing to lead, and once it arrives a stray dot parked in
 * the corner just looks like a bug.
 */
export function Trace({
  progress,
  width,
  height = 2,
  head = true,
}: {
  progress: number;
  width: number | string;
  height?: number;
  /** Set false where a second moving element would compete for attention. */
  head?: boolean;
}) {
  const p = Math.max(0, Math.min(1, progress));
  const showHead = head && p > 0.002 && p < 0.998;

  return (
    <div
      style={{
        height,
        width,
        background: theme.muted,
        borderRadius: 999,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${p * 100}%`,
            background: `linear-gradient(90deg, ${theme.brandLight}, ${theme.brandDeep})`,
            borderRadius: 999,
          }}
        />
      </div>

      {showHead ? (
        <div
          style={{
            position: "absolute",
            left: `${p * 100}%`,
            top: "50%",
            width: height * 4,
            height: height * 4,
            marginLeft: height * -2,
            marginTop: height * -2,
            borderRadius: 999,
            background: theme.brandDeep,
            boxShadow: `0 0 0 ${height * 2.5}px ${brandAlpha(0.16)}`,
          }}
        />
      ) : null}
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
        border: `1px solid ${active ? brandAlpha(0.5) : theme.muted}`,
        borderRadius: 16,
        boxShadow: active
          ? `0 0 0 1px ${brandAlpha(0.16)}, 0 14px 38px rgba(16,16,16,0.07)`
          : "0 1px 2px rgba(16,16,16,0.03)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
