# Prompt 01 · Write the script

Produces `narration.json`. Run this first — every later stage depends on the
scene lengths it produces.

---

## The prompt

```
Read docs/03-writing-narration.md before writing anything.

Write narration.json for a <LENGTH>-minute demo video of <PRODUCT>.

PRODUCT
  <Product> is <one sentence: what it does, concretely>.
  It is for <audience — be specific: "platform engineers at Series B
  companies", not "developers">.
  What makes it different from <the category it competes in> is
  <the actual differentiator, in one sentence>.

WHAT IT ACTUALLY DOES
  <3-6 bullets. Only real, shipped capabilities. This is the raw
  material for the capability scenes.>
  -
  -
  -

SCENES, in order
   1. hook        — the promise in one sentence
   2. problem     — why anyone should care          [motion scene]
   3. onboarding  — how easy it is to start
   4. pipeline    — the whole loop, once            [motion scene]
   5. <feature>   — takeaway: <what the viewer should remember>
   6. <feature>   — takeaway: <...>
   7. <feature>   — takeaway: <...>
   8. integrations— it fits where they already work
   9. cta         — what to do next

RULES
  - 130-150 words per minute. `npm run narrate` prints this; I will check.
  - One idea per scene. If a line needs "and also", split the scene.
  - Name the product in the hook and again in the CTA. Use "it" in between.
  - Never read UI labels aloud. Say why something matters, not what to click.
  - Specific numbers over adjectives: "under ten minutes", not "blazing fast".
  - Write for the ear. Short sentences, active voice, commas where a breath
    belongs.
  - Only describe what the product actually does. Do not overclaim. If you
    are unsure whether something is real, ask me instead of writing it.
  - Add phonetic spelling in `text` for anything Edge TTS will mispronounce
    (product names, acronyms). Nobody sees that field.

IDS
  Number them so they sort in running order: 01-hook, 02-problem,
  03-onboarding, 03b-pipeline, 04-<name>, ... , 09-cta.
  Use the `03b` form for scenes between numbers, so inserting one later
  does not renumber everything after it.

Then run `npm run narrate` and show me the words-per-minute column.
```

---

## Follow-ups

**Pace**

```
Scene 05 is 168 wpm and scene 09 is 118. Fix both by editing the words —
do not change tts.rate. Scene 05 should lose about 15 words.
```

**A scene doing two jobs**

```
Scene 07 makes two claims: that it generates code, and that the code is
readable. Split it into two scenes, 07-code and 07b-review, and renumber
the sequence in video.config.mjs to match.
```

**Overclaiming**

```
Scene 06 says "catches every regression". We cannot claim that. Rewrite it
to describe what actually happens: it runs the approved suite on every PR
and reports failures with a root cause summary.
```

**Marketing language**

```
Scenes 02 and 08 read like a landing page. Rewrite them the way an engineer
would explain the product to another engineer over coffee.
```

**Pronunciation**

```
Edge TTS says "Par-IK-shan". Update the phonetic spelling in every scene
that names the product so it reads as "Pareekshan".
```

**Tightening the arc**

```
The middle sags — scenes 05 through 08 are all "here is another feature".
Reorder them strongest first, and give 06 an explicit contrast with how
this is done today.
```

---

## Checking the result

```bash
npm run narrate
```

- **wpm** between 130 and 150 for every line
- **total** close to your target length
- **listen to every MP3** — pronunciation is the only thing the numbers do not catch

Then read the whole script aloud, in order. If you lose the thread anywhere,
the viewer will too.
