# 07 · Compositing

What `npm run compose` (`scripts/compose.mjs`) does, and where to change it.

## The six steps

```
timeline ──▶ stage ──▶ picture ──▶ sound ──▶ master ──▶ review
```

### 1. timeline — `scripts/lib/timeline.mjs`

Turns `video.config.mjs` + `tts/durations.json` into `work/timeline.json`,
the one clock everything else is cut to.

- Every scene owns exactly `durations[id] + timing.gap` seconds. This is the
  metronome rule, unchanged.
- The intro sting owns its own length + `timing.introTail`; the end card owns
  `timing.endHold`.
- Each scene's transition (from the tone, or the scene's own `transition`)
  becomes a `lead`: the scene is on screen that many seconds *before* its slot,
  under the tail of the previous one, in the silent gap.
- Lower thirds, focus moves and sound cues are placed on the same clock.

### 2. stage

Footage (`raw/*`, intro, outro) is hard-linked into `remotion/public/film/media/`
and the timeline is written to `remotion/public/film/timeline.json`, where the
motion engine's bundle can read them. The directory is regenerated on every compose
and is git-ignored.

### 3. picture — `remotion/src/film/`

One composition, `Film`, renders the whole video silent to `work/film.mp4`
(H.264 from PNG frames at CRF 12, a near-lossless intermediate).

| File | Does |
| --- | --- |
| `Film.tsx` | lays every segment, title and wipe edge on the timeline; top/tail fade |
| `transitions.tsx` | `cut`, `fade`, `dip`, `zoom`, `push`, `wipe`, as pure functions of progress |
| `Footage.tsx` | product footage: slow push, focus moves (zoom, dim, ring, label), grade, vignette; holds the last frame if a file runs short |
| `tone.tsx`, `tones.json` | the tone presets, provided to every primitive |

Motion scenes render inline at exactly their slot length (a `<Sequence>`
reports its own duration to `useVideoConfig`). Under the incoming transition
they hold frame 0, so hand-timed beats still land on their words.

Scrub the whole film with `npm run studio` → `Film` after one compose.

### 4. sound — `scripts/lib/sound.mjs`

Everything is placed by absolute time with `adelay`, from the timeline:

```
intro audio + narration lines ──┬──────────────────────────────┐
                                └─(sidechain key)─┐            │
music bed ── normalise ── volume ── fades ── sidechaincompress ─┤── amix ── loudnorm (2-pass) ──▶ mix.wav
effects (whoosh, title, focus, outro) ── volume ───────────────┘
```

- The bed is ducked by the narration (fast attack, 650ms release), so it sits
  under the voice and breathes up in the gaps.
- The whoosh is synthesised per transition length; other effects come from
  `assets/sfx/`.
- The master is normalised to -16 LUFS integrated, -1.5 dBTP.

### 5. master

`work/film.mp4` + `mix.wav` → `out/<name>.mp4` with the final encode settings
from `config.encode`. The poster (`out/<name>.jpg`) is grabbed from the film
and overlaid on frame 0 only (`overlay=enable='eq(n,0)'`), replacing that
frame, so duration and sync are unchanged.

### 6. review — `scripts/lib/review.mjs`

Stills of every scene (settled), transition (mid-way), title and focus move,
in `out/review/`, with `index.json` and a labelled `contact-sheet.jpg`.

## Sync

```
video    125.93s
audio    125.92s
drift    0.013s
```

Printed on every build. Picture length is `round(total × fps)` frames; audio
is trimmed to `total`. Anything over 0.1s means the timeline and a render
disagree, which should not happen; re-run a full compose.

## Iterating

```bash
npm run compose -- --sound-only   # re-mix and re-master against the last picture
```

A full compose re-renders only the chunks that changed (cached in
`work/chunks/master/`); a cold render still takes a while on a laptop. Iterate on single motion scenes in the studio, and on focus boxes with the
gridded contact sheets described in [10 Direction](10-direction.md).

