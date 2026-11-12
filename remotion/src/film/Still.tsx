/**
 * A still image, alive: a slow zoom and pan across the scene's time on screen.
 *
 * Progress runs over the whole Sequence (lead included), so the move is already
 * under way beneath the incoming transition. The maths is mirrored exactly in
 * scripts/lib/stills.mjs, which renders the same scene with ffmpeg when no
 * Remotion layer (title, avatar, transition) touches it.
 */
import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";

import type { StillMove, StillSegment } from "./types";

export function stillCamera(move: StillMove, p: number) {
  const e = move.ease === "linear" ? p : 0.5 - 0.5 * Math.cos(Math.PI * p);
  const s = move.zoom[0] + (move.zoom[1] - move.zoom[0]) * e;
  const half = 0.5 / s;
  const lim = (v: number) => Math.min(1 - half, Math.max(half, v));
  const cx = lim(move.pan[0][0] + (move.pan[1][0] - move.pan[0][0]) * e);
  const cy = lim(move.pan[0][1] + (move.pan[1][1] - move.pan[0][1]) * e);
  return { s, cx, cy };
}

export function StillBody({
  seg,
  width: W,
  height: H,
  frames,
}: {
  seg: StillSegment;
  width: number;
  height: number;
  /** The scene's Sequence length: from its lead to the next scene's start. */
  frames: number;
}) {
  const frame = useCurrentFrame();
  const p = Math.max(0, Math.min(1, frame / Math.max(1, frames)));
  const { s, cx, cy } = stillCamera(seg.move, p);
  const tx = W / 2 - cx * W * s;
  const ty = H / 2 - cy * H * s;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={staticFile(seg.src)}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: H,
          objectFit: "cover",
          transformOrigin: "0 0",
          transform: `translate(${tx}px, ${ty}px) scale(${s})`,
        }}
      />
    </AbsoluteFill>
  );
}
