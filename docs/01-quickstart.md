# 01 · Quickstart

From a clean clone to a finished video. Budget about an hour for your first
one, most of it spent writing the script rather than running commands.

## 1. Install

```bash
git clone <your-fork> claude-video-generation
cd claude-video-generation
npm run setup
npm run doctor
```

`npm run setup` installs the pipeline's dependencies, Remotion's dependencies,
and the Chromium build Playwright drives. `npm run doctor` then verifies every
external tool and prints the exact fix for anything missing:

```
  ok  node >= 20              v22.17.0
  ok  ffmpeg                  8.0.1
  ok  ffprobe                 8.0.1
  ok  edge-tts                7.2.7
  ok  playwright chromium     installed
  ok  remotion dependencies   installed
  ok  project config          6 narration lines, 4 captured + 2 motion scenes

All good. Run `npm run build`.
```

Fix anything marked `--` before continuing. The most common miss is `edge-tts`:
`pip install edge-tts`, then open a new terminal so PATH updates.

## 2. Get your app running

Capture drives a real browser against a real server.

**Run a production build, not a dev server.** A dev server can render an error
overlay, a hydration warning or a hot-reload toast at any moment, and there is
no way to remove that from footage afterwards.

```bash
# in your product's repo
npm run build && npm run start -- --port 3100
```

Then point the pipeline at it, in `video.config.mjs`:

```js
capture: {
  baseUrl: process.env.BASE_URL ?? "http://localhost:3100",
}
```

`BASE_URL` overrides it per run, which is handy for recording against staging:

```bash
BASE_URL=https://staging.acme.com npm run capture
```

**Seed your data first.** The demo should show a populated, believable account —
real-looking names, a run that has actually completed, a chart with a shape.
Empty states make a product look unfinished. This is worth more to the final
video than any amount of tuning downstream.

## 3. Write the script

Edit `narration.json`. One entry per scene:

```json
{
  "id": "04-feature",
  "title": "The thing that wins the demo",
  "text": "Now Acme explores your application like a real user. It crawls every page, maps complete journeys, and listens to network traffic to discover your APIs, automatically."
}
```

`id` is the join key for the entire pipeline — the MP3, the recorded clip, the
sequence entry and the lower third all key off it. `title` is a note to
yourself and never appears on screen.

Write the whole script before recording anything. The narration decides how
long each scene is, so the script has to exist before there is anything to
time the browser against.

See **[03 Writing narration](03-writing-narration.md)** for structure and pacing.

## 4. Synthesise the voiceover

```bash
npm run narrate
```

```
spoke   01-hook             10.61s   27 words  153 wpm
spoke   02-problem          10.58s   23 words  130 wpm
...
narration 62.9s + gaps 2.7s + cards 3.2s = about 1m 09s of finished film
```

Read the words-per-minute column. **130–150 wpm is the target.** Above 160 the
narrator sounds rushed and the viewer cannot keep up with the UI; below 120 it
drags. Fix pace by editing the words, not by changing `tts.rate` — a sentence
that is too long is better cut than read faster.

Then listen to the MP3s. Edge TTS mispronounces product names, acronyms and
anything unusual. Fixes that work:

- spell it out phonetically: `Parikshan` → `Pareekshan`
- add a comma to force a pause
- split a long sentence into two

Re-running is cheap: `narrate` caches on the exact text, so only lines you
changed are re-synthesised.

## 5. Set the running order

In `video.config.mjs`, `sequence` is the film:

```js
sequence: [
  { id: "01-hook", from: "capture" },
  { id: "02-problem", from: "motion", composition: "Problem" },
  { id: "03-onboarding", from: "capture" },
  {
    id: "04-feature",
    from: "capture",
    lowerThird: { kicker: "Discovery", title: "The AI explores your app" },
  },
  { id: "05-cta", from: "capture" },
],
```

- `from: "capture"` — recorded from your app, needs a function in `scenes.mjs`
- `from: "motion"` — rendered by Remotion from `composition`
- `lowerThird` — an animated title card, composited over the scene

Every `id` must exist in `narration.json`. If it does not, the pipeline fails
immediately with a clear message rather than twenty minutes into a render.

## 6. Choreograph the recorded scenes

Edit `scenes.mjs`. One exported function per captured id:

```js
"04-feature": async (s) => {
  await s.goto("/projects/demo/discovery");
  await s.wait(9.8);   // the page animates itself; stay out of the way
  await s.wait(1.2);
},
```

Storyboard against the narration length `narrate` printed. If the line is 12.3
seconds, the choreography gets 12.3 seconds of beats.

See **[04 Scene choreography](04-scene-choreography.md)** for the full API and
the timing method.

## 7. Render, record, cut

```bash
npm run motion     # Remotion: explainers + lower thirds
npm run capture    # Playwright: your app
npm run compose    # ffmpeg: the finished film
```

`compose` prints a drift line. It should be under a few milliseconds:

```
video   68.83s
audio   68.83s
drift   0.005s
final   68.83s  ->  out/demo.mp4
```

Anything above 0.15s means a scene is missing from one of the two timelines.

## 8. Iterate

Watch it. Then fix one thing at a time:

```bash
npm run narrate -- 05-cta    # reworded a line
npm run capture -- 05-cta    # scene was mistimed
npm run motion  -- Problem   # explainer needs work
npm run compose              # always, to see the change in context
```

`compose` re-cuts the whole film in well under a minute, so there is no reason
to skip it.

## What to expect

| Stage | Time for a 3-minute video |
| --- | --- |
| narrate | ~20s (seconds when cached) |
| motion | 1–4 minutes |
| capture | roughly real time — the browser drives the scenes live |
| compose | 30–90s |

Writing the script is the long pole. The build is not.

## Next

- **[02 Architecture](02-architecture.md)** — how it fits together
- **[08 Prompting Claude](08-prompting-claude.md)** — hand the work to Claude Code
