/**
 * The "why this matters" beat. Three claims that reveal one at a time while a
 * trace line runs the width of the frame.
 *
 * Use a motion scene, not screen capture, whenever the point is an argument
 * rather than a feature. Nobody needs to watch a UI to be told that testing is
 * slow, and a captured scene would just be a slow scroll past marketing copy.
 *
 * The `at` frames are hand-placed against the narration for this scene. When
 * you rewrite the line, re-time them: play the MP3, note where each claim is
 * spoken, multiply by fps.
 */
import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { Card, Eyebrow, FadeUp, Page, Trace } from "../components/Motion";
import { fontDisplay, fontSans } from "../fonts";
import { theme } from "../theme";

export type Beat = {
  /** Frame this beat lights up on. */
  at: number;
  kicker: string;
  title: string;
  body: string;
};

export type ProblemProps = {
  eyebrow: string;
  headline: string[];
  beats: Beat[];
};

export function Problem({ eyebrow, headline, beats }: ProblemProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const trace = interpolate(frame, [6, durationInFrames - 20], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <Page>
      <div
        style={{
          height: "100%",
          padding: "72px 96px 80px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <FadeUp>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1
            style={{
              fontFamily: fontSans,
              fontSize: 52,
              fontWeight: 600,
              letterSpacing: -1.4,
              margin: "14px 0 0",
              lineHeight: 1.12,
            }}
          >
            {headline.map((row, i) => (
              <React.Fragment key={row}>
                {i > 0 ? <br /> : null}
                {row}
              </React.Fragment>
            ))}
          </h1>
        </FadeUp>

        <div style={{ marginTop: 28 }}>
          <Trace progress={trace} width="100%" />
        </div>

        <div
          style={{
            marginTop: 40,
            display: "flex",
            flexDirection: "column",
            // Centred in the space below the headline, so a scene with two
            // beats does not leave a void where a third would have been.
            justifyContent: "center",
            gap: 16,
            flex: 1,
          }}
        >
          {beats.map((beat, i) => {
            // A beat is "on" from its own cue until just after the next one,
            // so exactly one card carries the accent at any moment.
            const nextAt = beats[i + 1]?.at ?? durationInFrames;
            const on = frame >= beat.at && frame < nextAt + 6;

            const enter = interpolate(frame, [beat.at, beat.at + 14], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });

            return (
              <Card
                key={beat.title}
                active={on}
                style={{
                  display: "flex",
                  gap: 28,
                  alignItems: "center",
                  padding: "22px 28px",
                  // Never fully hidden — the shape of the argument is visible
                  // from the first frame, which stops the layout jumping.
                  opacity: 0.38 + enter * 0.62,
                  transform: `translateX(${(1 - enter) * 18}px)`,
                }}
              >
                <div
                  style={{
                    fontFamily: fontDisplay,
                    fontSize: 12,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: on ? theme.brandDeep : theme.tertiary,
                    width: 168,
                    flexShrink: 0,
                  }}
                >
                  {beat.kicker}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.3 }}>
                    {beat.title}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 16,
                      color: theme.secondary,
                      lineHeight: 1.4,
                    }}
                  >
                    {beat.body}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </Page>
  );
}
