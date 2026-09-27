/**
 * The composition registry.
 *
 * `Film` is the whole video: compose.mjs renders it from the timeline, and it
 * renders the motion scenes and lower thirds inline, at their exact slot
 * lengths. The other compositions are registered so each scene can be worked
 * on alone in the studio (`npm run studio`); their copy lives in scenes.ts.
 *
 * Standalone durations below are for previewing only. Inside the Film a scene
 * always runs for exactly its narration slot, from tts/durations.json.
 */
import React from "react";
import { Composition, staticFile } from "remotion";

import { AvatarPreview } from "./avatar/AvatarPreview";
import { EndCard } from "./compositions/EndCard";
import { LowerThird, type LowerThirdProps } from "./compositions/LowerThird";
import { Pipeline } from "./compositions/Pipeline";
import { Problem } from "./compositions/Problem";
import { Film, type FilmProps } from "./film/Film";
import type { Timeline } from "./film/types";
import { endCardProps, pipelineProps, problemProps } from "./scenes";
import { FPS, H, W, sec } from "./theme";

/** Reads the timeline compose.mjs staged into public/, unless one is passed as a prop. */
async function loadTimeline(props: FilmProps): Promise<Timeline | null> {
  if (props.timeline) return props.timeline;
  try {
    const res = await fetch(staticFile("film/timeline.json"));
    return res.ok ? ((await res.json()) as Timeline) : null;
  } catch {
    return null;
  }
}

export const RemotionRoot: React.FC = () => {
  const frame = { fps: FPS, width: W, height: H };

  return (
    <>
      <Composition
        id="Film"
        component={Film}
        durationInFrames={sec(1)}
        {...frame}
        defaultProps={{ timeline: null } satisfies FilmProps}
        calculateMetadata={async ({ props }) => {
          const timeline = await loadTimeline(props);
          if (!timeline) return { props: { timeline: null } };
          return {
            durationInFrames: Math.round(timeline.total * timeline.fps),
            fps: timeline.fps,
            width: timeline.width,
            height: timeline.height,
            props: { timeline },
          };
        }}
      />

      <Composition id="Problem" component={Problem} durationInFrames={sec(14.42)} {...frame} defaultProps={problemProps} />

      <Composition id="Pipeline" component={Pipeline} durationInFrames={sec(14.9)} {...frame} defaultProps={pipelineProps} />

      <Composition id="EndCard" component={EndCard} durationInFrames={sec(3.9)} {...frame} defaultProps={endCardProps} />

      <Composition id="Avatar" component={AvatarPreview} durationInFrames={sec(8)} {...frame} />

      <Composition
        id="LowerThird"
        component={LowerThird}
        durationInFrames={sec(3.6)}
        {...frame}
        defaultProps={{ kicker: "Section", title: "What this part shows" } satisfies LowerThirdProps}
      />
    </>
  );
};
