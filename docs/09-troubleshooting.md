# 09 · Troubleshooting

Every failure we have actually hit, and its fix.

Start with `npm run doctor`. It checks every external tool and validates the
config, and it catches most of what follows.

## Setup

### `edge-tts: command not found`

```bash
pip install edge-tts
```

Then **open a new terminal** — PATH is read at shell start. On Windows,
`pip install --user` puts it in
`%APPDATA%\Python\Python3xx\Scripts`, which is not always on PATH.

### `ffmpeg: command not found`

```bash
winget install Gyan.FFmpeg     # Windows
brew install ffmpeg            # macOS
sudo apt install ffmpeg        # Debian/Ubuntu
```

Put the whole `bin` directory on PATH, not just the ffmpeg binary — `ffprobe`
lives next to it and the pipeline needs both.

### `Cannot find module 'playwright'`

```bash
npm install && npx playwright install chromium
```

Both. The npm package and the browser binary are separate downloads.

### `remotion/node_modules is empty`

```bash
npm --prefix remotion install
```

Remotion is a separate package with its own dependency tree, so a root
`npm install` does not reach it. `npm run setup` does both.

### `'C:\Users\...\claude' is not recognized as an internal or external command`

A space in the checkout path, hitting a Windows `.cmd` shim launched through a
shell. Already fixed in `remotion/render.mjs` (bin directory on PATH, all paths
relative). If you see it in code you have added, do the same rather than trying
to quote.

## Narration

### A word is mispronounced

Spell it phonetically in `text`. Nobody sees that field.

```json
"text": "Meet Pareekshan, the platform that..."
```

Also useful: a comma forces a pause, and splitting a sentence fixes a rushed
clause.

### Narration is too fast or too slow

`npm run narrate` prints wpm. Target 130–150.

**Fix it by editing the words, not `tts.rate`.** A line that is too long to read
comfortably should be shorter.

### A rewritten line did not re-synthesise

The cache compares `tts/<id>.txt` byte for byte with `narration.json`. If they
differ it rebuilds. To force everything:

```bash
npm run narrate -- --all
```

### `durations.json missing`

`npm run narrate` has not run, or it failed. It is the metronome — nothing
downstream works without it.

## Capture

### Every selector times out

The app is not running, or `baseUrl` is wrong. Check:

```bash
curl http://localhost:3100
```

### One selector times out

The warning names it:

```
  ! 06-plan: locator.waitFor: Timeout 15000ms exceeded.
```

Find the real one:

```bash
npx playwright codegen http://localhost:3100
```

Prefer `text=` and `aria-label` over CSS — CSS class names change with every
redesign.

### A dev overlay appeared in the footage

**Record against a production build.** A dev server can render an error
overlay, a hydration warning or a hot-reload toast at any moment, and there is
no way to remove it afterwards.

```bash
npm run build && npm run start -- --port 3100
```

`config.capture.hide` is the second line of defence — add the selector there
too — but the production build is the real fix.

### The cursor is invisible

It is injected via `addInitScript`, which runs before page scripts on every
document in the context. If it is missing:

- the page navigated with a full document replacement that dropped it — the
  script re-creates it on demand, so this should self-heal
- something in the app has a higher z-index than `2147483647`
- the cursor colour matches the background. Change `cursor.fill` /
  `cursor.stroke` in `design.tokens.json`

### Nothing scrolls

`s.scroll` auto-picks the largest scrollable element, and inside an app shell
it can pick wrong. Pass the scroller explicitly:

```js
await s.scroll(420, 1500, s.main);          // <main>
await s.scroll(420, 1500, "[data-scroll]"); // anything else
```

### The scene finishes way too early

`capture` prints it:

```
04-feature   narration 12.3s  drove 4.1s  clip 13.2s
```

Eight seconds of held frame while the narrator is still talking. Add beats —
scrolls, a click, a `moveTo` and a hold.

### `(choreography overran)`

The scene drove longer than narration plus `tailPad`, so its tail is being
trimmed. Either cut beats, or accept it — a slight overrun is much less
noticeable than finishing early.

