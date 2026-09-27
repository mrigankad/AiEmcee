# Direction: tone, focus, transitions, sound

The pipeline makes a *correct* film: narration first, every scene cut to its
line. Direction is what makes it a *good* one. It covers how scenes hand over
to each other, where the camera looks inside product footage, how titles
move, what the soundtrack does between lines, and which frame is the
thumbnail.

All of it is configured in `video.config.mjs`, and none of it can knock the
film out of sync, because it is all placed on the same clock as the voice.

> The creative rules here are adapted from [/brag](https://github.com/latent-spaces/brag),
> a Claude Code skill for short launch videos: show the real thing, keep it
> readable, make every frame postable. AiEmcee applies them to long-form,
> narrated demos, where the voice sets the pace. To have Claude direct a film
> end to end, run `/emcee` in this repo (`.claude/skills/emcee`).

---

## How the film is built

```
config + durations.json ──▶ work/timeline.json ──┬──▶ Remotion "Film" ──▶ work/film.mp4 (silent)
                                                 └──▶ ffmpeg mix ──────▶ work/sound/mix.wav
                                                                  │
                                            master + poster ──▶ out/<name>.mp4 + .jpg
                                            review stills  ──▶ out/review/
```

`scripts/lib/timeline.mjs` turns the config into one timeline. The whole
picture is then a single Remotion composition (`remotion/src/film/Film.tsx`)
that places product footage, motion scenes, transitions, titles and focus
moves on that timeline. The sound is mixed by ffmpeg from the *same* file, by
absolute time. Picture and sound come from one set of numbers, so they cannot
drift; `compose` prints the measured drift on every build.

Transitions happen in the silent gap at the end of each scene. The incoming
scene starts `transition.duration` seconds early, underneath the outgoing one,
so the voice for every scene always starts on a settled picture.

---

## Tone

```js
direction: { tone: "polished" },
```

| Tone | Transitions | Camera | Feel |
|---|---|---|---|
| `polished` *(default)* | dip through the page colour, 0.5s | slow push, zooms up to 1.7× | Serious, restrained, elegant |
| `default` | zoom, 0.45s | a little more push | Clean and friendly |
| `cinematic` | brand-coloured wipe, 0.6s | bigger push, zooms up to 2×, heavier grade and vignette | Trailer scale |
| `app-store` | horizontal push, 0.45s | light | Feature-card clean |
| `deadpan` | hard cut | locked | Dry, still, almost silent |

A tone also sets the spring every motion primitive enters on, the colour
grade on footage, the lower-third hold time and which sound effect plays on
each cue. Presets live in `remotion/src/film/tones.json`. Override any field:

```js
direction: {
  tone: "polished",
  transition: { type: "zoom", duration: 0.4 },
  push: 0,                 // lock the camera on footage
  focus: { zoomMax: 1.5 },
  sfx: { focus: null },    // no sound on focus moves
},
```

## Transitions

`cut`, `fade`, `dip`, `zoom`, `push`, `wipe`. The tone sets the default; any
scene can set its own:

```js
{ id: "03-loop", from: "motion", composition: "Pipeline", transition: "wipe" },
{ id: "05-pdi", from: "clip", clip: {…}, transition: { type: "zoom", duration: 0.4 } },
```

Use `dip` rather than `fade` between two busy UI frames: a crossfade makes a
muddy double exposure, while a dip takes the old scene out before the new one
comes in. Spend at most one accent transition per film, on the cut that
matters most. Keep durations at or under `timing.gap`, so the transition
stays in the silence between lines. `validate` warns if it does not.

## Focus moves

Product UI is designed for a laptop screen, not a video, and a full-frame
screen recording leaves the viewer to find the point on their own. A focus
move eases the camera in on the part that matters, dims the rest, rings it
and names it:

```js
{
  id: "04-traceability",
  from: "clip",
  clip: { … },
  focus: [
    { at: 4.8, until: 7.7, box: [0.36, 0.34, 0.30, 0.34], label: "Electroluminescence image, from the line" },
    { at: 8.1, until: 10.7, box: [0.03, 0.885, 0.95, 0.09], zoom: 1, label: "Flash test · junction box · pallet" },
  ],
},
```

| Field | Meaning |
|---|---|
| `at`, `until` | Seconds into the **footage file** (`raw/<id>.mp4`). |
| `box` | `[x, y, w, h]`, fractions of the frame. |
| `label` | Optional. Short, specific and true. |
| `zoom` | Optional. Overrides the computed zoom. `1` spotlights without moving the camera. |
| `spotlight` | Optional. `false` moves the camera without dimming. |

To place boxes, make a gridded contact sheet of the clip, one frame per second
with a 10×10 grid (each cell is 0.1 of the frame):

```bash
ffmpeg -i raw/04-traceability.mp4 -vf "fps=1,scale=640:-1,drawtext=text='%{pts\:hms}':x=6:y=6:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.7,drawgrid=w=64:h=36:t=1:c=red@0.25,tile=3x5" -frames:v 1 -y work/grid.jpg
```

Footage starts one transition-length (usually 0.5s) before its narration, so
a word spoken *t* seconds into the line is on screen at footage time *t + 0.5*.
Keep each move at least ~2s long so it can ease in, settle and be read. Keep
the box still, meaning the page does not scroll under it, and keep it clear of
the lower third's window (about footage 0.8–4.4s) unless the box is nowhere
near the bottom left.

## Titles

Lower thirds are now animated in the film: the brand bar grows, the card
unrolls from it, the kicker and title rise in, and it fades out after the
tone's hold time (3.4–3.8s). The config is unchanged:
`lowerThird: { kicker, title }`.

Motion-scene headlines set word by word (`KineticLine`). Add `highlight` to a
scene's copy in `remotion/src/scenes.ts` to set its key word in the brand
colour.

## Voice

edge-tts gives one pace and one pitch per request and no speaking styles.
A whole line read in one request comes out in a single flat register, which
is what makes TTS sound generic. So `narrate` directs each line instead
(`scripts/lib/delivery.mjs`):

- **One sentence per request.** Each sentence gets its own prosody: the
  global `tts.rate` / `tts.pitch`, plus the line's **intent**, plus a
  **contour**. The first sentence opens with a lift, the last one lands
  lower and slower, and questions rise.
- **Deliberate pauses.** The engine's own silences are trimmed and
  replaced with `tts.pauses.sentence` between sentences. Write `[beat]` in a
  line for a longer, dramatic pause (`tts.pauses.beat`) before a reveal.
- **Mastering.** Every line goes through a short chain before it reaches the
  mix: highpass, warmth, presence, de-esser, gentle compression, and a fixed
  -18 LUFS. That makes the voice sound recorded, and every line equally loud.

```jsonc
// narration.json
{ "id": "01-hook", "delivery": "hook",
  "text": "A utility-scale solar project ships half a million modules. [beat] Meet Ree Doms, a Wayam AI product." }
```

```js
// video.config.mjs
tts: {
  voice: "en-US-BrianMultilingualNeural",
  rate: "+6%", pitch: "+2Hz",
  delivery: {
    presets: { hook: {…}, problem: {…}, explain: {…}, feature: {…}, payoff: {…}, close: {…} },
    contour: { open: {…}, land: {…}, question: {…} },
  },
  pauses: { sentence: 0.18, beat: 0.5 },
  master: { warmth: 2, presence: 3 },
},
```

Choose a voice by ear: `npm run narrate -- --audition` renders the first line
(or `-- --audition 05-pdi`) in several voices to `out/voice-audition/`. Set
`tts.audition` to a list of voice names to compare others.

Each take's inputs are recorded in `tts/<id>.take.json`, and a line is only
re-spoken when they change. After re-voicing, re-time hand-placed beats in
motion scenes and check focus moves still fit their shorter or longer scenes
(`npm run validate` flags moves that run past a scene).

## Avatar

The Wayam AI presenter: an orb in the Wayam gradient (from
`assets/Logo Main.svg`) that speaks the narration and shows what it says.

```js
avatar: { enabled: true, size: 124, captions: true },

// per scene:
{ id: "01-hook", from: "clip", avatar: { mode: "host", mood: "happy" }, … },
{ id: "05-pdi",  from: "clip", avatar: { mode: "corner", mood: "focused" }, … },
```

| Mode | What it does |
|---|---|
| `host` | Large, left of centre, over a blurred and darkened frame; the line as big captions beside it. For openings, closings, and anything said to the viewer rather than about the screen. |
| `corner` | Small presenter bottom right, captions in a pill beside it. Default for footage. |
| `off` | Out of the way. Default for motion scenes, which carry their own type. |

Moods are `neutral`, `happy`, `curious` and `focused`. They change the eyes,
and blend into each other between scenes.

**It speaks with the voice.** Its level on every frame comes from the
narration audio itself: the orb wobbles and squashes as it talks, and rings
pulse out from it with the loudness of what was just said. When it is silent,
it stays still.

**Captions follow the words.** Sentence times come from edge-tts
(`tts/<id>.srt`, written by `narrate`). Words within a sentence are timed by
their length. The sentence is set whole, unspoken words dimmed, and the word
being said lights up in Wayam orange.

**It is one presenter, not one per scene.** Between scenes it moves from one
pose to the next on the transition's clock. From a host line into product
footage, it moves from the centre to the corner. In the corner it also
**yields**: when a focus move's box reaches into its corner, it fades back so
it never covers what the camera is pointing at.

Preview every mood in the studio: `npm run studio` → `Avatar`.

## Sound

```js
sound: {
  music: { generate: "pad", volume: -12 },   // or { src: "assets/music/bed.mp3" }, or null
  sfx: true,
  sfxGain: 0,
},
```

- **Music bed.** Bring your own licensed track (`src`), or use the built-in
  synthesised ambient pad (`generate: "pad"`). The bed is loudness-normalised,
  set `volume` dB below that, starts after the intro sting, and is *ducked*
  under the narration by a sidechain compressor. It breathes back up in the
  gaps between lines, so they are never dead air. Other options:
  `startAt`, `fadeIn`, `fadeOut`, `duckThreshold`, `duckRatio`.
- **Effects.** Placed automatically on cues from the timeline: a synthesised
  whoosh sized to each transition, a soft UI sound as a title arrives, a
  chime as a focus move lands, an impact on the end card. The files are in
  `assets/sfx/` (Kenney, CC0). Swap any of them via `direction.sfx`.
- **Mastering.** The final mix is normalised to -16 LUFS / -1.5 dBTP
  (two-pass EBU R128), which is where streaming platforms play back.

## Poster

```js
poster: { scene: "07-scanning", at: 5.4 },   // seconds after that scene's narration starts
```

The poster is written next to the video (`out/<name>.jpg`) and baked in as
frame 0. It replaces that frame rather than adding one, so duration and sync
are untouched. Every platform's idle thumbnail then shows the product at its
best instead of a black fade-in. Without `poster`, the first focus move's
settled frame is used. `poster.bake: false` skips the bake.

## Review

Every `compose` writes `out/review/`: one still per scene (settled), per
transition (mid-way), per title and per focus move, plus `contact-sheet.jpg`
with all of them tiled and labelled. Look at it before you watch the film:
overflow, collisions, missed focus boxes and muddy transitions are all
visible frozen, and easy to miss at speed.

```bash
npm run compose                    # full render (minutes)
npm run compose -- --sound-only    # reuse the last picture; remix, remaster, re-poster
npm run studio                     # the Film composition, scrubbable, after one compose
```
