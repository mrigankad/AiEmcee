"use client";

/**
 * The studio's motion: GSAP, kept quiet. Everything here moves transform and
 * opacity only, runs 150-350 ms, never blocks input, and does nothing when the
 * viewer asks for reduced motion (gsap.matchMedia reverts it all).
 */
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";

gsap.registerPlugin(useGSAP, Flip);

export const MOTION_OK = "(prefers-reduced-motion: no-preference)";
const EASE = "power2.out";

/**
 * Fade-and-rise the children matching `selector` inside `scope` when `deps` change.
 * Elements already animated in keep their place (marked with data-in).
 */
export function useEntrance(scope: RefObject<HTMLElement | null>, selector: string, deps: unknown[] = [], { y = 8, stagger = 0.035, duration = 0.28 } = {}) {
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const els = gsap.utils.toArray<HTMLElement>(selector, scope.current).filter((e) => !e.dataset.in);
        if (!els.length) return;
        els.forEach((e) => (e.dataset.in = "1"));
        gsap.from(els, { opacity: 0, y, duration, stagger: { each: stagger, amount: Math.min(0.24, stagger * els.length) }, ease: EASE, clearProps: "transform,opacity" });
      });
      return () => mm.revert();
    },
    { scope, dependencies: deps },
  );
}

/**
 * Flip a list or layout. Call the returned `capture()` in the event handler
 * right before the state change that moves things; the next commit animates.
 */
export function useFlip(scope: RefObject<HTMLElement | null>, selector: string) {
  const state = useRef<Flip.FlipState | null>(null);
  useLayoutEffect(() => {
    const s = state.current;
    if (!s || !scope.current) return;
    state.current = null;
    Flip.from(s, {
      targets: gsap.utils.toArray<HTMLElement>(selector, scope.current),
      duration: 0.3,
      ease: EASE,
      onEnter: (els) => gsap.fromTo(els, { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.22, ease: EASE }),
    });
  });
  return () => {
    if (!scope.current || !window.matchMedia(MOTION_OK).matches) return;
    state.current = Flip.getState(gsap.utils.toArray<HTMLElement>(selector, scope.current));
  };
}

/** A number that eases to its new value (render progress, stats). */
export function CountUp({ value, decimals = 0, suffix = "", className = "" }: { value: number; decimals?: number; suffix?: string; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const format = (n: number) => `${n.toFixed(decimals)}${suffix}`;
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const from = shown.current;
    if (from === value || !window.matchMedia(MOTION_OK).matches) {
      shown.current = value;
      node.textContent = format(value);
      return;
    }
    const o = { n: from };
    const tween = gsap.to(o, {
      n: value,
      duration: 0.35,
      ease: EASE,
      onUpdate: () => {
        shown.current = o.n;
        node.textContent = format(o.n);
      },
    });
    return () => {
      tween.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, decimals, suffix]);
  return (
    <span ref={el} className={className}>
      {format(value)}
    </span>
  );
}
