/**
 * Product UI, glass. A cool grey ground, white product panels with soft
 * shadows and 12px radii, real-looking rows, pills and buttons, and floating
 * callout chips. The camera glides and pushes between panels.
 */
import React from "react";
import { Img, staticFile } from "remotion";
import { fontSans } from "../../../fonts";
import { beatAt, useGsapTimeline } from "../../../motion/gsap";
import type { EndcardProps, HeroProps, MetricsProps, PipelineProps, StackProps, StyleDef } from "../../types";
import { GlyphSvg, Stage, countTo, depKey, fitSize, hashStr, isFile, metricText, seeded } from "../swiss/lib";

const BG = "#EEF1F6";
const INK = "#16181D";
const ACCENT = "#C9480A";
const MUTED = "#6B7280";
const FAINT = "#9AA1AD";
const LINE = "#E4E8EF";
const SOFT = "#F6F7FA";
const SHADOW = "0 1px 2px rgba(22,24,29,0.06), 0 12px 32px rgba(22,24,29,0.08), 0 40px 80px rgba(22,24,29,0.06)";
const CHIP_SHADOW = "0 2px 4px rgba(22,24,29,0.08), 0 18px 40px rgba(22,24,29,0.14)";

/** A tint of `hex` at alpha `a`. */
function tint(hex: string, a: number) {
  const h = hex.replace("#", "");
  const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  const n = parseInt(f.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const Panel: React.FC<{ className?: string; style?: React.CSSProperties; children?: React.ReactNode }> = ({ className, style, children }) => (
  <div className={className} style={{ background: "#FFFFFF", borderRadius: 12, boxShadow: SHADOW, border: `1px solid ${LINE}`, overflow: "hidden", ...style }}>
    {children}
  </div>
);

function Pill({ text, color, bg, className }: { text: string; color: string; bg: string; className?: string }) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: bg, color, fontSize: 18, fontWeight: 600, whiteSpace: "nowrap" }}>
      <span style={{ width: 7, height: 7, borderRadius: 7, background: color }} />
      {text}
    </span>
  );
}

function Tile({ glyph, accent, size = 56, solid = false }: { glyph?: string; accent: string; size?: number; solid?: boolean }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.24, background: solid ? accent : tint(accent, 0.1), display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
      <GlyphSvg name={glyph} size={size * 0.56} stroke={solid ? "#FFFFFF" : INK} accent={solid ? "#FFFFFF" : accent} strokeWidth={1.75} />
    </div>
  );
}

function Kicker({ text, accent }: { text?: string; accent: string }) {
  if (!text) return null;
  return (
    <div className="gl-kicker" style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "8px 16px", borderRadius: 999, background: "#FFFFFF", border: `1px solid ${LINE}`, fontSize: 22, fontWeight: 600, color: INK, boxShadow: "0 1px 2px rgba(22,24,29,0.05)", maxWidth: 900 }}>
      <span style={{ width: 8, height: 8, borderRadius: 8, background: accent }} />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text}</span>
    </div>
  );
}

/** Window chrome: three neutral dots and a quiet address/title bar. */
function Chrome({ title }: { title: string }) {
  return (
    <div style={{ height: 52, display: "flex", alignItems: "center", gap: 8, padding: "0 20px", borderBottom: `1px solid ${LINE}`, background: SOFT }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{ width: 11, height: 11, borderRadius: 11, background: "#D5DAE2" }} />
      ))}
      <div style={{ marginLeft: 18, height: 28, flex: 1, maxWidth: 420, borderRadius: 8, background: "#FFFFFF", border: `1px solid ${LINE}`, display: "flex", alignItems: "center", padding: "0 12px", fontSize: 15, color: FAINT, whiteSpace: "nowrap", overflow: "hidden" }}>
        {title}
      </div>
    </div>
  );
}

/** Placeholder text bar, for rows that should read as content without words. */
const Bar = ({ w, h = 12, c = "#E7EAF0" }: { w: number | string; h?: number; c?: string }) => <span style={{ display: "block", width: w, height: h, borderRadius: h, background: c }} />;

