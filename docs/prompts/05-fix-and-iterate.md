# Prompt 05 · Fix and iterate

After the first cut. Watch the video, then fix one thing at a time.

The rule for all of these: **name the scene, name the symptom, name the
evidence.** "Scene 6 feels off" gets you a guess. "Scene 6 drove 9s against a
14.3s line and the approve click has no hold" gets you a fix.

---

## The review prompt

Have Claude watch it with you.

```
Pull a frame every 10 seconds from out/demo.mp4 and look at them:

  ffmpeg -i out/demo.mp4 -vf fps=1/10 -y /tmp/frame-%03d.png

For each frame tell me:
  - is anything illegible at 50% size
  - is any frame visually dead (empty state, nothing happening, a held
    frame that reads as frozen)
  - do the motion scenes and the captured scenes look like the same
    product
  - is anything on screen that dates the video — timestamps, version
    numbers, placeholder data

List problems in severity order. Do not fix anything yet.
```

---

## By symptom

### The video is too long

```
The cut is 3m 40s and I need under 3m. Show me the narration lengths
sorted longest first, and propose which scenes to cut or merge. Do not
speed up the narration — cut words.
```

### It feels rushed

```
The cut feels breathless. Raise timing.gap from 0.45 to 0.6, and tell me
which scenes have actions with no hold after them.
```

### A scene is dead

```
04-discovery is eight seconds of frozen frame. Look at the narration line
and the current choreography and add beats to fill the time — the page has
a crawl view, a journey list and an API tab.
```

### Actions are invisible

```
In 05-map and 06-plan the clicks happen too fast to register. Add holds
after every click, and use s.moveTo before each one so the cursor travels
rather than teleporting.
```

### The narration is out of sync

```
compose reports drift 0.4s. Diagnose it: check that durations.json covers
every id in the sequence, and that no clip was trimmed hard in the
`x -> y` lines.
```

### A line is mispronounced

```
Edge TTS reads "PRD" as a word. Update the phonetic spelling to "P R D"
in every scene that says it, then `npm run narrate` — only changed lines
will re-synthesise.
```

### A scene shows the wrong thing

```
07-prd's narration talks about traceability but the clip is showing the
extraction stage. Re-choreograph it: land on the results, scroll to the
traceability tab, click it, and hold on the requirement-to-test matrix
for the last three seconds.
```

### Motion and capture look like different products

```
The motion scenes and the captured footage do not look like the same
product. Compare a frame of each and tell me what differs — background
colour, type weight, corner radius, border colour — then fix it in
design.tokens.json.
```

### The file is too big

```
out/demo.mp4 is 180MB. Raise crf in encode.final until it is under 50MB,
but stop at 25 — above that the UI text starts to smear. Tell me the
final size and crf.
```

---

## Adding a scene after the fact

```
Add a scene about <topic> between <id> and <id>.

  1. narration.json — a new entry, 12-15s, matching the voice of the
     rest. Use the "Nb" id form so nothing after it is renumbered.
  2. video.config.mjs — insert it in the sequence at the right position,
     with a lower third.
  3. scenes.mjs — choreography against <these routes and selectors>.

Then: npm run narrate && npm run motion && npm run capture -- <id> &&
npm run compose
```

---

## Removing a scene

```
Cut <id>. Remove it from narration.json and from the sequence. Leave
tts/ and raw/ alone — they are gitignored and harmless, and I may want
it back.

Then npm run compose and tell me the new length.
```

---

## Recording against a different environment

```
I want to record against staging instead of local. Confirm nothing in
scenes.mjs assumes local data, then show me the command.
```

(It is `BASE_URL=https://staging.acme.com npm run capture`.)

---

## Before you ship

```
Final check on out/demo.mp4:

  - total length matches the target
  - drift under 0.15s
  - it opens on a fade and ends on the end card, not mid-motion
  - no dev overlay, cookie banner or placeholder data in any frame
  - audio does not clip; the last line lands before the fade
  - it plays in a browser (faststart is set)

Report anything that fails, with the timestamp.
```
