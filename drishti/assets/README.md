# assets/

Source media you drop in yourself.

| File | Used by |
| --- | --- |
| a logo sting (`.mp4`) | `intro: { src: "assets/logo-reveal.mp4" }` in `video.config.mjs` |
| a music bed (`.mp3`) | see [docs/07-compositing.md](../docs/07-compositing.md#adding-a-music-bed) |

Video files here are gitignored by default, because a logo animation is
usually tens of megabytes and does not belong in a git history. If yours is
small enough to track, delete the `assets/*.mp4` lines from `.gitignore`.

An intro sting keeps its own audio — `compose.mjs` splices it in ahead of
scene one, followed by `timing.introTail` seconds of silence.
