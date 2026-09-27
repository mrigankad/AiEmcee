# 03 · Writing narration

The script is the video. Everything else is production. A great script badly
rendered is still a good demo; a bad script perfectly rendered is a bad demo
that took longer.

## The file

`narration.json` — an array, in no particular order (`sequence` decides the
order):

```json
[
  {
    "id": "01-hook",
    "title": "The promise, in one sentence",
    "text": "What if your app could test itself? Meet Acme, the platform that turns a code repository, or a live URL, into a runnable test suite in minutes."
  }
]
```

| Field | Purpose |
| --- | --- |
| `id` | join key for the whole pipeline — MP3, clip, sequence entry, lower third |
| `title` | a note to yourself. Never rendered. Use it to state the scene's job |
| `text` | exactly what is spoken |

### Naming ids

Number them so they sort in running order, and name them for their job:

```
01-hook  02-problem  03-onboarding  03b-pipeline  04-discovery  …  12-cta
```

The `03b` form is deliberate: it is how you insert a scene later without
renumbering everything after it — which would mean renaming every MP3 and every
recorded clip.

## Structure

A product demo that works has a shape. This one, over roughly three minutes:

| # | Beat | Job | Length |
| --- | --- | --- | --- |
| 1 | **Hook** | the promise, in one sentence | 10–15s |
| 2 | **Problem** | why anyone should care | 10–15s |
| 3 | **Onboarding** | how easy it is to start | 15–20s |
| 4 | **Pipeline** | the whole loop, once, so the rest makes sense | 10–15s |
| 5–10 | **Capabilities** | one idea per scene, best first | 10–25s each |
| 11 | **Integrations** | it fits where you already work | 10s |
| 12 | **CTA** | what to do next | 10s |

Two things are load-bearing.

**The hook names the product and the promise in the first sentence.** Viewers
decide within ten seconds. "What if your app could test itself?" then the name,
then the mechanism.

**The pipeline scene sits at position four, not first.** Show the product
moving before you diagram it. By scene four the viewer has seen the thing work
and is ready for a model of it, and that model then pays for every scene after.

## Rules

### One idea per scene

If a line contains "and also", it is two scenes. Scenes are cheap; a viewer
losing the thread is not.

### 130–150 words per minute

`npm run narrate` prints wpm for every line. Above 160 the narrator sounds
rushed and nobody can follow the UI at the same time. Below 120 it drags.

Fix pace **by editing the words**, never by changing `tts.rate`. A sentence
that is too long to read comfortably is a sentence that should be shorter.

### Write for the ear

Read it aloud. If you run out of breath, it is too long.

| Instead of | Say |
| --- | --- |
| "utilise" | "use" |
| "in order to" | "to" |
| "Parikshan will then proceed to generate" | "Parikshan writes" |
| "leverage our AI-powered platform" | just say what it does |

Short sentences. Active voice. Commas where you want a breath — Edge TTS
honours them, and they are your only pacing control.

### Narrate what is on screen, one beat ahead

The voice should arrive just before the UI does. "It crawls every page" as the
crawl starts, not three seconds after it finished.

This is also why the script comes first: you cannot time a browser to a voice
that does not exist yet.

### Never read the UI aloud

If the button says "Approve", do not say "click the Approve button". Say why
approval matters. The picture handles the what.

### Name the product early, and again at the end

Twice, deliberately. Once in the hook, once in the CTA. In between, use "it".

### Numbers over adjectives

"Under ten minutes" beats "incredibly fast". "Chromium, Firefox and WebKit"
beats "all major browsers".

## Pronunciation

Edge TTS mispronounces product names, acronyms and anything unusual. Always
listen before recording anything.

| Problem | Fix |
| --- | --- |
| Product name is wrong | spell it phonetically: `Parikshan` → `Pareekshan` |
| An acronym is read as a word | space the letters: `API` → `A P I` |
| Two clauses run together | add a comma |
| A sentence rushes | split it in two |

The phonetic spelling lives in `text` and is never seen by anyone.

## Choosing a voice

```bash
edge-tts --list-voices | grep en-US
```

Solid defaults:

| Voice | Character |
| --- | --- |
| `en-US-AndrewMultilingualNeural` | warm, measured, credible — the default here |
| `en-US-BrianMultilingualNeural` | brighter, more energetic |
| `en-US-AvaMultilingualNeural` | clear, professional |
| `en-GB-RyanNeural` | British, understated |

Set it in `video.config.mjs` under `tts.voice`, then `npm run narrate -- --all`
to rebuild every line in the new voice.

Leave `rate` at `+0%`. If a line needs to be faster, cut words.

## Working method

1. **Draft the whole script first.** Do not write scene one and record it. The
   whole thing exists before anything is recorded, because the script decides
   every scene's length.
2. **`npm run narrate`.** Read the wpm column. Fix anything outside 130–150.
3. **Listen to every MP3.** Fix pronunciation.
4. **Read the durations as a storyboard.** A 24-second scene needs four or five
   distinct beats of choreography. A 9-second scene needs one.
5. **Then write `scenes.mjs`.**

## A worked example

`examples/parikshan/narration.json` is a complete thirteen-scene, three-minute
script as shipped. Read it end to end — it is the fastest way to internalise
the rhythm.

Its scene 7, the longest at 24.7 seconds, is worth studying: it makes a claim,
demonstrates it, then makes the *counter*-claim that the product also reports
what it cannot do. Admitting a limitation mid-demo is the most credible thing
in the whole film.

## Next

- **[04 Scene choreography](04-scene-choreography.md)** — timing a browser to the voice
- **[Prompt: write the script](prompts/01-script.md)** — hand this to Claude
