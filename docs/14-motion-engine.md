# 14 · AiEmcee Motion

AiEmcee draws its pictures with its own motion engine. Until 2026-11-12 that
job was Remotion's; the scenes were written against Remotion's API, so the
engine keeps that API and replaces everything behind it.

## Why

- **Speed.** On the smoke film (14.2 s, 1080p60, 4K footage) the fast engine
  went from 260.6 s to 31.8 s. A cached re-render takes 0.6 s and a one-scene
  preview about 2 s.
- **Weight.** The scene package's `node_modules` went from 980 MB (Remotion,
  its own Chrome download, a webpack cache) to 49 MB: React, esbuild, fonts.
- **Control.** Footage, frame capture and encoding are ours to tune, and there
  are no third-party license terms for companies to track.

## The pieces

| Piece | File | Job |
|---|---|---|
| Runtime | `remotion/engine/runtime.tsx` | the scene API: `useCurrentFrame`, `useVideoConfig`, `Sequence`, `Freeze`, `AbsoluteFill`, `interpolate`, `Easing`, `spring`, `Img`, `OffthreadVideo`, `staticFile`, `Composition`, `registerRoot` |
| Fonts | `remotion/src/fonts.ts`, `remotion/engine/fonts.ts` | local @fontsource files, every face loaded before the first frame |
| Bundle | `scripts/lib/motion/bundle.mjs` | esbuild, about 0.3 s; `import "remotion"` resolves to the runtime |
| Host | `scripts/lib/motion/host.mjs` | serves the bundle, `remotion/public`, and exact video frames |
| Renderer | `scripts/lib/motion/render.mjs` | Chromium pages, frame capture, x264 chunks |
| Studio | `scripts/motion-studio.mjs` | the preview: every composition, scrubbable, rebuilt on save |
| Parity test | `remotion/engine/parity.test.mjs` | the maths, against Remotion's frozen outputs |

The scenes did not change. They still `import { spring } from "remotion"`: the
bundler points that import at the runtime.

## How a frame is made

1. A page loads the bundle. `registerRoot` collects the compositions.
2. `init(id, props)` mounts one composition (the Film, with the timeline as
   props) and waits for every font face.
3. `seek(frame)` renders that frame synchronously, then waits until every
   `<Img>`, every video frame and every font it needs has decoded.
4. The renderer takes a screenshot over the Chrome DevTools Protocol and pipes
   it straight into ffmpeg's stdin. Nothing touches the disk until the chunk.
5. x264 writes the chunk as MPEG-TS; chunks join with a stream copy.

A film is cut into chunks on its own seams (scene bodies and transitions, see
`scripts/lib/fast.mjs`), and each chunk is cut again into pieces so every page
stays busy. Pages run in a few Chromium processes.

## Footage

`OffthreadVideo` draws a video as an `<img>` whose source is the host's frame
server: `/__frame?src=…&t=…`.

- **Forward decoding.** Each page keeps one ffmpeg per video and reads frames
  in order as the page asks for later times. A jump (a new piece, a seek back)
  restarts it at the new time.
- **Only the pixels shown.** The element measures itself after layout, camera
  transform included. An unzoomed 4K shot in a 1080p film gets a half-size
  frame (a box filter, exact for 2x); a focus move gets the full 4K frame. A
  decoder only ever steps up a size, so a zoom never restarts it twice.
- **Ends of files.** A frame past the end holds the last frame.

New captures put a keyframe every second (`capture.intermediate`, `-g 60`), so
a decoder restart costs at most a second of decoding.

## Profiles

| Profile | Command | Frames | Chunk encode | Colour out of the chunk |
|---|---|---|---|---|
| master | `compose` | PNG | x264 medium, crf 12 | BT.709 limited (delivery) |
| fast | `compose --fast` | JPEG q90 | x264 veryfast, crf 14 | BT.601 full; the master converts once |
| draft | `compose --draft` | JPEG q72, 2/3 size | x264 ultrafast, crf 23 | as fast |

All three are chunked and cached in `work/chunks/<profile>/`. A chunk's key
covers what it shows, its media, the scene code and the engine code, so
changing one scene re-renders that scene and its two seams.

## Settings

In a project's `video.config.mjs`:

```js
render: {
  pages: 6,            // render pages; default about half the hardware threads
  gl: undefined,       // unset or "angle": hardware D3D11 on Windows; "software"; or a --use-gl value
  crf: 12,             // the master profile's chunk quality
  imageFormat: "png",  // the master profile's frames: "png" or "jpeg"
  fast: { /* crf, x264Preset, jpegQuality, scale, pages */ },
  draft: { /* same */ },
  master: { /* same, over the master defaults */ },
}
```

More `render` keys:

| Key | Does |
|---|---|
| `mode` | `"fast"` or `"draft"` makes that profile the default for `compose` |
| `x264Preset` | the master profile's chunk preset (default `medium`) |
| `publicDeps` | the `remotion/public/` folders this film reads, so editing another film's art keeps this film's cache |
| `nativeStills` | `false` draws still scenes in the browser too (default: ffmpeg draws plain stills in fast and draft) |
| `fastConcurrency` | an older name for `pages` |

Environment:

| Variable | Does |
|---|---|
| `AIEMCEE_LOCAL=off` | builds the scenes without your `remotion/src/local.tsx`: the engine as published |
| `AIEMCEE_CPU_SHARE=N` | N films render at once (set by `batch --jobs`); each takes 1/N of the pages |
| `AIEMCEE_MOTION_PROFILE=1` | prints where each page's time goes: seek, screenshot, pipe |
| `AIEMCEE_MOTION_ARGS` | extra Chromium switches, space separated |
| `AIEMCEE_FRAME_FORMAT` | `jpeg` (default) or `bmp` for footage frames; BMP measured slower |

## Your own scenes

Scenes made for one film or client live outside the engine: their code in
`remotion/src/compositions/<name>/`, their art in `remotion/public/<name>/`,
and their registration in `remotion/src/local.tsx`. All three are
git-ignored. `local.example.tsx` shows the shape (`LOCAL_MOTION` for the Film,
`LocalCompositions` for previews); copy it to `local.tsx` to start. The
bundler and TypeScript resolve `@local` to your file when it exists and to the
example otherwise, so a fresh checkout builds with the engine's scenes alone.

## Measured

Smoke film, 852 frames at 1920x1080, 12-thread Windows machine:

| | Remotion | Motion |
|---|---|---|
| fast engine render | 260.6 s | 31.8 s |
| default (master) render | not measured | 41.8 s |
| bundle | 13 s (webpack) | 0.3 s (esbuild) |
| cached re-render | | 0.6 s |
| one-scene preview | | 1.7 s |
| SSIM against the Remotion render | | 0.995 (footage 0.998) |

The spring, interpolate and easing values match Remotion 4.0.518 exactly:
60,003 values, worst difference 0.

Where the time goes now (one page): a motion-graphics frame is about 40 ms of
screenshot (the browser's JPEG encode); a footage frame adds 15 ms of video
decode. With 4 to 6 pages the machine runs at 100% CPU, so more pages do not
help. The next gains are cheaper capture and footage at its final size.

## Writing scenes

Nothing changes: write React components against the same API, register them
in `remotion/src/Root.tsx` and `remotion/src/scenes.ts`, preview them with
`npm run studio`. Two rules carry over:

- Animate from `useCurrentFrame()`, never from timers or CSS animations: a
  frame is rendered on its own, in any order.
- Load images with `Img` and video with `OffthreadVideo`, so the renderer knows
  to wait for them.
