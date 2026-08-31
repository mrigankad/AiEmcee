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
- **compose** cuts every clip to exactly `narration + gap`
- **compose** builds the audio track from the same numbers, in the same order

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

### 2. motion — `remotion/render.mjs`

```
video.config.mjs sequence ──▶ Remotion ──▶ remotion/out/<composition>.mp4
                                           remotion/out/lt-<id>.png
```

Remotion renders React components to video, frame by frame, in headless
Chromium. It is used here for two things:

**Explainer scenes** (`from: "motion"`) — full frames that make an argument
rather than showing a UI. The problem statement, the how-it-works diagram, the
end card.

**Lower thirds** (`lowerThird: {...}`) — the animated title cards that name a
section. These render as a single **transparent PNG still**, not as video.
`compose` then fades one in and out over the footage with ffmpeg. One still
composited eight times is far cheaper than eight video renders, and it keeps
the fade timing with the rest of the edit where it belongs.

There is no separate list of things to render. `render.mjs` reads the sequence:
add a motion scene and it renders, remove it and it stops.

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
raw/*.webm + remotion/out/* + tts/*.mp3 ──▶ ffmpeg ──▶ out/demo.mp4
```

Four passes:

**normalise** — every clip is forced to the exact same width, height, frame
rate, pixel format and duration. Short clips hold their last frame (`tpad`);
long clips are trimmed. This uniformity is not cosmetic — it is what lets the
next step stream-copy.

**title** — for scenes with a `lowerThird`, the PNG is overlaid with an alpha
fade in and out.

**concat** — the normalised clips are joined with ffmpeg's concat demuxer using
`-c copy`. No re-encode, because every clip already matches. The audio track is
built the same way, from narration WAVs interleaved with silence of exactly
`timing.gap`.

**mux** — the silent cut and the narration track are combined in one final
encode, with fades at the top and tail.

Then it prints the drift between the two timelines. Under a few milliseconds is
correct; anything above `0.15s` means a scene is in one list and not the other.

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
        │  motion  │   │ capture  │   │ compose  │
        └────┬─────┘   └────┬─────┘   └────┬─────┘
             │              │              │
      remotion/out/     raw/*.webm         │
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
| An explainer scene | new composition in `remotion/src/compositions/` → register in `Root.tsx` → `{ from: "motion", composition: "..." }` |
| A title card | add `lowerThird: { kicker, title }` to a sequence entry |
| A logo sting | drop the file in `assets/`, set `intro: { src: "assets/sting.mp4" }` |
| Background music | see [07 Compositing](07-compositing.md#adding-a-music-bed) |
| A different aspect ratio | change `video` in `design.tokens.json`; everything follows |

## Next

- **[03 Writing narration](03-writing-narration.md)**
- **[07 Compositing](07-compositing.md)** — the ffmpeg detail
