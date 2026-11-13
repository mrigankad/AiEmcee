/**
 * Showreel: AiEmcee in twelve seconds, as one isometric diorama.
 *
 * A platform carries four stations on an orange track: the script, the
 * voice, the captured product and the film. A cube travels the track and
 * wakes each station as it arrives, while the copy on the left names the
 * beat. It closes on the mark and the promise.
 *
 * Everything is drawn here (the isometric kit below is self-contained), so
 * the scene ships with the engine and renders anywhere.
 */
import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import { fontSans } from "../fonts";

export const SHOWREEL_SECONDS = 12.5;

/* ------------------------------------------------------------------ palette */
const C = {
  page: "#FFFFFF",
  ink: "#16181D",
  body: "#5E6370",
  mute: "#7A7F8C",
  line: "#E8E8EC",
  peach: "#FFF3EC",
  brand: "#F0731A",
  deep: "#DC440C",
  light: "#FFA12B",
};

type Faces = { top: string; left: string; right: string };
const F = {
  platform: { top: "#F7F7F8", left: "#E4E4EA", right: "#EDEDF1" },
  pad: { top: "#FFFFFF", left: "#DADAE1", right: "#E6E6EB" },
  padOn: { top: "#FFF0E6", left: "#F3C9AE", right: "#F8DCC9" },
  paper: { top: "#FFFFFF", left: "#E3E3E9", right: "#EFEFF3" },
  ink: { top: "#2A2D35", left: "#101216", right: "#1B1E24" },
  orange: { top: "#FFA12B", left: "#DC440C", right: "#F0731A" },
  stand: { top: "#D9D9E0", left: "#B9BBC4", right: "#C9CBD3" },
} satisfies Record<string, Faces>;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const io = Easing.bezier(0.45, 0, 0.25, 1);

