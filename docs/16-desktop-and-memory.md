# 16 · Desktop app and memory (lean mode)

AiEmcee has to run on an 8 GB laptop and as a double-click Windows `.exe`. Two pieces do that:
a resource profile that every heavy stage reads (`scripts/lib/resources.mjs`), and a small launcher
(`desktop/`) built into a Node single executable. No Electron.

## Lean mode

```
AIEMCEE_PROFILE=lean|standard|auto        default auto
node bin/aiemcee.mjs <any command> --lean  (or --standard)
```

`auto` picks **lean** when the machine has under 12 GB of RAM in total, or under 3 GB free when the
command starts. `bin/aiemcee.mjs` resolves `auto` once and pins the result in the env, so every stage
of a `film` run (and every studio job) uses the same profile. `aiemcee doctor` prints the profile,
the RAM it saw, and what lean changes.

| | standard | lean |
|---|---|---|
| render pages (Chromium tabs) | half the threads (6 on 12) | 2, capped even if `render.pages` asks for more |
| Chromium processes for rendering | one per two pages | 1 |
| ffmpeg still chunks in parallel | 2 | 1 |
| draft capture device scale | the config's `deviceScaleFactor` | 1× for `capture --draft` and `film --draft` (masters still at full dsf) |
| capture: encode of the previous scene | overlaps the next recording | waits for it (Chromium and two ffmpegs never peak together) |
| ffmpeg threads in screencast assembly | ffmpeg decides | half the threads, at least 2 |
| Chromium switches | none extra | `--js-flags=--max-old-space-size=512 --disable-dev-shm-usage --disk-cache-size/--media-cache-size=32 MB --renderer-process-limit=2 --disable-gpu-rasterization --disable-extensions --disable-component-update --mute-audio` |
| priority | normal | `capture`, `clip`, `compose`, `film` run below normal (ffmpeg and Chromium inherit it) |
| video cache budget | 2 GB | 512 MB |

Where it is applied:

- `scripts/lib/fast.mjs` (the film renderer) and `remotion/render.mjs` (single scenes): page count,
  browser count, stills pool. Chromium switches reach `openMotion` through `AIEMCEE_MOTION_ARGS`
  (which `applyProfile()` fills; switches you set yourself there win).
- `scripts/capture.mjs` and `scripts/lib/screencast.mjs`: launch args, draft scale, serial encodes, ffmpeg threads.
- `scripts/compose.mjs`: applies the profile and lowers its own priority first thing.
- `studio/lib/jobs.mjs`: **every** studio job runs at below-normal priority regardless of profile
  (`os.setPriority(child.pid, PRIORITY_BELOW_NORMAL)`, errors ignored), with `AIEMCEE_PROFILE`
  resolved per job and passed in its env. The studio itself stays responsive while a render runs.

The video cache budget is exported as `AIEMCEE_VIDEO_CACHE_BYTES`; nothing in the engine keeps a
decoded-video cache yet, so today it is a budget for the renderer to honour, not a live limit.

### Measured

`node bin/aiemcee.mjs compose --project projects/_smoke --draft` (14.2 s film, 852 frames at 720p
draft, 1 captured + 1 motion scene), chunk cache cleared before each run, on a 12-thread laptop with
31 GB RAM. Peak is the summed working set of the whole process tree (node, Chromium, ffmpeg) sampled
every 200 ms. Summed working sets count pages shared between Chromium processes more than once, so
the absolute numbers overstate real use; the ratio is the honest part.

| | peak working set (tree) | processes at peak | render | total |
|---|---|---|---|---|
| standard (6 pages) | 13 742 MB | 34 | 36.3 s, 23.5 fps | 45 s |
| lean (2 pages, 1 Chromium) | 6 258 MB | 16 | 55.1 s, 15.5 fps | 63 s |

Lean roughly halves peak memory and process count for about 40 % more render time. A master (1080p,
or 4K) costs more per page, so the saving in absolute terms is larger. Capture was not measured (it
needs the fixture site served); its lean changes are a 1× draft scale (a quarter of the pixels of
dsf 2) and serial encodes.

## The desktop app

### Layout

```
AiEmcee\
  AiEmcee.exe        Node SEA: the launcher (desktop/launcher.mjs, bundled)
  runtime\node.exe   a plain Node, for the studio and the stages
  app\               the engine: bin, scripts, studio, remotion (+node_modules), node_modules, web, ...
```

