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
Remotion bundle can read them. The directory is regenerated on every compose
and is git-ignored.

### 3. picture — `remotion/src/film/`

One composition, `Film`, renders the whole video silent to `work/film.mp4`
(H.264, CRF 16, a high-quality intermediate).

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

A full compose re-renders the picture: minutes, not seconds, on a laptop.
Iterate on single motion scenes in the studio, and on focus boxes with the
gridded contact sheets described in [10 Direction](10-direction.md).
