/**
 * Dark cinematic. Near-black ground, white type, one orange. Lit, bevelled
 * marks drawn with SVG gradients, slow push-ins, light sweeps and a soft
 * glow: restrained, for the moment a product is named.
 */
import React, { useId } from "react";
import { Img, staticFile } from "remotion";
import { fontSans } from "../../../fonts";
import { beatAt, useGsapTimeline } from "../../../motion/gsap";
import type { EndcardProps, HeroProps, MetricsProps, PipelineProps, StackProps, StyleDef } from "../../types";
import { GlyphSvg, Stage, countTo, depKey, fitSize, isFile, metricText } from "../swiss/lib";

const BG = "#0B0C10";
const WHITE = "#FFFFFF";
const ORANGE = "#FF8A1F";
const MUTED = "rgba(255,255,255,0.56)";
const FAINT = "rgba(255,255,255,0.32)";
const HAIR = "rgba(255,255,255,0.12)";

function rgba(hex: string, a: number) {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  const n = parseInt(f.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Ground: vignette, a cool top light and a warm floor glow. */
function Ground({ accent, glowX = 960, glowY = 540, glow = 0.16 }: { accent: string; glowX?: number; glowY?: number; glow?: number }) {
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(1400px 700px at 50% -10%, rgba(140,160,200,0.10), transparent 70%)` }} />
      <div className="dc-glow" style={{ position: "absolute", left: glowX - 700, top: glowY - 500, width: 1400, height: 1000, background: `radial-gradient(closest-side, ${rgba(accent, glow)}, transparent)` }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
    </>
  );
}

/**
 * A lit, bevelled tile: a centre face and four bevels, each with its own
 * gradient, a glyph in the face, and a light sweep (`.dc-sweep`, tween attr x).
 */
function Tile({ size, glyph, accent, lit = false, src }: { size: number; glyph?: string; accent: string; lit?: boolean; src?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const b = 13;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5A606E" />
            <stop offset="1" stopColor="#343844" />
          </linearGradient>
          <linearGradient id={`${id}l`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#2C3039" />
            <stop offset="1" stopColor="#23262E" />
          </linearGradient>
          <linearGradient id={`${id}r`} x1="1" y1="0" x2="0" y2="0">
            <stop offset="0" stopColor={lit ? rgba(accent, 0.55) : "#16181E"} />
            <stop offset="1" stopColor="#1A1C22" />
          </linearGradient>
          <linearGradient id={`${id}b`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={lit ? rgba(accent, 0.75) : "#0F1014"} />
            <stop offset="1" stopColor="#15171C" />
          </linearGradient>
          <linearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#2B2F38" />
            <stop offset="0.55" stopColor="#1C1E25" />
            <stop offset="1" stopColor="#14161B" />
          </linearGradient>
          <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0.22" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          <clipPath id={`${id}c`}>
            <rect x="0" y="0" width="100" height="100" rx="6" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id}c)`}>
          <polygon points={`0,0 100,0 ${100 - b},${b} ${b},${b}`} fill={`url(#${id}t)`} />
          <polygon points={`0,0 ${b},${b} ${b},${100 - b} 0,100`} fill={`url(#${id}l)`} />
          <polygon points={`100,0 100,100 ${100 - b},${100 - b} ${100 - b},${b}`} fill={`url(#${id}r)`} />
          <polygon points={`0,100 ${b},${100 - b} ${100 - b},${100 - b} 100,100`} fill={`url(#${id}b)`} />
          <rect x={b} y={b} width={100 - 2 * b} height={100 - 2 * b} fill={`url(#${id}f)`} />
          <line x1={b} y1={b + 0.4} x2={100 - b} y2={b + 0.4} stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="0.5" />
          <line x1="1" y1="0.5" x2="99" y2="0.5" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="0.6" />
          <g transform="skewX(-20)">
            <rect className="dc-sweep" x="-80" y="-10" width="40" height="120" fill={`url(#${id}s)`} />
          </g>
        </g>
        {lit ? <rect x={b} y={b} width={100 - 2 * b} height={100 - 2 * b} fill="none" stroke={accent} strokeOpacity="0.9" strokeWidth="0.8" /> : null}
      </svg>
      <div style={{ position: "absolute", left: size * 0.25, top: size * 0.25, width: size * 0.5, height: size * 0.5, filter: lit ? `drop-shadow(0 0 ${size * 0.04}px ${rgba(accent, 0.9)})` : undefined }}>
        {src ? (
          <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        ) : (
          <GlyphSvg name={glyph} size={size * 0.5} stroke="rgba(255,255,255,0.92)" accent={accent} strokeWidth={1.5} />
        )}
      </div>
    </div>
  );
}

