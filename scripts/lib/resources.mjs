/**
 * Machine resources: how hard the engine may push this computer.
 *
 *   AIEMCEE_PROFILE=lean|standard|auto   (default auto; CLI: --lean / --standard)
 *
 * auto picks lean when the machine has under 12 GB of RAM in total or under
 * 3 GB free at the moment the stage starts. Lean is for 8 GB laptops:
 *
 *   renderConcurrency  2 Chromium render pages (standard: half the threads)
 *   browsers           1 Chromium process for those pages (standard: one per 2 pages)
 *   videoCacheBytes    512 MB (standard: 2 GB), exported as AIEMCEE_VIDEO_CACHE_BYTES
 *   captureScale       drafts capture at 1x device scale (standard: the config's dsf)
 *   chromiumArgs       a V8 heap cap, no /dev/shm, small disk/media caches, no GPU raster
 *   ffmpegThreads      half the threads, at least 2 (standard: ffmpeg's own choice)
 *   priority           heavy stages run below normal priority
 *
 * Every number can be overridden by the project (render.pages) or the env
 * (AIEMCEE_MOTION_ARGS, AIEMCEE_CPU_SHARE).
 */
import os from "node:os";

const GB = 1024 ** 3;
const MB = 1024 ** 2;

/** The profile name asked for: env, else auto. */
export function requestedProfile(env = process.env) {
  const v = String(env.AIEMCEE_PROFILE ?? "auto").toLowerCase();
  return ["lean", "standard", "auto"].includes(v) ? v : "auto";
}

/** Computes the resource profile for this machine. Pure apart from reading os. */
export function resourceProfile({ env = process.env, totalmem = os.totalmem(), freemem = os.freemem(), threads = os.availableParallelism?.() ?? os.cpus().length } = {}) {
  const requested = requestedProfile(env);
  const why = [];
  let name = requested;
  if (requested === "auto") {
    if (totalmem < 12 * GB) why.push(`${(totalmem / GB).toFixed(1)} GB total RAM < 12 GB`);
    if (freemem < 3 * GB) why.push(`${(freemem / GB).toFixed(1)} GB free RAM < 3 GB`);
    name = why.length ? "lean" : "standard";
  } else why.push(env.AIEMCEE_PROFILE_REASON ?? `AIEMCEE_PROFILE=${requested}`);
  const lean = name === "lean";
  const share = Math.max(1, Number(env.AIEMCEE_CPU_SHARE || 1));
  const cores = Math.max(1, Math.floor(threads / share));
  return {
    name,
    requested,
    why: why.join(", ") || "enough memory",
    totalmem,
    freemem,
    threads,
    renderConcurrency: lean ? Math.min(2, Math.max(1, cores)) : Math.max(2, Math.round(cores / 2)),
    browsers: lean ? 1 : null, // null: the renderer's default (one per two pages)
    videoCacheBytes: lean ? 512 * MB : 2 * GB,
    captureScale: lean ? 1 : null, // null: keep capture.deviceScaleFactor
    ffmpegThreads: lean ? Math.max(2, Math.floor(cores / 2)) : 0, // 0: ffmpeg decides
    chromiumArgs: lean
      ? [
          "--js-flags=--max-old-space-size=512",
          "--disable-dev-shm-usage",
          "--disk-cache-size=33554432",
          "--media-cache-size=33554432",
          "--renderer-process-limit=2",
          "--disable-gpu-rasterization",
          "--disable-extensions",
          "--disable-component-update",
          "--mute-audio",
        ]
      : [],
    priority: lean ? "below-normal" : "normal",
  };
}

/** The lines `aiemcee doctor` prints about it. */
export function describeProfile(p = resourceProfile()) {
  const lean = resourceProfile({ env: { AIEMCEE_PROFILE: "lean" }, totalmem: p.totalmem, freemem: p.freemem, threads: p.threads });
  const std = resourceProfile({ env: { AIEMCEE_PROFILE: "standard" }, totalmem: p.totalmem, freemem: p.freemem, threads: p.threads });
  return {
    summary: `${p.name} (${p.requested === "auto" ? `auto: ${p.why}` : p.why}); RAM ${(p.totalmem / GB).toFixed(1)} GB total, ${(p.freemem / GB).toFixed(1)} GB free, ${p.threads} threads`,
    lean: [
      `render pages ${std.renderConcurrency} -> ${lean.renderConcurrency}, in 1 Chromium`,
      `video cache ${std.videoCacheBytes / MB} MB -> ${lean.videoCacheBytes / MB} MB`,
      "draft captures at 1x device scale",
      `ffmpeg threads auto -> ${lean.ffmpegThreads}`,
      "Chromium: 512 MB V8 heap, no /dev/shm, 32 MB caches, no GPU raster",
      "capture and compose at below-normal priority",
    ],
  };
}

/** Chromium switches for render/capture under this profile, merged into AIEMCEE_MOTION_ARGS form. */
export function motionArgsEnv(p = resourceProfile(), env = process.env) {
  const own = env.AIEMCEE_MOTION_ARGS?.split(" ").filter(Boolean) ?? [];
  // A switch the user set wins over ours.
  const keys = new Set(own.map((a) => a.split("=")[0]));
  return [...p.chromiumArgs.filter((a) => !keys.has(a.split("=")[0])), ...own].join(" ");
}

/** ffmpeg arguments that cap its threads ([] when ffmpeg may decide). */
export function ffmpegThreadArgs(p = resourceProfile()) {
  return p.ffmpegThreads ? ["-threads", String(p.ffmpegThreads)] : [];
}

/** Lowers a process's priority under lean (pid 0: this process; children inherit it). Never throws. */
export function lowerPriority(pid = 0, p = resourceProfile()) {
  if (p.priority !== "below-normal") return false;
  return setBelowNormal(pid);
}

/** Below-normal priority for `pid`, regardless of profile. Never throws. */
export function setBelowNormal(pid = 0) {
  try {
    os.setPriority(pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
    return true;
  } catch {
    return false;
  }
}

/**
 * Applies the profile to this process: env for children and the motion
 * renderer (which reads AIEMCEE_MOTION_ARGS), plus priority. Idempotent.
 */
export function applyProfile(env = process.env) {
  const p = resourceProfile({ env });
  if (env.AIEMCEE_RESOURCES_APPLIED !== p.name) {
    const args = motionArgsEnv(p, env);
    if (args) env.AIEMCEE_MOTION_ARGS = args;
    env.AIEMCEE_RESOURCES_APPLIED = p.name;
  }
  env.AIEMCEE_VIDEO_CACHE_BYTES ??= String(p.videoCacheBytes);
  return p;
}
