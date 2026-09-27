# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] — 2026-09-27

### Added

- **Direction.** Every film is now directed, adapting the creative system of
  [/brag](https://github.com/latent-spaces/brag) to long-form narrated demos.
  See [docs/10-direction.md](docs/10-direction.md).
  - **Tones**: `polished` (default), `default`, `cinematic`, `app-store`,
    `deadpan`. Each sets transitions, camera push, focus zoom, colour grade,
    motion springs, title hold and sound cues. Set with `direction.tone`;
    any field can be overridden.
  - **Transitions** between every scene: `cut`, `fade`, `dip`, `zoom`,
    `push`, `wipe`. They sit in the silent gap before each line, so the voice
    always lands on a settled picture. Per-scene `transition` override.
  - **Focus moves** inside product footage: `focus: [{ at, until, box, label }]`.
    The camera eases in on a region of the UI, dims the rest, rings it and
    labels it.
  - **Sound design**: a music bed (`sound.music`, your own track or a
    synthesised ambient pad) ducked under the narration by a sidechain
    compressor; effects cued from the edit (a synthesised whoosh per
    transition, Kenney CC0 UI sounds for titles, focus moves and the end
    card); two-pass loudness normalisation to -16 LUFS / -1.5 dBTP.
  - **Poster frame** (`poster: { scene, at }`), written next to the video and
    baked in as frame 0.
  - **Review stills**: `out/review/`, one still per scene, transition, title
    and focus move, plus a labelled contact sheet.
  - **`/emcee`**, a Claude Code skill (`.claude/skills/emcee`) that directs a
    film end to end: inspects the footage on a grid, places focus moves,
    builds, reviews the stills, fixes, and writes share copy.
  - **The Wayam avatar**, an AI presenter: an original orb in the Wayam
    gradient that moves with the narration's loudness, pulses rings as it
    speaks, blinks and changes mood (`neutral`, `happy`, `curious`,
    `focused`), and shows the line as word-by-word captions. Per scene:
    `avatar: "host" | "corner" | "off"` or `{ mode, mood }`. One continuous
    presenter moves between poses on the transition clock, and fades back
    when a focus move reaches its corner. `narrate` now writes
    `tts/<id>.srt` for caption timing.
  - **Directed voice.** `narrate` speaks each line a sentence at a time,
    with prosody from the line's `delivery` intent (`hook`, `problem`,
    `explain`, `feature`, `payoff`, `close`) and a contour within the line;
    joins sentences with set pauses and `[beat]` markers; and masters the
    voice (warmth, presence, de-ess, compression, -18 LUFS).
    `npm run narrate -- --audition` compares voices by ear. Takes are cached
    by `tts/<id>.take.json`.
  - `KineticLine`, a word-by-word headline primitive, now used by `Problem`,
    `Pipeline` and `EndCard`, with an optional `highlight` word in brand colour.
- `npm run compose -- --sound-only` re-mixes and re-masters against the last
  rendered picture.

- **`clip`** — a fifth pipeline stage, and a `from: "clip"` scene source. Cuts
  scene footage out of an existing recording instead of driving a live app,
  for products that cannot be run locally but already have a screencast. Takes
  `clip: { src, start, end, speed }`; obeys the same metronome as `capture`, so
  every clip is cut long enough that `compose` never freeze-frames a tail.
- `outro: { src }` — close on a pre-made file, not only a Remotion
  composition, so a brand's own animated mark can be used as the end card.
- `brandAlpha()` in the Remotion theme, so a composition never has to write an
  rgba() literal to tint the brand colour.

### Changed

- **Compositing.** The picture is now rendered as one Remotion composition
  (`Film`) from a timeline (`work/timeline.json`), instead of per-scene ffmpeg
  normalise + concat. Motion scenes and lower thirds render inline at their
  exact slot lengths; `npm run motion` is now only for previewing single
  scenes, and `build` no longer runs it. The metronome rule is unchanged:
  every scene is still exactly `narration + gap`.
- **Lower thirds** animate in the film (bar grows, card unrolls, words rise)
  instead of being a still faded by ffmpeg.
- Motion-scene copy moved from `Root.tsx` to `remotion/src/scenes.ts`, which is
  also the registry the Film looks scenes up in. `validate` checks it, and
  now also checks tones, transitions, focus boxes, the poster and sound assets.
- **RE-DOMS cut.** `08-summary` no longer runs into the burned-in "Module
  reconciliation" title card; `04` and `05` are slowed slightly so their
  footage covers the transition lead without holding a frame.

