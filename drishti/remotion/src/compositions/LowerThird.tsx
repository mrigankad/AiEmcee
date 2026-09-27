/**
 * The animated title card that names a section of the film.
 *
 * Rendered live inside the Film, over the footage, for exactly its hold time
 * (the tone's `lowerThird.hold`). It builds in three moves, one gesture: the
 * brand bar grows, the card unrolls from it, the words rise into place. It
 * leaves by fading without moving: an element that exits the way it arrived
 * pulls the eye back to it exactly when the scene wants the eye on the product.
 */
import React from "react";
import { Easing, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { Page } from "../components/Motion";
import { useTone } from "../film/tone";
import { brandAlpha, theme } from "../theme";
import { fontDisplay, fontSans } from "../fonts";

export type LowerThirdProps = {
  kicker: string;
  title: string;
};

const unroll = Easing.bezier(0.16, 1, 0.3, 1);

export function LowerThird({ kicker, title }: LowerThirdProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const tone = useTone();

  const bar = spring({ frame, fps, config: { damping: 18, mass: 0.5, stiffness: 160 } });
  const open = unroll(interpolate(frame, [4, 20], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const word = (delay: number) => spring({ frame: frame - delay, fps, config: tone.spring });
  const kickerIn = word(10);
  const titleIn = word(14);
  const leave = interpolate(frame, [durationInFrames - 10, durationInFrames - 1], [1, 0], {
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
          opacity: leave,
        }}
      >
        <div
          style={{
            width: 5,
            borderRadius: "8px 0 0 8px",
            background: `linear-gradient(180deg, ${theme.brandLight}, ${theme.brandDeep})`,
            transform: `scaleY(${bar})`,
            transformOrigin: "50% 100%",
          }}
        />

        <div
          style={{
            background: "rgba(255,255,255,0.95)",
            border: `1px solid ${theme.muted}`,
            borderLeft: "none",
            borderRadius: "0 14px 14px 0",
            padding: "13px 24px 14px 16px",
            boxShadow: `0 2px 6px rgba(16,16,16,0.06), 0 18px 48px rgba(16,16,16,0.18)`,
            display: "flex",
            alignItems: "center",
            gap: 14,
            clipPath: `inset(-60px ${(1 - open) * 100}% -60px 0)`,
          }}
        >
          <img
            src={staticFile("mark.svg")}
            alt=""
            width={36}
            height={36}
            style={{
              borderRadius: 9,
              flexShrink: 0,
              transform: `scale(${0.6 + 0.4 * kickerIn})`,
              opacity: kickerIn,
            }}
          />
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: fontDisplay,
                fontSize: 11,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: theme.brandDeep,
                opacity: kickerIn,
                transform: `translateY(${(1 - kickerIn) * 12}px)`,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: theme.brand,
                  boxShadow: `0 0 0 4px ${brandAlpha(0.16)}`,
                }}
              />
              {kicker}
            </div>

            <div
              style={{
                marginTop: 6,
                fontFamily: fontSans,
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: -0.4,
                color: theme.text,
                opacity: titleIn,
                transform: `translateY(${(1 - titleIn) * 18}px)`,
              }}
            >
              {title}
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}
