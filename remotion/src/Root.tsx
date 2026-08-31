/**
 * The composition registry, and the copy that fills each one.
 *
 * Durations are written in seconds via sec() and must match the narration
 * duration for that scene id in tts/durations.json. `npm run narrate` prints
 * every length; copy the number for the motion scenes in here. If a
 * composition is shorter than its line, compose.mjs freeze-frames the tail,
 * which is visible and ugly.
 */
import React from "react";
import { Composition } from "remotion";

import { EndCard, type EndCardProps } from "./compositions/EndCard";
import { LowerThird, type LowerThirdProps } from "./compositions/LowerThird";
import { Pipeline, type PipelineProps } from "./compositions/Pipeline";
import { Problem, type ProblemProps } from "./compositions/Problem";
import { FPS, H, W, sec } from "./theme";

export const RemotionRoot: React.FC = () => {
  const frame = { fps: FPS, width: W, height: H };

  return (
    <>
      <Composition
        id="Problem"
        component={Problem}
        durationInFrames={sec(11.4)}
        {...frame}
        defaultProps={
          {
            eyebrow: "The cost today",
            headline: ["Teams still spend weeks", "on work nobody wants."],
            beats: [
              {
                at: sec(0.3),
                kicker: "Weeks of setup",
                title: "Doing it by hand",
                body: "It takes weeks to stand up, then the same weeks again every quarter.",
              },
              {
                at: sec(3.6),
                kicker: "Every change",
                title: "And then it breaks",
                body: "One rename, and half of it fails. Maintenance quietly becomes the job.",
              },
              {
                at: sec(7.1),
                kicker: "Shallow tooling",
                title: "Output nobody trusts",
                body: "Most tools cover the easy path and skip the cases that actually matter.",
              },
            ],
          } satisfies ProblemProps
        }
      />

      <Composition
        id="Pipeline"
        component={Pipeline}
        durationInFrames={sec(13.0)}
        {...frame}
        defaultProps={
          {
            eyebrow: "How it works",
            headline: ["One loop. From input", "to a result that holds."],
            steps: [
              { id: "01", label: "Connect", hint: "Repo or URL" },
              { id: "02", label: "Explore", hint: "Crawl like a user" },
              { id: "03", label: "Approve", hint: "Plain-language plan" },
              { id: "04", label: "Generate", hint: "Code you own" },
              { id: "05", label: "Run", hint: "Three browsers" },
              { id: "06", label: "Heal", hint: "Locators rewrite" },
            ],
            payoff: {
              labelBefore: "Locator",
              labelAfter: "Healed",
              before: "#pay-btn",
              after: "getByRole('button', { name: 'Place order' })",
            },
          } satisfies PipelineProps
        }
      />

      <Composition
        id="EndCard"
        component={EndCard}
        durationInFrames={sec(3.2)}
        {...frame}
        defaultProps={
          {
            // Drop your own SVG or PNG in remotion/public and name it here.
            mark: null,
            title: "Your product",
            kicker: "A one-line positioning statement",
            tagline: "The call to action, in six words or fewer.",
          } satisfies EndCardProps
        }
      />

      {/*
        Rendered as a still, one PNG per titled scene, with props supplied on
        the command line by render.mjs. The duration only exists so the fade
        keyframes have a range; frame 24 is grabbed at full opacity.
      */}
      <Composition
        id="LowerThird"
        component={LowerThird}
        durationInFrames={sec(2.5)}
        {...frame}
        defaultProps={
          { kicker: "Section", title: "What this part shows" } satisfies LowerThirdProps
        }
      />
    </>
  );
};
