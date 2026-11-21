/**
 * Small motion helpers on top of motion/gsap.ts.
 *
 * Most motion is the scene's GSAP timeline. A few values are not properties
 * GSAP can tween on an element (a number's digits, a bar's height in iso
 * space); `useTween` computes those from the frame with a GSAP ease, which is
 * just as deterministic: the frame is still the only clock.
 */
import { useCurrentFrame, useVideoConfig } from "remotion";

import { gsap } from "../../motion/gsap";

/** Seconds into the scene. */
export function useSceneTime(): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
}

const eases = new Map<string, (p: number) => number>();
export function ease(name: string): (p: number) => number {
  let e = eases.get(name);
  if (!e) {
    e = gsap.parseEase(name) as (p: number) => number;
    eases.set(name, e);
  }
  return e;
}

/** Eased progress 0..1 of a tween that starts at `start` seconds and lasts `duration`. */
export function progressAt(t: number, start: number, duration: number, easeName = "emcee.out"): number {
  if (t <= start) return 0;
  if (t >= start + duration) return 1;
  return ease(easeName)((t - start) / duration);
}

export function useTween(start: number, duration: number, easeName = "emcee.out"): number {
  return progressAt(useSceneTime(), start, duration, easeName);
}

/**
 * Slow ambient bob on the timeline: `targets` drift by `amp` px and back every
 * `period` seconds from `at`, for a long finite run (a paused timeline needs no
 * infinite repeat, and a finite one keeps its duration honest).
 */
export function float(tl: gsap.core.Timeline, targets: Element[] | string, { at, amp = 8, period = 3.2, stagger = 0.4, runFor = 120 }: { at: number; amp?: number; period?: number; stagger?: number; runFor?: number }) {
  const list = typeof targets === "string" ? gsap.utils.toArray<Element>(targets) : targets;
  if (!list.length) return;
  const repeat = Math.ceil(runFor / (period / 2));
  list.forEach((el, i) => {
    tl.to(el, { y: -amp, duration: period / 2, ease: "sine.inOut", yoyo: true, repeat }, at + i * stagger);
  });
}