function Kicker({ text, accent, center }: { text?: string; accent: string; center?: boolean }) {
  if (!text) return null;
  return (
    <div className="dc-kicker" style={{ display: "flex", alignItems: "center", justifyContent: center ? "center" : "flex-start", gap: 14, fontSize: 24, fontWeight: 600, color: MUTED, letterSpacing: "0.02em" }}>
      <span style={{ width: 28, height: 2, background: accent, boxShadow: `0 0 10px ${rgba(accent, 0.8)}` }} />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 1200 }}>{text}</span>
    </div>
  );
}

/** Headline in white with a light sweep that passes over it once. */
function Shine({ text, fs, className = "dc-head", lh = 1.04, align = "left" }: { text: string; fs: number; className?: string; lh?: number; align?: "left" | "center" }) {
  return (
    <div
      className={className}
      style={{
        fontSize: fs,
        fontWeight: 600,
        letterSpacing: "-0.035em",
        lineHeight: lh,
        textAlign: align,
        color: "transparent",
        backgroundImage: "linear-gradient(100deg, #FFFFFF 0%, #FFFFFF 40%, #FFE3C4 48%, #FFFFFF 56%, #C9CCD3 100%)",
        backgroundSize: "300% 100%",
        backgroundPosition: "100% 0",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
      }}
    >
      {text}
    </div>
  );
}

function sweep(tl: gsap.core.Timeline, q: (s: string) => Element[], sel: string, at: number) {
  const els = q(sel);
  if (els.length) tl.fromTo(els, { backgroundPosition: "100% 0" }, { backgroundPosition: "0% 0", duration: 1.6, ease: "power2.inOut" }, at);
}
function tileSweep(tl: gsap.core.Timeline, q: (s: string) => Element[], at: number, stagger = 0.12) {
  const els = q(".dc-sweep");
  if (els.length) tl.fromTo(els, { attr: { x: -80 } }, { attr: { x: 160 }, duration: 1.4, ease: "power2.inOut", stagger }, at);
}

function Head({ kicker, headline, accent }: { kicker?: string; headline?: string; accent: string }) {
  const fs = headline ? fitSize(headline, 1680, 170, 80, { charW: 0.55, lineH: 1.05, min: 36 }) : 0;
  return (
    <div style={{ position: "absolute", left: 120, top: 100, width: 1680 }}>
      <Kicker text={kicker} accent={accent} />
      {headline ? (
        <div style={{ marginTop: 22 }}>
          <Shine text={headline} fs={fs} lh={1.05} />
        </div>
      ) : null}
    </div>
  );
}

function headIn(tl: gsap.core.Timeline, q: (s: string) => Element[], t: number) {
  tl.from(q(".dc-kicker"), { autoAlpha: 0, y: 12, duration: 0.8, ease: "emcee.out" }, Math.max(0, t - 0.2));
  tl.from(q(".dc-head"), { autoAlpha: 0, y: 26, filter: "blur(8px)", duration: 1.1, ease: "emcee.out" }, t);
  sweep(tl, q, ".dc-head", t + 0.5);
}

const push = (tl: gsap.core.Timeline, q: (s: string) => Element[], to = 1.05) =>
  tl.fromTo(q(".dc-cam"), { scale: 1 }, { scale: to, duration: 12, ease: "sine.inOut" }, 0);

/* ---------------------------------------------------------------- hero */