/* ------------------------------------------------------------------ iso kit */
const pts = (p: number[][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

/**
 * An isometric box. (fx, fy) is its front-bottom corner; l runs back-left,
 * d runs back-right, h is the height.
 */
const Block: React.FC<{ fx: number; fy: number; l: number; d: number; h: number; c: Faces; opacity?: number }> = ({ fx, fy, l, d, h, c, opacity = 1 }) => (
  <g opacity={opacity}>
    <polygon points={pts([[fx - l, fy - l / 2 - h], [fx, fy - h], [fx, fy], [fx - l, fy - l / 2]])} fill={c.left} />
    <polygon points={pts([[fx, fy - h], [fx + d, fy - d / 2 - h], [fx + d, fy - d / 2], [fx, fy]])} fill={c.right} />
    <polygon points={pts([[fx - l, fy - l / 2 - h], [fx, fy - h], [fx + d, fy - d / 2 - h], [fx + d - l, fy - (l + d) / 2 - h]])} fill={c.top} />
  </g>
);

/** A box whose top face is centred on (cx, cy) once raised by h. */
const Boxed: React.FC<{ cx: number; cy: number; l: number; d: number; h: number; c: Faces; lift?: number; opacity?: number }> = ({ cx, cy, l, d, h, c, lift = 0, opacity }) => (
  <Block fx={cx + (l - d) / 2} fy={cy + (l + d) / 4 - lift} l={l} d={d} h={h} c={c} opacity={opacity} />
);

/** Draws children on the right-facing plane of a box: local x runs along the face, local y down it. */
const OnRight: React.FC<{ x0: number; y0: number; children: React.ReactNode }> = ({ x0, y0, children }) => (
  <g transform={`matrix(1 -0.5 0 1 ${x0} ${y0})`}>{children}</g>
);

/** Draws children on a top face: local x runs back-right, local y runs back-left. */
const OnTop: React.FC<{ x0: number; y0: number; children: React.ReactNode }> = ({ x0, y0, children }) => (
  <g transform={`matrix(1 -0.5 -1 -0.5 ${x0} ${y0})`}>{children}</g>
);

/* ------------------------------------------------------------------ timing */
/** Seconds, and a 0..1 spring that starts at `at`. */
function useClock() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const pop = (at: number, damping = 14) => spring({ frame: frame - at * fps, fps, config: { damping, mass: 0.7, stiffness: 140 } });
  const ramp = (a: number, b: number) => interpolate(t, [a, b], [0, 1], { ...clamp, easing: io });
  return { t, frame, fps, pop, ramp };
}

/* ------------------------------------------------------------------ the board */
// The platform's top face: a point u along the track (0..720), v across it (0..180).
const P = { fx: 250, fy: 650, l: 180, d: 720, h: 26 };
const at = (u: number, v = P.l / 2) => ({ x: P.fx - v + u, y: P.fy - P.h - v / 2 - u / 2 });

// Where the cube is, and when: it rests at each station, then glides on.
const STATIONS = [100, 280, 460, 640];
const ARRIVE = [1.2, 3.6, 6.0, 8.4]; // seconds the cube reaches each station
const LEAVE = [2.9, 5.3, 7.7, 99];

function cubeU(t: number) {
  if (t < ARRIVE[0]) return interpolate(t, [0.6, ARRIVE[0]], [10, STATIONS[0]], { ...clamp, easing: io });
  for (let i = 0; i < STATIONS.length; i++) {
    if (t < LEAVE[i]) return STATIONS[i];
    if (i + 1 < STATIONS.length && t < ARRIVE[i + 1]) return interpolate(t, [LEAVE[i], ARRIVE[i + 1]], [STATIONS[i], STATIONS[i + 1]], { ...clamp, easing: io });
  }
  return STATIONS[STATIONS.length - 1];
}

const Platform: React.FC = () => {
  const { pop, t } = useClock();
  const rise = pop(0.05, 16);
  const lift = (1 - rise) * 60;
  const fill = cubeU(t);
  const a = at(30);
  const b = at(690);
  const f = at(fill);
  return (
    <g opacity={Math.min(1, rise * 1.6)} transform={`translate(0 ${lift})`}>
      <ellipse cx={P.fx + 270} cy={P.fy - 150} rx={430} ry={110} fill={C.ink} opacity={0.04} />
      <Block {...P} c={F.platform} />
      {/* The track, and the stretch the cube has already travelled. */}
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={C.line} strokeWidth={10} strokeLinecap="round" />
      <line x1={a.x} y1={a.y} x2={f.x} y2={f.y} stroke="url(#trackGlow)" strokeWidth={10} strokeLinecap="round" />
    </g>
  );
};

/** A station's pad: lights up while the cube is there. */
const Pad: React.FC<{ i: number }> = ({ i }) => {
  const { pop, t, ramp } = useClock();
  const p = at(STATIONS[i]);
  const show = pop(0.35 + i * 0.12);
  const on = ramp(ARRIVE[i] - 0.15, ARRIVE[i] + 0.2) * (i < 3 ? 1 - ramp(LEAVE[i] - 0.1, LEAVE[i] + 0.3) * 0.55 : 1);
  const lit = on > 0.5;
  return (
    <g opacity={Math.min(1, show * 1.5)} transform={`translate(0 ${(1 - show) * 30})`}>
      <Boxed cx={p.x} cy={p.y - 6} l={86} d={86} h={8} c={lit ? F.padOn : F.pad} />
      {t > ARRIVE[i] && t < ARRIVE[i] + 0.9 && (
        <ellipse cx={p.x} cy={p.y - 4} rx={60 + (t - ARRIVE[i]) * 70} ry={30 + (t - ARRIVE[i]) * 35} fill="none" stroke={C.brand} strokeWidth={2} opacity={1 - (t - ARRIVE[i]) / 0.9} />
      )}
    </g>
  );
};

/** The travelling cube. */
const Cube: React.FC = () => {
  const { t, pop } = useClock();
  const p = at(cubeU(t));
  const hop = Math.abs(Math.sin(t * Math.PI * 1.6)) * (STATIONS.includes(cubeU(t)) ? 0 : 10);
  const show = pop(0.6);
  return (
    <g opacity={show}>
      <ellipse cx={p.x} cy={p.y - 2} rx={20} ry={10} fill={C.deep} opacity={0.18} />
      <Boxed cx={p.x} cy={p.y - 12} l={22} d={22} h={22} c={F.orange} lift={hop} />
    </g>
  );
};

/** A label that appears above a station. */
const Label: React.FC<{ x: number; y: number; text: string; at: number }> = ({ x, y, text, at: from }) => {
  const { pop } = useClock();
  const v = pop(from, 16);
  const w = text.length * 11.5 + 34;
  return (
    <g opacity={Math.min(1, v * 1.5)} transform={`translate(${x} ${y + (1 - v) * 14})`}>
      <rect x={-w / 2} y={-17} width={w} height={34} rx={17} fill={C.ink} />
      <text x={0} y={6} textAnchor="middle" fontSize={17} fontWeight={600} fill="#FFFFFF" fontFamily={fontSans}>
        {text}
      </text>
    </g>
  );
};

/* ------------------------------------------------------------------ stations */
/** 01: a stack of pages; the top one writes itself. */
const Script: React.FC = () => {
  const { pop, ramp } = useClock();
  const p = at(STATIONS[0]);
  const v = pop(0.55);
  const write = ramp(ARRIVE[0] - 0.1, ARRIVE[0] + 1.2);
  const lines = [0.92, 0.7, 0.84, 0.55];
  return (
    <g opacity={Math.min(1, v * 1.4)} transform={`translate(0 ${(1 - v) * -40})`}>
      {[0, 1, 2].map((k) => (
        <Boxed key={k} cx={p.x + k * 2} cy={p.y - 14 - k * 7} l={56} d={70} h={6} c={F.paper} />
      ))}
      {/* Writing on the top page, along its length. */}
      <OnTop x0={p.x + 4 - (56 - 70) / 2 - 2} y0={p.y - 14 - 2 * 7 - 6 + (56 + 70) / 4 - 2}>
        {lines.map((len, k) => (
          <rect key={k} x={10} y={8 + k * 11} width={Math.max(0, (70 - 20) * len * Math.min(1, Math.max(0, write * 4 - k)))} height={4} rx={2} fill={k === 0 ? C.brand : "#C9CBD3"} />
        ))}
      </OnTop>
    </g>
  );
};

/** 02: a waveform of bars that speaks while the cube is there. */
const Voice: React.FC = () => {
  const { pop, t, ramp } = useClock();
  const p = at(STATIONS[1]);
  const v = pop(0.67);
  const live = ramp(ARRIVE[1] - 0.1, ARRIVE[1] + 0.3) * (1 - ramp(LEAVE[1] + 0.2, LEAVE[1] + 0.8) * 0.6);
  const bars = 7;
  return (
    <g opacity={Math.min(1, v * 1.4)} transform={`translate(0 ${(1 - v) * -40})`}>
      <Boxed cx={p.x} cy={p.y - 14} l={30} d={78} h={8} c={F.stand} />
      {Array.from({ length: bars }, (_, k) => {
        const u = -30 + k * 10;
        const base = 10 + 6 * Math.sin(k * 1.7);
        const h = base + live * (16 + 22 * Math.abs(Math.sin(t * 7 + k * 0.9)) * (0.6 + 0.4 * Math.sin(t * 3.1 + k)));
        const q = { x: p.x + u, y: p.y - 22 - u / 2 };
        return <Boxed key={k} cx={q.x} cy={q.y} l={7} d={7} h={h} c={k % 2 ? F.orange : { top: "#FFB547", left: "#E25812", right: "#F68A2A" }} />;
      })}
    </g>
  );
};

/** 03: a monitor showing a product; a focus box closes in on one row. */
const Capture: React.FC = () => {
  const { pop, ramp } = useClock();
  const p = at(STATIONS[2]);
  const v = pop(0.79);
  const focus = ramp(ARRIVE[2] + 0.3, ARRIVE[2] + 1.1);
  // The screen: a thin upright box; its right face is the display.
  const W = 120;
  const H = 82;
  const fx = p.x - 34;
  const fy = p.y - 4;
  const lift = 40;
  return (
    <g opacity={Math.min(1, v * 1.4)} transform={`translate(0 ${(1 - v) * -40})`}>
      <Boxed cx={p.x} cy={p.y - 12} l={26} d={34} h={6} c={F.stand} />
      <Boxed cx={p.x} cy={p.y - 18} l={6} d={8} h={lift - 12} c={F.stand} />
      <Block fx={fx} fy={fy - lift} l={8} d={W} h={H} c={F.ink} />
      <OnRight x0={fx} y0={fy - lift - H}>
        <rect x={6} y={6} width={W - 12} height={H - 12} rx={3} fill="#FFFFFF" />
        <rect x={12} y={12} width={30} height={H - 24} rx={2} fill="#F1F1F4" />
        <rect x={48} y={13} width={44} height={6} rx={3} fill={C.ink} />
        {[0, 1, 2].map((k) => (
          <rect key={k} x={48} y={26 + k * 12} width={W - 64} height={7} rx={2} fill={k === 1 ? "#FFE3CF" : "#EDEDF1"} />
        ))}
        {/* The camera's focus move: a ring that settles on the row that matters. */}
        <rect x={46 - (1 - focus) * 30} y={36 - (1 - focus) * 22} width={W - 60 + (1 - focus) * 60} height={11 + (1 - focus) * 44} rx={3} fill="none" stroke={C.brand} strokeWidth={2.4} opacity={focus > 0 ? 1 : 0} />
      </OnRight>
    </g>
  );
};

/** 04: the film, a play tile that lands and glows. */
const Film: React.FC = () => {
  const { pop, ramp, t } = useClock();
  const p = at(STATIONS[3]);
  const v = pop(0.91);
  const done = ramp(ARRIVE[3] - 0.1, ARRIVE[3] + 0.4);
  const breathe = 1 + 0.03 * Math.sin(t * 4) * done;
  const H = 64;
  return (
    <g opacity={Math.min(1, v * 1.4)} transform={`translate(0 ${(1 - v) * -40})`}>
      <g transform={`translate(${p.x} ${p.y}) scale(${breathe}) translate(${-p.x} ${-p.y})`}>
        <Boxed cx={p.x} cy={p.y - 10} l={64} d={64} h={H} c={done > 0.5 ? F.orange : F.paper} />
        <OnRight x0={p.x} y0={p.y - 10 + 32 - H}>
          <path d="M 22 24 L 46 36 L 22 48 Z" fill={done > 0.5 ? "#FFFFFF" : "#C9CBD3"} />
        </OnRight>
      </g>
      {/* Frames leaving the tile, like a strip of film. */}
      {done > 0 &&
        [0, 1, 2].map((k) => {
          const q = at(STATIONS[3] + 60 + k * 26 * done);
          return <Boxed key={k} cx={q.x + 30} cy={q.y - 20 - k * 2} l={20} d={20} h={3} c={F.ink} opacity={done * (1 - k * 0.25)} />;
        })}
    </g>
  );
};

/* ------------------------------------------------------------------ copy */
const BEATS = [
  { from: 0.3, to: ARRIVE[1] - 0.25, n: "01", head: "Write the script.", body: "One line per scene, in a plain JSON file." },
  { from: ARRIVE[1] - 0.25, to: ARRIVE[2] - 0.25, n: "02", head: "It speaks every line.", body: "A directed voice. Each line's length becomes the clock." },
  { from: ARRIVE[2] - 0.25, to: ARRIVE[3] - 0.25, n: "03", head: "It films your product.", body: "Your real app, captured at 2x, with the camera directed." },
  { from: ARRIVE[3] - 0.25, to: 10.6, n: "04", head: "You get the film.", body: "Picture and sound cut from the same numbers." },
];

const Copy: React.FC = () => {
  const { t } = useClock();
  return (
    <div style={{ position: "absolute", left: 120, top: 0, bottom: 0, width: 600, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ position: "relative", height: 380 }}>
        {BEATS.map((b) => {
          const inV = interpolate(t, [b.from, b.from + 0.45], [0, 1], { ...clamp, easing: io });
          const outV = interpolate(t, [b.to - 0.3, b.to], [0, 1], { ...clamp, easing: io });
          const o = inV * (1 - outV);
          if (o <= 0) return null;
          return (
            <div key={b.n} style={{ position: "absolute", left: 0, top: 0, right: 0, opacity: o, transform: `translateY(${(1 - inV) * 26 - outV * 18}px)` }}>
              <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "0.14em", color: C.brand, marginBottom: 22 }}>{b.n} / 04</div>
              <div style={{ fontSize: 84, lineHeight: "88px", fontWeight: 700, letterSpacing: "-0.035em", color: C.ink }}>{b.head}</div>
              <div style={{ fontSize: 28, lineHeight: "40px", color: C.body, marginTop: 24, width: 520 }}>{b.body}</div>
            </div>
          );
        })}
      </div>
      {/* Progress: four ticks, the current one long and orange. */}
      <div style={{ display: "flex", gap: 10, marginTop: 40, opacity: interpolate(t, [0.4, 0.9, 10.3, 10.6], [0, 1, 1, 0], clamp) }}>
        {BEATS.map((b) => {
          const on = t >= b.from && t < b.to;
          return <div key={b.n} style={{ height: 6, width: on ? 54 : 18, borderRadius: 3, background: on ? C.brand : C.line }} />;
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ end card */
const Mark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 256 256">
    <defs>
      <linearGradient id="showreelMark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FFB547" />
        <stop offset=".45" stopColor="#F98620" />
        <stop offset="1" stopColor="#D9400B" />
      </linearGradient>
    </defs>
    <rect width="256" height="256" rx="60" fill="url(#showreelMark)" />
    <path d="M98 76Q98 62 110 69L180 112Q192 120 180 128L110 171Q98 178 98 164Z" fill="#fff" />
    <circle cx="196" cy="70" r="15" fill="#fff" />
  </svg>
);

const EndCard: React.FC = () => {
  const { t, pop } = useClock();
  const veil = interpolate(t, [10.5, 11.0], [0, 1], { ...clamp, easing: io });
  if (veil <= 0) return null;
  const mark = pop(10.75, 13);
  const words = pop(10.95, 16);
  return (
    <AbsoluteFill style={{ background: `rgba(255,255,255,${veil})`, alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
        <div style={{ transform: `scale(${0.6 + 0.4 * mark})`, opacity: Math.min(1, mark * 1.5), display: "flex", alignItems: "center", gap: 22 }}>
          <Mark size={96} />
          <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: "-0.03em", color: C.ink }}>AiEmcee</div>
        </div>
        <div style={{ fontSize: 46, fontWeight: 600, letterSpacing: "-0.02em", opacity: words, transform: `translateY(${(1 - words) * 18}px)`, color: C.ink }}>
          Write the script.{" "}
          <span style={{ backgroundImage: `linear-gradient(100deg, ${C.light}, ${C.brand} 50%, ${C.deep})`, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Get the film.</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ scene */
export const Showreel: React.FC = () => {
  const { t } = useClock();
  // A slow push across the board, following the cube.
  const pan = interpolate(t, [0, 10.5], [10, -30], { ...clamp, easing: Easing.bezier(0.33, 0, 0.3, 1) });
  const zoom = interpolate(t, [0, 10.5], [1.0, 1.07], { ...clamp, easing: Easing.bezier(0.33, 0, 0.3, 1) });
  return (
    <AbsoluteFill style={{ background: C.page, fontFamily: fontSans }}>
      {/* A warm wash behind the diorama. */}
      <div style={{ position: "absolute", left: 760, top: 60, width: 1100, height: 1000, borderRadius: "50%", background: "radial-gradient(closest-side, #FFF0E6 0%, #FFF7F1 45%, #FFFFFF00 100%)" }} />
      <div style={{ position: "absolute", left: 620, top: 210, width: 1000, height: 900, transform: `translateX(${pan}px) scale(${zoom})`, transformOrigin: "45% 50%" }}>
        <svg width={1000} height={900} viewBox="0 0 1000 900" style={{ overflow: "visible", fontFamily: fontSans }}>
          <defs>
            <linearGradient id="trackGlow" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor={C.light} />
              <stop offset="1" stopColor={C.deep} />
            </linearGradient>
          </defs>
          <Platform />
          {[0, 1, 2, 3].map((i) => (
            <Pad key={i} i={i} />
          ))}
          <Script />
          <Voice />
          <Capture />
          <Film />
          <Cube />
          <Label x={at(STATIONS[0]).x} y={at(STATIONS[0]).y - 92} text="narration.json" at={ARRIVE[0] + 0.1} />
          <Label x={at(STATIONS[1]).x} y={at(STATIONS[1]).y - 120} text="the voice" at={ARRIVE[1] + 0.1} />
          <Label x={at(STATIONS[2]).x + 20} y={at(STATIONS[2]).y - 190} text="your product" at={ARRIVE[2] + 0.1} />
          <Label x={at(STATIONS[3]).x} y={at(STATIONS[3]).y - 120} text="the film" at={ARRIVE[3] + 0.1} />
        </svg>
      </div>
      <Copy />
      <EndCard />
    </AbsoluteFill>
  );
};
