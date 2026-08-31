# Example · Parikshan

A complete three-minute product film, as actually shipped. Thirteen scenes,
eight lower thirds, two explainer scenes, a logo sting and an end card.

Parikshan is an AI testing platform: point it at a repository or a URL, it
explores the app, proposes a test plan you approve, generates Playwright code,
runs it in the cloud and heals locators when the UI changes.

Read this when you want to see what a finished script and a full set of
choreography actually look like.

## Files

| | |
| --- | --- |
| `narration.json` | the shipped script — thirteen scenes |
| `durations.json` | what Edge TTS produced from it, to the millisecond |
| `scenes.mjs` | choreography for the eleven captured scenes |
| `video.config.mjs` | the running order, lower thirds, intro sting |

## Running it

```bash
cp examples/parikshan/narration.json .
cp examples/parikshan/scenes.mjs .
cp examples/parikshan/video.config.mjs .

# it records against a Parikshan production build on :3100
npm run build
```

You will not have the app, so treat this as reading material rather than
something to execute.

## The shape

| # | Scene | Length | Kind |
| --- | --- | --- | --- |
| 1 | hook | 13.3s | capture |
| 2 | problem | 11.4s | **motion** |
| 3 | onboarding | 16.2s | capture |
| 3b | pipeline | 12.8s | **motion** |
| 4 | discovery | 12.5s | capture + title |
| 5 | map | 13.9s | capture + title |
| 6 | plan | 14.3s | capture + title |
| 7 | PRD analysis | 24.7s | capture + title |
| 8 | code | 11.3s | capture + title |
| 9 | run | 11.3s | capture + title |
| 10 | triage | 20.6s | capture + title |
| 11 | analytics | 9.8s | capture + title |
| 12 | CTA | 10.8s | capture |

Narration 182.7s, plus gaps, the sting and the end card — a little over three
minutes.

## What is worth stealing

### The pipeline scene is fourth, not first

Scene 3b diagrams the whole loop. It sits *after* onboarding, so by the time
the viewer sees the diagram they have already watched the product work. The
model then pays for every scene that follows. Putting it first would be
explaining a thing nobody has seen yet.

### Scene 7 admits a limitation

The longest scene in the film, at 24.7 seconds, spends its second half on what
the product *cannot* do:

> And when a requirement cannot be tested as written, it says so. Vague
> wording, missing thresholds, and duplicated rules are flagged for you to
> fix, instead of being quietly ignored.

Nothing else in the film buys as much credibility. Every demo claims its
product works; almost none show it reporting its own limits.

### Scene 12 closes the loop

The CTA returns to the exact shot the film opened on — the hero URL field —
with the URL changed from `https://shopstack.demo` to `https://your-app.com`.
Same frame, now addressed to the viewer. It lands every time, and it costs two
lines of choreography.

### Scene 6 demonstrates an action, not a state

The plan page's visible cards were already approved, so the choreography
expands a *collapsed* journey specifically to find an unapproved item and
accept it on camera:

```js
await s.click('button:has-text("Product search")', { after: 800 });
await s.wait(0.5);
await s.click("button[aria-label^='Approve']", { after: 900 });
```

Showing an approved list proves nothing. Showing something being approved
proves the feature.

### Scene 4 knows when to do nothing

The discovery page runs its own ten-second crawl animation. The choreography is
two lines:

```js
await s.goto(`${PROJECT}/discovery`);
await s.wait(9.8);
await s.wait(1.2);
```

Arrive on time, stay out of the way.

### Scene 10 crosses four locations

Triage → healing → quarantine, in one scene, because the narration links them
into one claim: things break, they get healed, the flaky ones get isolated.
Three separate scenes would have broken the argument into three.

It is also the only scene that drags a slider, and it overshoots before
settling — past the target, back, then land — because that is what a person
does.

### Scene 8 points without clicking

```js
await s.moveTo("text=Copy");
await s.wait(1.2);
```

The narrator says "review it, diff it, own it". The cursor rests on the copy
button. No click, because clicking would navigate away from the point.

## The script

Read `narration.json` end to end. Things to notice:

- **The hook names the product in sentence two**, after a question that states
  the promise: "What if your app could test itself?"
- **The product name appears exactly twice** — the hook and the CTA. Everywhere
  in between it is "it".
- **Numbers, not adjectives**: "in under ten minutes", "Chromium, Firefox, and
  WebKit", not "blazing fast" and "all major browsers".
- **No UI labels are read aloud.** The narration never says "click Approve".
- **Every line is 127–161 wpm.** Checked with `npm run narrate`.

## Titles

Eight lower thirds, on the capability scenes only. The hook, the problem, the
onboarding and the CTA carry none — a title on the opening shot competes with
the thing the shot is there to show.

```
Discovery         The AI explores your app
Application map   Every screen, every endpoint
Test plan         You approve before any code
PRD analysis      Requirements, traced to tests
Playwright        Real code you own
Cloud runs        Chromium, Firefox, WebKit
Triage            Heal, then quarantine
Quality gates     Coverage, CI, Slack, Jira
```

Kicker names the area. Title states the takeaway. Nothing over 40 characters,
nothing with a full stop.