const Hero: React.FC<HeroProps> = (p) => {
  const accent = p.accent ?? ORANGE;
  const tTitle = beatAt(p.beats, "title", 0.4);
  const tObj = beatAt(p.beats, "object", tTitle + 0.7);
  const fs = fitSize(p.headline, 1500, 260, 112, { charW: 0.55, lineH: 1.04, min: 44 });

  const scope = useGsapTimeline((tl, q) => {
    push(tl, q, 1.05);
    tl.from(q(".dc-glow"), { autoAlpha: 0, scale: 0.7, duration: 2.2, ease: "power2.out" }, Math.max(0, tObj - 0.4));
    tl.from(q(".dc-mark"), { autoAlpha: 0, y: 50, rotationX: 40, scale: 0.85, duration: 1.4, ease: "emcee.out" }, Math.max(0, tObj - 0.3));
    tileSweep(tl, q, tObj + 0.6);
    tl.from(q(".dc-kicker"), { autoAlpha: 0, y: 12, duration: 0.8, ease: "emcee.out" }, Math.max(0, tTitle - 0.2));
    tl.from(q(".dc-head"), { autoAlpha: 0, y: 30, filter: "blur(10px)", duration: 1.2, ease: "emcee.out" }, tTitle);
    sweep(tl, q, ".dc-head", tTitle + 0.8);
    tl.from(q(".dc-sub"), { autoAlpha: 0, y: 14, duration: 0.9, ease: "emcee.out" }, tTitle + 0.5);
    tl.to(q(".dc-markwrap"), { y: -10, duration: 4, ease: "sine.inOut", yoyo: true, repeat: 3 }, 2.5);
  }, [depKey(p)]);

  return (
    <Stage ref={scope} bg={BG} font={fontSans}>
      <Ground accent={accent} glowY={330} glow={0.2} />
      <div className="dc-cam" style={{ position: "absolute", inset: 0, transformOrigin: "50% 45%" }}>
        <div className="dc-markwrap" style={{ position: "absolute", left: 960 - 130, top: 150, perspective: 1200 }}>
          <div className="dc-mark" style={{ transform: "rotateX(14deg) rotateY(-16deg)", filter: `drop-shadow(0 40px 60px rgba(0,0,0,0.7))` }}>
            <Tile size={260} glyph={p.glyph} accent={accent} lit />
          </div>
        </div>
        <div style={{ position: "absolute", left: 210, right: 210, top: 500, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <Kicker text={p.kicker} accent={accent} center />
          <div style={{ marginTop: 24 }}>
            <Shine text={p.headline} fs={fs} align="center" />
          </div>
          {p.sub ? (
            <div className="dc-sub" style={{ marginTop: 28, maxWidth: 1100, fontSize: fitSize(p.sub, 1100, 100, 32, { lineH: 1.4, min: 18 }), lineHeight: 1.4, color: MUTED }}>
              {p.sub}
            </div>
          ) : null}
        </div>
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- pipeline */

const Pipeline: React.FC<PipelineProps> = (p) => {
  const accent = p.accent ?? ORANGE;
  const steps = p.steps.slice(0, 6);
  const n = Math.max(1, steps.length);
  const tTitle = beatAt(p.beats, "title", 0.3);
  const tSteps = beatAt(p.beats, "steps", tTitle + 0.6);
  const tTravel = beatAt(p.beats, "travel", tSteps + n * 0.15 + 0.4);
  const slot = 1680 / n;
  const ts = Math.min(170, slot * 0.6);
  const cy = 560;
  const cx = (i: number) => 120 + slot * (i + 0.5);
  const labelFs = Math.min(...steps.map((s) => fitSize(s.label, slot - 30, 80, 36, { lineH: 1.15, min: 18 })));
  const hintFs = Math.min(...steps.map((s) => fitSize(s.hint ?? "", slot - 30, 70, 22, { lineH: 1.35, min: 14 })));
  const hop = Math.min(0.5, 1.2 / Math.max(1, n - 1));

  const scope = useGsapTimeline((tl, q) => {
    push(tl, q, 1.04);
    headIn(tl, q, tTitle);
    tl.from(q(".dc-line"), { scaleX: 0, duration: 1.2, ease: "emcee.inOut" }, tSteps);
    tl.from(q(".dc-step"), { autoAlpha: 0, y: 40, duration: 0.9, ease: "emcee.out", stagger: 0.15 }, tSteps);
    tl.from(q(".dc-stxt"), { autoAlpha: 0, y: 14, duration: 0.7, ease: "emcee.out", stagger: 0.15 }, tSteps + 0.2);
    const pulse = q(".dc-pulse")[0];
    const lits = q(".dc-lit");
    const fill = q(".dc-fill")[0];
    tl.from(pulse, { autoAlpha: 0, scale: 0.3, duration: 0.4, ease: "power2.out" }, tTravel);
    tl.to(lits[0], { autoAlpha: 1, duration: 0.4 }, tTravel);
    for (let i = 1; i < n; i++) {
      const at = tTravel + 0.3 + (i - 1) * hop;
      tl.to(pulse, { x: cx(i) - cx(0), duration: hop, ease: "power1.inOut" }, at);
      tl.to(fill, { width: cx(i) - cx(0), duration: hop, ease: "power1.inOut" }, at);
      tl.to(lits[i], { autoAlpha: 1, duration: 0.35 }, at + hop * 0.8);
    }
    tileSweep(tl, q, tTravel + 0.2, 0.15);
  }, [depKey(p)]);

  return (
    <Stage ref={scope} bg={BG} font={fontSans}>
      <Ground accent={accent} glowY={600} glow={0.08} />
      <Head kicker={p.kicker} headline={p.headline} accent={accent} />
      <div className="dc-cam" style={{ position: "absolute", inset: 0, transformOrigin: "50% 55%" }}>
        <div className="dc-line" style={{ position: "absolute", left: cx(0), width: cx(n - 1) - cx(0), top: cy - 1, height: 2, background: HAIR, transformOrigin: "0 50%" }}>
          <div className="dc-fill" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 0, background: `linear-gradient(90deg, ${rgba(accent, 0.2)}, ${accent})`, boxShadow: `0 0 12px ${rgba(accent, 0.7)}` }} />
        </div>
        {steps.map((s, i) => (
          <React.Fragment key={i}>
            <div className="dc-step" style={{ position: "absolute", left: cx(i) - ts / 2, top: cy - ts / 2 }}>
              <div style={{ position: "relative" }}>
                <Tile size={ts} glyph={s.glyph} accent={accent} />
                <div className="dc-lit" style={{ position: "absolute", inset: 0, opacity: 0, visibility: "hidden" }}>
                  <div style={{ position: "absolute", inset: -30, background: `radial-gradient(closest-side, ${rgba(accent, 0.35)}, transparent)` }} />
                  <Tile size={ts} glyph={s.glyph} accent={accent} lit />
                </div>
              </div>
            </div>
            <div className="dc-stxt" style={{ position: "absolute", left: cx(i) - slot / 2 + 15, width: slot - 30, top: cy + ts / 2 + 44, textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: FAINT, fontVariantNumeric: "tabular-nums" }}>{String(i + 1).padStart(2, "0")}</div>
              <div style={{ marginTop: 10, fontSize: labelFs, fontWeight: 600, color: WHITE, lineHeight: 1.15, letterSpacing: "-0.02em" }}>{s.label}</div>
              {s.hint ? <div style={{ marginTop: 8, fontSize: hintFs, color: MUTED, lineHeight: 1.35 }}>{s.hint}</div> : null}
            </div>
          </React.Fragment>
        ))}
        <div className="dc-pulse" style={{ position: "absolute", left: cx(0) - 9, top: cy - ts / 2 - 40, width: 18, height: 18, borderRadius: 18, background: "#FFF3E6", boxShadow: `0 0 12px 4px ${accent}, 0 0 40px 10px ${rgba(accent, 0.5)}` }} />
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- stack */

const Stack: React.FC<StackProps> = (p) => {
  const accent = p.accent ?? ORANGE;
  const layers = p.layers.slice(0, 5);
  const n = Math.max(1, layers.length);
  const hi = Math.min(Math.max(0, p.highlight ?? 0), n - 1);
  const tTitle = beatAt(p.beats, "title", 0.3);
  const tLayers = beatAt(p.beats, "layers", tTitle + 0.6);
  const tHi = beatAt(p.beats, "highlight", tLayers + n * 0.18 + 0.6);
  // Slabs: flat isometric plates, top first.
  const SX = 560; // slab centre x
  const sw = n >= 4 ? 280 : 330; // half width along the iso axis
  const sh = sw / 2;
  const th = 22; // slab thickness
  // Fit the whole stack, top face to bottom edge, between y 330 and 1040.
  const room = 710;
  const pitch = n > 1 ? Math.min(130, (room - 2 * sh - th) / (n - 1)) : 0;
  const total = pitch * (n - 1) + 2 * sh + th;
  const y0 = 330 + (room - total) / 2 + sh - 60;
  const labelFs = Math.min(...layers.map((l) => fitSize(l.label, 640, 60, 44, { lineH: 1.1, min: 20, maxLines: 1 })));

  const scope = useGsapTimeline((tl, q) => {
    push(tl, q, 1.04);
    headIn(tl, q, tTitle);
    // Slabs are painted bottom first (so upper ones overlap); index them top first.
    const slabs = q(".dc-slab").reverse();
    const labs = q(".dc-lab");
    slabs.forEach((s, i) => {
      const at = tLayers + i * 0.18;
      tl.from(s, { autoAlpha: 0, y: -60, duration: 1.0, ease: "emcee.out" }, at);
      tl.from(labs[i], { autoAlpha: 0, x: 20, duration: 0.8, ease: "emcee.out" }, at + 0.2);
    });
    tl.to(q(".dc-slit"), { autoAlpha: 1, duration: 0.8, ease: "power2.out" }, tHi);
    tl.to(slabs[hi], { x: -16, y: -10, duration: 1.0, ease: "emcee.glide" }, tHi);
    tl.to(q(".dc-labt")[hi], { color: WHITE, duration: 0.5 }, tHi);
    tl.to(q(".dc-labhi"), { autoAlpha: 1, duration: 0.5 }, tHi);
  }, [depKey(p)]);

  const pts = (cy: number) => `${SX},${cy - sh} ${SX + sw},${cy} ${SX},${cy + sh} ${SX - sw},${cy}`;
  return (
    <Stage ref={scope} bg={BG} font={fontSans}>
      <Ground accent={accent} glowX={SX} glowY={y0 + hi * pitch + 60} glow={0.12} />
      <Head kicker={p.kicker} headline={p.headline} accent={accent} />
      <div className="dc-cam" style={{ position: "absolute", inset: 0, transformOrigin: "40% 60%" }}>
        {layers
          .map((l, i) => ({ l, i }))
          .reverse()
          .map(({ i }) => {
            const cy = y0 + i * pitch + 60;
            const lit = i === hi;
            return (
              <svg key={i} className="dc-slab" width={1920} height={1080} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
                <defs>
                  <linearGradient id={`dcs${i}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#3A3F4A" />
                    <stop offset="1" stopColor="#1C1E24" />
                  </linearGradient>
                  <linearGradient id={`dcl${i}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor={rgba(accent, 0.9)} />
                    <stop offset="1" stopColor={rgba(accent, 0.25)} />
                  </linearGradient>
                </defs>
                <polygon points={`${SX - sw},${cy} ${SX},${cy + sh} ${SX},${cy + sh + th} ${SX - sw},${cy + th}`} fill="#15171C" />
                <polygon points={`${SX + sw},${cy} ${SX},${cy + sh} ${SX},${cy + sh + th} ${SX + sw},${cy + th}`} fill="#0F1014" />
                <polygon points={pts(cy)} fill={`url(#dcs${i})`} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
                <g className={lit ? "dc-slit" : undefined} style={lit ? { opacity: 0, visibility: "hidden" } : { display: "none" }}>
                  <polygon points={pts(cy)} fill={`url(#dcl${i})`} opacity={0.35} />
                  <polygon points={`${SX - sw},${cy} ${SX},${cy + sh} ${SX},${cy + sh + th} ${SX - sw},${cy + th}`} fill={rgba(accent, 0.55)} />
                  <polygon points={`${SX + sw},${cy} ${SX},${cy + sh} ${SX},${cy + sh + th} ${SX + sw},${cy + th}`} fill={rgba(accent, 0.3)} />
                  <polyline points={`${SX - sw},${cy} ${SX},${cy + sh} ${SX + sw},${cy}`} fill="none" stroke={accent} strokeWidth={2} style={{ filter: `drop-shadow(0 0 6px ${accent})` }} />
                </g>
              </svg>
            );
          })}
        {layers.map((l, i) => {
          const cy = y0 + i * pitch + 60;
          return (
            <div key={i} className="dc-lab" style={{ position: "absolute", left: SX + sw + 40, top: cy - 30, width: 1920 - (SX + sw + 40) - 120, height: 60, display: "flex", alignItems: "center", gap: 20 }}>
              <span style={{ width: 80, height: 1, background: HAIR, flex: "none" }} />
              <span className="dc-labhi" style={{ position: "absolute", left: 0, width: 80, height: 2, background: accent, boxShadow: `0 0 10px ${accent}`, opacity: i === hi ? 0 : 0, visibility: "hidden", display: i === hi ? "block" : "none" }} />
              <GlyphSvg name={l.glyph} size={40} stroke={i === hi ? WHITE : MUTED} accent={accent} />
              <div className="dc-labt" style={{ minWidth: 0, color: "rgba(255,255,255,0.78)" }}>
                <div style={{ fontSize: labelFs, fontWeight: 600, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.label}</div>
                {l.hint && pitch >= 90 ? <div style={{ marginTop: 4, fontSize: 21, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.hint}</div> : null}
              </div>
            </div>
          );
        })}
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- metrics */

const Metrics: React.FC<MetricsProps> = (p) => {
  const accent = p.accent ?? ORANGE;
  const ms = p.metrics.slice(0, 4);
  const n = Math.max(1, ms.length);
  const tTitle = beatAt(p.beats, "title", 0.3);
  const tNum = beatAt(p.beats, "numbers", tTitle + 0.6);
  const gap = 60;
  const colW = (1680 - gap * (n - 1)) / n;
  const numFs = Math.min(n === 1 ? 300 : 180, ...ms.map((m) => colW / Math.max(1, metricText(m).length * 0.6)));
  const labelFs = Math.min(...ms.map((m) => fitSize(m.label, colW, 90, 30, { lineH: 1.35, min: 18 })));

  const scope = useGsapTimeline((tl, q) => {
    push(tl, q, 1.04);
    headIn(tl, q, tTitle);
    q(".dc-m").forEach((c, i) => {
      const at = tNum + i * 0.18;
      tl.from(c.querySelector(".dc-rule"), { scaleX: 0, duration: 1.0, ease: "emcee.inOut" }, at);
      tl.from(c.querySelector(".dc-valw"), { autoAlpha: 0, y: 30, filter: "blur(8px)", duration: 1.0, ease: "emcee.out" }, at + 0.1);
      const { o, write } = countTo(c.querySelector(".dc-val")!, ms[i]);
      tl.to(o, { v: ms[i].value, duration: 1.6, ease: "power3.out", onUpdate: write }, at + 0.1);
      tl.from(c.querySelector(".dc-lab"), { autoAlpha: 0, y: 12, duration: 0.8, ease: "emcee.out" }, at + 0.35);
    });
    sweep(tl, q, ".dc-valw", tNum + 1.2);
  }, [depKey(p)]);

  return (
    <Stage ref={scope} bg={BG} font={fontSans}>
      <Ground accent={accent} glowY={720} glow={0.09} />
      <Head kicker={p.kicker} headline={p.headline} accent={accent} />
      <div className="dc-cam" style={{ position: "absolute", inset: 0, transformOrigin: "50% 65%" }}>
        {ms.map((m, i) => (
          <div key={i} className="dc-m" style={{ position: "absolute", left: 120 + i * (colW + gap), top: 470, width: colW, textAlign: n === 1 ? "center" : "left" }}>
            <div className="dc-rule" style={{ height: 2, background: i === 0 ? accent : HAIR, boxShadow: i === 0 ? `0 0 12px ${rgba(accent, 0.7)}` : undefined, transformOrigin: n === 1 ? "50% 50%" : "0 50%" }} />
            <div
              className="dc-valw"
              style={{
                marginTop: 40,
                fontSize: numFs,
                fontWeight: 600,
                letterSpacing: "-0.045em",
                lineHeight: 1,
                whiteSpace: "nowrap",
                color: "transparent",
                backgroundImage: `linear-gradient(100deg, #FFFFFF 0%, #FFFFFF 40%, ${i === 0 ? "#FFD2A6" : "#FFFFFF"} 48%, #FFFFFF 56%, #A9ADB6 100%)`,
                backgroundSize: "300% 100%",
                backgroundPosition: "100% 0",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span className="dc-val">{metricText(m)}</span>
            </div>
            <div className="dc-lab" style={{ marginTop: 26, fontSize: labelFs, lineHeight: 1.35, color: MUTED }}>{m.label}</div>
          </div>
        ))}
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- endcard */

const Endcard: React.FC<EndcardProps> = (p) => {
  const accent = p.accent ?? ORANGE;
  const tMark = beatAt(p.beats, "mark", 0.3);
  const tTitle = beatAt(p.beats, "title", tMark + 0.8);
  const fs = fitSize(p.title, 1500, 240, 150, { charW: 0.55, lineH: 1.02, min: 50 });

  const scope = useGsapTimeline((tl, q) => {
    push(tl, q, 1.06);
    tl.from(q(".dc-glow"), { autoAlpha: 0, scale: 0.6, duration: 2.4, ease: "power2.out" }, tMark);
    tl.from(q(".dc-mark"), { autoAlpha: 0, y: 40, rotationX: 50, scale: 0.8, duration: 1.5, ease: "emcee.out" }, tMark);
    tileSweep(tl, q, tMark + 0.9);
    tl.from(q(".dc-kicker"), { autoAlpha: 0, y: 10, duration: 0.8, ease: "emcee.out" }, tTitle - 0.2);
    tl.from(q(".dc-head"), { autoAlpha: 0, y: 26, filter: "blur(10px)", letterSpacing: "0.02em", duration: 1.3, ease: "emcee.out" }, tTitle);
    sweep(tl, q, ".dc-head", tTitle + 0.8);
    tl.from(q(".dc-sub"), { autoAlpha: 0, y: 12, duration: 0.9, ease: "emcee.out" }, tTitle + 0.5);
    tl.to(q(".dc-markwrap"), { y: -8, duration: 4, ease: "sine.inOut", yoyo: true, repeat: 3 }, 2.5);
  }, [depKey(p)]);

  return (
    <Stage ref={scope} bg={BG} font={fontSans}>
      <Ground accent={accent} glowY={330} glow={0.22} />
      <div className="dc-cam" style={{ position: "absolute", inset: 0, transformOrigin: "50% 50%" }}>
        <div className="dc-markwrap" style={{ position: "absolute", left: 960 - 110, top: 200, perspective: 1200 }}>
          <div className="dc-mark" style={{ filter: "drop-shadow(0 40px 60px rgba(0,0,0,0.7))" }}>
            <Tile size={220} glyph={isFile(p.mark) ? undefined : p.mark} src={isFile(p.mark) ? p.mark : undefined} accent={accent} lit />
          </div>
        </div>
        <div style={{ position: "absolute", left: 160, right: 160, top: 500, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <Kicker text={p.kicker} accent={accent} center />
          <div style={{ marginTop: 22 }}>
            <Shine text={p.title} fs={fs} lh={1.02} align="center" />
          </div>
          {p.tagline ? (
            <div className="dc-sub" style={{ marginTop: 26, fontSize: fitSize(p.tagline, 1300, 90, 34, { lineH: 1.4, min: 18 }), lineHeight: 1.4, color: MUTED }}>
              {p.tagline}
            </div>
          ) : null}
        </div>
      </div>
    </Stage>
  );
};

export const style: StyleDef = {
  id: "dark-cinematic",
  label: "Dark cinematic",
  description: "Lit 3D marks, slow push-ins and light sweeps, for the moment a product is named.",
  bestFor: "reveals, end cards",
  tone: "dark",
  swatch: ["#0B0C10", "#FFFFFF", "#FF8A1F"],
  templates: { hero: Hero, pipeline: Pipeline, stack: Stack, metrics: Metrics, endcard: Endcard },
};
