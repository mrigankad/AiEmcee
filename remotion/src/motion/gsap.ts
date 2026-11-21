/**
 * GSAP, driven by the film's clock.
 *
 * A template builds one paused GSAP timeline. Every frame, the timeline is
 * seeked to frame / fps inside a layout effect, before the frame is captured,
 * so a render is deterministic and any frame can be drawn on its own (the
 * renderer jumps around and renders in parallel). GSAP's own ticker never
 * drives anything here.
 *
 *   const scope = useGsapTimeline((tl, q) => {
 *     tl.from(q(".tile"), { y: 40, autoAlpha: 0, stagger: 0.15, ease: "emcee.out" })
 *       .from(q(".path"), { drawSVG: 0 }, 1.2);
 *   });
 *   return <AbsoluteFill ref={scope}>...</AbsoluteFill>;
 *
 * Times are seconds from the start of the scene (its narration slot). Use
 * `beatAt(props.beats, "name", fallback)` to place a step on a named beat
 * that the board or the script can move.
 */
import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { SplitText } from "gsap/SplitText";
import { useLayoutEffect, useRef } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";

let registered = false;
export function registerGsap() {
  if (registered) return;
  registered = true;
  gsap.registerPlugin(CustomEase, DrawSVGPlugin, MorphSVGPlugin, MotionPathPlugin, SplitText);
  // Nothing may advance on wall-clock time: the frame is the only clock.
  gsap.ticker.lagSmoothing(0);
  gsap.config({ autoSleep: 60, force3D: false, nullTargetWarn: false });
  // House curves. Styles may register more with CustomEase.create("<style>.<name>", ...).
  CustomEase.create("emcee.out", "0.16, 1, 0.3, 1");
  CustomEase.create("emcee.inOut", "0.65, 0, 0.35, 1");
  CustomEase.create("emcee.pop", "M0,0 C0.12,0.6 0.3,1.12 0.52,1.06 0.7,1.01 0.84,1 1,1");
  CustomEase.create("emcee.glide", "0.33, 0, 0.12, 1");
}
registerGsap();

export { gsap };

export type Build = (tl: gsap.core.Timeline, q: (selector: string) => Element[]) => void;

/**
 * Builds a paused timeline once (and again when `deps` change), then seeks it
 * to the current frame on every render. Returns the ref for the scope element:
 * selectors passed to `q` only match inside it.
 */
export function useGsapTimeline<T extends Element = HTMLDivElement>(build: Build, deps: unknown[] = []) {
  const scope = useRef<T>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);
  const ctx = useRef<gsap.Context | null>(null);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  useLayoutEffect(() => {
    if (!scope.current) return;
    const root = scope.current;
    ctx.current = gsap.context(() => {
      const t = gsap.timeline({ paused: true });
      build(t, (sel) => gsap.utils.toArray<Element>(sel, root));
      tl.current = t;
    }, root);
    return () => {
      ctx.current?.revert();
      ctx.current = null;
      tl.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useLayoutEffect(() => {
    tl.current?.seek(frame / fps, false);
  });

  return scope;
}

/** Seconds for a named beat, from props.beats (set by the board or the script), else the fallback. */
export function beatAt(beats: Record<string, number> | undefined, name: string, fallback: number): number {
  const v = beats?.[name];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
