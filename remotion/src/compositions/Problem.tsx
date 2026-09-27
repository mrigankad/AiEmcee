/**
 * The "why this matters" beat. Three claims land as evidence documents — a
 * workbook, two records that never meet, a history that cannot be rebuilt —
 * so the argument is seen, not only read.
 *
 * Use a motion scene, not screen capture, whenever the point is an argument
 * rather than a feature.
 *
 * The `at` frames are hand-placed against the narration for this scene. When
 * you rewrite the line, re-time them: play the MP3, note where each claim is
 * spoken, multiply by fps.
 *
 * Three states, never two. A claim not yet made is faint, the claim being made
 * is lit and lifted, and a claim already made stays legible but recedes.
 */
import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import { Card, Eyebrow, FadeUp, KineticLine, Page, Trace } from "../components/Motion";
import { brandAlpha, theme } from "../theme";
import { fontDisplay, fontMono, fontSans } from "../fonts";

export type BeatVisual = "sheet" | "split" | "void";

export type Beat = {
  /** Frame this beat lights up on. */
  at: number;
  kicker: string;
  title: string;
  body: string;
  /** Miniature inside the card. Defaults by index. */
  visual?: BeatVisual;
};

export type ProblemProps = {
  eyebrow: string;
  headline: string[];
  /** Words in the headline to set in the brand colour. */
  highlight?: string[];
  beats: Beat[];
};

const VISUALS: BeatVisual[] = ["sheet", "split", "void"];

