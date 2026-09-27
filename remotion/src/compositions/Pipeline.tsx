/**
 * The "how it works" beat: numbered steps lighting up along a progress rail,
 * with a module nameplate underneath that fills in as each stage completes.
 *
 * Placed in the middle of the film on purpose. By this point the viewer has
 * seen the product move but has no mental model of the whole loop, and one
 * diagram buys comprehension for every scene that follows.
 *
 * One thing moves at a time on the rail. The nameplate is present from the
 * first beat so the lower half of the frame is never empty — fields resolve
 * as the head reaches them, rather than popping in at the end.
 */
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import { Card, Eyebrow, FadeUp, KineticLine, Page } from "../components/Motion";
import { brandAlpha, theme } from "../theme";
import { fontDisplay, fontMono, fontSans } from "../fonts";

export type Step = {
  id: string;
  label: string;
  hint: string;
  icon?: StepIconName;
};

export type StepIconName = "upload" | "verify" | "inspect" | "ship" | "scan" | "reconcile";

export type PlateField = {
  label: string;
  pending: string;
  value: string;
  /** Step index that resolves this field. */
  at: number;
};

export type PipelineProps = {
  eyebrow: string;
  headline: string[];
  /** Words in the headline to set in the brand colour. */
  highlight?: string[];
  steps: Step[];
  /** The payoff strip: something unresolved being replaced by something exact. */
  payoff: {
    labelBefore: string;
    labelAfter: string;
    before: string;
    after: string;
  };
  /** Optional nameplate. When set, it replaces the strikethrough strip. */
  plate?: {
    kicker: string;
    fields: PlateField[];
  };
};

