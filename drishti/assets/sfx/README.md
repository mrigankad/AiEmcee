# Sound effects

Short UI and impact sounds the film's sound design cues from. The tone in
`remotion/src/film/tones.json` names which one plays for each role
(`transition`, `lowerThird`, `focus`, `outro`).

| File | Role it suits | Source file |
|---|---|---|
| `rollover.ogg` | lower third arriving | Kenney UI Audio, `rollover2` |
| `click.ogg` | lower third, app-store tone | Kenney UI Audio, `click2` |
| `select.ogg` | focus move landing | Kenney Interface Sounds, `bong_001` |
| `impact.ogg` | end card, cinematic focus | Kenney Impact Sounds, `impactSoft_heavy_003` |
| `tap.ogg` | spare soft accent | Kenney Impact Sounds, `impactSoft_medium_001` |

`whoosh` is not a file: it is synthesised at build time by
`scripts/lib/sound.mjs` (filtered pink noise with a swelling envelope), so its
length always matches the transition it sits under.

All files above are by [Kenney](https://kenney.nl/) and released under
**CC0 1.0** (public domain). They were selected via the `/brag` project's
SFX analysis, which rates each sound's brightness and high-frequency fatigue.

To use your own: drop a file here and name it in `direction.sfx` in
`video.config.mjs`, e.g. `sfx: { focus: "my-chime" }` for `assets/sfx/my-chime.ogg`
(`.ogg`, `.wav` or `.mp3`).
