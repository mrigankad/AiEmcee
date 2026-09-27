/**
 * The avatar across the whole film: one continuous presenter, not one per
 * scene.
 *
 * Each scene says where the avatar should be: `host` (large, left of centre,
 * over a blurred and darkened frame, with big captions), `corner` (small,
 * bottom right, captions in a pill beside it) or `off`. Between scenes it
 * travels from one pose to the next on the same clock as the transition, so a
 * host line that hands over to product footage reads as the presenter
 * stepping aside, rather than a cut.
 *
 * In the corner it also yields: if a focus move's box comes near it, it fades
 * back, so it never covers the thing the camera is pointing at.
 */
import React from "react";
import { AbsoluteFill, Easing, useCurrentFrame } from "remotion";

import { cameraAt, clamp } from "../film/camera";
import type { AvatarMood, Segment, Timeline } from "../film/types";
import { avatarColors } from "../theme";
import { Captions } from "./Captions";
import { faceFor, type Mood, WayamOrb } from "./WayamOrb";

const MARGIN = 44;
const HOST_SIZE = 300;
const CORNER_CAPTION = 560;
const ease = Easing.bezier(0.65, 0, 0.35, 1);

type Pose = { x: number; y: number; d: number; host: number; opacity: number };

function poseFor(mode: Segment["avatar"]["mode"], W: number, H: number, size: number): Pose {
  const corner = { x: W - MARGIN - size / 2, y: H - MARGIN - size / 2, d: size, host: 0, opacity: 1 };
  if (mode === "host") return { x: W * 0.25, y: H * 0.5, d: HOST_SIZE, host: 1, opacity: 1 };
  if (mode === "off") return { ...corner, d: size * 0.55, opacity: 0 };
  return corner;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  d: lerp(a.d, b.d, t),
  host: lerp(a.host, b.host, t),
  opacity: lerp(a.opacity, b.opacity, t),
});

/** Where the avatar is, what it feels, and which scene it is in, at film time `t`. */
function stateAt(timeline: Timeline, t: number) {
  const { segments, width: W, height: H } = timeline;
  const size = timeline.avatar!.size;
  const windowFor = (s: Segment) => Math.max(s.lead, 0.45);

  let i = 0;
  for (let j = 0; j < segments.length; j++) {
    if (t >= segments[j].start - windowFor(segments[j])) i = j;
  }
  const cur = segments[i];
  const prev = segments[i - 1] ?? cur;
  const span = windowFor(cur) + 0.35;
  const p = ease(clamp((t - (cur.start - windowFor(cur))) / span, 0, 1));

  // An "off" scene next to an on-screen one keeps its neighbour's position,
  // so the avatar shrinks away where it was instead of flying off.
  let from = poseFor(prev.avatar.mode, W, H, size);
  let to = poseFor(cur.avatar.mode, W, H, size);
  if (prev.avatar.mode === "off") from = { ...to, d: to.d * 0.55, opacity: 0 };
  if (cur.avatar.mode === "off") to = { ...from, d: from.d * 0.55, opacity: 0 };

  return {
    pose: lerpPose(from, to, p),
    moods: [prev.avatar.mood, cur.avatar.mood] as [AvatarMood, AvatarMood],
    p,
    segment: cur,
    index: i,
  };
}

/** The darkened, blurred frame behind the avatar when it hosts. Drawn under the titles. */
export function AvatarBackdrop({ timeline }: { timeline: Timeline }) {
  const frame = useCurrentFrame();
  if (!timeline.avatar) return null;
  const { pose } = stateAt(timeline, frame / timeline.fps);
  const h = pose.host * pose.opacity;
  if (h < 0.005) return null;

  const [, g1, g2] = avatarColors.gradient;
  return (
    <AbsoluteFill style={{ opacity: h }}>
      <AbsoluteFill
        style={{
          backdropFilter: "blur(7px) saturate(1.08)",
          background: `linear-gradient(90deg, rgba(22,28,38,0.82) 0%, rgba(22,28,38,0.72) 50%, rgba(22,28,38,0.62) 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${pose.x}px ${pose.y}px, ${g1}40 0%, ${g2}14 22%, transparent 42%)`,
        }}
      />
    </AbsoluteFill>
  );
}

/** The orb and its captions. Drawn above everything but the film's fades. */
export function AvatarPresenter({ timeline }: { timeline: Timeline }) {
  const frame = useCurrentFrame();
  const track = timeline.avatar;
  if (!track) return null;

  const { fps, width: W, height: H, tone } = timeline;
  const t = frame / fps;
  const { pose, moods, p, segment } = stateAt(timeline, t);
  if (pose.opacity < 0.01) return null;

  /* Step aside for a focus move that reaches into the corner. */
  let yield_ = 0;
  if (segment.kind === "video" && pose.host < 0.5) {
    const local = t - (segment.start - segment.lead);
    const cam = cameraAt(segment, tone, local, false);
    if (cam.active) {
      const [bx, by, bw, bh] = cam.active.box;
      const fx = W / 2 + (bx - cam.cx) * W * cam.s;
      const fy = H / 2 + (by - cam.cy) * H * cam.s;
      const zone = { x: W - MARGIN - pose.d - 16 - CORNER_CAPTION, y: H - MARGIN - pose.d - 20 };
      const overlaps = fx + bw * W * cam.s > zone.x && fy + bh * H * cam.s > zone.y;
      if (overlaps) yield_ = cam.k;
    }
  }
  const opacity = pose.opacity * (1 - 0.92 * yield_);
  if (opacity < 0.01) return null;

  const env = track.envelope;
  const level = env[frame] ?? 0;
  const voice = (ago: number) => env[frame - Math.round(ago * fps)] ?? 0;
  const look: [number, number] = [
    lerp(-0.6, 0.45 + 0.12 * Math.sin(t * 0.7), pose.host),
    lerp(-0.35, -0.05, pose.host),
  ];

  const box = pose.d * (200 / 128);
  const hostCaptionLeft = pose.x + pose.d / 2 + 60;

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      <div style={{ position: "absolute", left: pose.x - box / 2, top: pose.y - box / 2 }}>
        <WayamOrb
          size={pose.d}
          t={t}
          level={level}
          voice={voice}
          face={faceFor(moods[0] as Mood, moods[1] as Mood, p)}
          look={look}
        />
      </div>

      {track.captions && pose.host > 0.02 ? (
        <div
          style={{
            position: "absolute",
            left: hostCaptionLeft,
            top: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            opacity: pose.host,
          }}
        >
          <Captions cues={track.cues} t={t} fps={fps} variant="host" maxWidth={W - hostCaptionLeft - 96} />
        </div>
      ) : null}

      {track.captions && pose.host < 0.98 ? (
        <div
          style={{
            position: "absolute",
            right: W - (pose.x - pose.d / 2) + 16,
            bottom: H - (pose.y + pose.d / 2) + pose.d * 0.16,
            display: "flex",
            justifyContent: "flex-end",
            opacity: 1 - pose.host,
          }}
        >
          <Captions cues={track.cues} t={t} fps={fps} variant="corner" maxWidth={CORNER_CAPTION} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
}
