# 07 · Compositing

What `scripts/compose.mjs` does with ffmpeg, and how to change it.

## The four passes

```
normalise  ──▶  title  ──▶  concat  ──▶  mux
```

Each has one job, and the order matters.

### 1. normalise

Every clip is forced to identical width, height, frame rate, pixel format and
duration.

```
-vf scale=1600:900:flags=lanczos,fps=30,format=yuv420p[,tpad=...]
-t  <narration + gap>
-an
```

| Part | Why |
| --- | --- |
| `scale=…:flags=lanczos` | highest-quality resampler — matters for UI text |
| `fps=30` | Playwright's webm frame rate wanders; this pins it |
| `format=yuv420p` | the only pixel format every player handles |
| `tpad=stop_mode=clone` | short clips hold their last frame |
| `-t` | the hard cut to the exact target |
| `-an` | drop audio; the narration track is built separately |

The target is always `durations[id] + timing.gap`. That single line is what
keeps picture and sound locked together.

This uniformity is not cosmetic. It is what makes the next-but-one step able to
stream-copy instead of re-encoding everything twice.

### 2. title

Scenes with a `lowerThird` get the PNG composited on top:

```
[1:v]format=rgba,
     fade=t=in:st=0.35:d=0.25:alpha=1,
     fade=t=out:st=2.15:d=0.3:alpha=1[lt];
[0:v][lt]overlay=0:0:format=auto:eof_action=pass
```

The still is looped for 2.5 seconds, faded in at 0.35s and out at 2.15s, and
overlaid at the origin — the card positions itself inside its own transparent
1600×900 frame, so the overlay never needs coordinates.

`eof_action=pass` lets the base video continue after the 2.5-second overlay
ends. Without it, the scene would be truncated to the length of the title card.

### 3. concat

```
ffmpeg -f concat -safe 0 -i video.txt -c copy silent.mp4
```

The concat **demuxer**, not the filter. `-c copy` means no re-encode: the clips
are already identical, so their packets are just appended. It takes a second
instead of a minute, and costs no generation loss.

This only works because normalise did its job. Any mismatch in resolution,
frame rate, pixel format or codec parameters, and the output is corrupt or the
join fails.

The audio track is built the same way, from narration WAVs interleaved with
silence of exactly `timing.gap`, in the same order — which is what guarantees
the two timelines match.

Concat lists need forward slashes even on Windows, which is what
`posix()` in `scripts/lib/config.mjs` is for.

### 4. mux

One final encode combining the silent cut and the narration:

```
-vf fade=t=in:st=0:d=0.5,fade=t=out:st=<end-0.8>:d=0.8
-af afade=t=in:st=0:d=0.4,afade=t=out:st=<end-1.0>:d=1.0
-c:v libx264 -preset slow -crf 19 -pix_fmt yuv420p
-c:a aac -b:a 192k
-movflags +faststart
-shortest
```

| Flag | Why |
| --- | --- |
| `-preset slow -crf 19` | the only quality-critical encode; worth the time |
| `-movflags +faststart` | moves the index to the front so it streams |
| `-shortest` | guards against a rounding-level mismatch becoming a frame of black |

The audio fades out slightly ahead of the video, so the picture is still there
when the sound goes.

## Reading the output

```
01-hook            11.0s -> 11.1s
02-problem         11.5s -> 11.0s
04-feature         14.0s -> 12.7s
                   + lower third "Discovery"

video   68.83s
audio   68.83s
drift   0.005s
final   68.83s  ->  out/demo.mp4
```

`x -> y` is source duration to target. Padding by more than about two seconds
means the choreography is finishing early. Trimming by more than about two
means it is overrunning — the tail is being cut.

**`drift` is the health check.** Under a few milliseconds is correct. Above
`0.15s` means a scene is in one timeline and not the other, and `compose`
flags it.

## The timing knobs

In `video.config.mjs`:

```js
timing: {
  gap: 0.45,        // silence after each line — the breathing room
  tailPad: 0.9,     // extra seconds a clip must outlast its narration
  minPad: 0.6,      // floor on the end-of-scene hold
  introTail: 0.35,  // beat after the logo sting
  endHold: 3.2,     // how long the end card holds
  fadeIn: 0.5,
  fadeOut: 0.8,
}
```

**`gap`** is the one worth tuning. 0.45s is a comfortable default. Below 0.3 the
video feels breathless; above 0.7 it drags. It applies uniformly, so changing
it changes the pace of the whole film.

**`endHold`** should be long enough to read the end card and no longer. 3–4
seconds.

## Recipes

### Adding a music bed

Add a third input to the mux and mix it under the narration:

```js
ff([
  "-i", silentCut,
  "-i", narrationWav,
  "-i", at("assets/music.mp3"),
  "-filter_complex",
    // narration to the front, music at 12% under it, ducking on overlap
    "[2:a]volume=0.12,afade=t=out:st=" + (total - 3).toFixed(2) + ":d=3[bed];" +
    "[1:a][bed]amix=inputs=2:duration=first:dropout_transition=0[a]",
  "-map", "0:v", "-map", "[a]",
  ...
]);
```

Keep it at 10–15%. Louder and it fights the voice. Choose something without a
strong melody — a bed, not a song.

### Cross-dissolves between scenes

The concat demuxer produces hard cuts, which is correct for a product demo:
hard cuts read as decisive, dissolves read as a slideshow.

If you need one, `xfade` is the filter — but it requires re-encoding the join,
so build it as a separate pass rather than changing the concat step.

### A different output format

```js
encode: {
  final: ["-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0"],  // WebM
}
```

Change `output` to match the container: `out/demo.webm`.

### Smaller files

Raise `crf`. 19 is high quality; 23 is noticeably smaller and still fine for
Slack. Above 28, UI text starts to smear — which is the one thing a product
demo cannot afford.

### A per-scene trim

There is no per-scene trim, by design: scene length is narration length. To
make a scene shorter, cut words from the line.

## Why it looks like this

**Why not one big filter_complex?** It would re-encode everything once, be
impossible to debug, and give you no way to inspect an intermediate. Passes
writing to `work/` mean you can play any stage.

**Why keep `work/` after a successful run?** So you can. When something looks
wrong, `work/04-feature.mp4` is the clip exactly as it entered the concat.

**Why `-c copy` for the join?** Speed and quality. The clips are already
correct; re-encoding them would cost a minute and a generation of quality for
nothing.

**Why is the end card silent?** So the last narrated line has room to land
before the video ends. A CTA that gets cut off by the fade is a wasted CTA.

## Next

- **[08 Prompting Claude](08-prompting-claude.md)**
- **[09 Troubleshooting](09-troubleshooting.md)**