The exe looks for the app in `--app <dir>`, `AIEMCEE_APP`, `<exe dir>\app`, the exe's own folder,
then the folder above it. So `dist\AiEmcee.exe` built inside a checkout finds the repo, and a release
zip of `dist\` built with `--with-app` is self-contained.

Why a separate `node.exe`: a single executable always runs its embedded script, whatever its
arguments, and the engine spawns `process.execPath` for every stage (and `node --check` for edits).
So the servers run on `runtime\node.exe` (or `AIEMCEE_NODE`, or Node on PATH).

State lives in `%LOCALAPPDATA%\AiEmcee`: `logs\` (launcher, studio, web logs per day),
`tools\ffmpeg\` (if downloaded), `browser-profile\` (the app window's Edge profile). Projects default
to `app\projects` if it exists, else `Documents\AiEmcee`; `--projects <dir>` overrides.

### What the launcher does

1. **Single instance**: holds the named pipe `\\.\pipe\aiemcee-desktop`. A second launch tells the
   first to reopen its window and exits.
2. **Tools**: ffmpeg on PATH, else `%LOCALAPPDATA%\AiEmcee\tools\ffmpeg`; if neither, downloads the
   gyan.dev essentials build (`AIEMCEE_FFMPEG_URL` overrides) with a progress line, unpacks it with
   Windows' `tar`. Playwright's Chromium: if `chromium.executablePath()` is missing, runs
   `playwright install chromium` (its own progress bar) into the default `%LOCALAPPDATA%\ms-playwright`.
3. **Servers**: the studio (`bin/aiemcee.mjs studio --port <free port>`), healthy when
   `/api/status` answers. The UI: if `web/` has been built (`web/.next/BUILD_ID`), `next start` on a
   second free port with `AIEMCEE_STUDIO_URL` pointing at the studio; otherwise the studio's own page
   (`studio/public/index.html`, served by the studio on the same port).
4. **Window**: Edge `--app=<url> --user-data-dir=%LOCALAPPDATA%\AiEmcee\browser-profile`, then
   Chrome, then the default browser. When that Edge process exits (the window closed) the launcher
   kills the server trees and exits. If the browser hands the window to an already running instance,
   or the default browser is used, the console window decides: close it or press Ctrl+C.

Flags: `--lean`, `--standard`, `--projects <dir>`, `--app <dir>`, `--studio-ui` (skip `next start`),
`--no-window`, `--keep` (do not stop when the window closes). `npm run desktop` runs the launcher
without building.

**Serving the web UI.** `web/next.config.ts` uses `cacheComponents` and rewrites `/api`, `/files`,
`/s` to the studio, so a static export is not possible; production means `next start` (a second Node
process, roughly 150-250 MB, and `web/node_modules` must ship). The lightest option is the studio's
built-in page on one process, which the launcher uses whenever `web/` is not built or `--studio-ui` is
passed. A `output: "standalone"` build in `web/` would shrink the shipped web folder a lot; that is a
change for the web workstream.

### Building the exe

```
npm run build:exe            # = node desktop/build.mjs
node desktop/build.mjs --with-app   # also copies the app into dist\app, ready to zip
```

1. esbuild (from `remotion/node_modules`) bundles `desktop/launcher.mjs` into `dist/build/launcher.cjs` (about 15 KB).
2. `desktop/aiemcee.ico` is drawn from `remotion/public/mark.svg` at 16-256 px with Playwright and
   packed as a PNG-entry `.ico` (only when missing; `--icon` redraws it).
3. `node --experimental-sea-config` writes the blob.
4. `node.exe` is copied to `dist/AiEmcee.exe`; `rcedit` (installed into `dist/build/tools` on first
   build) sets the icon and version strings; `postject` injects the blob. node.exe's signature is
   invalidated by design: the build is unsigned, so SmartScreen asks once.
5. `node.exe` is copied again to `dist/runtime/node.exe`.

Needs network for the first build (`npx postject`, `npm install rcedit`). Verified on Windows 11,
Node 22.17.0: `dist\AiEmcee.exe` is 81 MB; launched, it started the studio on a free port, answered
`/api/status` 200, opened an Edge app window, a second launch handed off and exited, and closing
the window stopped the studio and the launcher.

### Gaps

- The first-run downloads (ffmpeg, Chromium) were not exercised on this machine: both were already
  installed.
- `edge-tts` (narration) is a Python tool and is not bootstrapped; `doctor` reports it.
- `--with-app` copies `node_modules` as installed on the build machine (Windows x64 binaries).
- The video cache budget is exported but not enforced by anything yet (see above).
