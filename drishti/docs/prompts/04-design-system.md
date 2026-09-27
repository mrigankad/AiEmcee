# Prompt 04 · Design system

Makes the video look like your product instead of like this template. About
twenty minutes.

---

## The rebrand prompt

```
Read docs/06-styling.md.

Rebrand this pipeline for <PRODUCT>.

BRAND
  Primary colour: <#HEX>
  <If you have them: the light and deep stops of the same hue, and a soft
   tint. Otherwise ask Claude to derive them.>
  Display font: <family, or "keep Michroma">
  Sans font:    <family, or "keep Geist">
  Surface:      <light | dark>

DO
  1. Update design.tokens.json:
     - brand, brandLight, brandDeep, brandSoft as four stops of ONE hue.
       brandLight and brandDeep must be genuine stops of the same hue, not
       two different colours — the gradients depend on it.
     - cursor.ripple to an rgba of the brand at 0.9 alpha
     - match `page` to my app's background colour, so the motion scenes do
       not flash against the captured footage
  2. Update the font imports in remotion/src/fonts.ts, and the `fonts`
     block in design.tokens.json so it stays honest.
  3. Leave every component alone — they read from tokens. If you find
     yourself editing a composition to change a colour, that colour is
     hardcoded and should be a token instead.

DO NOT
  - introduce a second brand hue. If a design needs two materials, the
    second one is a neutral.
  - change the type scale or the motion timings.

Then `npm run motion` and pull a frame from each scene so we can look.
```

---

## Dark mode

```
Read docs/06-styling.md, the dark mode section.

Switch design.tokens.json to a dark surface: page #000000, container
#101010, raised #191919, text #f5f5f5, secondary #b4b4b4, tertiary
#8a8a8a, and translucent white for muted and stroke.

Then fix the two things that do not invert automatically:

  1. Pipeline's lit step nodes use theme.text as a background with white
     text. On dark that inverts wrong — use theme.brand instead.
  2. LowerThird's panel is hardcoded rgba(255,255,255,0.92) because it
     sits over live footage. Make it a dark translucent value, and flip
     cursor.fill / cursor.stroke so the cursor stays visible over my UI.

Render and show me a frame of each.
```

---

## Aspect ratio

```
Change the output to <1920x1080 | 1080x1080 | 1080x1920>.

Update `video` in design.tokens.json. The capture viewport and every
composition follow automatically.

Then check each composition at the new size and fix the layouts — a
resize is not a redesign. In particular <for vertical: the Pipeline rail
has to become a vertical stack, and the headline needs fewer words per
line>.
```

---

## Making the recorded UI match

The motion graphics are only half the frame.

```
Read docs/06-styling.md, the last section.

Look at the frames in raw/ and tell me what would date or cheapen the
video:
  - absolute timestamps, "3 days ago", version numbers
  - placeholder or lorem data
  - empty states
  - cookie banners, dev badges, feature-flag toggles

For anything that should be hidden rather than fixed in the app, add the
selector to capture.hide in video.config.mjs.
```

---

## Follow-ups

**Colours are off**

```
brandLight and brandDeep are reading as two different colours rather than
stops of one hue. Derive them from the primary: lighten and darken in the
same hue family, keeping saturation close.
```

**Cuts flash**

```
There is a visible flash cutting from a motion scene into captured
footage. The motion `page` colour does not match my app's background —
mine is #ffffff.
```

**Illegible**

```
Pull a frame and scale it to 800px wide. The card body copy disappears at
that size. Raise it and check the contrast against the container colour.
```

---

## Checking the result

```bash
npm run motion
ffmpeg -i remotion/out/problem.mp4 -ss 8 -frames:v 1 -y /tmp/f.png
ffmpeg -i /tmp/f.png -vf scale=800:-1 -y /tmp/small.png   # the 50% test
```

- one brand hue, four stops
- gradients run light to deep
- nothing below 14px
- the motion `page` colour matches your app's background
- the cursor is visible against your UI
