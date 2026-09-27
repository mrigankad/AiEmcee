# 02 · Architecture

How the four stages fit together, and the decisions behind them.

## The central idea

**Audio is the metronome.**

Every conventional video workflow does this backwards: record picture, then
fight to fit a voiceover to it. That fight is the reason video editing is
manual work.

This pipeline inverts it. The script is synthesised first, each line's exact
duration is measured with `ffprobe`, and those numbers are written to
`tts/durations.json`. Everything downstream reads them:

- **capture** holds the last frame of a scene until the clip outlasts its line
- **compose** gives every scene exactly `narration + gap` on one timeline
- **compose** renders the picture and mixes the sound from that same timeline

Two timelines generated from one source of truth cannot drift. That is the
whole trick, and it is why nothing here has a sync step.

## Stage by stage

### 1. narrate — `scripts/narrate.mjs`

```
narration.json ──▶ edge-tts ──▶ tts/<id>.mp3
                                tts/<id>.txt        (cache key)
                                tts/durations.json  (the metronome)
```

Edge TTS is Microsoft's neural voice service, driven through the `edge-tts`
CLI. It is free, needs no API key, and the quality is good enough to ship.

The `.txt` sidecar next to each MP3 holds the exact text that produced it. On
the next run, a byte-identical match means nothing is re-synthesised. Rewriting
one line costs one round trip, not thirteen.

`durations.json` is regenerated on every run, including for cached lines, so it
is always complete even when you narrate a single scene.

### 2. motion — `remotion/src/`

Remotion renders React components to video, frame by frame, in headless
Chromium. It is used for three things, all rendered inside the one `Film`
composition by `compose`:

**Explainer scenes** (`from: "motion"`) — full frames that make an argument
rather than showing a UI. The problem statement, the how-it-works diagram, the
end card. Their copy lives in `remotion/src/scenes.ts`.

**Lower thirds** (`lowerThird: {...}`) — the animated title cards that name a
section, drawn live over the footage.

**Direction** — transitions between scenes, and the camera and focus moves
inside product footage. See [10 Direction](10-direction.md).

`npm run motion` renders single motion scenes to `remotion/out/` for
previewing; the film itself does not need it.

### 3. capture — `scripts/capture.mjs`

```
scenes.mjs + your running app ──▶ Playwright ──▶ raw/<id>.webm
```

Playwright drives a real Chromium against your real app and records it.

**One browser context per scene.** This is what produces one video file per
scene rather than one long take. A scene that goes wrong is re-recorded on its
own in twenty seconds. It also means a crash in scene nine does not cost you
scenes one through eight.

**A virtual cursor.** Playwright moves a real mouse but draws nothing, so
footage of it is a UI reacting to an invisible hand. `scripts/lib/scene.mjs`
injects an SVG arrow before any page script runs, and moves it with
`easeInOutQuad` — slow out of rest, quick through the middle, slow into the
target. Clicks emit an expanding ring. This is the single biggest difference
between footage that reads as a person and footage that reads as automation.

**Record against production.** `capture` also force-hides framework error
portals (`config.capture.hide`) as a second line of defence, but the real
protection is that a production build cannot render a dev overlay at all.

**Scenes never fail the run.** A missed selector is caught, logged as a
warning, and the clip is still written — so you can watch it and see exactly
where the choreography went wrong.

**The tail is held, not frozen.** After choreography finishes, the browser sits
on the final frame until the clip outlasts its narration plus `timing.tailPad`.
Holding a live page is not the same as freezing a frame: timers keep ticking,
carets keep blinking, and the shot stays alive.

### 4. compose — `scripts/compose.mjs`

```
config + durations ──▶ timeline ──┬──▶ Remotion Film ──▶ picture ─┐
raw/* + tts/*.mp3 ────────────────┴──▶ ffmpeg mix    ──▶ sound   ─┴──▶ out/demo.mp4
```

**timeline** — every scene gets exactly `narration + gap` seconds; transitions,
titles, focus moves and sound cues are placed on the same clock.

**picture** — one Remotion composition renders the whole film, silent.

**sound** — narration, a ducked music bed and effects are placed by absolute
time and loudness-normalised.

**master** — picture and sound are muxed, with the poster baked in as frame 0,
and review stills are written to `out/review/`.

Then it prints the drift between picture and sound. Under a few hundredths of
a second is correct. The detail is in [07 Compositing](07-compositing.md).

## Data flow

```
                       narration.json
                             │
                             ▼
                      ┌─────────────┐
                      │  narrate    │
                      └──────┬──────┘
                             │
                    tts/durations.json
                     (the metronome)
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │   clip   │   │ capture  │   │ compose  │
        └────┬─────┘   └────┬─────┘   └────┬─────┘
             │              │              │
        raw/*.mp4       raw/*.webm         │
             └──────────────┴──────────────┘
                             ▼
                       out/demo.mp4
```

`video.config.mjs` and `design.tokens.json` feed every box.

## Why the config is shaped this way

**`design.tokens.json` is JSON, not JavaScript,** because it has to be read
from two runtimes: Node (`video.config.mjs`) and TypeScript inside Remotion's
bundler (`remotion/src/theme.ts`). JSON is the only format both consume without
a build step. Frame size and frame rate live there for the same reason — if the
compositor and the compositions disagreed about 1600×900, every motion scene
would be silently rescaled.

**`sequence` is the single source of truth for the running order.** Reordering
the film is reordering that array. Nothing else knows the order — not
`render.mjs`, not `compose.mjs`, not `scenes.mjs`.

**Choreography lives in `scenes.mjs`, not in `capture.mjs`.** Machinery and
content are different kinds of file with different rates of change. You will
rewrite choreography constantly and touch the recorder almost never.

## Extending it

| To add | Do this |
| --- | --- |
| A recorded scene | entry in `narration.json` → entry in `sequence` → function in `scenes.mjs` |
| An explainer scene | new composition in `remotion/src/compositions/` → add it and its copy to `MOTION` in `scenes.ts` (and `Root.tsx` for the studio) → `{ from: "motion", composition: "..." }` |
| A title card | add `lowerThird: { kicker, title }` to a sequence entry |
| A logo sting | drop the file in `assets/`, set `intro: { src: "assets/sting.mp4" }` |
| Background music | `sound.music` — see [10 Direction](10-direction.md#sound) |
| A zoom onto part of the UI | `focus: [{ at, until, box, label }]` — see [10 Direction](10-direction.md#focus-moves) |
| A different aspect ratio | change `video` in `design.tokens.json`; everything follows |

## Next

- **[03 Writing narration](03-writing-narration.md)**
- **[07 Compositing](07-compositing.md)** — timeline, picture, sound
- **[10 Direction](10-direction.md)** — tone, transitions, focus moves
