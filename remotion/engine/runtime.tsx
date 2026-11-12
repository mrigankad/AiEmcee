/**
 * AiEmcee Motion: the browser runtime.
 *
 * The scenes import { useCurrentFrame, interpolate, spring, Sequence, ... }
 * from "remotion"; the bundler (scripts/lib/motion/bundle.mjs) points that
 * import here, so the scene code is unchanged. This file is the whole API
 * surface the scenes use, and nothing more:
 *
 *   frame        useCurrentFrame, useVideoConfig, Sequence, Freeze
 *   maths        interpolate, Easing, spring
 *   layout       AbsoluteFill
 *   media        Img, OffthreadVideo, staticFile
 *   registry     Composition, registerRoot
 *
 * The renderer drives it through window.__motion: init() mounts one
 * composition, seek(frame) shows a frame and resolves once every image,
 * video frame and font that frame needs has decoded.
 */
import React, { createContext, useContext, useLayoutEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";

import { fontsReady } from "./fonts";

/* ---------------------------------------------------------------- */
/* Frame and config                                                  */
/* ---------------------------------------------------------------- */
export type VideoConfig = { id: string; width: number; height: number; fps: number; durationInFrames: number; defaultProps: Record<string, unknown>; props: Record<string, unknown> };

const FrameCtx = createContext(0);
const ConfigCtx = createContext<VideoConfig | null>(null);

export const useCurrentFrame = () => useContext(FrameCtx);

export function useVideoConfig(): VideoConfig {
  const c = useContext(ConfigCtx);
  if (!c) throw new Error("useVideoConfig() outside a composition");
  return c;
}

/* ---------------------------------------------------------------- */
/* Layout                                                            */
/* ---------------------------------------------------------------- */
const FILL: React.CSSProperties = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column" };

export const AbsoluteFill = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function AbsoluteFill({ style, ...rest }, ref) {
  return <div ref={ref} {...rest} style={{ ...FILL, ...style }} />;
});

/**
 * Children see time relative to `from`, and their video config reports the
 * sequence's own duration. Outside [from, from + durationInFrames) nothing renders.
 */
export function Sequence({
  from = 0,
  durationInFrames = Infinity,
  layout = "absolute-fill",
  style,
  children,
}: {
  from?: number;
  durationInFrames?: number;
  name?: string;
  layout?: "absolute-fill" | "none";
  style?: React.CSSProperties;
  children?: React.ReactNode;
}) {
  const parent = useCurrentFrame();
  const config = useVideoConfig();
  const frame = parent - from;
  if (frame < 0 || frame >= durationInFrames) return null;
  const inner = Number.isFinite(durationInFrames) ? { ...config, durationInFrames } : config;
  return (
    <ConfigCtx.Provider value={inner}>
      <FrameCtx.Provider value={frame}>{layout === "none" ? children : <AbsoluteFill style={style}>{children}</AbsoluteFill>}</FrameCtx.Provider>
    </ConfigCtx.Provider>
  );
}

/** Children see one fixed frame. */
export function Freeze({ frame, active = true, children }: { frame: number; active?: boolean; children?: React.ReactNode }) {
  return active ? <FrameCtx.Provider value={frame}>{children}</FrameCtx.Provider> : <>{children}</>;
}

/* ---------------------------------------------------------------- */
/* interpolate                                                       */
/* ---------------------------------------------------------------- */
type Extrapolate = "extend" | "clamp" | "identity" | "wrap";
export type InterpolateOptions = { easing?: (t: number) => number; extrapolateLeft?: Extrapolate; extrapolateRight?: Extrapolate };

function segment(input: number, [i0, i1]: [number, number], [o0, o1]: [number, number], o: InterpolateOptions): number {
  const { easing = (t: number) => t, extrapolateLeft = "extend", extrapolateRight = "extend" } = o;
  let x = input;
  if (x < i0) {
    if (extrapolateLeft === "identity") return x;
    if (extrapolateLeft === "clamp") x = i0;
    if (extrapolateLeft === "wrap") x = i0 + ((((x - i0) % (i1 - i0)) + (i1 - i0)) % (i1 - i0));
  }
  if (x > i1) {
    if (extrapolateRight === "identity") return x;
    if (extrapolateRight === "clamp") x = i1;
    if (extrapolateRight === "wrap") x = i0 + ((x - i0) % (i1 - i0));
  }
  if (o0 === o1) return o0;
  let t = i1 === i0 ? (x >= i1 ? 1 : 0) : (x - i0) / (i1 - i0);
  t = easing(t);
  return o0 + t * (o1 - o0);
}