## Fast engine

`compose --fast`, `compose --draft`, or `render: { mode: "fast" }` in a
project config. Code: `scripts/lib/fast.mjs` and `scripts/lib/stills.mjs`.
Like the default engine, it renders the same `Film` composition on AiEmcee
Motion from the same timeline, so sound,
master and review are unchanged; what changes is how the picture is made.

| | default engine | `--fast` | `--draft` |
| --- | --- | --- | --- |
| renderer | AiEmcee Motion, one cached bundle, parallel pages, chunks | same as default | same as fast |
| frames | PNG | JPEG q90 | JPEG q72, 1280x720 |
| picture encode | crf 12 | crf 14, x264 veryfast (MPEG-TS chunks) | crf 23, ultrafast |
| master encode | `encode.final` (slow, crf 14) | `-preset veryfast -crf 17` | `-preset veryfast -crf 25` |
| output | `out/<name>.mp4` | `out/<name>.mp4` | `out/<name>-draft.mp4`, `out/review-draft/` |
| reuse | per chunk, `work/chunks/master/` | per chunk, `work/chunks/<mode>/` | per chunk |

**Colour.** JPEG frames are encoded as BT.601 full range (yuvj420p, tagged
so), and ffmpeg-drawn stills are written the same way, so every chunk matches.
The master converts once to BT.709 limited range, like the default engine's
output. (Under the old Remotion renderer, `colorSpace: "bt709"` was tried and shifts saturated
colours, e.g. an orange (247,131,90) came out (255,138,86).)

**Chunks.** The film is cut on its own seams: a scene's settled body (split
into pieces of at most 300 frames, counted from the body's start) and each
transition between two scenes. A chunk's key hashes what it can show: its
scenes with times made relative to the chunk, their media files (size and
mtime), lower thirds and avatar inside it, the fades, the tone, the tokens,
every file in `remotion/src`, the shared `remotion/public` art (by size and
mtime), and the profile. Changing one scene's narration, footage or focus
re-renders that scene and its two transitions; the rest is reused, even
though everything after it has moved in time. Unused chunks are pruned.

**Stills.** `from: "still"` scenes (`still: { src, zoom, pan, ease }`) render
on the motion engine through `remotion/src/film/Still.tsx`. A body chunk that shows
only the still (no lower third, no avatar) is drawn by ffmpeg instead:
the image is scaled once onto a 2x canvas and `zoompan` crops it straight to
the frame size (half-pixel steps), with the same easing and clamping as `Still.tsx`.
`render.nativeStills: false` turns this off.

**Up to date.** Each fast compose writes `work/stamp-<mode>.json`: a hash of
every chunk key, the timeline's audio, the sound, timing, encode and poster
settings and the tts files. `--if-changed` exits in under a second when it
matches and the output exists. `batch` passes it unless you give `--force`.

**Knobs** (`render.fast` or `render.draft` in a project config merge over the profile):

```js
render: {
  mode: "fast",                    // make fast the default for this project
  publicDeps: ["mfg-01-art"],      // key only on these remotion/public folders
  fast: { crf: 14, jpegQuality: 90, x264Preset: "veryfast", pages: 6, pieceFrames: 300,
          final: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-profile:v", "high"] },
}
```

With `poster: { bake: false }` and no ffmpeg-drawn stills, the master copies
the picture instead of re-encoding it.

**Batch.**

```bash
node bin/aiemcee.mjs batch --projects "projects/uc-*" --fast [--jobs 1] [--stages narrate,compose] [--force]
```

Films run `--jobs` at a time (default 1: a compose already fills every core,
and two at once measured no faster) and split the cores between them. Each stage's log goes to `<project>/work/batch-<stage>.log`.

**Hardware encoders.** This machine's ffmpeg lists `h264_amf` and `h264_qsv`,
but neither opens (AMF error 30, QSV has no Intel GPU), so encoding stays on
x264. Rendering frames, not encoding, is where the time goes.
