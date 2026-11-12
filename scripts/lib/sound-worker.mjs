/**
 * Mixes the soundtrack on its own thread, so `compose` can render the picture
 * at the same time. The mix only reads the timeline, never the picture, so the
 * two cannot drift: they are built from the same numbers, just not in sequence.
 */
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";

import { mixSoundtrack } from "./sound.mjs";

if (!isMainThread && workerData?.aiemceeSound) {
  try {
    parentPort.postMessage({ ok: true, mix: mixSoundtrack(workerData.args) });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: err.stack ?? String(err) });
  }
}

/**
 * Starts the mix in a worker and returns a promise of mixSoundtrack's result.
 * `config` is sent as plain JSON (functions in it are not needed by the mix).
 */
export function mixSoundtrackAsync({ config, timeline, workDir, dest }) {
  const args = { config: JSON.parse(JSON.stringify(config)), timeline, workDir, dest };
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { aiemceeSound: true, args } });
    worker.once("message", (m) => (m.ok ? resolve(m.mix) : reject(new Error(`sound mix failed\n${m.error}`))));
    worker.once("error", reject);
    worker.once("exit", (code) => code !== 0 && reject(new Error(`sound worker exited with ${code}`)));
  });
}
