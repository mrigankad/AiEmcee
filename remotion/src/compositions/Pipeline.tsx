/**
 * The "how it works" beat: numbered steps lighting up along a progress rail,
 * with a payoff strip underneath that acts out the product's core promise.
 *
 * Placed in the middle of the film on purpose. By this point the viewer has
 * seen the product move but has no mental model of the whole loop, and one
 * diagram buys comprehension for every scene that follows.
 */
import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { Card, Eyebrow, FadeUp, Page } from "../components/Motion";
import { fontDisplay, fontMono, fontSans } from "../fonts";
import { theme } from "../theme";

export type Step = {
  id: string;
  label: string;
  hint: string;
};

export type PipelineProps = {
  eyebrow: string;
  headline: string[];
  steps: Step[];
  /** The payoff strip: something broken being replaced by something correct. */
  payoff: {
    labelBefore: string;
    labelAfter: string;
    before: string;
    after: string;
  };
};

export function Pipeline({ eyebrow, headline, steps, payoff }: PipelineProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // The rail fills across most of the scene, finishing before the payoff
  // animation so the two do not compete for attention.
  const progress = interpolate(frame, [18, durationInFrames - 72], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const strike = interpolate(frame, [durationInFrames - 90, durationInFrames - 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const reveal = interpolate(frame, [durationInFrames - 74, durationInFrames - 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const resolved = progress > 0.92;

  return (
    <Page>
      <div
        style={{
          height: "100%",
          padding: "72px 80px 64px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <FadeUp>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1
            style={{
              fontFamily: fontSans,
              fontSize: 48,
              fontWeight: 600,
              letterSpacing: -1.2,
              margin: "12px 0 0",
              lineHeight: 1.15,
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

        <div
          style={{
            // auto top and bottom: the rail floats in the middle of whatever
            // space the headline and the payoff strip leave it.
            marginTop: "auto",
            marginBottom: "auto",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            position: "relative",
          }}
        >
          {/* Rail: an unfilled track with a brand-gradient fill on top. */}
          <div
            style={{
              position: "absolute",
              top: 27,
              left: 48,
              right: 48,
              height: 2,
              background: theme.muted,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 27,
              left: 48,
              width: `calc((100% - 96px) * ${progress})`,
              height: 2,
              background: `linear-gradient(90deg, ${theme.brandLight}, ${theme.brandDeep})`,
            }}
          />

          {steps.map((step, i) => {
            // The small negative bias lights each node a touch before the rail
            // physically reaches it, so the node never lags behind the line.
            const lit = progress >= i / (steps.length - 1) - 0.02;

            return (
              <div
                key={step.id}
                style={{
                  width: 200,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 999,
                    background: lit ? theme.text : theme.container,
                    color: lit ? "#fff" : theme.tertiary,
                    border: `1px solid ${lit ? theme.text : theme.stroke}`,
                    display: "grid",
                    placeItems: "center",
                    fontFamily: fontDisplay,
                    fontSize: 11,
                    letterSpacing: "0.08em",
                  }}
                >
                  {step.id}
                </div>
                <div
                  style={{
                    marginTop: 16,
                    fontSize: 20,
                    fontWeight: 600,
                    letterSpacing: -0.2,
                    color: lit ? theme.text : theme.tertiary,
                  }}
                >
                  {step.label}
                </div>
                <div style={{ marginTop: 4, fontSize: 14, color: theme.tertiary }}>
                  {step.hint}
                </div>
              </div>
            );
          })}
        </div>

        <Card
          style={{
            marginTop: "auto",
            padding: "22px 28px",
            fontFamily: fontMono,
            fontSize: 18,
            display: "flex",
            alignItems: "center",
            gap: 28,
            minHeight: 88,
          }}
        >
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 11,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: resolved ? theme.success : theme.tertiary,
              width: 120,
              flexShrink: 0,
            }}
          >
            {resolved ? payoff.labelAfter : payoff.labelBefore}
          </div>

          <div style={{ position: "relative", color: theme.error }}>
            <span>{payoff.before}</span>
            {/* Strikethrough drawn as a growing bar so it animates. */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: "50%",
                height: 2,
                width: `${strike * 100}%`,
                background: theme.error,
              }}
            />
          </div>

          <div style={{ color: theme.tertiary }}>&rarr;</div>

          <div
            style={{
              color: theme.success,
              opacity: reveal,
              transform: `translateY(${(1 - reveal) * 8}px)`,
            }}
          >
            {payoff.after}
          </div>
        </Card>
      </div>
    </Page>
  );
}
