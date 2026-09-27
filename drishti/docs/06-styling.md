# 06 · Styling

The design system, and how to make the whole video look like your product
instead of like this template.

## One source of truth

`design.tokens.json` at the repo root. Read by both runtimes:

- `video.config.mjs` (Node) — frame size, frame rate, cursor colours
- `remotion/src/theme.ts` (TypeScript, via Remotion's bundler) — everything

It is JSON rather than JavaScript because those are the only two formats both
consume without a build step. Frame size lives there for a specific reason: if
the compositor and the compositions disagreed about 1600×900, every motion
scene would be silently rescaled and text would go soft.

## The tokens

```json
{
  "video":  { "width": 1600, "height": 900, "fps": 30 },

  "fonts":  { "display": "Michroma", "sans": "Geist", "mono": "ui-monospace, …" },

  "color": {
    "page": "#f2f2f2", "container": "#ffffff", "raised": "#fafafa",
    "text": "#101010", "secondary": "#464646", "tertiary": "#737373",
    "muted": "rgba(0,0,0,0.08)", "stroke": "rgba(0,0,0,0.14)",
    "brand": "#ff7b1c", "brandLight": "#ffa12b",
    "brandDeep": "#dc440c", "brandSoft": "#fff6ed",
    "success": "#3fae69", "successSoft": "rgba(63,174,105,0.12)",
    "error": "#c62830", "errorSoft": "#fff1f2"
  },

  "cursor": { "fill": "#ffffff", "stroke": "#111111", "ripple": "rgba(255,124,28,0.9)", "size": 22 }
}
```

### Surfaces

Three levels, and only three. `page` is the ground, `container` is a card on
it, `raised` is a panel inside a card. If you find yourself wanting a fourth,
the layout is too nested for video.

### Text

Three weights of emphasis. `text` for anything that must be read, `secondary`
for supporting copy, `tertiary` for labels and hints. Nothing else.

### Brand

Four stops of one hue, and one hue only:

| Token | Use |
| --- | --- |
| `brandLight` | gradient start, rim highlights |
| `brand` | the base, rarely used flat |
| `brandDeep` | gradient end, kickers, small text on light |
| `brandSoft` | tinted backgrounds |

Gradients run `brandLight → brandDeep`, left to right or top to bottom.

**Do not add a second brand colour.** If a design needs two materials, the
second one is a neutral. This is the difference between a video that looks
designed and one that looks decorated.

### Status

`success` and `error` belong to badges, diffs and the payoff strip. They are
never decoration.

## Typography

Two faces, used for exactly one thing each.

**Display (`Michroma`)** — small, uppercase, wide letter-spacing. Eyebrows,
kickers, step numbers. It never sets a headline and it never sets body copy.
Its whole job is to signal "this is a label, not prose".

**Sans (`Geist`)** — everything else. Headlines at 600 weight with tight
negative tracking; body at 400.

### The scale

| Role | Size | Weight | Tracking |
| --- | --- | --- | --- |
| Hero headline | 52 | 600 | -1.4 |
| Section headline | 48 | 600 | -1.2 |
| End card title | 56 | 600 | -1.6 |
| Card title | 22 | 600 | -0.3 |
| Body | 16–18 | 400 | 0 |
| Lower-third title | 22 | 600 | -0.3 |
| Eyebrow / kicker | 11–13 | 400 | +0.14 to +0.18em, uppercase |

Two rules that carry most of the look:

**Large type gets negative tracking.** At 48px and up, default letter-spacing
looks loose. -1.2 to -1.6 is what makes a headline read as typeset rather than
typed.

**Small type gets positive tracking, and only in caps.** +0.14em minimum. Tight
uppercase at 11px is illegible.

**Never go below 14px.** This is video. It may be watched at 50% size in a
Slack preview, or on a phone.

## Motion

| Property | Value |
| --- | --- |
| Entrance | rise 18px + fade, spring `{ damping: 18, mass: 0.7, stiffness: 120 }` |
| Fade in | 10–12 frames |
| Fade out | 10–12 frames |
| Stagger between siblings | 4–8 frames |
| Cursor travel | 520ms, `easeInOutQuad` |
| Click ripple | 420ms, scale to 2.2, fade out |
| Page scroll | 1200–2000ms, `easeInOutQuad` |
| Lower third | in at 0.35s, out at 2.15s, over a 2.5s hold |

Everything enters the same way. That is the point.

## Rebranding

Four steps, about twenty minutes.

### 1. Colours

Edit `design.tokens.json`. Pull the values from your product's own tokens — the
video should be the same colour as the app it is showing.

The minimum set to change:

```json
"brand":      "your primary",
"brandLight": "a lighter stop of the same hue",
"brandDeep":  "a deeper stop of the same hue",
"brandSoft":  "a very light tint of it",
"cursor":     { "ripple": "rgba(<brand rgb>, 0.9)" }
```

`brandLight` and `brandDeep` should be genuine stops of one hue, not two
different colours — the gradients depend on it.

### 2. Fonts

Change the two imports in `remotion/src/fonts.ts`:

```ts
import { loadFont as loadDisplay } from "@remotion/google-fonts/Michroma";
import { loadFont as loadSans } from "@remotion/google-fonts/Geist";
```

Any family in `@remotion/google-fonts` works — the package name is the family
name with no spaces. Update `fonts` in `design.tokens.json` to match so the
docs stay honest.

For a non-Google font, put the file in `remotion/public/` and load it with
`@remotion/fonts`.

Pairings that work:

| Display | Sans | Reads as |
| --- | --- | --- |
| Michroma | Geist | technical, precise |
| Space Grotesk | Inter | modern, friendly |
| JetBrains Mono | Inter | developer tool |
| Archivo | Archivo | one family, two weights — safest |

### 3. Your mark

Drop an SVG or PNG in `remotion/public/`, then in `Root.tsx`:

```tsx
defaultProps={{
  mark: "mark.svg",
  title: "Acme",
  kicker: "A one-line positioning statement",
  tagline: "Paste your URL. Ship with confidence.",
}}
```

### 4. Dark mode

The compositions read every colour from tokens, so inverting the surfaces is
enough:

```json
"page": "#000000",
"container": "#101010",
"raised": "#191919",
"text": "#f5f5f5",
"secondary": "#b4b4b4",
"tertiary": "#8a8a8a",
"muted": "rgba(255,255,255,0.08)",
"stroke": "rgba(255,255,255,0.14)"
```

Two things then need attention by hand:

- **Lit step nodes** in `Pipeline` use `theme.text` as a background with white
  text. On dark that inverts wrong — swap it for `theme.brand`.
- **The lower third's panel** is hardcoded `rgba(255,255,255,0.92)` because it
  sits over live footage. Change it to a dark translucent value, and flip
  `cursor.fill` / `cursor.stroke` so the cursor stays visible on your UI.

Then `npm run motion` and check a frame.

## Frame size

Change it in one place:

```json
"video": { "width": 1920, "height": 1080, "fps": 30 }
```

Capture picks the viewport up automatically. Everything scales.

| Size | For |
| --- | --- |
| 1600×900 | the default — crisp UI, sensible file size |
| 1920×1080 | full HD, if the destination demands it |
| 1280×720 | small files, embeds |
| 1080×1080 | square, social |
| 1080×1920 | vertical — **compositions need real layout work, not just a resize** |

Keep 30fps. UI footage has no motion blur, and 60 doubles render time to show
you the same thing.

## Making the recorded UI look right

The motion graphics are only half the frame. The rest is your app.

**Seed believable data.** Real-looking names, a run that has completed, a chart
with a shape. Empty states make a product look unfinished, and no amount of
production fixes that.

**Hide anything that dates the video.** Absolute timestamps, version numbers,
"3 days ago". Add them to `capture.hide`:

```js
hide: [
  "nextjs-portal",
  "[data-testid='build-version']",
  "#cookie-banner",
],
```

**Check contrast at small sizes.** Play a frame at 50%. If a label vanishes, it
is too small or too light for video.

**Match the video's page colour to your app's.** The motion scenes cut directly
against captured footage; if `page` is `#f2f2f2` and your app is white, every
cut flashes.

## Next

- **[07 Compositing](07-compositing.md)**
- **[Prompt: rebrand](prompts/04-design-system.md)**
