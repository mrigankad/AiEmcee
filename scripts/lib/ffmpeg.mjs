/** Thin ffmpeg / ffprobe wrappers. Everything the compositor needs, nothing else. */
import { execFileSync } from "node:child_process";

/** Run ffmpeg, quiet unless it actually fails. */
export function ff(args) {
  try {
    return execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const detail = err.stderr?.toString().trim();
    throw new Error(`ffmpeg failed\n  ${args.join(" ")}\n${detail ? `\n${detail}` : ""}`);
  }
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