/** The ground: a soft light from top-left and a faint dot grid. */
function Ground() {
  return (
    <>
      <div style={{ position: "absolute", inset: 0, background: `radial-gradient(1200px 800px at 20% 10%, #FFFFFF 0%, rgba(255,255,255,0) 70%)` }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(22,24,29,0.07) 1.2px, transparent 1.2px)", backgroundSize: "32px 32px", opacity: 0.6 }} />
    </>
  );
}

function Head({ kicker, headline, accent, width = 1680, maxFs = 76 }: { kicker?: string; headline?: string; accent: string; width?: number; maxFs?: number }) {
  const fs = headline ? fitSize(headline, width, 170, maxFs, { charW: 0.55, lineH: 1.08, min: 34 }) : 0;
  return (
    <div style={{ position: "absolute", left: 120, top: 92, width }}>
      <Kicker text={kicker} accent={accent} />
      {headline ? (
        <div className="gl-head" style={{ marginTop: 22, fontSize: fs, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.08, color: INK }}>
          {headline}
        </div>
      ) : null}
    </div>
  );
}

const STATUSES = [
  { t: "Passed", c: "#178A4C", b: "#E6F4EC" },
  { t: "Passed", c: "#178A4C", b: "#E6F4EC" },
  { t: "Review", c: "#A15C00", b: "#FBF0DE" },
  { t: "Passed", c: "#178A4C", b: "#E6F4EC" },
  { t: "Queued", c: "#5B6472", b: "#EEF0F4" },
];

/* ---------------------------------------------------------------- hero */