export function Pipeline({ eyebrow, headline, highlight = [], steps, payoff, plate }: PipelineProps) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();

  const railFrom = 16;
  const railTo = plate ? durationInFrames - 36 : durationInFrames - 72;
  const progress = interpolate(frame, [railFrom, railTo], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const litFrameFor = (i: number) =>
    railFrom + (railTo - railFrom) * Math.max(0, i / Math.max(1, steps.length - 1) - 0.02);

  const payoffIn = spring({
    frame: frame - (durationInFrames - 100),
    fps,
    config: { damping: 18, mass: 0.7, stiffness: 120 },
  });
  const strike = interpolate(frame, [durationInFrames - 90, durationInFrames - 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const reveal = interpolate(frame, [durationInFrames - 74, durationInFrames - 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const resolved = frame >= litFrameFor(steps.length - 1);
  const plateIn = spring({
    frame: frame - 10,
    fps,
    config: { damping: 18, mass: 0.7, stiffness: 120 },
  });

  return (
    <Page>
      <div
        style={{
          height: "100%",
          padding: "56px 64px 48px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <FadeUp>
          <Eyebrow>{eyebrow}</Eyebrow>
        </FadeUp>

        <h1
          style={{
            fontFamily: fontSans,
            fontSize: 44,
            fontWeight: 600,
            letterSpacing: -1.2,
            margin: "10px 0 0",
            lineHeight: 1.15,
          }}
        >
          {headline.map((row, i) => (
            <KineticLine key={row} text={row} delay={4 + i * 7} highlight={highlight} />
          ))}
        </h1>

        <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: "100%",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 27,
                left: 40,
                right: 40,
                height: 3,
                borderRadius: 999,
                background: theme.muted,
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 27,
                left: 40,
                width: `calc((100% - 80px) * ${progress})`,
                height: 3,
                borderRadius: 999,
                background: `linear-gradient(90deg, ${theme.brandLight}, ${theme.brandDeep})`,
                boxShadow: `0 0 16px ${brandAlpha(0.35)}`,
              }}
            />

            {progress > 0.004 && progress < 0.996 ? (
              <div
                style={{
                  position: "absolute",
                  top: 28.5,
                  left: `calc(40px + (100% - 80px) * ${progress})`,
                  width: 11,
                  height: 11,
                  marginLeft: -5.5,
                  marginTop: -5.5,
                  borderRadius: 999,
                  background: theme.brandDeep,
                  boxShadow: `0 0 0 8px ${brandAlpha(0.16)}`,
                }}
              />
            ) : null}

            {steps.map((step, i) => {
              const litAt = litFrameFor(i);
              const lit = frame >= litAt;

              const pop = spring({
                frame: frame - litAt,
                fps,
                config: { damping: 11, mass: 0.5, stiffness: 200 },
              });
              const scale = lit ? interpolate(pop, [0, 1], [1.26, 1]) : 1;

              const ring = interpolate(frame, [litAt, litAt + 16], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              const ringOn = lit && ring < 1;

              const textIn = interpolate(frame, [litAt, litAt + 12], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });

              return (
                <div
                  key={step.id}
                  style={{
                    width: 210,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    position: "relative",
                    zIndex: 1,
                  }}
                >
                  <div style={{ position: "relative", width: 56, height: 56 }}>
                    {ringOn ? (
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          borderRadius: 999,
                          border: `2px solid ${theme.brand}`,
                          transform: `scale(${1 + ring * 0.85})`,
                          opacity: (1 - ring) * 0.55,
                        }}
                      />
                    ) : null}

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
                        transform: `scale(${scale})`,
                        boxShadow: lit ? "0 8px 20px rgba(16,16,16,0.14)" : "none",
                      }}
                    >
                      {step.icon ? <Glyph name={step.icon} /> : step.id}
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 14,
                      fontSize: 19,
                      fontWeight: 600,
                      letterSpacing: -0.25,
                      color: lit ? theme.text : theme.tertiary,
                      opacity: 0.4 + textIn * 0.6,
                      transform: `translateY(${(1 - textIn) * 7}px)`,
                    }}
                  >
                    {step.label}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 13.5,
                      color: theme.tertiary,
                      opacity: textIn * 0.95,
                      transform: `translateY(${(1 - textIn) * 7}px)`,
                      textAlign: "center",
                      maxWidth: 160,
                      lineHeight: 1.3,
                    }}
                  >
                    {step.hint}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {plate ? (
          <Card
            active={resolved}
            style={{
              padding: "20px 26px",
              opacity: plateIn,
              transform: `translateY(${(1 - plateIn) * 14}px)`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div
                style={{
                  fontFamily: fontDisplay,
                  fontSize: 11,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: resolved ? theme.success : theme.tertiary,
                }}
              >
                {plate.kicker}
              </div>
              <div
                style={{
                  fontFamily: fontDisplay,
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: resolved ? theme.success : theme.tertiary,
                  background: resolved ? theme.successSoft : theme.muted,
                  padding: "5px 10px",
                  borderRadius: 999,
                }}
              >
                {resolved ? payoff.labelAfter : payoff.labelBefore}
              </div>
            </div>
            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: `repeat(${plate.fields.length}, 1fr)`,
                gap: 18,
              }}
            >
              {plate.fields.map((field) => {
                const litAt = litFrameFor(field.at);
                const on = frame >= litAt;
                const fill = interpolate(frame, [litAt, litAt + 14], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                });
                return (
                  <div key={field.label} style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: fontDisplay,
                        fontSize: 10,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: on ? theme.brandDeep : theme.tertiary,
                      }}
                    >
                      {field.label}
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        fontFamily: fontMono,
                        fontSize: 17,
                        color: on ? theme.text : theme.tertiary,
                        opacity: on ? 0.45 + fill * 0.55 : 0.7,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {on ? field.value : field.pending}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ) : (
          <Card
            active={resolved}
            style={{
              padding: "22px 28px",
              fontFamily: fontMono,
              fontSize: 18,
              display: "flex",
              alignItems: "center",
              gap: 28,
              minHeight: 88,
              opacity: payoffIn,
              transform: `translateY(${(1 - payoffIn) * 16}px)`,
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
        )}
      </div>
    </Page>
  );
}

function Glyph({ name }: { name: StepIconName }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.85,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 15V5" />
          <path d="M8 9l4-4 4 4" />
          <path d="M5 19h14" />
        </svg>
      );
    case "verify":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "inspect":
      return (
        <svg {...common}>
          <rect x="6" y="4" width="12" height="16" rx="2" />
          <path d="M9 9h6M9 13h6M9 17h4" />
        </svg>
      );
    case "ship":
      return (
        <svg {...common}>
          <path d="M3 13h13v5H3z" />
          <path d="M16 16h3l2-3h-5v3z" />
          <circle cx="7" cy="19" r="1.4" />
          <circle cx="17" cy="19" r="1.4" />
          <path d="M3 13V8h8l2 5" />
        </svg>
      );
    case "scan":
      return (
        <svg {...common}>
          <path d="M5 8V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3" />
          <path d="M8 12h8" />
        </svg>
      );
    case "reconcile":
      return (
        <svg {...common}>
          <path d="M5 12a7 7 0 0 1 12-3" />
          <path d="M19 12a7 7 0 0 1-12 3" />
          <path d="M16 5v4h4M8 19v-4H4" />
        </svg>
      );
    default:
      return null;
  }
}
