/**
 * The whole film, as one composition.
 *
 * Reads the timeline scripts/lib/timeline.mjs wrote (remotion/public/film/
 * timeline.json) and lays every scene, transition and title onto one clock.
 * The picture is rendered silent; the sound is mixed by ffmpeg from the same
 * timeline, which is what keeps the two in sync.
 *
 * Layering, bottom to top: scenes in order (each incoming scene above the one
 * it replaces), the avatar's host backdrop, lower thirds, transition edges,
 * the avatar and its captions, then the top/tail fade.
 */
import React from "react";
import { AbsoluteFill, Freeze, Sequence, useCurrentFrame } from "remotion";

import { AvatarBackdrop, AvatarPresenter } from "../avatar/AvatarLayer";
import { LowerThird } from "../compositions/LowerThird";
import { fontSans } from "../fonts";
import { MOTION } from "../scenes";
import { theme } from "../theme";
import { Footage } from "./Footage";
import { ToneProvider } from "./tone";
import { enterStyle, exitStyle, WipeEdge } from "./transitions";
import type { MotionSegment, Segment, Timeline } from "./types";

export type FilmProps = { timeline: Timeline | null };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function Film({ timeline }: FilmProps) {
  const frame = useCurrentFrame();

  if (!timeline) {
    return (
      <AbsoluteFill
        style={{
          background: theme.page,
          fontFamily: fontSans,
          fontSize: 28,
          color: theme.secondary,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        No timeline yet. Run `npm run compose` once, then reopen the studio.
      </AbsoluteFill>
    );
  }

  const { fps, width, height, tone, segments } = timeline;
  const f = (s: number) => Math.round(s * fps);
  const total = f(timeline.total);

  const fadeIn = f(timeline.fadeIn);
  const fadeOut = f(timeline.fadeOut);
  const black = Math.max(
    fadeIn > 0 ? 1 - clamp01(frame / fadeIn) : 0,
    fadeOut > 0 ? clamp01((frame - (total - fadeOut)) / fadeOut) : 0,
  );

  return (
    <ToneProvider tone={tone}>
      <AbsoluteFill style={{ backgroundColor: theme.page }}>
        {segments.map((seg, i) => {
          const next = segments[i + 1];
          const from = f(seg.start - seg.lead);
          const until = next ? f(next.start) : total;
          const leadF = f(seg.lead);

          const enterP = leadF > 0 ? clamp01((frame - from) / leadF) : 1;
          const nextLead = next ? f(next.lead) : 0;
          const exitP = nextLead > 0 ? clamp01((frame - (f(next!.start) - nextLead)) / nextLead) : 0;

          return (
            <Sequence key={seg.id} name={seg.id} from={from} durationInFrames={until - from}>
              <AbsoluteFill style={exitP > 0 && next ? exitStyle(next.transition.type, exitP) : undefined}>
                <AbsoluteFill style={enterStyle(seg.transition.type, enterP)}>
                  <SegmentBody seg={seg} fps={fps} width={width} height={height} tone={tone} />
                </AbsoluteFill>
              </AbsoluteFill>
            </Sequence>
          );
        })}

        <AvatarBackdrop timeline={timeline} />

        {segments.map((seg) =>
          seg.lowerThird ? (
            <Sequence
              key={`lt-${seg.id}`}
              name={`lower third · ${seg.id}`}
              from={f(seg.start + seg.lowerThird.at)}
              durationInFrames={f(seg.lowerThird.hold)}
            >
              <LowerThird kicker={seg.lowerThird.kicker} title={seg.lowerThird.title} />
            </Sequence>
          ) : null,
        )}

        {segments.map((seg) =>
          seg.transition.type === "wipe" && seg.lead > 0 ? (
            <Sequence key={`edge-${seg.id}`} from={f(seg.start - seg.lead)} durationInFrames={f(seg.lead)}>
              <WipeEdge p={(frame - f(seg.start - seg.lead)) / f(seg.lead)} />
            </Sequence>
          ) : null,
        )}

        <AvatarPresenter timeline={timeline} />

        {black > 0 ? <AbsoluteFill style={{ backgroundColor: "#000", opacity: black }} /> : null}
      </AbsoluteFill>
    </ToneProvider>
  );
}

function SegmentBody({
  seg,
  fps,
  width,
  height,
  tone,
}: {
  seg: Segment;
  fps: number;
  width: number;
  height: number;
  tone: Timeline["tone"];
}) {
  if (seg.kind === "video") {
    const plain = seg.id === "00-intro" || seg.id === "zz-outro";
    return <Footage segment={seg} tone={tone} fps={fps} width={width} height={height} plain={plain} />;
  }
  return <MotionBody seg={seg} fps={fps} />;
}

/**
 * A motion scene holds its first frame under the incoming transition, then
 * plays from frame 0 exactly when its narration starts, so every hand-timed
 * beat inside it still lands on the word it was timed to.
 */
function MotionBody({ seg, fps }: { seg: MotionSegment; fps: number }) {
  const frame = useCurrentFrame();
  const entry = MOTION[seg.composition];
  if (!entry) throw new Error(`Film: no motion scene registered as "${seg.composition}" (remotion/src/scenes.ts)`);

  const Comp = entry.component;
  const leadF = Math.round(seg.lead * fps);
  const slotF = Math.round(seg.slot * fps);

  if (frame < leadF) {
    return (
      <Freeze frame={0}>
        <Sequence durationInFrames={slotF}>
          <Comp {...entry.props} />
        </Sequence>
      </Freeze>
    );
  }
  return (
    <Sequence from={leadF} durationInFrames={slotF}>
      <Comp {...entry.props} />
    </Sequence>
  );
}
