/**
 * Product footage, directed.
 *
 * A screen recording played full frame asks the viewer to find the point
 * themselves, in UI that was designed for a laptop, not a video. So footage
 * here is shot with a virtual camera:
 *
 *   push     a slow drift in across the scene, so a still UI is never dead
 *   focus    at a marked moment, the camera eases in on the part that matters,
 *            the rest of the frame dims, and a label names it
 *
 * Everything is a pure function of the frame, as Remotion requires.
 */
import React from "react";
import { AbsoluteFill, Freeze, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";

import { fontSans } from "../fonts";
import { brandAlpha, theme } from "../theme";
import { cameraAt, clamp } from "./camera";
import type { Focus, Tone, VideoSegment } from "./types";

export function Footage({
  segment,
  tone,
  fps,
  width: W,
  height: H,
  plain = false,
}: {
  segment: VideoSegment;
  tone: Tone;
  fps: number;
  width: number;
  height: number;
  /** Brand stings play untouched: no camera, no grade. */
  plain?: boolean;
}) {
  const frame = useCurrentFrame();
  const t = frame / fps;

  /* Camera ------------------------------------------------------------ */
  const { s, cx, cy, active, k } = cameraAt(segment, tone, t, plain);
  const tx = W / 2 - cx * W * s;
  const ty = H / 2 - cy * H * s;

  /* Footage ----------------------------------------------------------- */
  // Hold the last good frame rather than run off the end of the file.
  const last = Math.max(0, Math.floor(segment.srcDuration * fps) - 2);
  const video = (
    <OffthreadVideo
      src={staticFile(segment.src)}
      muted
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        filter: plain
          ? undefined
          : `contrast(${tone.grade.contrast}) saturate(${tone.grade.saturate})`,
      }}
    />
  );

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: theme.page }}>
      <AbsoluteFill
        style={{
          transformOrigin: "0 0",
          transform: `translate(${tx}px, ${ty}px) scale(${s})`,
        }}
      >
        {frame > last ? <Freeze frame={last}>{video}</Freeze> : video}
      </AbsoluteFill>

      {!plain && tone.grade.vignette > 0 ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse at center, transparent 58%, rgba(0,0,0,${tone.grade.vignette}) 100%)`,
          }}
        />
      ) : null}

      {active && k > 0.01 ? (
        <Spotlight focus={active} k={k} s={s} cx={cx} cy={cy} W={W} H={H} dim={tone.focus.dim} />
      ) : null}
    </AbsoluteFill>
  );
}

/** Dims everything but the focus box, rings it, and names it. Drawn in screen space. */
function Spotlight({
  focus,
  k,
  s,
  cx,
  cy,
  W,
  H,
  dim,
}: {
  focus: Focus;
  k: number;
  s: number;
  cx: number;
  cy: number;
  W: number;
  H: number;
  dim: number;
}) {
  const [bx, by, bw, bh] = focus.box;
  const pad = 10;
  const x = W / 2 + (bx - cx) * W * s - pad;
  const y = H / 2 + (by - cy) * H * s - pad;
  const w = bw * W * s + pad * 2;
  const h = bh * H * s + pad * 2;
  const spot = focus.spotlight !== false;

  // Label goes under the box when there is room, otherwise above it.
  const below = y + h + 64 < H;
  const labelY = below ? y + h + 14 : y - 14;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {spot ? (
        <div
          style={{
            position: "absolute",
            left: x,
            top: y,
            width: w,
            height: h,
            borderRadius: 14,
            boxShadow: `0 0 0 4000px rgba(10,12,16,${dim * k})`,
            outline: `2px solid ${brandAlpha(0.9 * k)}`,
            outlineOffset: 0,
          }}
        />
      ) : null}

      {focus.label ? (
        <div
          style={{
            position: "absolute",
            left: clamp(x, 24, W - 520),
            top: labelY,
            transform: `translateY(${below ? (1 - k) * 10 : -100 + (1 - k) * -10}%)`,
            opacity: k,
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 16px 10px 14px",
            borderRadius: 999,
            background: "rgba(16,16,16,0.88)",
            color: "#fff",
            fontFamily: fontSans,
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: -0.2,
            boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: theme.brand,
              boxShadow: `0 0 0 4px ${brandAlpha(0.28)}`,
            }}
          />
          {focus.label}
        </div>
      ) : null}
    </AbsoluteFill>
  );
}
