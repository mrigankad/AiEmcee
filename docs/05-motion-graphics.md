# 05 · Motion graphics

Remotion renders React components to video, frame by frame, in headless
Chromium. If you can build it in a browser, you can render it as a scene.

## When to use a motion scene instead of capture

| Use motion when | Use capture when |
| --- | --- |
| the point is an argument | the point is the product |
| the thing does not exist in the UI (a pipeline diagram) | it does |
| you are stating a problem | you are showing a solution |
| you need a title or end card | — |

Nobody needs to watch a slow scroll past a marketing page to be told that
testing is expensive. Say it in a designed frame and move on.

## The three-scene starting set

| Composition | Role |
| --- | --- |
| `Problem` | three claims revealing one at a time, along a trace line |
| `Pipeline` | numbered steps lighting up a rail, with a payoff strip |
| `EndCard` | mark, name, positioning line, call to action |
| `LowerThird` | animated title card, drawn over footage inside the film |

All four are prop-driven. Rewriting the copy usually means editing
its copy in `remotion/src/scenes.ts` — no component changes at all.

## Frames, not seconds

Remotion counts frames. At 30fps, second 4 is frame 120. `theme.ts` exports a
helper so composition lengths read in the same unit as narration:

```ts
import { sec } from "./theme";

durationInFrames={sec(11.4)}   // 11.4 seconds
```

**Inside the film, a motion scene always runs exactly its narration slot**
(`narration + gap`); `useVideoConfig().durationInFrames` reports that length.
The durations in `Root.tsx` are only for previewing in the studio. What you
do still re-time by hand is the `at` frames inside a scene, when its line
changes.

## The motion vocabulary

`src/components/Motion.tsx` deliberately holds only five primitives. A video
where everything enters the same way reads as one designed piece; a video where
each section invents its own animation reads as a template.

### `<Page>`

The full-frame surface. Every composition starts with one.

```tsx
<Page>...</Page>
<Page transparent>...</Page>   // lower thirds, composited over footage
```

### `<FadeUp delay={n}>`

The house entrance: rise 18px while fading in, on a spring. `delay` is in
frames.

```tsx
<FadeUp delay={sec(0.4)}>
  <h1>The headline</h1>
</FadeUp>
```

Stagger siblings by 4–8 frames. Enough to read as sequence, little enough that
it still feels like one gesture.

### `<Trace progress={0..1} width={...} />`

A brand-gradient line that draws left to right. Progress bars, crawls, traces.

### `<Card active={bool}>`

The standard white panel. `active` swaps the neutral border for a brand-tinted
one plus a soft ring — the only way anything gets highlighted.

### `<Eyebrow>`

Small uppercase display type. The only place the display face appears at size.

## Timing inside a composition

Two functions do all the work.

**`interpolate`** — map a frame range onto a value range. Always clamp, or the
value keeps going past the ends.

```tsx
const opacity = interpolate(frame, [0, 12], [0, 1], {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
});
```

**`spring`** — physical motion for anything that enters. Springs read as
organic in a way eased interpolation does not.

```tsx
const enter = spring({
  frame: frame - delay,
  fps,
  config: { damping: 18, mass: 0.7, stiffness: 120 },
});
```

The house spring is `{ damping: 18, mass: 0.7, stiffness: 120 }`. Lower damping
overshoots more; higher stiffness snaps faster.

### Cue frames

`Problem` takes a `beats` array where each beat carries the frame it lights up
on:

```tsx
beats: [
  { at: sec(0.3), kicker: "Weeks of setup", title: "...", body: "..." },
  { at: sec(3.6), kicker: "Every change",   title: "...", body: "..." },
  { at: sec(7.1), kicker: "Shallow tooling", title: "...", body: "..." },
]
```

These are hand-placed against the narration. To re-time them: play
`tts/02-problem.mp3`, note the second each claim is spoken, wrap it in `sec()`.

**Cue slightly early.** A beat that lights up 0.2s before the words land reads
as responsive. One that lands 0.2s late reads as broken.

## Live editing

```bash
npm run studio
```

Remotion Studio opens with a scrubbable timeline and hot reload. This is the
only sane way to time a composition — scrub to the frame, adjust, watch it
update.

Props are editable in the sidebar, so you can try copy without editing files.