### Playwright wrote no video

The context closed before a frame was captured, usually because `goto` threw on
the very first line. Check the app is up and the path is right.

### Captures are enormous

`deviceScaleFactor: 2` quadruples the pixels. Use `1` unless you have a
specific reason. The final encode is what determines quality.

## Motion

### `Composition with id "X" not found`

Registered in `Root.tsx`? The `id` prop must match `composition` in the
sequence exactly, including case. For the film, the composition must also be
in `MOTION` in `remotion/src/scenes.ts`; `npm run validate` checks this.

### Fonts render as fallbacks

Load through `@remotion/google-fonts` (see `fonts.ts`), never a `<link>`. The
renderer screenshots frames headlessly and will capture one before a network
font arrives.

### The render flickers

Something in the composition is non-deterministic. `Date.now()`,
`Math.random()`, an unseeded animation. Every frame must be a pure function of
`useCurrentFrame()`.

### The lower third has a black background

The composition must use `<Page transparent>`. It is already set; if you
copied `LowerThird` into a new composition, check you kept it.

### An element is in the wrong place after adding padding

`Pipeline`'s rail is absolutely positioned at `top: 27` relative to the steps
row. Padding moves the nodes but not the rail. Adjust both, or use margins.

### Renders are slow

Normal — one to four minutes for a few scenes. Use `npm run studio` to iterate
and render only at the end. Render one composition at a time with
`npm run motion -- Problem`.

## Compose

### `missing clip for <id>`

The error names the command to run. Usually `npm run capture` for a scene you
added to the sequence but never recorded.

### `missing footage for <id>`

The error names the command to run: `npm run clip` or `npm run capture`.

### A focus move missed its target

Read the still in `out/review/` for that move. `at` / `until` are seconds into
the footage file, not the film, and `box` is fractions of the frame. Re-grid
the clip (see [10 Direction](10-direction.md#focus-moves)) and read the box
off again.

### `drift 0.4s   <- check for a missing scene`

The video and audio timelines disagree. Almost always a sequence entry whose
narration exists but whose clip is stale — re-run `npm run narrate` so
`durations.json` covers every id, then `npm run compose`.

### The concat step fails or the output is corrupt

Every clip must match exactly. If you edited `normalise`, check that width,
height, fps, pixel format and codec parameters are still identical for every
clip — `-c copy` cannot fix a mismatch.

```bash
ffprobe -v error -show_entries stream=width,height,r_frame_rate,pix_fmt -of csv=p=0 work/01-hook.mp4
```

### The end of the narration is cut off

`-shortest` truncates to whichever timeline is shorter. If the audio is longer,
a scene's video is short — check the `x -> y` lines for a clip that was trimmed
hard.

### The video is huge

Raise `crf` in `encode.final`. 19 is high quality, 23 is much smaller and fine
for Slack. Do not go above 28 — UI text starts to smear.

### The narration is out of sync with the picture

This should be structurally impossible; both timelines are built from
`durations.json` in sequence order. If it happens:

1. `npm run narrate -- --all` — rebuild every duration
2. `npm run compose` — check `drift`
3. If drift is fine but it still looks wrong, the problem is choreography
   timing inside a scene, not the compositor

## Quality

### The demo looks empty

Seed your app with believable data before recording. This is worth more than
anything downstream.

### It feels rushed

Raise `timing.gap` to 0.6, and add holds in `scenes.mjs`.

### Text is illegible

Nothing below 14px, and check a frame at 50%:

```bash
ffmpeg -i out/demo.mp4 -ss 30 -frames:v 1 -vf scale=800:-1 -y /tmp/f.png
```

### The cuts flash

The motion scenes' `page` colour does not match your app's background. Match
them in `design.tokens.json`.

## Still stuck

Every intermediate file survives in `work/`. Play them.

```bash
ffprobe -v error -show_format -show_streams work/04-feature.mp4
```

If a stage is producing something you did not expect, the stage before it is
where to look.