const Hero: React.FC<HeroProps> = (p) => {
  const accent = p.accent ?? ACCENT;
  const tTitle = beatAt(p.beats, "title", 0.3);
  const tObj = beatAt(p.beats, "object", tTitle + 0.8);
  const fs = fitSize(p.headline, 700, 420, 92, { charW: 0.55, lineH: 1.04, min: 40 });
  const subFs = p.sub ? fitSize(p.sub, 680, 130, 30, { lineH: 1.4, min: 18 }) : 0;
  const rnd = seeded(hashStr(p.headline));
  const rows = STATUSES.map((s, i) => ({ ...s, w1: 140 + rnd() * 120, w2: 90 + rnd() * 80, n: 12 + Math.floor(rnd() * 80) + i }));

  const scope = useGsapTimeline((tl, q) => {
    tl.from(q(".gl-kicker"), { y: 16, autoAlpha: 0, duration: 0.5, ease: "emcee.out" }, Math.max(0, tTitle - 0.15));
    tl.from(q(".gl-head"), { y: 30, autoAlpha: 0, duration: 0.7, ease: "emcee.out" }, tTitle);
    tl.from(q(".gl-sub"), { y: 20, autoAlpha: 0, duration: 0.6, ease: "emcee.out" }, tTitle + 0.25);
    tl.from(q(".gl-btn"), { y: 16, autoAlpha: 0, duration: 0.5, ease: "emcee.out", stagger: 0.08 }, tTitle + 0.4);
    tl.from(q(".gl-win"), { y: 80, autoAlpha: 0, scale: 0.96, duration: 0.9, ease: "emcee.glide" }, Math.max(0, tObj - 0.5));
    tl.from(q(".gl-row"), { y: 14, autoAlpha: 0, duration: 0.4, ease: "emcee.out", stagger: 0.06 }, tObj - 0.15);
    tl.from(q(".gl-chip"), { y: 30, scale: 0.9, autoAlpha: 0, duration: 0.6, ease: "emcee.pop" }, tObj + 0.35);
    // camera: a slow push toward the window
    tl.fromTo(q(".gl-cam"), { scale: 1.0, x: 0 }, { scale: 1.03, x: -30, duration: 9, ease: "sine.inOut" }, 0);
    tl.to(q(".gl-chip"), { y: -8, duration: 3, ease: "sine.inOut", yoyo: true, repeat: 3 }, 3);
  }, [depKey(p)]);

  return (
    <Stage ref={scope} bg={BG} font={fontSans}>
      <Ground />
      <div className="gl-cam" style={{ position: "absolute", inset: 0, transformOrigin: "70% 50%" }}>
        <div style={{ position: "absolute", left: 120, top: 0, bottom: 0, width: 720, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div>
            <Kicker text={p.kicker} accent={accent} />
          </div>
          <div className="gl-head" style={{ marginTop: 28, fontSize: fs, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.04, color: INK }}>
            {p.headline}
          </div>
          {p.sub ? (
            <div className="gl-sub" style={{ marginTop: 28, fontSize: subFs, lineHeight: 1.4, color: MUTED, maxWidth: 680 }}>
              {p.sub}
            </div>
          ) : null}
          <div style={{ marginTop: 40, display: "flex", gap: 14 }}>
            <div className="gl-btn" style={{ padding: "16px 26px", borderRadius: 10, background: INK, color: "#FFFFFF", fontSize: 21, fontWeight: 600 }}>Get started</div>
            <div className="gl-btn" style={{ padding: "16px 26px", borderRadius: 10, background: "#FFFFFF", border: `1px solid ${LINE}`, color: INK, fontSize: 21, fontWeight: 600 }}>See how it works</div>
          </div>
        </div>

        <Panel className="gl-win" style={{ position: "absolute", left: 940, top: 190, width: 840, height: 700 }}>
          <Chrome title="app / runs / latest" />
          <div style={{ display: "flex", height: 648 }}>
            <div style={{ width: 200, borderRight: `1px solid ${LINE}`, padding: "24px 18px", display: "flex", flexDirection: "column", gap: 18, background: "#FBFCFD" }}>
              {[80, 110, 96, 70, 120].map((w, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: i === 1 ? tint(accent, 0.08) : "transparent" }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: i === 1 ? accent : "#D9DEE6" }} />
                  <Bar w={w * 0.9} h={10} c={i === 1 ? tint(accent, 0.35) : "#E3E7EE"} />
                </div>
              ))}
            </div>
            <div style={{ flex: 1, padding: "28px 30px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 26, fontWeight: 600, color: INK, letterSpacing: "-0.01em" }}>Latest run</div>
                <Pill text="All checks" color={accent} bg={tint(accent, 0.1)} />
              </div>
              <div style={{ marginTop: 22, border: `1px solid ${LINE}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "flex", padding: "12px 18px", background: SOFT, fontSize: 15, color: FAINT, fontWeight: 600 }}>
                  <span style={{ flex: 1 }}>Check</span>
                  <span style={{ width: 120 }}>Evidence</span>
                  <span style={{ width: 110, textAlign: "right" }}>Status</span>
                </div>
                {rows.map((r, i) => (
                  <div key={i} className="gl-row" style={{ display: "flex", alignItems: "center", padding: "0 18px", height: 74, borderTop: `1px solid ${LINE}` }}>
                    <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                      <Bar w={r.w1} h={11} c="#D7DCE4" />
                      <Bar w={r.w2} h={9} />
                    </span>
                    <span style={{ width: 120, fontSize: 17, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{r.n} files</span>
                    <span style={{ width: 110, display: "flex", justifyContent: "flex-end" }}>
                      <Pill text={r.t} color={r.c} bg={r.b} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <div className="gl-chip" style={{ position: "absolute", left: 880, top: 780, display: "flex", alignItems: "center", gap: 16, padding: "16px 22px 16px 16px", background: "#FFFFFF", borderRadius: 14, boxShadow: CHIP_SHADOW, border: `1px solid ${LINE}` }}>
          <Tile glyph={p.glyph} accent={accent} size={60} solid />
          <div>
            <div style={{ fontSize: 22, fontWeight: 600, color: INK }}>{(p.glyph ?? "verified").replace(/^./, (c) => c.toUpperCase())}</div>
            <div style={{ fontSize: 17, color: MUTED, marginTop: 4 }}>Proof attached to every check</div>
          </div>
        </div>
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- pipeline */

const Pipeline: React.FC<PipelineProps> = (p) => {
  const accent = p.accent ?? ACCENT;
  const steps = p.steps.slice(0, 6);
  const n = Math.max(1, steps.length);
  const tTitle = beatAt(p.beats, "title", 0.25);
  const tSteps = beatAt(p.beats, "steps", tTitle + 0.5);
  const tTravel = beatAt(p.beats, "travel", tSteps + 0.4 + n * 0.1);
  const gap = 28;
  const L = 120;
  const cardW = (1680 - gap * (n - 1)) / n;
  const labelFs = Math.min(...steps.map((s) => fitSize(s.label, cardW - 56, 80, 34, { lineH: 1.15, min: 18 })));
  const hintFs = Math.min(...steps.map((s) => fitSize(s.hint ?? "", cardW - 56, 70, 21, { lineH: 1.35, min: 14 })));
  const hop = Math.min(0.45, 1.5 / Math.max(1, n - 1));
  const cx = (i: number) => L + i * (cardW + gap) + cardW / 2;

  const scope = useGsapTimeline((tl, q) => {
    tl.from(q(".gl-kicker"), { y: 16, autoAlpha: 0, duration: 0.5, ease: "emcee.out" }, Math.max(0, tTitle - 0.15));
    tl.from(q(".gl-head"), { y: 26, autoAlpha: 0, duration: 0.7, ease: "emcee.out" }, tTitle);
    tl.from(q(".gl-board"), { y: 60, autoAlpha: 0, duration: 0.9, ease: "emcee.glide" }, Math.max(0, tSteps - 0.3));
    tl.from(q(".gl-card"), { y: 40, autoAlpha: 0, duration: 0.6, ease: "emcee.out", stagger: 0.1 }, tSteps);
    tl.from(q(".gl-track"), { scaleX: 0, duration: 0.8, ease: "emcee.inOut" }, tSteps + 0.2);
    const dot = q(".gl-dot")[0];
    const fill = q(".gl-fill")[0];
    const rings = q(".gl-ring");
    const pills = q(".gl-state");
    const queued = q(".gl-q");
    tl.from(dot, { scale: 0, duration: 0.4, ease: "emcee.pop" }, tTravel);
    tl.to(rings[0], { autoAlpha: 1, duration: 0.3 }, tTravel);
    for (let i = 1; i < n; i++) {
      const at = tTravel + 0.3 + (i - 1) * hop;
      tl.to(dot, { x: cx(i) - cx(0), duration: hop * 0.9, ease: "emcee.inOut" }, at);
      tl.to(fill, { width: cx(i) - cx(0), duration: hop * 0.9, ease: "emcee.inOut" }, at);
      tl.to(rings[i - 1], { autoAlpha: 0, duration: 0.25 }, at + hop * 0.5);
      tl.to(rings[i], { autoAlpha: 1, duration: 0.25 }, at + hop * 0.5);
      tl.to(pills[i - 1], { autoAlpha: 1, duration: 0.2 }, at + hop * 0.5);
      tl.to(queued[i - 1], { autoAlpha: 0, duration: 0.15 }, at + hop * 0.5);
    }
    const end = tTravel + 0.3 + Math.max(0, n - 2) * hop + hop * 0.5;
    tl.to(pills[n - 1], { autoAlpha: 1, duration: 0.2 }, end);
    tl.to(queued[n - 1], { autoAlpha: 0, duration: 0.15 }, end);
    // camera: glides gently across the row
    tl.fromTo(q(".gl-cam"), { x: 40, scale: 1.04 }, { x: -20, scale: 1, duration: 10, ease: "sine.inOut" }, 0);
    tl.from(q(".gl-callout"), { y: 20, autoAlpha: 0, scale: 0.9, duration: 0.5, ease: "emcee.pop" }, tTravel + 0.3 + (n - 1) * hop);
  }, [depKey(p)]);

  return (
    <Stage ref={scope} bg={BG} font={fontSans}>
      <Ground />
      <Head kicker={p.kicker} headline={p.headline} accent={accent} />
      <div className="gl-cam" style={{ position: "absolute", inset: 0, transformOrigin: "50% 60%" }}>
        <div className="gl-board" style={{ position: "absolute", left: 0, right: 0, top: 380, height: 560 }}>
          {steps.map((s, i) => (
            <Panel key={i} className="gl-card" style={{ position: "absolute", left: L + i * (cardW + gap), top: 0, width: cardW, height: 330, padding: 28, boxSizing: "border-box", overflow: "visible" }}>
              <div className="gl-ring" style={{ position: "absolute", inset: -3, borderRadius: 14, border: `2px solid ${accent}`, boxShadow: `0 0 0 6px ${tint(accent, 0.12)}`, opacity: 0, visibility: "hidden" }} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Tile glyph={s.glyph} accent={accent} size={Math.min(60, cardW * 0.22)} />
                <span style={{ fontSize: 17, fontWeight: 600, color: FAINT, fontVariantNumeric: "tabular-nums" }}>Step {i + 1}</span>
              </div>
              <div style={{ marginTop: 30, fontSize: labelFs, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.15, color: INK }}>{s.label}</div>
              {s.hint ? <div style={{ marginTop: 10, fontSize: hintFs, lineHeight: 1.35, color: MUTED }}>{s.hint}</div> : null}
              <div style={{ position: "absolute", left: 28, bottom: 26, right: 28, height: 30 }}>
                <span className="gl-q" style={{ position: "absolute", left: 0, top: 0 }}>
                  <Pill text="Queued" color="#5B6472" bg="#EEF0F4" />
                </span>
                <span className="gl-state" style={{ position: "absolute", left: 0, top: 0, opacity: i === n - 1 ? 0 : 0, visibility: "hidden" }}>
                  {i === n - 1 ? <Pill text="Active" color={accent} bg={tint(accent, 0.1)} /> : <Pill text="Done" color="#178A4C" bg="#E6F4EC" />}
                </span>
              </div>
            </Panel>
          ))}
          <div className="gl-track" style={{ position: "absolute", left: cx(0), width: cx(n - 1) - cx(0), top: 410, height: 6, borderRadius: 6, background: "#DCE1E9", transformOrigin: "0 50%" }}>
            <div className="gl-fill" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 0, borderRadius: 6, background: accent }} />
          </div>
          {steps.map((_, i) => (
            <span key={i} style={{ position: "absolute", left: cx(i) - 9, top: 404, width: 18, height: 18, borderRadius: 18, background: "#FFFFFF", border: `2px solid #CBD2DC`, boxSizing: "border-box" }} />
          ))}
          <div className="gl-dot" style={{ position: "absolute", left: cx(0) - 18, top: 395, width: 36, height: 36, borderRadius: 36, background: accent, boxShadow: `0 0 0 8px ${tint(accent, 0.16)}, 0 6px 16px ${tint(accent, 0.4)}` }} />
          <div className="gl-callout" style={{ position: "absolute", left: Math.min(cx(n - 1) - 120, 1920 - 120 - 300), top: 460, display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", background: "#FFFFFF", borderRadius: 12, boxShadow: CHIP_SHADOW, border: `1px solid ${LINE}`, fontSize: 20, fontWeight: 600, color: INK, whiteSpace: "nowrap" }}>
            <GlyphSvg name="approve" size={26} stroke={INK} accent={accent} />
            {n} of {n} complete
          </div>
        </div>
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- stack */

const Stack: React.FC<StackProps> = (p) => {
  const accent = p.accent ?? ACCENT;
  const layers = p.layers.slice(0, 5);
  const n = Math.max(1, layers.length);
  const hi = Math.min(Math.max(0, p.highlight ?? 0), n - 1);
  const tTitle = beatAt(p.beats, "title", 0.25);
  const tLayers = beatAt(p.beats, "layers", tTitle + 0.5);
  const tHi = beatAt(p.beats, "highlight", tLayers + n * 0.12 + 0.6);
  const gap = 18;
  const top = 340;
  const areaH = 620;
  const rowH = Math.min(150, (areaH - gap * (n - 1)) / n);
  const total = rowH * n + gap * (n - 1);
  const y0 = top + (areaH - total) / 2;
  const W0 = 1120;
  const labelFs = Math.min(...layers.map((l) => fitSize(l.label, 520, rowH * 0.5, 40, { lineH: 1.1, min: 20, maxLines: 1 })));
  const hintFs = Math.min(24, rowH * 0.2);

  const scope = useGsapTimeline((tl, q) => {
    tl.from(q(".gl-kicker"), { y: 16, autoAlpha: 0, duration: 0.5, ease: "emcee.out" }, Math.max(0, tTitle - 0.15));
    tl.from(q(".gl-head"), { y: 26, autoAlpha: 0, duration: 0.7, ease: "emcee.out" }, tTitle);
    tl.from(q(".gl-layer"), { y: -50, autoAlpha: 0, duration: 0.6, ease: "emcee.out", stagger: 0.12 }, tLayers);
    tl.to(q(".gl-layer")[hi], { x: -28, scale: 1.02, duration: 0.7, ease: "emcee.glide" }, tHi);
    tl.to(q(".gl-hiring")[hi], { autoAlpha: 1, duration: 0.4 }, tHi);
    tl.from(q(".gl-chip"), { x: -20, autoAlpha: 0, duration: 0.55, ease: "emcee.pop" }, tHi + 0.25);
    tl.from(q(".gl-conn"), { scaleX: 0, duration: 0.4, ease: "emcee.out" }, tHi + 0.15);
    tl.fromTo(q(".gl-cam"), { scale: 1, y: 0 }, { scale: 1.04, y: (540 - (y0 + hi * (rowH + gap) + rowH / 2)) * 0.15, duration: 8, ease: "sine.inOut" }, Math.max(0, tHi - 0.5));
  }, [depKey(p)]);

  const hiY = y0 + hi * (rowH + gap) + rowH / 2;
  return (
    <Stage ref={scope} bg={BG} font={fontSans}>
      <Ground />
      <Head kicker={p.kicker} headline={p.headline} accent={accent} />
      <div className="gl-cam" style={{ position: "absolute", inset: 0, transformOrigin: "40% 60%" }}>
        {layers.map((l, i) => (
          <Panel key={i} className="gl-layer" style={{ position: "absolute", left: 120, top: y0 + i * (rowH + gap), width: W0, height: rowH, overflow: "visible", zIndex: i === hi ? 2 : 1 }}>
            <div className="gl-hiring" style={{ position: "absolute", inset: -3, borderRadius: 14, border: `2px solid ${accent}`, boxShadow: `0 0 0 8px ${tint(accent, 0.1)}`, opacity: 0, visibility: i === hi ? "hidden" : "hidden" }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", gap: 26, padding: "0 32px" }}>
              <Tile glyph={l.glyph} accent={accent} size={Math.min(64, rowH * 0.56)} solid={i === hi} />
              <div style={{ width: 520, minWidth: 0 }}>
                <div style={{ fontSize: labelFs, fontWeight: 600, letterSpacing: "-0.02em", color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.label}</div>
                {l.hint && rowH > 80 ? (
                  <div style={{ marginTop: 6, fontSize: hintFs, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.hint}</div>
                ) : null}
              </div>
              <div style={{ flex: 1, display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
                {[0, 1, 2].map((k) => (
                  <Bar key={k} w={60 + ((i * 3 + k * 7) % 5) * 14} h={10} c={i === hi ? tint(accent, 0.25) : "#E5E8EE"} />
                ))}
                <span style={{ marginLeft: 16, fontSize: 17, color: FAINT, fontWeight: 600, width: 60, textAlign: "right" }}>L{i + 1}</span>
              </div>
            </div>
          </Panel>
        ))}
        <div className="gl-conn" style={{ position: "absolute", left: 120 + W0 - 28, top: hiY - 1, width: 120, height: 2, background: accent, transformOrigin: "0 50%" }} />
        <div className="gl-chip" style={{ position: "absolute", left: 120 + W0 + 92, top: hiY - 70, width: 440, padding: 22, boxSizing: "border-box", background: "#FFFFFF", borderRadius: 14, boxShadow: CHIP_SHADOW, border: `1px solid ${LINE}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Pill text="In focus" color={accent} bg={tint(accent, 0.1)} />
            <span style={{ fontSize: 17, color: FAINT, fontWeight: 600 }}>Layer {hi + 1} of {n}</span>
          </div>
          <div style={{ marginTop: 14, fontSize: fitSize(layers[hi]?.label ?? "", 390, 40, 30, { min: 18, maxLines: 1 }), fontWeight: 600, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{layers[hi]?.label}</div>
          {layers[hi]?.hint ? <div style={{ marginTop: 6, fontSize: 19, lineHeight: 1.35, color: MUTED }}>{layers[hi]?.hint}</div> : null}
        </div>
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- metrics */

const Metrics: React.FC<MetricsProps> = (p) => {
  const accent = p.accent ?? ACCENT;
  const ms = p.metrics.slice(0, 4);
  const n = Math.max(1, ms.length);
  const tTitle = beatAt(p.beats, "title", 0.25);
  const tNum = beatAt(p.beats, "numbers", tTitle + 0.55);
  const gap = 28;
  const cardW = n === 1 ? 900 : (1680 - gap * (n - 1)) / n;
  const left = n === 1 ? (1920 - cardW) / 2 : 120;
  const numFs = Math.min(n === 1 ? 170 : 120, ...ms.map((m) => (cardW - 64) / Math.max(1, metricText(m).length * 0.6)));
  const labelFs = Math.min(...ms.map((m) => fitSize(m.label, cardW - 64, 64, 26, { lineH: 1.3, min: 16 })));

  const scope = useGsapTimeline((tl, q) => {
    tl.from(q(".gl-kicker"), { y: 16, autoAlpha: 0, duration: 0.5, ease: "emcee.out" }, Math.max(0, tTitle - 0.15));
    tl.from(q(".gl-head"), { y: 26, autoAlpha: 0, duration: 0.7, ease: "emcee.out" }, tTitle);
    q(".gl-m").forEach((c, i) => {
      const at = tNum + i * 0.12;
      tl.from(c, { y: 50, autoAlpha: 0, duration: 0.7, ease: "emcee.glide" }, at - 0.2);
      const { o, write } = countTo(c.querySelector(".gl-val")!, ms[i]);
      tl.to(o, { v: ms[i].value, duration: 1.4, ease: "power3.out", onUpdate: write }, at);
      tl.from(c.querySelectorAll(".gl-bar"), { scaleY: 0, duration: 0.5, ease: "emcee.out", stagger: 0.03 }, at + 0.1);
    });
    tl.fromTo(q(".gl-cam"), { scale: 1.03 }, { scale: 1, duration: 9, ease: "sine.inOut" }, 0);
  }, [depKey(p)]);

  return (
    <Stage ref={scope} bg={BG} font={fontSans}>
      <Ground />
      <Head kicker={p.kicker} headline={p.headline} accent={accent} />
      <div className="gl-cam" style={{ position: "absolute", inset: 0, transformOrigin: "50% 65%" }}>
        {ms.map((m, i) => {
          const r = seeded(hashStr(m.label) + i);
          const bars = Array.from({ length: 14 }, (_, k) => 0.25 + 0.6 * (k / 13) + r() * 0.2);
          return (
            <Panel key={i} className="gl-m" style={{ position: "absolute", left: left + i * (cardW + gap), top: 380, width: cardW, height: 500, padding: 32, boxSizing: "border-box" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 18, fontWeight: 600, color: FAINT }}>Metric {i + 1}</span>
                <Pill text="This quarter" color={i === 0 ? accent : "#5B6472"} bg={i === 0 ? tint(accent, 0.1) : "#EEF0F4"} />
              </div>
              <div className="gl-val" style={{ marginTop: 26, fontSize: numFs, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1, color: INK, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                {metricText(m)}
              </div>
              <div style={{ marginTop: 14, fontSize: labelFs, lineHeight: 1.3, color: MUTED }}>{m.label}</div>
              <div style={{ position: "absolute", left: 32, right: 32, bottom: 32, height: 110, display: "flex", alignItems: "flex-end", gap: 6, borderTop: `1px dashed ${LINE}` }}>
                {bars.map((b, k) => (
                  <span key={k} className="gl-bar" style={{ flex: 1, height: `${Math.min(1, b) * 100}%`, borderRadius: 4, background: k === bars.length - 1 ? accent : i === 0 ? tint(accent, 0.22) : "#DDE2EA", transformOrigin: "50% 100%" }} />
                ))}
              </div>
            </Panel>
          );
        })}
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- endcard */

const Endcard: React.FC<EndcardProps> = (p) => {
  const accent = p.accent ?? ACCENT;
  const tMark = beatAt(p.beats, "mark", 0.25);
  const tTitle = beatAt(p.beats, "title", tMark + 0.5);
  const fs = fitSize(p.title, 900, 200, 96, { charW: 0.55, lineH: 1.05, min: 40 });

  const scope = useGsapTimeline((tl, q) => {
    tl.from(q(".gl-card"), { y: 70, scale: 0.96, autoAlpha: 0, duration: 0.9, ease: "emcee.glide" }, Math.max(0, tMark - 0.2));
    tl.from(q(".gl-mark"), { scale: 0.6, autoAlpha: 0, duration: 0.6, ease: "emcee.pop" }, tMark);
    tl.from(q(".gl-kicker"), { y: 12, autoAlpha: 0, duration: 0.45, ease: "emcee.out" }, tTitle - 0.15);
    tl.from(q(".gl-head"), { y: 22, autoAlpha: 0, duration: 0.6, ease: "emcee.out" }, tTitle);
    tl.from(q(".gl-sub"), { y: 16, autoAlpha: 0, duration: 0.5, ease: "emcee.out" }, tTitle + 0.2);
    tl.from(q(".gl-btn"), { y: 12, autoAlpha: 0, duration: 0.45, ease: "emcee.out", stagger: 0.08 }, tTitle + 0.35);
    tl.from(q(".gl-chip"), { y: 20, autoAlpha: 0, scale: 0.9, duration: 0.5, ease: "emcee.pop", stagger: 0.12 }, tTitle + 0.5);
    tl.fromTo(q(".gl-cam"), { scale: 1.05 }, { scale: 1, duration: 8, ease: "sine.inOut" }, 0);
    tl.to(q(".gl-chip"), { y: -8, duration: 3, ease: "sine.inOut", yoyo: true, repeat: 3, stagger: 0.6 }, 3);
  }, [depKey(p)]);

  return (
    <Stage ref={scope} bg={BG} font={fontSans}>
      <Ground />
      <div className="gl-cam" style={{ position: "absolute", inset: 0 }}>
        <Panel className="gl-card" style={{ position: "absolute", left: 460, top: 230, width: 1000, height: 620, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 50px", boxSizing: "border-box" }}>
          <div className="gl-mark" style={{ marginBottom: 34 }}>
            {isFile(p.mark) ? (
              <Img src={staticFile(p.mark!)} style={{ width: 112, height: 112, objectFit: "contain" }} />
            ) : (
              <div style={{ width: 112, height: 112, borderRadius: 28, background: accent, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 16px 40px ${tint(accent, 0.35)}` }}>
                <GlyphSvg name={p.mark} size={64} stroke="#FFFFFF" accent="#FFFFFF" />
              </div>
            )}
          </div>
          {p.kicker ? <Kicker text={p.kicker} accent={accent} /> : null}
          <div className="gl-head" style={{ marginTop: 22, fontSize: fs, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.05, color: INK }}>{p.title}</div>
          {p.tagline ? (
            <div className="gl-sub" style={{ marginTop: 18, fontSize: fitSize(p.tagline, 860, 80, 30, { lineH: 1.35, min: 18 }), lineHeight: 1.35, color: MUTED }}>{p.tagline}</div>
          ) : null}
          <div style={{ marginTop: 36, display: "flex", gap: 14 }}>
            <div className="gl-btn" style={{ padding: "16px 28px", borderRadius: 10, background: INK, color: "#FFFFFF", fontSize: 21, fontWeight: 600 }}>Get started</div>
            <div className="gl-btn" style={{ padding: "16px 28px", borderRadius: 10, background: "#FFFFFF", border: `1px solid ${LINE}`, color: INK, fontSize: 21, fontWeight: 600 }}>Book a demo</div>
          </div>
        </Panel>
        <div className="gl-chip" style={{ position: "absolute", left: 300, top: 300, display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", background: "#FFFFFF", borderRadius: 12, boxShadow: CHIP_SHADOW, border: `1px solid ${LINE}`, fontSize: 19, fontWeight: 600, color: INK }}>
          <GlyphSvg name="approve" size={26} stroke={INK} accent={accent} /> Approved
        </div>
        <div className="gl-chip" style={{ position: "absolute", left: 1400, top: 740, display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", background: "#FFFFFF", borderRadius: 12, boxShadow: CHIP_SHADOW, border: `1px solid ${LINE}`, fontSize: 19, fontWeight: 600, color: INK }}>
          <GlyphSvg name="share" size={26} stroke={INK} accent={accent} /> Ready to share
        </div>
      </div>
    </Stage>
  );
};

export const style: StyleDef = {
  id: "glass",
  label: "Product UI · Glass",
  description: "Clean mock product screens with floating callouts; the camera glides between panels.",
  bestFor: "SaaS features",
  tone: "light",
  swatch: ["#EEF1F6", "#16181D", "#C9480A"],
  templates: { hero: Hero, pipeline: Pipeline, stack: Stack, metrics: Metrics, endcard: Endcard },
};