## Adding a composition

**1. Write it** — `remotion/src/compositions/Metrics.tsx`:

```tsx
import React from "react";
import { interpolate, useCurrentFrame } from "remotion";

import { Card, Eyebrow, FadeUp, Page } from "../components/Motion";
import { fontSans } from "../fonts";
import { theme } from "../theme";

export type MetricsProps = {
  eyebrow: string;
  stats: { value: string; label: string }[];
};

export function Metrics({ eyebrow, stats }: MetricsProps) {
  const frame = useCurrentFrame();

  return (
    <Page>
      <div style={{ height: "100%", padding: "72px 96px", display: "flex", flexDirection: "column" }}>
        <FadeUp>
          <Eyebrow>{eyebrow}</Eyebrow>
        </FadeUp>

        <div style={{ marginTop: "auto", marginBottom: "auto", display: "flex", gap: 32 }}>
          {stats.map((stat, i) => (
            <FadeUp key={stat.label} delay={12 + i * 6} style={{ flex: 1 }}>
              <Card style={{ padding: "32px 36px" }}>
                <div style={{ fontFamily: fontSans, fontSize: 64, fontWeight: 600, letterSpacing: -2 }}>
                  {stat.value}
                </div>
                <div style={{ marginTop: 8, fontSize: 18, color: theme.secondary }}>
                  {stat.label}
                </div>
              </Card>
            </FadeUp>
          ))}
        </div>
      </div>
    </Page>
  );
}
```

**2. Register it.** Put its copy and a registry entry in `scenes.ts`, which is
where the film looks it up:

```ts
export const metricsProps = { eyebrow: "By the numbers", stats: [/* … */] } satisfies MetricsProps;

export const MOTION = {
  // …
  Metrics: { component: Metrics, props: metricsProps },
};
```

Then, to preview it in the studio, register it in `Root.tsx`:

```tsx
<Composition
  id="Metrics"
  component={Metrics}
  durationInFrames={sec(9.5)}
  {...frame}
  defaultProps={{
    eyebrow: "By the numbers",
    stats: [
      { value: "10 min", label: "repo to running suite" },
      { value: "3", label: "browsers in parallel" },
      { value: "92%", label: "locators healed automatically" },
    ],
  } satisfies MetricsProps}
/>
```

**3. Put it in the film** — `video.config.mjs`:

```js
{ id: "11-metrics", from: "motion", composition: "Metrics" },
```

Plus a matching `narration.json` entry.

**4. Preview** with `npm run studio` or `npm run motion -- Metrics`; the film
picks it up on the next `npm run compose`.

## Lower thirds

Drawn live over the footage inside the film: the brand bar grows, the card
unrolls, the words rise in, and it fades out after the tone's hold time.

Add one by adding it to a sequence entry:

```js
{
  id: "04-feature",
  from: "capture",
  lowerThird: { kicker: "Discovery", title: "The AI explores your app" },
}
```

`kicker` is 1–2 words in brand orange. `title` is a short phrase. Keep the
title under about 40 characters — it is a caption, not a sentence.

It arrives `timing.lowerThirdIn` (0.32s) after the scene's narration starts.
Keep focus moves clear of it (see [10 Direction](10-direction.md)).

## Gotchas

**Fonts must be bundled, not linked.** `fonts.ts` loads through
`@remotion/google-fonts` for a reason: the renderer screenshots frames
headlessly and will happily capture a frame before a network font has arrived.

**No CSS transitions.** Each frame is rendered independently, so a transition
has nothing to transition from. Drive everything from `frame`.

**No `Date.now()`, no `Math.random()`.** Frames must be deterministic — the
same frame number must always produce the same image, or the render flickers.
Use `useCurrentFrame()`, and Remotion's `random()` if you need noise.

**Absolute positioning inside a padded flex parent.** `Pipeline`'s rail is
positioned at `top: 27` relative to the steps row. Adding padding to that row
moves the nodes but not the rail. Adjust both, or use margins.

**Renders are slow-ish.** One to four minutes for a few scenes at 1600×900. Use
Studio to iterate, and render only at the end.

## Next

- **[06 Styling](06-styling.md)** — the design system
- **[Prompt: build a composition](prompts/03-remotion.md)**
