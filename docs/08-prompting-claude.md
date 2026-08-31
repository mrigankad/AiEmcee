# 08 · Prompting Claude

This repo is built to be driven by Claude Code. The script, the choreography
and the motion graphics are all just text files, which is exactly the kind of
work an agent is good at — provided you give it the right context.

Ready-made prompts: **[docs/prompts/](prompts/)**.

## The one thing that decides whether this works

**Claude cannot see your product.**

Every failure mode below comes from the same root cause. The model will write
plausible choreography clicking a "Get started" button that does not exist, on
a route that does not exist, and you will only find out when `capture` prints
fifteen timeout warnings.

So: **give it the app, or give it the facts about the app.**

Best to worst:

1. **Point it at the product's own repo.** If both are checked out, say so —
   Claude reads your routes, components and test ids directly.
2. **Paste the routes and selectors.** A list of URLs and the real ids on each
   page removes the guesswork.
3. **Paste screenshots.** Enough to write layout, not enough for selectors.
4. **Describe it in prose.** It will invent selectors. Expect to fix them.

## The working loop

Do not ask for the whole video in one prompt. Four passes, each verified before
the next:

```
1. script          →  narration.json          →  npm run narrate   → listen
2. sequence        →  video.config.mjs        →  npm run doctor
3. choreography    →  scenes.mjs              →  npm run capture   → watch
4. motion + brand  →  Remotion, tokens        →  npm run motion    → check a frame
```

Each stage feeds the next. Getting the script right first is not optional —
scene lengths come from it, and re-cutting choreography after a script rewrite
is the whole job twice.

## Pass 1 — the script

Give Claude four things: what the product does, who it is for, what to show,
and how long.

```
Read docs/03-writing-narration.md.

Write narration.json for a 3-minute demo of <product>.

<Product> is <one sentence>. It is for <audience>. What makes it
different from <competitor category> is <the actual differentiator>.

The film should cover, in order:
  1. hook — the promise in one sentence
  2. problem — why anyone should care
  3. onboarding — how easy it is to start
  4. pipeline — the whole loop, as a motion scene
  5. <feature>  — <what the viewer should take away>
  6. <feature>  — <what the viewer should take away>
  ...
  N. cta

Constraints:
  - 130-150 wpm, which narrate will verify
  - one idea per scene
  - name the product in the hook and in the CTA, and use "it" in between
  - specific numbers over adjectives
  - never read UI labels aloud
  - phonetic spelling for anything Edge TTS will mispronounce
```

Then: `npm run narrate`, read the wpm column, listen to the MP3s. Ask for
targeted rewrites:

```
Scene 07 is 178 wpm — too fast, and it makes two claims. Split it into
two scenes and cut about 15 words from each.
```

### What Claude is good and bad at here

Good: structure, pacing, cutting marketing language, generating a coherent arc.

Bad: **it will overclaim.** Ask it explicitly to describe only what the product
actually does, and check every specific number in the script against reality.
An impressive demo that overstates is worse than an honest one.

## Pass 2 — the sequence

```
Read docs/02-architecture.md.

Update video.config.mjs so the sequence matches narration.json.

  - 02-problem and 03b-pipeline are motion scenes (Problem, Pipeline)
  - everything else is captured
  - add lower thirds to the six capability scenes; kickers 1-2 words,
    titles under 40 characters
  - baseUrl is http://localhost:3100
```

Verify with `npm run doctor` — it validates that every sequence id exists in
the narration.

## Pass 3 — the choreography

The pass that needs the most context.

```
Read docs/04-scene-choreography.md and scripts/lib/scene.mjs.

Write scenes.mjs for the captured scenes in the sequence.

The app is at ../acme (also checked out). Read its routes before
writing anything.

Narration lengths from `npm run narrate`:
  01-hook        13.3s
  03-onboarding  16.2s
  04-discovery   12.5s
  ...

For each scene: break the line into beats, then give each beat roughly
the seconds it is spoken over. Hold after every action. Prefer text=
and role selectors over CSS. Overrun rather than finish early.
```

If the product repo is not available, hand it the map yourself:

```
Routes and the selectors that matter:

  /                        #hero-url (input), form button
  /onboarding              text=Continue, text=Paste a live URL
  /projects/demo/discovery self-animating, runs ~10s
  /projects/demo/map       text=Checkout, [aria-label='Close inspector']
  /projects/demo/plan      button:has-text("Product search"),
                           button[aria-label^='Approve']
```

