/**
 * Studio sheet for the avatar: every mood side by side, speaking on a
 * synthetic voice, over the host backdrop and over the page colour.
 * `npm run studio` -> Avatar. Not used by the film.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

import { fontSans } from "../fonts";
import { avatarColors, theme } from "../theme";
import { faceFor, type Mood, WayamOrb } from "./WayamOrb";

const MOODS: Mood[] = ["neutral", "happy", "curious", "focused"];

/** Syllable-like bursts: on for a phrase, off for a breath. */
const fakeVoice = (t: number) => {
  const phrase = (Math.sin(t * 0.9) + 1) / 2 > 0.3 ? 1 : 0;
  const syllable = Math.max(0, Math.sin(t * 13) * 0.5 + Math.sin(t * 7.3) * 0.35 + 0.35);
  return Math.min(1, phrase * syllable);
};

export function AvatarPreview() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  return (
    <AbsoluteFill style={{ background: theme.page, fontFamily: fontSans }}>
      <AbsoluteFill style={{ height: "50%", background: avatarColors.ink }} />
      {[0, 1].map((row) =>
        MOODS.map((mood, i) => (
          <div
            key={`${row}-${mood}`}
            style={{
              position: "absolute",
              left: 200 + i * 400 - 125,
              top: row * 450 + 60,
              width: 250,
              textAlign: "center",
              color: row ? theme.secondary : "#fff",
              fontSize: 18,
            }}
          >
            <div style={{ display: "flex", justifyContent: "center" }}>
              <WayamOrb
                size={row ? 150 : 190}
                t={t + i * 0.7}
                level={fakeVoice(t + i)}
                voice={(ago) => fakeVoice(t + i - ago)}
                face={faceFor(mood, mood, 1)}
                look={row ? [-0.6, -0.35] : [0.4, 0]}
                id={`p-${row}-${i}`}
              />
            </div>
            <div style={{ marginTop: 6 }}>{mood}</div>
          </div>
        )),
      )}
    </AbsoluteFill>
  );
}
