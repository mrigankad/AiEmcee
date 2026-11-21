/**
 * Hand-drawn line. Warm paper, one navy ink, one blue. Everything is a stroke
 * that draws itself on, like a whiteboard: boxes, arrows, circled notes and
 * underlines, each with a deterministic hand wobble.
 */
import React from "react";
import { Img, staticFile } from "remotion";
import { fontSans } from "../../../fonts";
import { beatAt, useGsapTimeline } from "../../../motion/gsap";
import type { EndcardProps, HeroProps, MetricsProps, PipelineProps, StackProps, StyleDef } from "../../types";
import { GlyphSvg, Stage, countTo, depKey, fitSize, hashStr, isFile, metricText } from "../swiss/lib";
import { RoughDefs, arrow, box, line, loop, underline } from "./ink";

const PAPER = "#FFFDF7";
const INK = "#1F2A44";
const BLUE = "#2F7DF6";
const MUTED = "rgba(31,42,68,0.6)";
const SW = 3.2; // ink stroke width at 1920x1080

const stroke = (color: string, w = SW): React.SVGProps<SVGPathElement> => ({
  fill: "none",
  stroke: color,
  strokeWidth: w,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

/** Paper: warm ground and a faint dot grid. */
function Paper() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: "radial-gradient(rgba(31,42,68,0.09) 1.3px, transparent 1.3px)",
        backgroundSize: "40px 40px",
        backgroundPosition: "20px 20px",
      }}
    />
  );
}

/** The full-frame stroke layer. */
const Ink: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <svg width={1920} height={1080} viewBox="0 0 1920 1080" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
    <RoughDefs />
    <g filter="url(#hd-rough)">{children}</g>
  </svg>
);

/** Draw a set of strokes on, in DOM order. */
function drawOn(tl: gsap.core.Timeline, els: Element[], at: number, dur = 0.6, stagger = 0.12) {
  if (!els.length) return;
  // Round caps would show a dot before a stroke starts: keep it hidden until then.
  tl.from(els, { autoAlpha: 0, duration: 0.01, stagger }, at);
  tl.from(els, { drawSVG: "0%", duration: dur, ease: "power2.inOut", stagger }, at);
}

/** Draws a glyph's strokes on and pops its filled dots in. */
function drawGlyph(tl: gsap.core.Timeline, root: Element | undefined, at: number, dur = 0.8) {
  if (!root) return;
  const lines = Array.from(root.querySelectorAll(".hd-g")).filter((e) => e.getAttribute("fill") === "none");
  const dots = Array.from(root.querySelectorAll(".hd-g")).filter((e) => e.getAttribute("fill") !== "none");
  if (lines.length) tl.from(lines, { autoAlpha: 0, duration: 0.01, stagger: 0.1 }, at);
  if (lines.length) tl.from(lines, { drawSVG: "0%", duration: dur, ease: "power2.inOut", stagger: 0.1 }, at);
  if (dots.length) tl.from(dots, { autoAlpha: 0, duration: 0.2 }, at + dur * 0.8);
}

function Kicker({ text, accent }: { text?: string; accent: string }) {
  if (!text) return null;
  return (
    <div className="hd-kicker" style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, fontWeight: 600, color: accent, letterSpacing: "0.01em" }}>
      <svg width={34} height={14} viewBox="0 0 34 14" style={{ overflow: "visible" }}>
        <path className="hd-k" d={line([2, 7], [32, 6], 11, 1.5)} {...stroke(accent, 3)} />
      </svg>
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 1200 }}>{text}</span>
    </div>
  );
}

function Title({ kicker, headline, accent, seed }: { kicker?: string; headline?: string; accent: string; seed: number }) {
  if (!kicker && !headline) return null;
  const fs = headline ? fitSize(headline, 1680, 170, 84, { charW: 0.56, lineH: 1.08, min: 36 }) : 0;
  const ulW = headline ? Math.min(1500, Math.max(200, headline.length * fs * 0.5 * 0.6)) : 0;
  return (
    <div style={{ position: "absolute", left: 120, top: 90, width: 1680 }}>
      <Kicker text={kicker} accent={accent} />
      {headline ? (
        <>
          <div className="hd-head" style={{ marginTop: 18, fontSize: fs, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.08, color: INK }}>
            {headline}
          </div>
          <svg width={ulW + 20} height={24} style={{ display: "block", overflow: "visible", marginTop: 6 }}>
            <path className="hd-ul" d={underline(4, 12, ulW, seed)} {...stroke(accent, 4.5)} />
          </svg>
        </>
      ) : null}
    </div>
  );
}

