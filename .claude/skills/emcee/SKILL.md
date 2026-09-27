---
name: emcee
description: Direct an AiEmcee demo film end to end — pick the tone, place camera focus moves on the real product UI, set transitions, titles, sound and poster, build it, then review stills and fix what is wrong. Use when someone says "/emcee", "direct the video", "polish the demo video", "make the video look better", "add zooms / transitions / music", or wants a finished, shareable cut from this repo. Adapted from /brag's creative workflow for long-form narrated demos.
---

# /emcee

You are the director. The pipeline already makes a correct film: narration first, every scene cut to its line. Your job is to make it a *good* one, the way /brag makes a launch video: specific to this product, alive, readable, and every frame worth posting.

Usage: `/emcee [direction]`. Direction is optional plain language: a tone ("cinematic"), a focus ("make the PDI scene land harder"), or a constraint ("no music").

Everything you change lives in `video.config.mjs` (direction, sound, poster, per-scene `transition` and `focus`), `narration.json` (words), and `remotion/src/scenes.ts` (motion-scene copy). Read `docs/10-direction.md` once for the full schema.

## 1. Inspect

- Read `narration.json`, `video.config.mjs`, and `tts/durations.json`. Know each scene's line and its length.
- Find the product's 2–3 beats: entry → key action → result. Which scene shows each?
- **Look at the footage.** For every clip or capture scene, make a gridded contact sheet, one frame per second, with a 10×10 grid so boxes can be read off as fractions:

  ```bash
  ffmpeg -i raw/<id>.mp4 -vf "fps=1,scale=640:-1,drawtext=text='%{pts\:hms}':x=6:y=6:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.7,drawgrid=w=64:h=36:t=1:c=red@0.25,tile=3x5" -frames:v 1 -y work/grid-<id>.jpg
  ```

  Read each image. Note what is on screen at each second, and anything that should not be: burned-in title cards, empty states, loading spinners, dead scroll. Fix those first by moving `clip.start` / `clip.end` / `speed` and re-running `npm run clip -- <id>`.

Before planning, answer: What is it in one sentence? Who is it for? What is the most impressive true claim the footage can *prove*? Which single frame would you post?

## 2. Plan

Write `work/direction.md`: the tone and why, the one accent transition (if any), and per scene the moment worth pointing at, with the narration words it should land on.

**Tone** (`direction.tone`): `polished` (default: dips, restraint), `default` (zoom transitions, a little more motion), `cinematic` (brand wipes, heavier grade, bigger camera), `app-store` (horizontal pushes), `deadpan` (hard cuts, still camera, almost silent). Presets are defaults; override fields under `direction`.

## 3. Direct

**Focus moves** are the most valuable thing you can add. Product UI was designed for a laptop, not a video; a focus move tells the viewer where to look.

```js
focus: [
  { at: 4.8, until: 7.7, box: [0.36, 0.34, 0.30, 0.34], label: "Electroluminescence image, from the line" },
]
```

- `at` / `until` are seconds **into the footage file** — exactly the timestamps on your grid.
- `box` is `[x, y, w, h]` as fractions of the frame. Read it off the grid (each cell is 0.1). Pad a little.
- The camera zooms to fit the box (capped by the tone), dims the rest, and rings it. `zoom: 1` spotlights without moving the camera, for wide targets. `spotlight: false` moves without dimming.
- Check the box holds still for the whole beat. If the page scrolls under it, shorten the beat or pick a stiller moment.
- Land it on the words: footage starts `transition.duration` (usually 0.5s) before the narration, so a word spoken at *t* seconds into the line is on screen at footage time *t + 0.5*.
- Labels are short, specific and true: the product's own nouns, numbers visible on screen. Never invent a claim.
- Avoid the lower third's window (roughly footage 0.8s–4.4s) unless the focus box is well clear of the bottom-left.
- One or two per scene. A focus move on every beat is as bad as none.

**Transitions.** Keep the tone's default for almost every cut. Spend one accent (`transition: "wipe"` or `"zoom"`) on the cut that matters most, usually into the core explainer. Transitions live in the silent gap between lines; keep them ≤ `timing.gap`.

**Lower thirds** name a section in 2–5 words. Kicker = the feature's name in the product, title = what it does for the viewer.

**Sound.** `sound.music: { src }` for a licensed track the user supplies, or `{ generate: "pad" }` for the built-in ambient bed. Music is ducked under the voice automatically. Effects come from the tone; `sound.sfx: false` removes them.

**Avatar.** The Wayam orb presents the film. Give the opening and the
closing `avatar: { mode: "host", mood: "happy" }`, and leave product scenes on
the corner presenter (the default for footage). Pick a mood per scene from
what the line does: `curious` for discovery, `focused` for verification or
precision, `happy` for payoffs, `neutral` otherwise. In review, check that the
corner captions never sit on top of a focus label or the product's key UI.

**Poster.** `poster: { scene, at }` is the strongest *settled* frame, usually a focus move fully landed on the most visual scene. It is baked in as frame 0.

Run `npm run validate` after editing. It checks boxes, beat lengths, overlaps, tones and assets.

## 4. Build and review

```bash
npm run compose            # renders the film (minutes), mixes, masters, writes review stills
npm run compose -- --sound-only   # after changing only sound or poster
```

Then **look before you deliver**. Read `out/review/contact-sheet.jpg`, then any still in `out/review/` that looks wrong at full size. Stills are taken at every scene's settled frame, the middle of every transition, every title and every focus move. Fix:

- text overflowing, clipped or colliding with a title
- a focus box that missed its target or drifted off it
- a label running off the frame edge
- a muddy mid-transition (switch that cut to `dip`)
- a frame that is not the product: title cards, black, spinners

Re-render and look again until the sheet is clean. Check the printed `drift` is under 0.1s.

## 5. Deliver

- Write `out/share-copy.txt`: 1–3 sentences, postable as is, specific to the product, matching the tone. No "excited to share".
- Tell the user where `out/<name>.mp4`, the poster `.jpg` and the share copy are, give one sentence on the direction you took, and offer to re-roll a scene or try another tone.

## Creative laws

- **The voice sets the pace.** Never move narration to fit the picture; move the picture.
- **Show the thing.** Real UI, real numbers. Focus on what the product did, not on chrome.
- **Readable.** Anything meant to be read stays settled for about 0.3s per word.
- **Specific.** Every label and title belongs to this product. "Streamline your workflow" is banned.
- **Restraint.** One accent transition, a few focus moves, effects under the music. Craft that calls attention to itself is a mistake.
- **Every frame postable.** If a frozen frame would embarrass the product, fix it.