export function interpolate(input: number, inputRange: readonly number[], outputRange: readonly number[], options: InterpolateOptions = {}): number {
  if (inputRange.length !== outputRange.length) throw new Error("interpolate: inputRange and outputRange must be the same length");
  if (inputRange.length < 2) throw new Error("interpolate: needs at least two points");
  for (let k = 1; k < inputRange.length; k++) {
    if (!(inputRange[k] > inputRange[k - 1])) throw new Error(`interpolate: inputRange must be strictly increasing, got [${inputRange.join(", ")}]`);
  }
  if (typeof input !== "number" || Number.isNaN(input)) throw new Error(`interpolate: input must be a number, got ${input}`);
  // Pick the segment the input falls in (the first or last one when outside).
  let k = 1;
  while (k < inputRange.length - 1 && input >= inputRange[k]) k++;
  return segment(input, [inputRange[k - 1], inputRange[k]], [outputRange[k - 1], outputRange[k]], options);
}

/* ---------------------------------------------------------------- */
/* Easing (the React Native set, with a cubic-bezier solver)         */
/* ---------------------------------------------------------------- */
function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  if (x1 === y1 && x2 === y2) return (t) => t;
  const A = (a: number, b: number) => 1 - 3 * b + 3 * a;
  const B = (a: number, b: number) => 3 * b - 6 * a;
  const C = (a: number) => 3 * a;
  const calc = (t: number, a: number, b: number) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const slope = (t: number, a: number, b: number) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);

  // Sample table, then Newton-Raphson or bisection: the classic bezier-easing approach.
  const N = 11;
  const step = 1 / (N - 1);
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) samples[i] = calc(i * step, x1, x2);

  function tForX(x: number) {
    let start = 0;
    let i = 1;
    for (; i !== N - 1 && samples[i] <= x; i++) start += step;
    i--;
    const dist = (x - samples[i]) / (samples[i + 1] - samples[i]);
    let t = start + dist * step;
    const s = slope(t, x1, x2);
    if (s >= 0.001) {
      for (let n = 0; n < 4; n++) {
        const sl = slope(t, x1, x2);
        if (sl === 0) break;
        t -= (calc(t, x1, x2) - x) / sl;
      }
      return t;
    }
    if (s === 0) return t;
    let lo = start;
    let hi = start + step;
    let cur = 0;
    let n = 0;
    do {
      t = lo + (hi - lo) / 2;
      cur = calc(t, x1, x2) - x;
      if (cur > 0) hi = t;
      else lo = t;
    } while (Math.abs(cur) > 1e-7 && ++n < 10);
    return t;
  }
  // Outside 0..1 the curve holds its end values (an extrapolating interpolate can pass these).
  return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : calc(tForX(x), y1, y2));
}

type Fn = (t: number) => number;
const unit = (t: number) => Math.min(1, Math.max(0, t));

export const Easing = {
  step0: (n: number) => (n > 0 ? 1 : 0),
  step1: (n: number) => (n >= 1 ? 1 : 0),
  linear: (t: number) => t,
  ease: bezier(0.42, 0, 1, 1),
  quad: (t: number) => t * t,
  cubic: (t: number) => t * t * t,
  poly: (n: number) => (t: number) => t ** n,
  sin: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  // circle and bounce are only defined on 0..1; an extrapolating interpolate can pass more.
  circle: (t: number) => {
    const u = unit(t);
    return 1 - Math.sqrt(1 - u * u);
  },
  exp: (t: number) => 2 ** (10 * (t - 1)),
  elastic: (bounciness = 1) => {
    const p = bounciness * Math.PI;
    return (t: number) => 1 - Math.cos((t * Math.PI) / 2) ** 3 * Math.cos(t * p);
  },
  back: (s = 1.70158) => (t: number) => t * t * ((s + 1) * t - s),
  bounce: (t: number) => {
    const x = unit(t);
    if (x < 1 / 2.75) return 7.5625 * x * x;
    if (x < 2 / 2.75) {
      const u = x - 1.5 / 2.75;
      return 7.5625 * u * u + 0.75;
    }
    if (x < 2.5 / 2.75) {
      const u = x - 2.25 / 2.75;
      return 7.5625 * u * u + 0.9375;
    }
    const u = x - 2.625 / 2.75;
    return 7.5625 * u * u + 0.984375;
  },
  bezier,
  in: (f: Fn) => f,
  out: (f: Fn) => (t: number) => 1 - f(1 - t),
  inOut: (f: Fn) => (t: number) => (t < 0.5 ? f(t * 2) / 2 : 1 - f((1 - t) * 2) / 2),
};

