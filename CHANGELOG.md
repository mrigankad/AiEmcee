# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/mrigankad/AiEmcee/releases/tag/v1.0.0