function titleIn(tl: gsap.core.Timeline, q: (s: string) => Element[], t: number) {
  drawOn(tl, q(".hd-k"), Math.max(0, t - 0.2), 0.35);
  tl.from(q(".hd-kicker span"), { autoAlpha: 0, x: -10, duration: 0.4, ease: "emcee.out" }, Math.max(0, t - 0.1));
  tl.from(q(".hd-head"), { autoAlpha: 0, y: 18, duration: 0.6, ease: "emcee.out" }, t);
  drawOn(tl, q(".hd-ul"), t + 0.45, 0.7);
}

/* ---------------------------------------------------------------- hero */

const Hero: React.FC<HeroProps> = (p) => {
  const accent = p.accent ?? BLUE;
  const seed = hashStr(p.headline);
  const tTitle = beatAt(p.beats, "title", 0.3);
  const tObj = beatAt(p.beats, "object", tTitle + 0.7);
  const fs = fitSize(p.headline, 900, 430, 112, { charW: 0.56, lineH: 1.04, min: 44 });
  const lines = Math.max(1, Math.round(430 / (fs * 1.04)));
  const ulW = Math.min(760, Math.max(240, (p.headline.length / Math.max(1, Math.min(lines, 4))) * fs * 0.5));
  const cx = 1440;
  const cy = 520;
  const ar = arrow([1060, 760], [1250, 650], seed + 9, -0.25);

  const scope = useGsapTimeline((tl, q) => {
    drawOn(tl, q(".hd-k"), Math.max(0, tTitle - 0.2), 0.35);
    tl.from(q(".hd-kicker span"), { autoAlpha: 0, x: -10, duration: 0.4, ease: "emcee.out" }, Math.max(0, tTitle - 0.1));
    tl.from(q(".hd-head"), { autoAlpha: 0, y: 24, duration: 0.7, ease: "emcee.out" }, tTitle);
    drawOn(tl, q(".hd-ul"), tTitle + 0.5, 0.7);
    tl.from(q(".hd-sub"), { autoAlpha: 0, y: 14, duration: 0.5, ease: "emcee.out" }, tTitle + 0.6);
    drawOn(tl, q(".hd-loop"), tObj, 0.9);
    drawGlyph(tl, q(".hd-obj")[0], tObj + 0.25, 0.9);
    drawOn(tl, q(".hd-arrow"), tObj + 0.9, 0.45, 0.25);
    tl.from(q(".hd-note"), { autoAlpha: 0, duration: 0.4 }, tObj + 1.1);
    tl.to(q(".hd-obj"), { rotation: 2, y: -6, duration: 5, ease: "sine.inOut", yoyo: true, repeat: 3, transformOrigin: "50% 50%" }, 3);
  }, [depKey(p)]);

  return (
    <Stage ref={scope} bg={PAPER} font={fontSans}>
      <Paper />
      <div style={{ position: "absolute", left: 120, top: 0, bottom: 0, width: 920, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <Kicker text={p.kicker} accent={accent} />
        <div className="hd-head" style={{ marginTop: 22, fontSize: fs, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1.04, color: INK }}>
          {p.headline}
        </div>
        <svg width={ulW + 20} height={26} style={{ display: "block", overflow: "visible", marginTop: 10 }}>
          <path className="hd-ul" d={underline(4, 12, ulW, seed)} {...stroke(accent, 5)} />
        </svg>
        {p.sub ? (
          <div className="hd-sub" style={{ marginTop: 26, fontSize: fitSize(p.sub, 820, 130, 32, { lineH: 1.4, min: 18 }), lineHeight: 1.4, color: MUTED, maxWidth: 820 }}>
            {p.sub}
          </div>
        ) : null}
      </div>
      <Ink>
        <path className="hd-loop" d={loop(cx, cy, 270, 250, seed + 3)} {...stroke(accent, 4)} />
        <path className="hd-arrow" d={ar.shaft} {...stroke(INK)} />
        <path className="hd-arrow" d={ar.head} {...stroke(INK)} />
      </Ink>
      <div className="hd-obj" style={{ position: "absolute", left: cx - 170, top: cy - 170 }}>
        <GlyphSvg name={p.glyph} size={340} stroke={INK} accent={accent} strokeWidth={0.75} className="hd-g" filter="url(#hd-rough)" />
      </div>
      <div className="hd-note" style={{ position: "absolute", left: 1120, top: 800, fontSize: 26, fontWeight: 600, color: INK, transform: "rotate(-4deg)" }}>
        {(p.glyph ?? "").replace(/^./, (c) => c.toUpperCase())}
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- pipeline */

const Pipeline: React.FC<PipelineProps> = (p) => {
  const accent = p.accent ?? BLUE;
  const steps = p.steps.slice(0, 6);
  const n = Math.max(1, steps.length);
  const seed = hashStr(steps.map((s) => s.label).join("|"));
  const tTitle = beatAt(p.beats, "title", 0.25);
  const tSteps = beatAt(p.beats, "steps", tTitle + 0.5);
  const stepGap = n > 4 ? 0.16 : 0.25;
  const tTravel = beatAt(p.beats, "travel", tSteps + n * stepGap + 0.2);
  const gapA = n > 4 ? 70 : 110; // room for the arrow
  const bw = Math.min(260, (1680 - gapA * (n - 1)) / n);
  const total = bw * n + gapA * (n - 1);
  const x0 = (1920 - total) / 2;
  const by = 470;
  const bh = Math.min(bw, 230);
  const labelFs = Math.min(...steps.map((s) => fitSize(s.label, bw + gapA * 0.7, 80, 38, { lineH: 1.1, min: 20 })));
  const hintFs = Math.min(...steps.map((s) => fitSize(s.hint ?? "", bw + gapA * 0.7, 70, 24, { lineH: 1.3, min: 15 })));
  const hop = Math.min(0.45, 1.5 / Math.max(1, n - 1));
  const bx = (i: number) => x0 + i * (bw + gapA);

  const scope = useGsapTimeline((tl, q) => {
    titleIn(tl, q, tTitle);
    const boxes = q(".hd-box");
    const arrows = q(".hd-step-arrow");
    const glyphs = q(".hd-sg");
    const texts = q(".hd-st");
    for (let i = 0; i < n; i++) {
      const at = tSteps + i * stepGap;
      drawOn(tl, [boxes[i]], at, 0.55);
      drawGlyph(tl, glyphs[i], at + 0.25, 0.5);
      tl.from(texts[i], { autoAlpha: 0, y: 10, duration: 0.4, ease: "emcee.out" }, at + 0.3);
      if (i < n - 1) drawOn(tl, [arrows[2 * i], arrows[2 * i + 1]], at + 0.35, 0.3, 0.2);
    }
    const dot = q(".hd-dot")[0];
    tl.from(dot, { scale: 0, transformOrigin: "50% 50%", duration: 0.35, ease: "emcee.pop" }, tTravel);
    const ticks = q(".hd-tick");
    for (let i = 1; i < n; i++) {
      const at = tTravel + 0.3 + (i - 1) * hop;
      tl.to(dot, { x: bx(i) - bx(0), duration: hop * 0.85, ease: "power2.inOut" }, at);
      drawOn(tl, [ticks[i - 1]], at + hop * 0.4, 0.25);
    }
    drawOn(tl, [ticks[n - 1]], tTravel + 0.3 + (n - 1) * hop, 0.25);
  }, [depKey(p)]);

  return (
    <Stage ref={scope} bg={PAPER} font={fontSans}>
      <Paper />
      <Title kicker={p.kicker} headline={p.headline} accent={accent} seed={seed + 1} />
      <Ink>
        {steps.map((_, i) => (
          <path key={i} className="hd-box" d={box(bx(i), by, bw, bh, seed + i * 31)} {...stroke(INK)} />
        ))}
        {steps.slice(0, -1).map((_, i) => {
          const a = arrow([bx(i) + bw + 14, by + bh / 2], [bx(i + 1) - 14, by + bh / 2], seed + i * 7, 0.08);
          return (
            <React.Fragment key={i}>
              <path className="hd-step-arrow" d={a.shaft} {...stroke(INK, 2.8)} />
              <path className="hd-step-arrow" d={a.head} {...stroke(INK, 2.8)} />
            </React.Fragment>
          );
        })}
        {steps.map((_, i) => (
          <path key={i} className="hd-tick" d={`M${bx(i) + bw - 34} ${by - 18} l10 11 l22 -26`} {...stroke(accent, 4.5)} />
        ))}
        <circle className="hd-dot" cx={bx(0) + bw / 2} cy={by - 26} r={12} fill={accent} />
      </Ink>
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div className="hd-sg" style={{ position: "absolute", left: bx(i) + bw / 2 - bh * 0.27, top: by + bh / 2 - bh * 0.27 }}>
            <GlyphSvg name={s.glyph} size={bh * 0.54} stroke={INK} accent={accent} strokeWidth={1.4} className="hd-g" filter="url(#hd-rough)" />
          </div>
          <div className="hd-st" style={{ position: "absolute", left: bx(i) - gapA * 0.35, width: bw + gapA * 0.7, top: by + bh + 34, textAlign: "center" }}>
            <div style={{ fontSize: labelFs, fontWeight: 600, color: INK, lineHeight: 1.1 }}>{s.label}</div>
            {s.hint ? <div style={{ marginTop: 10, fontSize: hintFs, color: MUTED, lineHeight: 1.3 }}>{s.hint}</div> : null}
          </div>
        </React.Fragment>
      ))}
    </Stage>
  );
};

/* ---------------------------------------------------------------- stack */

const Stack: React.FC<StackProps> = (p) => {
  const accent = p.accent ?? BLUE;
  const layers = p.layers.slice(0, 5);
  const n = Math.max(1, layers.length);
  const hi = Math.min(Math.max(0, p.highlight ?? 0), n - 1);
  const seed = hashStr(layers.map((l) => l.label).join("|"));
  const tTitle = beatAt(p.beats, "title", 0.25);
  const tLayers = beatAt(p.beats, "layers", tTitle + 0.5);
  const tHi = beatAt(p.beats, "highlight", tLayers + n * 0.22 + 0.4);
  const top = 360;
  const areaH = 640;
  const gap = 26;
  const rowH = Math.min(140, (areaH - gap * (n - 1)) / n);
  const total = rowH * n + gap * (n - 1);
  const y0 = top + (areaH - total) / 2;
  const X = 220;
  const BW = 980;
  const labelFs = Math.min(...layers.map((l) => fitSize(l.label, 560, rowH * 0.5, 44, { lineH: 1.1, min: 20, maxLines: 1 })));
  const hiY = y0 + hi * (rowH + gap);
  const note = arrow([X + BW + 260, hiY - 30], [X + BW + 40, hiY + rowH / 2 - 6], seed + 5, 0.3);

  const scope = useGsapTimeline((tl, q) => {
    titleIn(tl, q, tTitle);
    const boxes = q(".hd-box");
    const texts = q(".hd-lt");
    const gl = q(".hd-lg");
    for (let i = 0; i < n; i++) {
      const at = tLayers + i * 0.22;
      drawOn(tl, [boxes[i]], at, 0.55);
      drawGlyph(tl, gl[i], at + 0.2, 0.45);
      tl.from(texts[i], { autoAlpha: 0, x: -12, duration: 0.4, ease: "emcee.out" }, at + 0.25);
    }
    drawOn(tl, q(".hd-hl"), tHi, 0.6);
    drawOn(tl, q(".hd-loop"), tHi + 0.2, 0.8);
    drawOn(tl, q(".hd-note-arrow"), tHi + 0.7, 0.4, 0.2);
    tl.from(q(".hd-note"), { autoAlpha: 0, duration: 0.4 }, tHi + 0.9);
  }, [depKey(p)]);

  return (
    <Stage ref={scope} bg={PAPER} font={fontSans}>
      <Paper />
      <Title kicker={p.kicker} headline={p.headline} accent={accent} seed={seed + 1} />
      <Ink>
        <path className="hd-hl" d={line([X + rowH + 10, hiY + rowH / 2 + 4], [X + rowH + 30 + Math.min(560, layers[hi].label.length * labelFs * 0.55), hiY + rowH / 2 + 2], seed + 8, 3)} fill="none" stroke={accent} strokeOpacity={0.22} strokeWidth={labelFs * 0.9} strokeLinecap="round" />
        {layers.map((_, i) => (
          <path key={i} className="hd-box" d={box(X, y0 + i * (rowH + gap), BW, rowH, seed + i * 17)} {...stroke(INK)} />
        ))}
        <path className="hd-loop" d={loop(X + BW / 2, hiY + rowH / 2, BW / 2 + 50, rowH / 2 + 34, seed + 2, 1.08)} {...stroke(accent, 4)} />
        <path className="hd-note-arrow" d={note.shaft} {...stroke(accent, 3.4)} />
        <path className="hd-note-arrow" d={note.head} {...stroke(accent, 3.4)} />
      </Ink>
      {layers.map((l, i) => {
        const y = y0 + i * (rowH + gap);
        const g = Math.min(64, rowH * 0.5);
        return (
          <React.Fragment key={i}>
            <div className="hd-lg" style={{ position: "absolute", left: X + (rowH - g) / 2 + 8, top: y + (rowH - g) / 2 }}>
              <GlyphSvg name={l.glyph} size={g} stroke={INK} accent={accent} strokeWidth={1.5} className="hd-g" filter="url(#hd-rough)" />
            </div>
            <div className="hd-lt" style={{ position: "absolute", left: X + rowH + 20, width: BW - rowH - 50, top: y, height: rowH, display: "flex", alignItems: "center", gap: 24 }}>
              <span style={{ fontSize: labelFs, fontWeight: 600, color: INK, whiteSpace: "nowrap", flex: "none", maxWidth: 560, overflow: "hidden", textOverflow: "ellipsis" }}>{l.label}</span>
              {l.hint ? (
                <span style={{ marginLeft: "auto", fontSize: Math.min(24, rowH * 0.22), color: MUTED, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{l.hint}</span>
              ) : null}
            </div>
          </React.Fragment>
        );
      })}
      <div className="hd-note" style={{ position: "absolute", left: X + BW + 150, top: hiY - 160, width: 380, fontSize: 30, fontWeight: 600, color: accent, transform: "rotate(-3deg)", lineHeight: 1.2 }}>
        {layers[hi].hint ? `${layers[hi].label}: ${layers[hi].hint.toLowerCase()}` : layers[hi].label}
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- metrics */

const Metrics: React.FC<MetricsProps> = (p) => {
  const accent = p.accent ?? BLUE;
  const ms = p.metrics.slice(0, 4);
  const n = Math.max(1, ms.length);
  const seed = hashStr(ms.map((m) => m.label).join("|"));
  const tTitle = beatAt(p.beats, "title", 0.25);
  const tNum = beatAt(p.beats, "numbers", tTitle + 0.6);
  const gap = 60;
  const colW = (1680 - gap * (n - 1)) / n;
  const numFs = Math.min(n === 1 ? 300 : 190, ...ms.map((m) => colW / Math.max(1, metricText(m).length * 0.6)));
  const labelFs = Math.min(...ms.map((m) => fitSize(m.label, colW - 20, 90, 34, { lineH: 1.3, min: 18 })));
  const ny = 470;

  const scope = useGsapTimeline((tl, q) => {
    titleIn(tl, q, tTitle);
    q(".hd-m").forEach((c, i) => {
      const at = tNum + i * 0.2;
      tl.from(c, { autoAlpha: 0, y: 20, duration: 0.5, ease: "emcee.out" }, at);
      const { o, write } = countTo(c.querySelector(".hd-val")!, ms[i]);
      tl.to(o, { v: ms[i].value, duration: 1.3, ease: "power3.out", onUpdate: write }, at);
    });
    drawOn(tl, q(".hd-mu"), tNum + 0.5, 0.6, 0.2);
    drawOn(tl, q(".hd-mloop"), tNum + 1.1, 0.8);
  }, [depKey(p)]);

  return (
    <Stage ref={scope} bg={PAPER} font={fontSans}>
      <Paper />
      <Title kicker={p.kicker} headline={p.headline} accent={accent} seed={seed + 1} />
      {ms.map((m, i) => (
        <div key={i} className="hd-m" style={{ position: "absolute", left: 120 + i * (colW + gap), top: ny, width: colW, textAlign: n === 1 ? "center" : "left" }}>
          <div className="hd-val" style={{ fontSize: numFs, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1, color: INK, whiteSpace: "nowrap" }}>
            {metricText(m)}
          </div>
          <div style={{ marginTop: 56, fontSize: labelFs, lineHeight: 1.3, color: MUTED }}>{m.label}</div>
        </div>
      ))}
      <Ink>
        {ms.map((m, i) => {
          const w = Math.min(colW, metricText(m).length * numFs * 0.58);
          const x = 120 + i * (colW + gap) + (n === 1 ? (colW - w) / 2 : 0);
          if (i === 0) return null; // the first number is circled instead
          return <path key={i} className="hd-mu" d={underline(x, ny + numFs * 1.05 + 10, w, seed + i * 5)} {...stroke(i === 0 ? accent : INK, i === 0 ? 5 : 3.2)} />;
        })}
        {(() => {
          const w = Math.min(colW, metricText(ms[0]).length * numFs * 0.58);
          const x = 120 + (n === 1 ? (colW - w) / 2 : 0);
          return <path className="hd-mloop" d={loop(x + w / 2, ny + numFs * 0.52, w / 2 + 50, numFs * 0.62, seed + 3)} {...stroke(accent, 4)} />;
        })()}
      </Ink>
    </Stage>
  );
};

/* ---------------------------------------------------------------- endcard */

const Endcard: React.FC<EndcardProps> = (p) => {
  const accent = p.accent ?? BLUE;
  const seed = hashStr(p.title);
  const tMark = beatAt(p.beats, "mark", 0.2);
  const tTitle = beatAt(p.beats, "title", tMark + 0.7);
  const fs = fitSize(p.title, 1400, 260, 140, { charW: 0.56, lineH: 1.02, min: 50 });
  const ulW = Math.min(1300, p.title.length * fs * 0.5);

  const scope = useGsapTimeline((tl, q) => {
    drawOn(tl, q(".hd-loop"), tMark, 0.9);
    drawGlyph(tl, q(".hd-mark")[0], tMark + 0.2, 0.8);
    tl.from(q(".hd-mark img"), { autoAlpha: 0, duration: 0.5 }, tMark + 0.3);
    tl.from(q(".hd-kicker"), { autoAlpha: 0, y: 10, duration: 0.4, ease: "emcee.out" }, tTitle - 0.2);
    tl.from(q(".hd-head"), { autoAlpha: 0, y: 20, duration: 0.6, ease: "emcee.out" }, tTitle);
    drawOn(tl, q(".hd-ul"), tTitle + 0.4, 0.7);
    tl.from(q(".hd-sub"), { autoAlpha: 0, y: 12, duration: 0.5, ease: "emcee.out" }, tTitle + 0.6);
    tl.to(q(".hd-mark"), { rotation: -3, duration: 5, ease: "sine.inOut", yoyo: true, repeat: 3, transformOrigin: "50% 50%" }, 3);
  }, [depKey(p)]);

  return (
    <Stage ref={scope} bg={PAPER} font={fontSans}>
      <Paper />
      <Ink>
        <path className="hd-loop" d={loop(960, 340, 130, 120, seed)} {...stroke(accent, 4)} />
      </Ink>
      <div className="hd-mark" style={{ position: "absolute", left: 960 - 85, top: 340 - 85, width: 170, height: 170 }}>
        {isFile(p.mark) ? (
          <Img src={staticFile(p.mark!)} style={{ width: 170, height: 170, objectFit: "contain" }} />
        ) : (
          <GlyphSvg name={p.mark} size={170} stroke={INK} accent={accent} strokeWidth={1.1} className="hd-g" filter="url(#hd-rough)" />
        )}
      </div>
      <div style={{ position: "absolute", left: 160, right: 160, top: 540, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        {p.kicker ? (
          <div className="hd-kicker" style={{ fontSize: 28, fontWeight: 600, color: accent }}>
            {p.kicker}
          </div>
        ) : null}
        <div className="hd-head" style={{ marginTop: 16, fontSize: fs, fontWeight: 600, letterSpacing: "-0.035em", lineHeight: 1.02, color: INK }}>
          {p.title}
        </div>
        <svg width={ulW + 20} height={26} style={{ display: "block", overflow: "visible", marginTop: 8 }}>
          <path className="hd-ul" d={underline(10, 12, ulW, seed + 4)} {...stroke(accent, 5)} />
        </svg>
        {p.tagline ? (
          <div className="hd-sub" style={{ marginTop: 22, fontSize: fitSize(p.tagline, 1400, 90, 36, { lineH: 1.35, min: 20 }), lineHeight: 1.35, color: MUTED }}>
            {p.tagline}
          </div>
        ) : null}
      </div>
    </Stage>
  );
};

export const style: StyleDef = {
  id: "hand-drawn",
  label: "Hand-drawn line",
  description: "Ink strokes draw on as the voice explains, like a whiteboard.",
  bestFor: "explainers, onboarding",
  tone: "light",
  swatch: ["#FFFDF7", "#1F2A44", "#2F7DF6"],
  templates: { hero: Hero, pipeline: Pipeline, stack: Stack, metrics: Metrics, endcard: Endcard },
};