/* ---------------------------------------------------------------- */
/* spring: a damped harmonic oscillator stepped once per frame       */
/* ---------------------------------------------------------------- */
export type SpringConfig = { damping: number; mass: number; stiffness: number; overshootClamping: boolean };
const SPRING: SpringConfig = { damping: 10, mass: 1, stiffness: 100, overshootClamping: false };

type State = { t: number; x: number; v: number };

function step(s: State, now: number, to: number, c: SpringConfig): State {
  const dt = Math.min(now - s.t, 64) / 1000;
  const v0 = -s.v;
  const x0 = to - s.x;
  const zeta = c.damping / (2 * Math.sqrt(c.stiffness * c.mass));
  const w0 = Math.sqrt(c.stiffness / c.mass);
  if (zeta < 1) {
    const w1 = w0 * Math.sqrt(1 - zeta * zeta);
    const env = Math.exp(-zeta * w0 * dt);
    const sin = Math.sin(w1 * dt);
    const cos = Math.cos(w1 * dt);
    const frag = env * (sin * ((v0 + zeta * w0 * x0) / w1) + x0 * cos);
    return { t: now, x: to - frag, v: zeta * w0 * frag - env * (cos * (v0 + zeta * w0 * x0) - w1 * x0 * sin) };
  }
  const env = Math.exp(-w0 * dt);
  return { t: now, x: to - env * (x0 + (v0 + w0 * x0) * dt), v: env * (v0 * (dt * w0 - 1) + dt * x0 * w0 * w0) };
}

/*
 * The spring is stepped once per frame from rest, so its state at frame f
 * depends on every frame before it. Done naively that is O(f) per call and
 * O(frames²) over a render. The integer steps never depend on f, so they are
 * kept per (fps, config): prefix[k] is the state after steps 0..k-1. A call
 * extends the prefix if needed, then takes the one final (possibly
 * fractional) step, exactly as before: the same floating-point operations in
 * the same order, so results stay bit-identical (parity.test.mjs).
 */
const PREFIX_LIMIT = 36000; // 10 minutes at 60 fps; beyond it, step on from the end
const prefixes = new Map<string, State[]>();

function prefixFor(fps: number, c: SpringConfig, whole: number): State {
  const key = `${fps}|${c.damping}|${c.mass}|${c.stiffness}`;
  let prefix = prefixes.get(key);
  if (!prefix) prefixes.set(key, (prefix = [{ t: 0, x: 0, v: 0 }]));
  const upto = Math.min(whole, PREFIX_LIMIT);
  for (let k = prefix.length - 1; k < upto; k++) prefix.push(step(prefix[k], (k / fps) * 1000, 1, c));
  let s = prefix[upto];
  for (let k = upto; k < whole; k++) s = step(s, (k / fps) * 1000, 1, c);
  return s;
}

function simulate(frame: number, fps: number, c: SpringConfig): State {
  const f = Math.max(0, frame);
  const whole = Math.floor(f);
  return step(prefixFor(fps, c, whole), (f / fps) * 1000, 1, c);
}

const settled = new Map<string, number>();

/** Frames until the spring settles within `threshold` of rest (cached: it depends only on its inputs). */
function settle(fps: number, c: SpringConfig, threshold = 0.005): number {
  const key = `${fps}|${c.damping}|${c.mass}|${c.stiffness}|${threshold}`;
  let n = settled.get(key);
  if (n === undefined) settled.set(key, (n = settleOnce(fps, c, threshold)));
  return n;
}

function settleOnce(fps: number, c: SpringConfig, threshold: number): number {
  let s: State = { t: 0, x: 0, v: 0 };
  let k = 0;
  let still = 0;
  while (k < 10000) {
    s = step(s, (k / fps) * 1000, 1, c);
    still = Math.abs(1 - s.x) < threshold && Math.abs(s.v) < threshold * 10 ? still + 1 : 0;
    if (still > 2) return k - 2;
    k++;
  }
  return k;
}

