/**
 * What the avatar is saying, one sentence at a time, following the voice word
 * by word.
 *
 * The whole sentence is set at once, so the eye can read ahead; words not yet
 * spoken sit dimmed, spoken words come up to full strength, and the word being
 * said takes the Wayam orange. Sentences rise in as they start and hold
 * briefly after they end, so a short pause never blanks the caption.
 */
import React from "react";
import { spring } from "remotion";

import { fontSans } from "../fonts";
import { avatarColors } from "../theme";
import type { AvatarCue } from "../film/types";

const HOLD = 0.4;

export function activeCue(cues: AvatarCue[], t: number) {
  let found: AvatarCue | null = null;
  for (const c of cues) {
    if (t >= c.start - 0.12 && t < c.end + HOLD) found = c;
  }
  return found;
}

export function Captions({
  cues,
  t,
  fps,
  variant,
  maxWidth,
}: {
  cues: AvatarCue[];
  t: number;
  fps: number;
  variant: "host" | "corner";
  maxWidth: number;
}) {
  const cue = activeCue(cues, t);
  if (!cue) return null;

  const host = variant === "host";
  const enter = spring({
    frame: Math.round((t - (cue.start - 0.12)) * fps),
    fps,
    config: { damping: 20, mass: 0.6, stiffness: 150 },
  });
  const leave = Math.min(1, Math.max(0, (cue.end + HOLD - t) / 0.18));

  return (
    <div
      style={{
        maxWidth,
        fontFamily: fontSans,
        fontWeight: 600,
        fontSize: host ? 46 : 21,
        lineHeight: host ? 1.18 : 1.34,
        letterSpacing: host ? -1.1 : -0.2,
        color: "#fff",
        opacity: enter * leave,
        transform: `translateY(${(1 - enter) * (host ? 22 : 10)}px)`,
        ...(host
          ? {}
          : {
              padding: "12px 18px 13px",
              borderRadius: 16,
              background: "rgba(22,28,38,0.94)",
              backdropFilter: "blur(10px)",
              boxShadow: "0 14px 40px rgba(0,0,0,0.28)",
            }),
      }}
    >
      {cue.words.map((word, i) => {
        const said = t >= word.start;
        const now = said && t < word.end;
        return (
          <span
            key={i}
            style={{
              color: now ? avatarColors.gradient[0] : "#fff",
              opacity: said ? 1 : host ? 0.26 : 0.42,
            }}
          >
            {word.w}
            {i < cue.words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </div>
  );
}
