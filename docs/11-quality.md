# 11 · Picture quality

Films used to look soft. Three things did it, one after the other:

1. **Capture at 1x, low bitrate.** Playwright's `recordVideo` writes VP8 at
   the viewport's CSS size (deviceScaleFactor 1) and a modest bitrate. 12px UI
   text is already smeared before anything else happens.
2. **The camera then upscales it.** A focus move to 1.6-2x on 1x footage is
   a 2x upscale of an already blurry image.
3. **Lossy all the way down.** Intermediates and the master were re-encoded at
   CRF 19-20, and Remotion rendered frames as JPEG, which rings around text.

## What the engine does now (implemented)

| Stage | Setting | Where |
| --- | --- | --- |
| Capture | Chromium at 1920x1080 CSS px, deviceScaleFactor 2 → **3840x2160** physical | `capture.viewport`, `capture.deviceScaleFactor` |
| | Real (not just emulated) DSF: `--force-device-scale-factor=2` added automatically | `scripts/capture.mjs` |
| | Frames via CDP `Page.startScreencast`, **PNG** (lossless), each frame's `metadata.timestamp`, every frame acked | `scripts/lib/screencast.mjs`, `capture.format` |
| Intermediate | Frames + real durations (ffconcat) → `fps=60` → **lossless H.264 4:4:4** (`-qp 0`, yuv444p, BT.709 tagged) | `capture.intermediate` |
| Film | Composition **1920x1080 @ 60 fps**. Footage is the 4K source drawn scaled down (supersampled); a 2x focus zoom lands on native pixels. `OffthreadVideo toneMapped={false}` | `remotion/src/film/Footage.tsx` |
| Render | AiEmcee Motion: PNG frames, x264 medium, crf 12, chunked and cached in `work/chunks/master/` | `render` in config |
| Master | x264 `-preset slow -crf 14 -profile:v high -pix_fmt yuv420p -movflags +faststart`, 60 fps, BT.709 tags, AAC 320k | `encode.final`, `encode.audio` |
| 4K master | `compose --master 4k` renders the same composition at scale 2 → `out/<name>-4k.mp4` | `scripts/compose.mjs` |
| Checks | `doctor` prints the capture plan and the last master's ffprobe; `compose` prints the master's resolution, fps, codec, profile and bitrates | `scripts/doctor.mjs`, `scripts/compose.mjs` |

These are the defaults for every project built with `defineProject`
(`scripts/lib/defaults.mjs`). The root RE-DOMS film keeps its own settings
(clip scenes, 1600x900 @ 30) until its config is moved over.

### Frame holds

The screencast only emits a frame when the page changes. A still page sends
nothing, so each frame is held until the next one arrives (its ffconcat
`duration` is the gap to the next timestamp), the first frame also covers the
time before it, and the last frame is held to the moment capture stopped,
which includes the tail pad. The assembled clip is exactly as long as the wall
clock of the scene.

## Measured (this machine, Windows 11, 12 threads, Chromium from Playwright 1.62.1)

Screencast frame size, Playwright `deviceScaleFactor: 2` only (emulated): **1920x1080**
(Chromium hands back CSS-pixel frames). With `--force-device-scale-factor=2` as
well: **3840x2160**. Both headless-shell and new-headless behave the same.

Sustained screencast rate at 3840x2160 under a continuous animation (3 s):

| Format | fps | avg KB/frame |
| --- | --- | --- |
| JPEG q95 | 30.3 | 222 |
| JPEG q100 | 33.0 | 315 |
| PNG | 32.3 | 241 |

PNG is as fast as JPEG on flat UI and lossless, so it is the default. At 1x the
same page ran at 60 fps; at 4K Chromium's copy-out caps unique frames at about
30 per second, so fast motion (cursor glides, scrolls) has ~30 distinct frames
per second, each held for two 60 fps frames. Static UI, holds and text are
unaffected.

Smoke film (`projects/_smoke`: one 13.8 s capture of a page with 12px text,
one motion scene, 14.1 s total):

| | |
| --- | --- |
| capture | 176 frames, peak 35 fps, 3840x2160 → 60 fps lossless H.264 High 4:4:4, 2.1 MB, assembled in 22.6 s |
| render 1080p60 (PNG frames, CRF 12) | 233 s for 847 frames (~3.6 frames/s) |
| master | 1920x1080, 60 fps, h264 High, yuv420p, ~2.1 Mb/s video, AAC 320k target (~241 kb/s measured), 4.0 MB; encode 11 s |
| render 4K (`--master 4k`) | 400 s render; master 3840x2160, 60 fps, h264 High yuv420p, ~5.6 Mb/s video, 9.8 MB; encode 55 s |

Text in the 12px card reads cleanly at 1x and when the camera zooms 2x onto it
(crops were checked frame by frame).

## The knobs

```js
capture: {
  mode: "screencast",          // or "recordVideo" (old, soft)
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,        // 2 = footage at twice the film; zoom up to 2x stays native
  format: "png",               // or "jpeg" + quality (smaller for photo-heavy pages)
  quality: 95,
  intermediate: ["-c:v", "libx264", "-preset", "veryfast", "-qp", "0", "-pix_fmt", "yuv444p"],
  keepFrames: false,           // keep work/<scene>/frames for debugging
},
render: { crf: 12, imageFormat: "png" },
encode: {
  final: ["-c:v", "libx264", "-preset", "slow", "-crf", "14", "-profile:v", "high"],
  audio: ["-c:a", "aac", "-b:a", "320k"],
},
```

- **Zoom ceiling.** A focus `zoom` above `deviceScaleFactor` upscales again.
  Keep focus zooms at or under 2 (the tone's `zoomMax` is 1.7-1.8).
- **Render time** is dominated by decoding 4K footage and PNG frames. Lower it
  with `render.imageFormat: "jpeg"` (softer text) or `render.pages` (parallel
  render pages; default about half the hardware threads).
- **Disk.** Frames are deleted after assembly; the lossless intermediate is
  small for UI (2.1 MB for 14 s) but grows with motion and photography.

## Not done (planned)

- Deterministic, frame-stepped capture (virtual time) for 60 unique fps of
  motion at 4K. Chromium's screencast tops out near 30 fps at this size, and a
  `page.screenshot()` loop is far slower, so this is not implemented.
- ProRes or FFV1 intermediates. Lossless H.264 4:4:4 decoded reliably in
  the old Remotion OffthreadVideo, and the motion engine's ffmpeg frame server
  decodes the same files, so nothing else was needed.