export function Problem({ eyebrow, headline, highlight = [], beats }: ProblemProps) {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();

  const traceStops = beats.map((_, i) => (i + 1) / beats.length);
  let trace = 0;
  beats.forEach((beat, i) => {
    const step = interpolate(frame, [beat.at, beat.at + 18], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    const from = i === 0 ? 0 : traceStops[i - 1];
    trace = Math.max(trace, from + (traceStops[i] - from) * step);
  });

  return (
    <Page>
      <div
        style={{
          height: "100%",
          padding: "56px 72px 52px",
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
            fontSize: 46,
            fontWeight: 600,
            letterSpacing: -1.3,
            margin: "12px 0 0",
            lineHeight: 1.12,
          }}
        >
          {headline.map((row, i) => (
            <KineticLine key={row} text={row} delay={4 + i * 7} highlight={highlight} />
          ))}
        </h1>

        <div style={{ marginTop: 22 }}>
          <Trace progress={trace} width="100%" />
        </div>

        <div
          style={{
            marginTop: 28,
            display: "flex",
            gap: 18,
            flex: 1,
            minHeight: 0,
          }}
        >
          {beats.map((beat, i) => {
            const nextAt = beats[i + 1]?.at ?? durationInFrames;
            const on = frame >= beat.at && frame < nextAt + 6;
            const past = frame >= nextAt + 6;

            const enter = spring({
              frame: frame - beat.at,
              fps,
              config: { damping: 16, mass: 0.6, stiffness: 140 },
            });

            const rest = on ? 1 : past ? 0.72 : 0.32;
            const opacity = 0.32 + (rest - 0.32) * (frame >= beat.at ? enter : 0);
            const lift = on ? enter * 1.4 : 0;
            const visual = beat.visual ?? VISUALS[i] ?? "sheet";

            return (
              <Card
                key={beat.title}
                active={on}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  padding: 0,
                  overflow: "hidden",
                  opacity,
                  transform:
                    `translateY(${(1 - enter) * 16 - lift * 4}px) ` + `scale(${1 + lift * 0.012})`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "14px 18px 12px",
                    borderBottom: `1px solid ${on ? brandAlpha(0.18) : theme.muted}`,
                    background: on ? theme.brandSoft : theme.raised,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      flexShrink: 0,
                      borderRadius: 10,
                      display: "grid",
                      placeItems: "center",
                      fontFamily: fontDisplay,
                      fontSize: 11,
                      letterSpacing: "0.04em",
                      background: on ? theme.brand : past ? brandAlpha(0.1) : theme.muted,
                      color: on ? "#fff" : past ? theme.brandDeep : theme.tertiary,
                      boxShadow: on ? `0 6px 16px ${brandAlpha(0.32)}` : "none",
                    }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div
                    style={{
                      fontFamily: fontDisplay,
                      fontSize: 11,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      color: on ? theme.brandDeep : theme.tertiary,
                    }}
                  >
                    {beat.kicker}
                  </div>
                </div>

                <div
                  style={{
                    padding: "16px 18px 10px",
                    flex: 1,
                    minHeight: 0,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <div style={{ width: "100%" }}>
                    <Artifact visual={visual} active={on} frame={frame} at={beat.at} />
                  </div>
                </div>

                <div style={{ padding: "4px 18px 18px" }}>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      letterSpacing: -0.3,
                      lineHeight: 1.25,
                    }}
                  >
                    {beat.title}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 14.5,
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

function Artifact({
  visual,
  active,
  frame,
  at,
}: {
  visual: BeatVisual;
  active: boolean;
  frame: number;
  at: number;
}) {
  if (visual === "split") return <SplitRecord active={active} />;
  if (visual === "void") return <BrokenSerial active={active} frame={frame} at={at} />;
  return <FlashSheet active={active} />;
}

function FlashSheet({ active }: { active: boolean }) {
  const cols = ["Serial", "Pmax", "Voc", "FF"];
  const rows = [
    ["WS0924…7506", "549.1", "50.1", "79.8"],
    ["WS0924…7524", "547.4", "49.9", "79.0"],
    ["WS0924…7546", "546.8", "49.5", "78.8"],
    ["WS0924…7577", "545.7", "49.5", "79.5"],
    ["WS0924…7581", "548.6", "49.7", "79.8"],
    ["WS0924…7602", "544.2", "49.4", "78.6"],
  ];

  return (
    <div
      style={{
        border: `1px solid ${theme.muted}`,
        borderRadius: 10,
        overflow: "hidden",
        fontFamily: fontMono,
        fontSize: 11,
        background: theme.raised,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 0.7fr 0.7fr 0.6fr",
          background: active ? brandAlpha(0.1) : "rgba(16,16,16,0.04)",
          padding: "7px 10px",
          color: theme.tertiary,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          fontFamily: fontDisplay,
          fontSize: 9,
        }}
      >
        {cols.map((c) => (
          <div key={c}>{c}</div>
        ))}
      </div>
      {rows.map((row, i) => (
        <div
          key={row[0]}
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 0.7fr 0.7fr 0.6fr",
            padding: "6px 10px",
            borderTop: `1px solid ${theme.muted}`,
            color: i === 1 && active ? theme.text : theme.secondary,
            background: i === 1 && active ? brandAlpha(0.08) : "transparent",
          }}
        >
          {row.map((cell) => (
            <div key={cell} style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SplitRecord({ active }: { active: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, height: "100%" }}>
      <RecordChip label="Factory" value="WS0924…2215" ok={false} />
      <div
        style={{
          flexShrink: 0,
          width: 28,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          color: active ? theme.error : theme.tertiary,
          fontFamily: fontDisplay,
          fontSize: 11,
        }}
      >
        <div
          style={{
            width: 22,
            height: 2,
            backgroundImage: `repeating-linear-gradient(90deg, ${active ? theme.error : theme.stroke} 0 4px, transparent 4px 8px)`,
          }}
        />
        <span>×</span>
        <div
          style={{
            width: 22,
            height: 2,
            backgroundImage: `repeating-linear-gradient(90deg, ${active ? theme.error : theme.stroke} 0 4px, transparent 4px 8px)`,
          }}
        />
      </div>
      <RecordChip label="Site" value="WS0924…2215" ok={false} />
    </div>
  );
}

function RecordChip({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div
      style={{
        flex: 1,
        border: `1px solid ${theme.muted}`,
        borderRadius: 10,
        padding: "12px 10px",
        background: theme.container,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 9,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: theme.tertiary,
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 8,
          fontFamily: fontMono,
          fontSize: 11,
          color: ok ? theme.success : theme.text,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function BrokenSerial({ active, frame, at }: { active: boolean; frame: number; at: number }) {
  const scramble = interpolate(frame, [at + 4, at + 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const serial = "WS09249038922215";
  const shown =
    scramble < 0.5
      ? serial
      : serial
          .split("")
          .map((ch, i) => (i % 3 === 0 && scramble > 0.5 ? "·" : ch))
          .join("");

  return (
    <div
      style={{
        height: "100%",
        border: `1px solid ${active ? theme.error : theme.muted}`,
        borderRadius: 10,
        background: active ? theme.errorSoft : theme.raised,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "16px 18px",
        gap: 10,
      }}
    >
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 9,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: active ? theme.error : theme.tertiary,
        }}
      >
        Provenance
      </div>
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 16,
          letterSpacing: 0.4,
          color: active ? theme.error : theme.text,
        }}
      >
        {active ? shown : serial}
      </div>
      <div style={{ fontSize: 13, color: theme.secondary }}>History cannot be reconstructed.</div>
    </div>
  );
}