- **Motion.** `Problem` now stages its claims in three states rather than two —
  unmade, live, made — with a spring entry, a numeral that fills on the live
  claim, and a trace that steps from claim to claim instead of crawling at a
  constant rate. `Pipeline` gives each node a spring pop and an expanding ring
  as the head reaches it, rides a lit head along the rail, raises the labels in
  behind, and holds the payoff strip back until the rail is home. The rail is
  centred in the space it has instead of being pushed under the headline by
  competing auto margins.
- **Lower thirds** now rise into place as they fade in, rather than only
  fading, and carry a heavier card, a flush brand bar, a kicker dot and the
  product mark.
- **Motion atmosphere.** Explainer pages sit on a datasheet grid with a slow
  brand wash. `Problem` lays its three claims out as evidence documents. 
  `Pipeline` uses stage icons and a module nameplate that fills in as the rail
  advances, so the lower half of the frame is never empty.
- **RE-DOMS cut.** Opens on aerial footage of the modules, then the workspace.
  Product clips skip burned-in title cards and the empty PDI mismatch tab.
  The summary scene is the real dashboard. Product UI gets a slow push-in.

### Fixed

- `narrate` could not slow a voice down. `--rate -3%` was passed as two
  arguments, and edge-tts parses with argparse, which reads a leading-dash
  value as an option. Now `=`-joined.
- `doctor` failed on a missing Chromium even when the sequence has no captured
  scenes. The browser check is now skipped, and reported as skipped.
- `capture` crashed `npm run build` on a film with no captured scenes: it
  imported Playwright at module load and exited non-zero. Playwright is now
  imported only when there is something to record.
- The `Card` primitive hardcoded the old brand orange, so an active card kept
  rendering the previous palette after a rebrand — exactly the failure
  `design.tokens.json` exists to prevent. It reads the token now.

## [1.0.0] — 2026-08-31

First release.

### The pipeline

- **`narrate`** — `narration.json` to `tts/*.mp3` plus `durations.json`, via
  Edge TTS. Caches on exact text, so a reworded line costs one round trip
  rather than a full rebuild. Reports words-per-minute per line.
- **`motion`** — Remotion renders explainer scenes and transparent lower-third
  stills, driven by the sequence in `video.config.mjs` rather than a second
  list to keep in sync.
- **`capture`** — Playwright drives a production build of the target app. One
  browser context per scene, an injected eased virtual cursor with click
  ripples, and a held live tail so no clip ever runs short of its narration.
- **`compose`** — ffmpeg normalises every clip to identical parameters,
  composites titles, stream-copy concatenates, and muxes the narration with
  fades. Reports drift between the audio and video timelines on every build.

Audio is the metronome: each line is measured with `ffprobe` and every clip is
cut to `narration + gap`, so the two timelines are generated from one set of
numbers and cannot drift.

### Tooling

- **`doctor`** — preflight for Node, ffmpeg, ffprobe, edge-tts, Chromium and
  the Remotion install, printing the fix next to anything missing.
- **`validate`** — config and choreography checks that need no external tools:
  duplicate ids, sequence entries with no choreography, unregistered
  compositions, a lower third on a motion scene, a viewport that disagrees
  with the render size.
- **`aiemcee init`** — scaffolds a complete standalone project.

### Compositions

`Problem`, `Pipeline`, `EndCard` and `LowerThird`, all prop-driven, built from
a deliberately small motion vocabulary (`Page`, `FadeUp`, `Trace`, `Card`,
`Eyebrow`) so a finished video reads as one designed piece.

### Configuration

Four files hold all project state: `narration.json`, `scenes.mjs`,
`video.config.mjs` and `design.tokens.json`. Tokens are JSON so the Node
pipeline and Remotion's TypeScript bundler read frame size, frame rate and
brand colours from one place.

### Documentation

A nine-chapter handbook, a five-prompt library for driving the repo with
Claude Code, and `examples/parikshan` — a complete shipped three-minute film
with its script, durations and choreography annotated.

### Notes

- Windows paths containing spaces are handled by putting Remotion's bin
  directory on `PATH` and passing only relative paths to its CLI, rather than
  quoting arguments through a `.cmd` shim.
- No generated media is committed. `raw/`, `tts/`, `work/`, `out/` and
  `remotion/out/` all rebuild from source.

[Unreleased]: https://github.com/mrigankad/AiEmcee/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/mrigankad/AiEmcee/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/mrigankad/AiEmcee/releases/tag/v1.0.0
