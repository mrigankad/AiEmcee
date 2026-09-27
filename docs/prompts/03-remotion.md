# Prompt 03 · Motion graphics

Produces Remotion compositions — the frames that make an argument rather than
showing a UI.

---

## Rewriting the copy in the existing scenes

Most of the time this is all you need. The compositions are prop-driven.

```
Read docs/05-motion-graphics.md.

Rewrite the props for Problem and Pipeline in remotion/src/scenes.ts
using scenes 02-problem and 03b-pipeline from narration.json.

Problem takes three beats. Each beat needs:
  - kicker: 1-3 words, the frame ("Weeks of setup")
  - title:  the claim, under 5 words
  - body:   one sentence expanding it
  - at:     the frame it lights up on

Time the `at` cues against the narration. Scene 02-problem is 11.4s; play
tts/02-problem.mp3 to find where each claim is spoken and wrap the second
in sec(). Cue about 0.2s early — a beat that lands late reads as broken.

Pipeline takes six steps (id, label, hint) and a payoff strip showing
something broken becoming something correct.

Also set durationInFrames for both from the narration lengths, with about
half a second of headroom. If a composition is shorter than its line,
compose freeze-frames the tail.
```

---

## Adding a new composition

```
Read docs/05-motion-graphics.md and remotion/src/components/Motion.tsx.

Add a <NAME> composition to remotion/src/compositions/.

WHAT IT SHOWS
  <one sentence>

CONTENT
  <the actual copy, or the shape of the props it should take>

TIMING
  <N>s, matching narration scene <id>.
  <what happens when — "the three cards stagger in over the first
  second, then the total counts up as the narrator says it">

CONSTRAINTS
  - Use only the primitives in components/Motion.tsx: Page, FadeUp,
    Trace, Card, Eyebrow. Do not invent a new entrance animation.
  - Every colour from theme (design.tokens.json). No literal hex values.
  - Every font from fonts.ts.
  - Type sizes from the scale in docs/06-styling.md. Nothing below 14px.
  - Deterministic: no Date.now(), no Math.random(), no CSS transitions.
    Every frame must be a pure function of useCurrentFrame().
  - Props typed and exported, so scenes.ts can use `satisfies`.

Then add it with sensible props to MOTION in scenes.ts (and Root.tsx for the studio), add it to the
sequence in video.config.mjs as a motion scene, and run
`npm run motion -- <NAME>`.
```

---

## The end card

```
Update endCardProps in remotion/src/scenes.ts:

  mark:    "<file>.svg"   (I have put it in remotion/public/)
  title:   "<Product>"
  kicker:  "<one-line positioning statement>"
  tagline: "<the call to action, six words or fewer>"

Set durationInFrames to match timing.endHold in video.config.mjs.
```

---

## Lower thirds

These are config, not components:

```
Add lower thirds to the six capability scenes in video.config.mjs.

Kickers are 1-2 words naming the area ("Discovery", "Application map",
"Quality gates"). Titles are the takeaway, under 40 characters, no full
sentences and no trailing punctuation.

Base them on the narration for each scene. Then `npm run motion`.
```

---

## Reviewing a render

Claude can read the frames it produced:

```
Pull a frame from the middle of each motion scene and look at them:

  ffmpeg -i remotion/out/problem.mp4 -ss 8 -frames:v 1 -y /tmp/problem.png
  ffmpeg -i remotion/out/pipeline.mp4 -ss 11 -frames:v 1 -y /tmp/pipeline.png

Check: vertical balance, no large dead areas, type hierarchy reads at a
glance, nothing clipped at the edges, and every label legible at 50% size.
Tell me what is wrong before changing anything.
```

---

## Follow-ups

**Layout**

```
The Pipeline steps sit too high and there is a void below them. The rail
should float in the middle of the space between the headline and the
payoff strip.
```

**Timing**

```
The Problem beats all light up in the first three seconds, but the
narration spreads them across eleven. Re-time the `at` cues to 0.3s,
3.6s and 7.1s.
```

**Too busy**

```
The Metrics scene has five stats and it is unreadable at a glance. Cut to
three, and make the numbers twice the size of the labels.
```

**Off-brand**

```
The new composition uses a blue accent. There is one brand hue in this
system — use theme.brand / brandLight / brandDeep. If it needs a second
material, that material is a neutral.
```

---

## Checking the result

```bash
npm run motion
npm run studio     # scrub the timeline; the only sane way to time a scene
```

- composition duration >= narration duration for that scene
- beats cue with the words, or just before
- a frame at 50% is still legible
- nothing enters in a way nothing else enters
