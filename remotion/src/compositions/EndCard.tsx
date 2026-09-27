/**
 * The closing card. Deliberately silent in the edit, so the last narrated line
 * has room to land before the video ends.
 *
 * Drop your own mark at remotion/public/mark.svg and it appears here.
 */
import React from "react";
import { interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

import { KineticLine, Page } from "../components/Motion";
import { fontDisplay, fontSans } from "../fonts";
import { theme } from "../theme";

export type EndCardProps = {
  /** File in remotion/public. Pass null to render the card without a mark. */
  mark: string | null;
  title: string;
  kicker: string;
  tagline: string;
};

export function EndCard({ mark, title, kicker, tagline }: EndCardProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({ frame, fps, config: { damping: 16, mass: 0.8, stiffness: 90 } });
  const fade = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Page>
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          opacity: fade,
          transform: `translateY(${interpolate(enter, [0, 1], [16, 0])}px)`,
        }}
      >
        {mark ? (
          <img
            src={staticFile(mark)}
            alt=""
            width={88}
            height={88}
            style={{ borderRadius: 20, boxShadow: "0 16px 40px rgba(16,16,16,0.12)" }}
          />
        ) : null}

        <div
          style={{
            marginTop: mark ? 28 : 0,
            fontFamily: fontSans,
            fontSize: 56,
            fontWeight: 600,
            letterSpacing: -1.6,
          }}
        >
          {title}
        </div>

        <div
          style={{
            marginTop: 10,
            fontFamily: fontDisplay,
            fontSize: 13,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: theme.tertiary,
          }}
        >
          {kicker}
        </div>

        <div style={{ marginTop: 36, fontSize: 20, color: theme.secondary }}>
          <KineticLine text={tagline} delay={14} stagger={2} />
        </div>
      </div>
    </Page>
  );
}
