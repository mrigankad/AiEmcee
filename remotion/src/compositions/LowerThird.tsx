/**
 * The animated title card that names a section of the film.
 *
 * Rendered as a single transparent PNG still, not a video: compose.mjs fades
 * it in and out with ffmpeg over the captured footage. One still composited
 * eight times is far cheaper than eight video renders, and the fade timing
 * then lives with the rest of the edit.
 */
import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { Page } from "../components/Motion";
import { fontDisplay, fontSans } from "../fonts";
import { theme } from "../theme";

export type LowerThirdProps = {
  kicker: string;
  title: string;
};

export function LowerThird({ kicker, title }: LowerThirdProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const fadeIn = interpolate(frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeOut = interpolate(frame, [durationInFrames - 12, durationInFrames - 2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(fadeIn, fadeOut);

  const slide = interpolate(frame, [0, 12], [-12, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Page transparent>
      <div
        style={{
          position: "absolute",
          left: 48,
          bottom: 44,
          display: "flex",
          alignItems: "stretch",
          gap: 14,
          opacity,
          transform: `translateX(${slide}px)`,
        }}
      >
        {/* The brand rule. The only saturated element in the card. */}
        <div
          style={{
            width: 3,
            borderRadius: 999,
            background: `linear-gradient(180deg, ${theme.brandLight}, ${theme.brandDeep})`,
          }}
        />

        <div
          style={{
            // Near-opaque rather than solid, so the UI underneath still reads
            // as continuous rather than being punched out.
            background: "rgba(255,255,255,0.92)",
            border: `1px solid ${theme.muted}`,
            borderRadius: 12,
            padding: "12px 18px 13px",
            boxShadow: "0 8px 28px rgba(16,16,16,0.08)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: theme.brandDeep,
            }}
          >
            {kicker}
          </div>
          <div
            style={{
              marginTop: 4,
              fontFamily: fontSans,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: -0.3,
              color: theme.text,
            }}
          >
            {title}
          </div>
        </div>
      </div>
    </Page>
  );
}
