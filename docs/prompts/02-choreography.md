# Prompt 02 · Sequence and choreography

Produces `video.config.mjs` (the running order) and `scenes.mjs` (what the
browser does). Run after the script is final.

---

## Step A — the sequence

```
Read docs/02-architecture.md.

Update the `sequence` in video.config.mjs so it matches narration.json.

  - 02-problem is a motion scene using the Problem composition
  - 03b-pipeline is a motion scene using the Pipeline composition
  - everything else is captured
  - add a lowerThird to these scenes:
      04-<name>, 05-<name>, 06-<name>, 07-<name>
    kickers 1-2 words, titles under 40 characters, no full sentences
  - baseUrl is http://localhost:<PORT>
  - output is out/<name>.mp4

Then run `npm run doctor` and show me the project config line.
```

---

## Step B — the choreography

**This is the prompt that needs real product knowledge.** Use the first form if
the product's repo is available; the second otherwise.

### With the product repo checked out

```
Read docs/04-scene-choreography.md and scripts/lib/scene.mjs.

The product is at <../acme>. Read its routes and page components before
writing anything — I want real selectors, not invented ones.

Write scenes.mjs for every scene marked `from: "capture"` in the sequence.

Narration lengths from `npm run narrate`:
  01-hook          13.3s
  03-onboarding    16.2s
  04-<name>        12.5s
  05-<name>        13.9s
  ...
  09-cta           10.8s

For each scene:
  1. Break the narration line into beats — which clause is spoken when.
  2. Give each beat roughly the seconds it is spoken over.
  3. Hold after every action. `after` on a click, or an explicit wait.
     A click with no pause is invisible at playback speed.
  4. Prefer text= and aria-label selectors over CSS classes.
  5. Overrun rather than finish early. capture pads a short scene, but
     finishing while the narrator is still talking looks broken.

The CTA scene should return to the opening shot, with the URL changed to
"https://your-app.com".

Add a one-line comment above each scene saying what it is demonstrating.
```

### Without the product repo

Add this block instead of the "product is at" line:

```
ROUTES AND SELECTORS

  /                          #hero-url (input), form button
  /onboarding                text=Continue, text=Paste a live URL
  /projects/demo/discovery   self-animating, runs ~10s, no interaction needed
  /projects/demo/map         text=Checkout, [aria-label='Close inspector'],
                             text=API inventory
  /projects/demo/plan        scrolls <main>,
                             button:has-text("Product search"),
                             button[aria-label^='Approve']
  /projects/demo/runs/137    shards animate in over ~4s, scrolls <main>

Use only these selectors. If a scene needs something not listed, tell me
what you need rather than guessing.
```

That last sentence matters. Without it the model invents selectors and you find
out during capture.

---

## Follow-ups

Watch the clips in `raw/` first, then be specific.

**A selector was wrong**

```
06-plan timed out on `button:has-text("Product search")`. The real label
is "Product discovery". Fix it, then re-run `npm run capture -- 06-plan`.
```

**A scene is dead**

```
04-discovery is 4 seconds of choreography against a 12.5s line, so eight
seconds is a held frame. Add beats: scroll through the discovered pages,
click into the API tab, hold on the endpoint list.
```

**Actions are invisible**

```
In 05-map the clicks happen too fast to see. Add `after: 900` to each one,
and a 1.5s hold after the inspector opens.
```

**Scrolling does nothing**

```
07-prd's scroll picks the wrong element. That page scrolls an inner
container, not <main> — pass the scroller explicitly.
```

**It looks robotic**

```
Scenes 08 and 09 teleport between elements. Use s.moveTo before each click
so the cursor travels, and hold on the thing being discussed rather than
moving on immediately.
```

**A slider**

```
10-triage should drag the before/after slider. Use s.dragSlider with
overshoot and settle — past the target, back, then land — so it reads as
a person.
```

---

## Checking the result

```bash
npm run capture
```

Read the columns:

```
01-hook            narration 13.3s  drove 12.1s  clip 14.2s
04-discovery       narration 12.5s  drove  4.1s  clip 13.4s   <- dead
06-plan            narration 14.3s  drove 18.9s  clip 19.5s  (choreography overran)
```

- `drove` within a couple of seconds of `narration` is right
- `drove` far below means a held frame while the voice is still going
- `(choreography overran)` means the tail gets trimmed

Then **watch every clip**. The numbers cannot tell you that a click landed on
the wrong thing.