export function spring({
  frame,
  fps,
  config = {},
  from = 0,
  to = 1,
  durationInFrames,
  durationRestThreshold,
  delay = 0,
  reverse = false,
}: {
  frame: number;
  fps: number;
  config?: Partial<SpringConfig>;
  from?: number;
  to?: number;
  durationInFrames?: number;
  durationRestThreshold?: number;
  delay?: number;
  reverse?: boolean;
}): number {
  const c = { ...SPRING, ...config };
  let f = reverse ? (durationInFrames ?? settle(fps, c, durationRestThreshold)) - (frame - delay) : frame - delay;
  if (durationInFrames != null) {
    // Stretch the natural motion to last exactly durationInFrames.
    const natural = settle(fps, c, durationRestThreshold);
    f = (f / durationInFrames) * natural;
  }
  const x = simulate(f, fps, c).x;
  // Matches Remotion exactly, quirk included: the 0 -> 1 value is clamped against
  // the raw `to`, so a descending from/to spring is never clamped.
  const v = c.overshootClamping ? (to >= from ? Math.min(x, to) : Math.max(x, to)) : x;
  return from === 0 && to === 1 ? v : from + v * (to - from);
}

/* ---------------------------------------------------------------- */
/* Pending work: a frame is ready when nothing is pending            */
/* ---------------------------------------------------------------- */
let pending = 0;
let waiters: (() => void)[] = [];

function hold(): () => void {
  pending++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    pending--;
    if (pending === 0) {
      const w = waiters;
      waiters = [];
      w.forEach((r) => r());
    }
  };
}

const idle = () => (pending === 0 ? Promise.resolve() : new Promise<void>((r) => waiters.push(r)));

/** Holds the frame until `src` has loaded and decoded into `img`. */
function useDecoded(ref: React.RefObject<HTMLImageElement | null>, src: string) {
  useLayoutEffect(() => {
    const img = ref.current;
    if (!img) return;
    const release = hold();
    const fail = () => {
      console.error(`motion: could not load ${src}`);
      release();
    };
    if (img.complete && img.naturalWidth) img.decode().then(release, release);
    else {
      img.addEventListener("load", () => img.decode().then(release, release), { once: true });
      img.addEventListener("error", fail, { once: true });
    }
    return release;
  }, [ref, src]);
}

/* ---------------------------------------------------------------- */
/* Media                                                             */
/* ---------------------------------------------------------------- */
export const staticFile = (p: string) => `/public/${p.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/")}`;

export function Img({ src, ...rest }: React.ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const ref = useRef<HTMLImageElement>(null);
  useDecoded(ref, src);
  return <img ref={ref} src={src} decoding="sync" {...rest} />;
}

/**
 * A video drawn frame by frame: the renderer's frame server decodes the file
 * and returns the exact frame for this moment, as an image.
 */
