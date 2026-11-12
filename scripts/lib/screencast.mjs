/**
 * High-quality capture: CDP screencast frames -> constant-fps lossless video.
 *
 * Playwright's recordVideo encodes VP8 at a low bitrate at 1x, which is soft
 * before the film's camera ever zooms into it. Here the page renders at
 * viewport x deviceScaleFactor (3840x2160 for 1080p at dsf 2) and Chromium
 * hands over every composited frame through Page.startScreencast, each with
 * the time it was swapped to screen. Frames are written untouched, then
 * assembled by ffmpeg with their real durations and resampled to a constant
 * frame rate, losslessly.
 *
 * The screencast only emits a frame when something changes. A still page
 * therefore produces no frames at all, and a hold is the previous frame
 * shown for longer: each frame's duration is the gap to the next one, and the
 * last frame is held until the moment the capture stopped (which includes the
 * tail pad capture.mjs adds after the choreography).
 */
import fs from "node:fs";
import path from "node:path";

import { ffAsync, ffprobeJson } from "./ffmpeg.mjs";

/**
 * Starts a screencast on `page`, writing frames into `dir`.
 * @returns {Promise<{ stop: () => Promise<{ frames: {file: string, t: number}[], t0: number, t1: number }> }>}
 */
export async function startScreencast(page, { dir, format = "jpeg", quality = 95, width, height }) {
  const cdp = await page.context().newCDPSession(page);
  const ext = format === "png" ? "png" : "jpg";
  const frames = [];
  const writes = [];
  let n = 0;

  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    // Ack first: Chromium will not produce the next frame until this one is acked.
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    const file = path.join(dir, `${String(n++).padStart(6, "0")}.${ext}`);
    frames.push({ file, t: metadata.timestamp, w: metadata.deviceWidth, h: metadata.deviceHeight });
    writes.push(fs.promises.writeFile(file, Buffer.from(data, "base64")));
  });

  const t0 = Date.now() / 1000;
  await cdp.send("Page.startScreencast", {
    format,
    ...(format === "jpeg" ? { quality } : {}),
    maxWidth: width,
    maxHeight: height,
    everyNthFrame: 1,
  });

  return {
    async stop() {
      const t1 = Date.now() / 1000;
      await cdp.send("Page.stopScreencast").catch(() => {});
      await Promise.all(writes);
      await cdp.detach().catch(() => {});
      return { frames, t0, t1 };
    },
  };
}

/**
 * Assembles screencast frames into a constant-`fps` video of exactly
 * `t1 - t0` seconds. Returns stats for the log.
 */
export async function assemble({ frames, t0, t1 }, { dest, fps, encode, listDir }) {
  if (!frames.length) throw new Error("the screencast produced no frames");

  // CDP timestamps are wall-clock seconds, like Date.now(). If a platform ever
  // reports a different clock, fall back to the first frame as the origin.
  const skew = Math.abs(frames[0].t - t0) > 5;
  const start = skew ? frames[0].t : t0;
  const end = skew ? frames.at(-1).t + (t1 - t0) - (frames.at(-1).t - frames[0].t) : t1;

  const lines = ["ffconcat version 1.0"];
  frames.forEach((f, i) => {
    // The first frame also covers anything before it (the blank page while
    // the first navigation was in flight).
    const from = i === 0 ? start : f.t;
    const to = i + 1 < frames.length ? frames[i + 1].t : end;
    const d = Math.max(to - from, 1 / 1000);
    lines.push(`file '${path.basename(f.file)}'`, `duration ${d.toFixed(6)}`);
  });
  // The concat demuxer ignores the last entry's duration unless it is repeated.
  lines.push(`file '${path.basename(frames.at(-1).file)}'`);

  const list = path.join(listDir, "frames.ffconcat");
  fs.writeFileSync(list, `${lines.join("\n")}\n`);

  const total = end - start;
  await ffAsync([
    "-f", "concat", "-safe", "0", "-i", list,
    "-vf",
    `fps=${fps},scale=out_color_matrix=bt709:out_range=tv:flags=neighbor,setsar=1`,
    "-t", total.toFixed(3),
    ...encode,
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-an",
    "-y", dest,
  ]);

  const info = ffprobeJson(dest);
  const v = info.streams.find((s) => s.codec_type === "video");
  // The screencast is change-driven, so the average undercounts. The busiest
  // one-second window is what the browser sustains while things move.
  let peak = 0;
  for (let i = 0, j = 0; i < frames.length; i++) {
    while (frames[i].t - frames[j].t > 1) j++;
    peak = Math.max(peak, i - j + 1);
  }

  return {
    frames: frames.length,
    seconds: total,
    captureFps: frames.length / total,
    peakFps: peak,
    width: v?.width,
    height: v?.height,
    bytes: fs.statSync(dest).size,
  };
}
