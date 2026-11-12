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
import { brandAlpha, overlay, theme } from "../theme";
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
      // The footage is 2x the frame (3840x2160 for 1080p): drawn at full size
      // and scaled by the browser, so the frame is supersampled and a 2x focus
      // move lands on native pixels. No tone mapping: UI colours stay exact.
      toneMapped={false}
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

/**
 * Pinned-marker caption (Paper "04 · Parikshan · Focus captions", C3): an orange dot with a soft
 * halo pinned at the top-left of the focus area, a short leader line, and a white label card.
 * Used when a focus move sets `spotlight: false`, so nothing dims or boxes the product UI.
 */
function PinnedLabel({ label, x, y, W, k }: { label: string; x: number; y: number; W: number; k: number }) {
  const dot = 28;
  const line = 56;
  const cardW = Math.min(760, 26 * label.length + 60); // rough width at 28px bold
  const px = clamp(x + 24, 40, W - 40);
  const py = clamp(y + 24, 40, 1040);
  const flip = px + dot / 2 + line + cardW > W - 40; // not enough room on the right: put the card on the left
  const grow = Math.min(1, k * 1.4);
  return (
    <div
      style={{
        position: "absolute",
        left: px - dot / 2,
        top: py - dot / 2,
        display: "flex",
        flexDirection: flip ? "row-reverse" : "row",
        alignItems: "center",
        transform: flip ? `translateX(calc(-100% + ${dot}px))` : undefined,
        opacity: k,
        fontFamily: fontSans,
      }}
    >
      <div style={{ width: dot, height: dot, borderRadius: 999, flexShrink: 0, background: theme.brand, boxShadow: `0 0 0 ${8 * grow}px ${brandAlpha(0.2)}`, transform: `scale(${0.6 + 0.4 * grow})` }} />
      <div style={{ width: line * grow, height: 2, background: theme.brand, flexShrink: 0 }} />
      <div
        style={{
          padding: "14px 22px",
          borderRadius: 16,
          background: overlay.card,
          color: overlay.label,
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: -0.3,
          whiteSpace: "nowrap",
          boxShadow: "0 18px 44px rgba(22,24,29,0.18), 0 0 0 1px rgba(22,24,29,0.06)",
          transform: `translateX(${(flip ? 1 : -1) * (1 - k) * 12}px)`,
        }}
      >
        {label}
      </div>
    </div>
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

      {focus.label && !spot ? (
        <PinnedLabel label={focus.label} x={x + pad} y={y + pad} W={W} k={k} />
      ) : null}

      {focus.label && spot ? (
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