export function OffthreadVideo({
  src,
  style,
  className,
  startFrom = 0,
  playbackRate = 1,
}: {
  src: string;
  style?: React.CSSProperties;
  className?: string;
  muted?: boolean;
  toneMapped?: boolean;
  startFrom?: number;
  playbackRate?: number;
  volume?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (startFrom + frame * playbackRate) / fps;
  const ref = useRef<HTMLImageElement>(null);

  // Ask for only the pixels this frame shows. The element is measured after
  // layout, camera transform included, and the frame server picks the size:
  // half the source for an unzoomed 4K shot in a 1080p film (a quarter of the
  // pixels to move and filter), the full source once a focus move zooms in.
  useLayoutEffect(() => {
    const img = ref.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();
    const aspect = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 16 / 9;
    const need = Math.ceil(Math.max(rect.width, rect.height * aspect) * window.devicePixelRatio * 0.999);
    const url = `/__frame?src=${encodeURIComponent(src)}&t=${t.toFixed(6)}&fps=${fps}&w=${need}&page=${PAGE}`;
    if (img.getAttribute("src") === url) return;
    const release = hold();
    const done = () => img.decode().then(release, release);
    img.addEventListener("load", done, { once: true });
    img.addEventListener(
      "error",
      () => {
        console.error(`motion: could not load ${url}`);
        release();
      },
      { once: true },
    );
    img.src = url;
    return release;
  });
  // object-fit and friends apply to an <img> exactly as to a <video>.
  return <img ref={ref} alt="" decoding="sync" style={style} className={className} />;
}

const PAGE = typeof window === "undefined" ? "0" : (new URLSearchParams(window.location.search).get("page") ?? "0");

/* ---------------------------------------------------------------- */
/* Registry                                                          */
/* ---------------------------------------------------------------- */
type Props = Record<string, unknown>;
type Meta<P> = { durationInFrames?: number; fps?: number; width?: number; height?: number; props?: Partial<P> };
export type CompositionProps<P extends Props = Props> = {
  id: string;
  // The component's own props type flows through defaultProps and calculateMetadata.
  component: React.ComponentType<P>;
  durationInFrames: number;
  fps: number;
  width: number;
  height: number;
  defaultProps?: NoInfer<P>;
  calculateMetadata?: (o: { props: NoInfer<P>; defaultProps: NoInfer<P> }) => Meta<NoInfer<P>> | Promise<Meta<NoInfer<P>>>;
};

const registry = new Map<string, CompositionProps>();

/** Registers a composition while the root renders once at load; draws nothing itself. */
export function Composition<P extends Props>(p: CompositionProps<P>) {
  registry.set(p.id, p as unknown as CompositionProps);
  return null;
}

/** For the scenes' standalone previews; the Film does not use it. */
export function Still<P extends Props>(p: Omit<CompositionProps<P>, "durationInFrames" | "fps">) {
  registry.set(p.id, { ...(p as unknown as CompositionProps), durationInFrames: 1, fps: 30 });
  return null;
}

let root: Root | null = null;
let current: { comp: CompositionProps; config: VideoConfig } | null = null;
let setFrame: ((f: number) => void) | null = null;

function Stage() {
  const [frame, set] = React.useState(0);
  setFrame = set;
  if (!current) return null;
  const Comp = current.comp.component as React.ComponentType<Record<string, unknown>>;
  const { width, height } = current.config;
  return (
    <ConfigCtx.Provider value={current.config}>
      <FrameCtx.Provider value={frame}>
        <div id="motion-stage" style={{ position: "relative", width, height, overflow: "hidden" }}>
          <Comp {...current.config.props} />
        </div>
      </FrameCtx.Provider>
    </ConfigCtx.Provider>
  );
}

export function registerRoot(Root: React.ComponentType) {
  const host = document.createElement("div");
  host.style.display = "none";
  document.body.appendChild(host);
  // Collect the <Composition> registrations synchronously.
  flushSync(() => createRoot(host).render(<Root />));

  const motion = {
    list: () => [...registry.values()].map(({ id, width, height, fps, durationInFrames }) => ({ id, width, height, fps, durationInFrames })),

    /** Mounts one composition; returns its resolved config. */
    async init(id: string, inputProps: Record<string, unknown> = {}) {
      const comp = registry.get(id);
      if (!comp) throw new Error(`no composition "${id}"; registered: ${[...registry.keys()].join(", ")}`);
      const defaultProps = comp.defaultProps ?? {};
      let props = { ...defaultProps, ...inputProps };
      let meta: Meta<Props> = {};
      if (comp.calculateMetadata) {
        meta = await comp.calculateMetadata({ props, defaultProps });
        if (meta.props) props = { ...props, ...meta.props };
      }
      const config: VideoConfig = {
        id,
        width: meta.width ?? comp.width,
        height: meta.height ?? comp.height,
        fps: meta.fps ?? comp.fps,
        durationInFrames: meta.durationInFrames ?? comp.durationInFrames,
        defaultProps,
        props,
      };
      current = { comp, config };
      const el = document.getElementById("root")!;
      root ??= createRoot(el);
      await Promise.all(fontsReady);
      flushSync(() => root!.render(<Stage />));
      await document.fonts.ready;
      return { id: config.id, width: config.width, height: config.height, fps: config.fps, durationInFrames: config.durationInFrames };
    },

    /** Shows `frame` and resolves once everything it needs has decoded. */
    async seek(frame: number) {
      if (!setFrame) throw new Error("init() first");
      flushSync(() => setFrame!(frame));
      await idle();
      await document.fonts.ready;
      // Fonts that only appear in this frame start loading at layout: wait for them too.
      if (document.fonts.status === "loading") await document.fonts.ready;
    },
  };
  (window as unknown as { __motion: typeof motion }).__motion = motion;
  document.documentElement.dataset.motion = "ready";
}

/** Remotion's input props API, for code that reads them directly. */
export const getInputProps = () => current?.config.props ?? {};
