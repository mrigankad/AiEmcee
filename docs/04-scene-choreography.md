# 04 · Scene choreography

`scenes.mjs` is what the browser does while the narrator talks. It is the part
of this repo you will rewrite most often, and the part that decides whether the
footage looks like a person or a robot.

## Shape

One exported function per captured scene id:

```js
export const SCENES = {
  "01-hook": async (s) => {
    await s.goto("/");
    await s.wait(0.9);
    await s.type("#hero-url", "https://acme.demo", 70);
    await s.moveTo("form button");
    await s.wait(0.6);
    await s.scroll(420, 1600);
    await s.wait(0.8);
  },
};
```

Only ids marked `from: "capture"` in `video.config.mjs` are recorded. Motion
scenes are Remotion's job and need nothing here.

## The Scene API

Defined in `scripts/lib/scene.mjs`.

### `s.goto(path)`

Navigate, relative to `capture.baseUrl`, then settle for
`capture.settleAfterNavigation` seconds.

```js
await s.goto("/projects/demo/discovery");
```

Waits for `domcontentloaded`, not `networkidle` — a page with live timers,
polling or a websocket never reaches networkidle, and waiting for a state that
will not arrive is how a scene hangs for twenty seconds.

### `s.wait(seconds)`

Hold. Seconds, because narration is measured in seconds.

```js
await s.wait(2.4);
```

### `s.click(selector, { after, ms })`

Glide the cursor to the element, emit a ripple, click, hold.

```js
await s.click("text=Continue", { after: 700 });
```

| Option | Default | Means |
| --- | --- | --- |
| `after` | `420` | ms held **after** the click, so the result is visible |
| `ms` | `520` | ms the cursor takes to travel there |

`after` is the option that matters. A click with no hold is invisible at
playback speed.

### `s.type(selector, text, delay)`

Focus, clear, type at a human cadence.

```js
await s.type("#hero-url", "https://acme.demo", 70);
```

`delay` is ms per keystroke. 55–75 reads as a confident typist. Below 40 looks
like a paste; above 100 is painful to watch.

### `s.moveTo(selector)`

Glide the cursor onto something without clicking. This is how you point.

```js
await s.moveTo("text=Copy");
await s.wait(1.2);
```

Use it whenever the narrator refers to something the viewer has to find. The
cursor is the pointing finger.

### `s.scroll(offset, ms, selector?)`

Eased scroll to an absolute offset.

```js
await s.scroll(420, 1600);              // auto-pick the scroller
await s.scroll(760, 1500, s.main);      // the app shell's <main>
```

With no selector, the largest actually-scrollable element wins. Marketing pages
usually scroll the document; app shells usually scroll `<main>`. Guessing wrong
produces a clip where nothing moves, so pass `s.main` explicitly inside an app
shell.

`ms` is the duration. **1500–2000ms for a screenful.** Faster than 1000ms and
the viewer cannot read anything on the way past.

### `s.dragSlider(selector, fractions, ms)`

Drag a range input through positions, cursor following.

```js
await s.dragSlider("input[type=range]", [0.62, 0.74, 0.4, 0.55]);
```

Written for before/after comparison sliders. The overshoot-and-settle pattern
above (past the target, back, then land) is what a real person does.

### `s.cursorTo(x, y, ms)`

Absolute coordinates, when there is no element to aim at.

### `s.main`

The string `"main"`. A convenience for the usual app-shell scroller.

### `s.page`

The raw Playwright `Page`, for anything the API does not cover:

```js
await s.page.locator("text=Coverage").first().scrollIntoViewIfNeeded();
await s.page.keyboard.press("Escape");
```

## Timing to the voice

This is the whole skill.

**1. Get the budget.** `npm run narrate` prints it:

```
spoke   04-feature          12.26s   26 words  127 wpm
```

12.26 seconds.

**2. Break the line into beats.** Read it aloud with a stopwatch and mark where
each clause lands:

```
"Now Acme explores your application like a real user."   0.0 – 3.2s
"It crawls every page,"                                  3.2 – 5.1s
"maps complete journeys,"                                5.1 – 7.0s
"and listens to network traffic to discover your APIs."  7.0 – 12.3s
```

**3. Give each beat its seconds:**

```js
"04-feature": async (s) => {
  await s.goto("/projects/demo/discovery");   // ~1.0s
  await s.wait(2.2);                          // land, let the viewer orient
  await s.scroll(240, 1500, s.main);          // "crawls every page"
  await s.wait(0.6);
  await s.click("text=Journeys", { after: 900 });  // "maps journeys"
  await s.wait(1.0);
  await s.click("text=API inventory", { after: 900 });
  await s.wait(2.4);                          // "discover your APIs" — hold
},
```

**4. Record and check.** `capture` prints what actually happened:

```
04-feature         narration 12.3s  drove 11.4s  clip 13.2s
```

`drove` under `narration` is fine — the tail is held on a live page. `drove`
well over it prints `(choreography overran)`, which means the end of the scene
plays in silence.

## Rules

### Hold after every action

A click with no pause is invisible. Nothing should happen and then immediately
be followed by something else.

### Overrun rather than finish early

`capture` pads a short scene automatically, and holding a *live* page is not
the same as freezing a frame — timers tick, carets blink, the shot stays alive.
Finishing three seconds early while the narrator is still talking is the worse
failure.

### One idea per scene

If the choreography needs to visit three unrelated screens, that is three
scenes.

### Prefer `text=` and role selectors

```js
await s.click("text=Continue");                       // good
await s.click("button[aria-label^='Approve']");       // good
await s.click(".sc-bdVaJa > div:nth-child(3) > button");  // will break
```

Text selectors survive a redesign, and they read as intent when someone else
opens the file six months from now.

### Let self-animating pages animate

If the page runs its own ten-second sequence, the scene's whole job is to
arrive on time and get out of the way:

```js
await s.goto("/projects/demo/discovery");
await s.wait(9.8);   // the crawl animation runs itself
await s.wait(1.2);
```

### Close the loop at the end

The CTA scene should return to the opening shot, now addressed to the viewer's
own app. It is a small thing and it lands every time.

```js
await s.type("#hero-url", "https://your-app.com", 65);
```

## Debugging

**Watch the clip.** `raw/<id>.webm` is written even when choreography throws.
The clip shows you exactly where it stopped.

**Read the warning.** A missed selector logs and continues:

```
  ! 06-plan: locator.waitFor: Timeout 15000ms exceeded.
```

**Watch the browser.** Temporarily launch headed, in `capture.mjs`:

```js
const browser = await chromium.launch({
  args: config.capture.launchArgs,
  headless: false,
  slowMo: 250,
});
```

**Find the real selector** with Playwright's inspector against your app:

```bash
npx playwright codegen http://localhost:3100
```

**Iterate on one scene:**

```bash
npm run capture -- 06-plan
```

## Recipes

**Expand a section, then act inside it**

```js
await s.click('button:has-text("Product search")', { after: 800 });
await s.wait(0.5);
await s.click("button[aria-label^='Approve']", { after: 900 });
```

**Open a panel, read it, close it**

```js
await s.click("text=Checkout", { after: 900 });
await s.wait(1.6);
await s.click("[aria-label='Close inspector']", { after: 500 });
```

**Point at something without clicking**

```js
await s.page.locator("text=Coverage").first().scrollIntoViewIfNeeded();
await s.wait(0.4);
await s.moveTo("text=Coverage");
await s.wait(2.4);
```

**Cross two pages in one scene**

```js
await s.goto("/analytics");
await s.wait(1.2);
await s.scroll(380, 1600, s.main);
await s.wait(1.8);
await s.goto("/integrations");
await s.wait(0.9);
await s.scroll(980, 1800, s.main);
await s.wait(2.2);
```

Only when the narration links them. Otherwise it is two scenes.

## Next

- **[05 Motion graphics](05-motion-graphics.md)**
- **[Prompt: write the choreography](prompts/02-choreography.md)**