Then `npm run capture` and **watch the clips**. Feed back concretely:

```
Three problems in 06-plan:
  - `button:has-text("Product search")` timed out; the real text is
    "Product discovery"
  - the approve click is invisible — needs a longer hold after it
  - it finishes at 9s against a 14.3s line. Add a scroll through the
    rest of the plan and hold on the summary.
```

### The failure mode to watch for

Claude writes choreography that is technically valid and visually dead: click,
click, click, no holds. The clip is unwatchable at playback speed. Ask
explicitly for holds, and give it the narration length so it has a budget to
fill.

## Pass 4 — motion graphics and brand

```
Read docs/05-motion-graphics.md and docs/06-styling.md.

1. Update design.tokens.json to our brand. Primary is #0B6BCB; give me
   light and deep stops of the same hue for the gradients, plus a soft
   tint. Update cursor.ripple to match.

2. Rewrite the defaultProps for Problem and Pipeline in Root.tsx from
   scenes 02 and 03b of narration.json. Re-time the Problem beat cues
   against the 11.4s line.

3. Add a Metrics composition: three stat cards, staggered entrance,
   using the existing Motion primitives. 9.5s.

Use only the primitives in components/Motion.tsx. Do not introduce a
second brand colour.
```

Then `npm run motion` and look at a frame:

```bash
ffmpeg -i remotion/out/problem.mp4 -ss 8 -frames:v 1 -y /tmp/f.png
```

Ask Claude to check it — it can read the image and tell you what is wrong with
the layout.

## Prompting rules that hold across all four passes

**Name the doc.** "Read docs/04-scene-choreography.md" is worth more than any
amount of explaining, and the docs are written to be read by an agent.

**Give it the numbers.** Narration lengths turn "write some choreography" into
a problem with a checkable answer.

**Ask for one file at a time.** A prompt that touches the script, the config
and the choreography at once produces three mediocre files.

**Make it verify.** End prompts with the command that proves it worked:

```
Then run `npm run narrate` and show me the wpm column.
```

**Feed back with specifics.** "Scene 6 feels off" gets you a guess. "Scene 6
finishes at 9s against a 14.3s line, and the approve click has no hold" gets
you a fix.

**Push back on overclaiming.** This is the one place to be actively sceptical.
Ask it to justify any specific number in the script.

## Prompts that do not work

| Prompt | Why it fails |
| --- | --- |
| "Make me a demo video for my app" | no product knowledge, no script, no shape — you get generic marketing copy and invented selectors |
| "Write scenes.mjs" | with no narration lengths, there is no budget, so every scene is mistimed |
| "Make it look better" | no criteria. Name the frame and the problem |
| "Fix the video" | fix which stage? Each has its own command and its own failure modes |

## A full session

```
You:    Read docs/03-writing-narration.md. Write narration.json for a
        3-minute demo of Acme, an API monitoring tool for platform
        teams. Twelve scenes: hook, problem, onboarding, pipeline,
        then alerting, dashboards, incident timeline, integrations,
        then CTA. Motion scenes for problem and pipeline.

Claude: [writes narration.json]

You:    npm run narrate

        [reads output] Scene 5 is 168 wpm and scene 9 is 118. Fix both
        by editing the words.

Claude: [rewrites two entries]

You:    Good. Now update the sequence in video.config.mjs to match, with
        lower thirds on the four capability scenes.

Claude: [updates config]

You:    The app is at ../acme. Read its route files, then write
        scenes.mjs. Narration lengths: [pastes narrate output].

Claude: [writes scenes.mjs]

You:    npm run capture

        [watches] 07-incidents timed out on text=Timeline — it is
        actually a tab with aria-label="Incident timeline". And
        05-alerting finishes at 8s against 14s; add a scroll through
        the rule list and hold on the summary card.

Claude: [fixes both]

You:    npm run capture -- 07-incidents && npm run capture -- 05-alerting
        [watches] Good. npm run compose.
```

About ninety minutes, most of it watching clips.

## Next

- **[Prompt library](prompts/)** — copy-paste versions of all of the above
- **[09 Troubleshooting](09-troubleshooting.md)**
