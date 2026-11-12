/** Thin ffmpeg / ffprobe wrappers. Everything the compositor needs, nothing else. */
import { execFileSync, spawn, spawnSync } from "node:child_process";

/**
 * Run ffmpeg, quiet unless it actually fails.
 *
 * `{ stderr: true }` runs at info level and returns stderr as a string, for
 * filters that report through the log (loudnorm, volumedetect).
 */
export function ff(args, { stderr = false } = {}) {
  try {
    if (stderr) {
      const run = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-loglevel", "info", ...args], {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      if (run.status !== 0) throw Object.assign(new Error("ffmpeg failed"), { stderr: run.stderr });
      return run.stderr;
    }
    return execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    const detail = err.stderr?.toString().trim();
    throw new Error(`ffmpeg failed\n  ${args.join(" ")}\n${detail ? `\n${detail}` : ""}`);
  }
}

/** ffmpeg without blocking the event loop, so several can run side by side. */
export function ffAsync(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg failed\n  ${args.join(" ")}\n\n${err.trim()}`)),
    );
  });
}

/** Up to `limit` items of `items` through `run` at a time; results in input order. */
export async function pool(items, limit, run) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await run(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

/** Duration of a media file, in seconds. */
export function probe(file) {
  const raw = execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "csv=p=0",
    file,
  ]).toString().trim();

  const seconds = parseFloat(raw);
  if (!Number.isFinite(seconds)) throw new Error(`could not read duration of ${file}`);
  return seconds;
}

/** ffprobe's JSON for a file: streams and format. */
export function ffprobeJson(file) {
  const raw = execFileSync("ffprobe", [
    "-v", "error",
    "-show_streams",
    "-show_format",
    "-of", "json",
    file,
  ]).toString();
  return JSON.parse(raw);
}

/** Describes a delivered video: size, fps, codec/profile, bitrates. */
export function describeVideo(file) {
  const info = ffprobeJson(file);
  const v = info.streams.find((s) => s.codec_type === "video");
  const a = info.streams.find((s) => s.codec_type === "audio");
  const [num, den] = (v?.avg_frame_rate ?? "0/1").split("/").map(Number);
  const kbps = (b) => (b ? `${Math.round(Number(b) / 1000)} kb/s` : "?");
  const d = {
    width: v?.width,
    height: v?.height,
    fps: den ? num / den : 0,
    codec: v?.codec_name,
    profile: v?.profile,
    pixFmt: v?.pix_fmt,
    videoBitrate: kbps(v?.bit_rate),
    totalBitrate: kbps(info.format?.bit_rate),
    audio: a ? `${a.codec_name} ${kbps(a.bit_rate)} ${a.sample_rate}Hz` : "none",
    duration: Number(info.format?.duration ?? 0),
    bytes: Number(info.format?.size ?? 0),
  };
  d.text =
    `${d.width}x${d.height} @ ${d.fps.toFixed(2)}fps  ${d.codec} (${d.profile}, ${d.pixFmt})  ` +
    `video ${d.videoBitrate}, total ${d.totalBitrate}  audio ${d.audio}  ` +
    `${d.duration.toFixed(2)}s  ${(d.bytes / 1048576).toFixed(1)} MB`;
  return d;
}

/** A silent stereo WAV of exactly `seconds`, used to space narration apart. */
export function silence(seconds, dest) {
  ff([
    "-f", "lavfi",
    "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-t", seconds.toFixed(3),
    "-y", dest,
  ]);
  return dest;
}

/** Any audio file, resampled to the pipeline's canonical 48kHz stereo WAV. */
export function toWav(src, dest, maxSeconds = null) {
  ff([
    "-i", src,
    "-ar", "48000",
    "-ac", "2",
    ...(maxSeconds ? ["-t", maxSeconds.toFixed(3)] : []),
    "-y", dest,
  ]);
  return dest;
}
