/** Thin ffmpeg / ffprobe wrappers. Everything the compositor needs, nothing else. */
import { execFileSync, spawnSync } from "node:child_process";

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
