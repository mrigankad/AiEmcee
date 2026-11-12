# 12 · Engine roadmap: faster, lighter, and a studio

The plan for what comes after the fast chunk engine (`scripts/lib/fast.mjs`).
This page comes first. The code follows it, phase by phase.

> **2026-11-12: Remotion replaced by AiEmcee Motion.** The picture engine no
> longer uses Remotion. AiEmcee Motion (`remotion/engine/` and
> `scripts/lib/motion/`) bundles the unchanged scenes with esbuild (about 0.3 s,
> cached) and renders them in headless Chromium pages piped into ffmpeg. Every
> profile (default master, `--fast`, `--draft`) and `npm run studio` run on it.
> Its spring, interpolate and Easing output matches Remotion 4.0.518 bit for bit
> (60,003 values). On the smoke film (14.2 s, 1080p60, 4K footage): fast render
> 31.8 s vs 260.6 s on Remotion, default master 41.8 s, cached re-render 0.6 s,
> SSIM 0.995 against the Remotion render. Mentions of Remotion below describe
> the plan as it was written before this change.

## Where the time goes today

A film is four stages, and every stage runs **one thing at a time**:

| Stage | What it does now | Flaw |
| --- | --- | --- |
| narrate | One line, then one sentence, then the next. Each sentence is a blocking `edge-tts` call plus 2-3 blocking ffmpeg calls | Network-bound work runs serially. 13 lines × 3 sentences ≈ 40 round trips back to back |
| capture | Records scene N, **then** assembles scene N's PNGs into lossless H.264, **then** opens scene N+1 | The browser sits idle while ffmpeg encodes, and ffmpeg sits idle while the browser records |
| compose | Picture (Remotion / fast chunks), **then** sound mix, **then** master, **then** review | The sound mix only depends on the timeline, but it waits for the whole picture to finish |
| every run | New Node process per stage, new Chromium per stage, Remotion bundle checked per compose | Fixed cost paid again on every build. A one-word change still cold-starts everything |

Other flaws:

- **Cache keys use mtime** (`fileStamp`). Touching a file or re-capturing a byte-identical clip invalidates its chunks.
- **There is no single process that knows the state of a film.** The CLI reruns everything, and nothing keeps warm state (browser, bundle, timeline) between edits.
- **No interface apart from the terminal.** You edit narration in JSON and watch the result in a file browser.
- **Capture at 4K is capped near 30 unique fps** by Chromium's screencast copy-out (see [11 Quality](11-quality.md)).

## The target architecture

```
                 ┌──────────────────── aiemcee studio (browser) ────────────────────┐
                 │  project list │ narration editor │ player + review │  chat box   │
                 └───────▲──────────────────────────────────────────────────▲────────┘
                         │ HTTP + SSE (job logs)                            │ /api/chat
┌────────────────────────┴──────────────── engine server (one Node process) ┴──────────────┐
│ job queue ─▶ stage runners (narrate / capture / compose ...)    agent harness            │
│             same scripts as the CLI, so both stay identical      ├─ provider: Claude      │
│                                                                 ├─ provider: OpenAI/Codex│
│ media server (range requests: out/*.mp4, review stills)         ├─ provider: Grok (xAI)  │
│                                                                 └─ tools: read/write     │
│                                                                    project files, run    │
│                                                                    a stage, list outputs │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                │
          ┌─────────────────────┼──────────────────────┬─────────────────────┐
          ▼                     ▼                      ▼                     ▼
   Voice engine          Capture engine          Picture engine        Sound engine
   edge-tts, pooled      Playwright/CDP,         Remotion chunks       ffmpeg mix,
   (N lines in flight)   assembly pipelined      + ffmpeg stills       runs alongside
                         behind recording        (fast.mjs)            the picture
```

### The engines

| Engine | Job | Parallelism |
| --- | --- | --- |
| **Voice** | text → timed takes, `durations.json` (the metronome) | Lines and sentences in flight together (`tts.parallel`, default 4) |
| **Capture** | real app → lossless footage | Recording of scene N+1 overlaps the encode of scene N |
| **Picture** | timeline → `film.mp4` | Content-keyed chunks, several browsers, ffmpeg still path (exists) |
| **Sound** | timeline → loudness-normalised mix | Runs in a worker thread while the picture renders |
| **Master** | mux, poster, colour conversion | Stream copy when nothing needs re-encoding (exists) |
| **Agent harness** | chat → edits to narration, scenes, config → reruns | Provider-agnostic. Every model gets the same tools |

The rule that keeps all of this correct does not change: **audio is the
metronome.** Every engine reads the same timeline, so running them at the same
time cannot cause drift.

## Phases

### Phase 1: parallelism inside the stages (this change)

1. **Voice pool.** `narrate` synthesises lines concurrently (`tts.parallel`,
   default 4; `--jobs N` overrides). Output order and logs stay deterministic.
2. **Capture pipelining.** Frame assembly runs in a background ffmpeg process
   while the next scene records. The process waits for every encode before it exits.
3. **Sound alongside picture.** `compose` mixes the soundtrack in a worker
   thread while Remotion renders, so the sound step drops off the critical path.
4. **Async ffmpeg** (`ffAsync`) so that 1-3 do not block the event loop.

### Phase 2: the studio and engine server (this change, first cut)

`aiemcee studio [--port 4810]` serves a lightweight web app with no build step:

- the project list, the narration editor (saves `narration.json`), and stage buttons
  (narrate / capture / compose --fast / --draft / film)
- live job logs streamed over SSE, one job queue, so two renders never fight for the CPU
- the player for `out/*.mp4`, plus the review contact sheet
- a **chat box** wired to an agent harness. Providers: Claude (Anthropic SDK,
  `ANTHROPIC_API_KEY`), OpenAI / Codex (`OPENAI_API_KEY`), Grok (`XAI_API_KEY`).
  Images can be pasted or attached: they are saved into `assets/uploads/` and
  sent to the model. Tools: `list_files`, `read_file`, `write_file` (sandboxed
  to the project), `run_stage`, `get_timeline`.

The server reuses the stage scripts, so the CLI and the studio can never drift
apart. Another surface (a VS Code panel, a hosted version) is just another
client of the same API.

### Phase 3: warm engine (next)

- Keep one Remotion bundle and a pool of browsers alive in the server between jobs.
  Composing then skips process start, bundle check and browser launch (several
  seconds on every edit).
- **Preview mode:** render only the chunks that changed at draft scale and play
  them in the studio immediately, before the full master.
- Content hashes (xxhash of the first and last MB plus the size) in place of mtime
  for media keys.

### Phase 4: rendering ceiling

- Distributed chunks: the chunk plan is already a list of independent jobs with
  content keys. A worker (`aiemcee worker --server URL`) can pull chunks from the
  queue, which allows a second machine or a cloud box to take part.
- Hardware encode for mezzanine chunks (`h264_nvenc` / `h264_qsv` / `h264_amf`),
  detected by `doctor`, with CPU x264 used for the master only.
- Deterministic frame-stepped capture (CDP virtual time) for 60 unique fps at 4K.
- A shared chunk cache across projects (same key, same pixels), so the end card
  and intro sting render once for every film in a batch.

## How it is measured

Every stage already prints its own timing. A phase only counts as done when
`projects/_smoke` gets faster with an identical drift line (picture and sound
within a few hundredths of a second) and the same review stills.
