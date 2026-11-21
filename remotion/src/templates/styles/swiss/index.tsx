/**
 * Swiss kinetic type. White ground, one ink, one red. Huge tight grotesk words
 * land word by word on a strict 12-column grid; numbers are set as giant
 * type; things cut and slide, nothing is decorated.
 */
import React from "react";
import { SplitText } from "gsap/SplitText";
import { fontSans } from "../../../fonts";
import { beatAt, useGsapTimeline } from "../../../motion/gsap";
import type { EndcardProps, HeroProps, MetricsProps, PipelineProps, StackProps, StyleDef } from "../../types";
import { GlyphSvg, Stage, countTo, depKey, fitSize, isFile, metricText } from "./lib";
import { Img, staticFile } from "remotion";

const BG = "#FFFFFF";
const INK = "#16181D";
const RED = "#E5231B";
const MUTED = "rgba(22,24,29,0.56)";
const RULE = "rgba(22,24,29,0.14)";
const M = 120; // outer margin
const COL = (1920 - 2 * M) / 12; // 140

const CUT = "power4.out";
const CHAR = 0.54; // Geist 600 at -0.045em tracking, average advance

function Kicker({ text, accent, cls = "sw-kicker" }: { text?: string; accent: string; cls?: string }) {
  if (!text) return null;
  return (
    <div className={cls} style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 28, fontWeight: 600, color: INK, letterSpacing: "-0.01em" }}>
      <span style={{ width: 18, height: 18, background: accent, display: "inline-block" }} />
      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 1200 }}>{text}</span>
    </div>
  );
}

/** Splits `.sw-words` into masked words and slides each up into place. */
function landWords(tl: gsap.core.Timeline, q: (s: string) => Element[], sel: string, at: number, stagger = 0.07) {
  const els = q(sel);
  if (!els.length) return;
  const split = SplitText.create(els, { type: "words", mask: "words" });
  tl.from(split.words, { yPercent: 105, duration: 0.55, ease: CUT, stagger }, at);
}

function TopRule({ cls = "sw-rule" }: { cls?: string }) {
  return <div className={cls} style={{ position: "absolute", left: M, right: M, top: 96, height: 2, background: INK, transformOrigin: "0 50%" }} />;
}

/* ---------------------------------------------------------------- hero */

const Hero: React.FC<HeroProps> = (p) => {
  const accent = p.accent ?? RED;
  const tTitle = beatAt(p.beats, "title", 0.3);
  const tObj = beatAt(p.beats, "object", tTitle + 0.9);
  const words = p.headline.trim().split(/\s+/);
  const last = words.pop() ?? "";
  const boxW = COL * 8;
  const fs = fitSize(p.headline, boxW, 560, 190, { charW: CHAR, lineH: 0.94, min: 48 });

  const scope = useGsapTimeline((tl, q) => {
    tl.from(q(".sw-rule"), { scaleX: 0, duration: 0.6, ease: "emcee.inOut" }, Math.max(0, tTitle - 0.25));
    tl.from(q(".sw-kicker"), { x: -40, autoAlpha: 0, duration: 0.4, ease: CUT }, tTitle - 0.1);
    landWords(tl, q, ".sw-words", tTitle);
    tl.from(q(".sw-sub"), { y: 24, autoAlpha: 0, duration: 0.5, ease: CUT }, tTitle + 0.2 + words.length * 0.07);
    tl.from(q(".sw-block"), { xPercent: 110, duration: 0.6, ease: "expo.out" }, tObj);
    tl.from(q(".sw-glyph"), { scale: 0.6, autoAlpha: 0, duration: 0.45, ease: "emcee.pop" }, tObj + 0.25);
    tl.from(q(".sw-idx"), { autoAlpha: 0, duration: 0.3 }, tObj + 0.4);
    // ambient: the block drifts a hair
    tl.to(q(".sw-blockwrap"), { y: -10, duration: 6, ease: "sine.inOut", yoyo: true, repeat: 3 }, 3);
  }, [depKey(p)]);

  return (
    <Stage ref={scope} bg={BG} font={fontSans}>
      <TopRule />
      <div style={{ position: "absolute", left: M, top: 128 }}>
        <Kicker text={p.kicker} accent={accent} />
      </div>
      <div style={{ position: "absolute", left: M, top: 230, width: boxW, height: 640, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div
          className="sw-words"
          style={{ fontSize: fs, fontWeight: 600, letterSpacing: "-0.045em", lineHeight: 0.94, color: INK }}
        >
          {words.length ? words.join(" ") + " " : ""}
          <span style={{ color: accent }}>{last}</span>
        </div>
      </div>
      {p.sub ? (
        <div
          className="sw-sub"
          style={{ position: "absolute", left: M, top: 900, width: COL * 7, fontSize: fitSize(p.sub, COL * 7, 100, 34, { min: 20, lineH: 1.3 }), lineHeight: 1.3, color: MUTED, fontWeight: 400 }}
        >
          {p.sub}
        </div>
      ) : null}
      <div className="sw-blockwrap" style={{ position: "absolute", left: M + COL * 9, top: 230, width: COL * 3, height: COL * 3 + 220, overflow: "hidden" }}>
        <div className="sw-block" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, background: accent }}>
          <div className="sw-glyph" style={{ position: "absolute", left: 40, bottom: 40 }}>
            <GlyphSvg name={p.glyph} size={220} stroke="#FFFFFF" accent={INK} strokeWidth={1.5} />
          </div>
          <div className="sw-idx" style={{ position: "absolute", left: 40, top: 32, color: "#FFFFFF", fontSize: 26, fontWeight: 600 }}>
            {(p.glyph ?? "").toUpperCase().slice(0, 16)}
          </div>
        </div>
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- pipeline */

const Pipeline: React.FC<PipelineProps> = (p) => {
  const accent = p.accent ?? RED;
  const steps = p.steps.slice(0, 6);
  const n = Math.max(1, steps.length);
  const tTitle = beatAt(p.beats, "title", 0.25);
  const tSteps = beatAt(p.beats, "steps", tTitle + 0.6);
  const tTravel = beatAt(p.beats, "travel", tSteps + 0.25 + n * 0.12);
  const gap = 32;
  const colW = (1920 - 2 * M - gap * (n - 1)) / n;
  const numFs = Math.min(220, colW * 0.62);
  const labelFs = Math.min(...steps.map((s) => fitSize(s.label, colW, 130, 64, { charW: CHAR, lineH: 1, min: 24 })));
  const hintFs = Math.min(...steps.map((s) => fitSize(s.hint ?? "", colW - 8, 80, 28, { lineH: 1.3, min: 16 })));
  const headFs = p.headline ? fitSize(p.headline, 1680, 200, 110, { charW: CHAR, lineH: 0.95, min: 40 }) : 0;
  const hop = Math.min(0.42, 1.6 / Math.max(1, n - 1));

  const scope = useGsapTimeline((tl, q) => {
    tl.from(q(".sw-rule"), { scaleX: 0, duration: 0.6, ease: "emcee.inOut" }, Math.max(0, tTitle - 0.2));
    tl.from(q(".sw-kicker"), { x: -40, autoAlpha: 0, duration: 0.4, ease: CUT }, tTitle - 0.1);
    landWords(tl, q, ".sw-words", tTitle);
    const cols = q(".sw-col");
    cols.forEach((c, i) => {
      const at = tSteps + i * 0.12;
      tl.from(c.querySelector(".sw-num"), { yPercent: 100, duration: 0.55, ease: CUT }, at);
      tl.from(c.querySelector(".sw-line"), { scaleX: 0, duration: 0.45, ease: CUT }, at);
      tl.from(c.querySelectorAll(".sw-txt"), { y: 30, autoAlpha: 0, duration: 0.45, ease: CUT, stagger: 0.05 }, at + 0.1);
    });
    const marker = q(".sw-marker")[0];
    tl.from(marker, { scaleX: 0, duration: 0.3, ease: CUT }, tTravel);
    const nums = q(".sw-numin");
    tl.to(nums[0], { color: accent, duration: 0.12 }, tTravel);
    for (let i = 1; i < n; i++) {
      const at = tTravel + 0.3 + (i - 1) * hop;
      tl.to(marker, { x: i * (colW + gap), duration: hop * 0.8, ease: "power3.inOut" }, at);
      tl.to(nums[i - 1], { color: INK, duration: 0.12 }, at + hop * 0.5);
      tl.to(nums[i], { color: accent, duration: 0.12 }, at + hop * 0.5);
    }
  }, [depKey(p)]);

  return (
    <Stage ref={scope} bg={BG} font={fontSans}>
      <TopRule />
      <div style={{ position: "absolute", left: M, top: 128 }}>
        <Kicker text={p.kicker} accent={accent} />
      </div>
      {p.headline ? (
        <div className="sw-words" style={{ position: "absolute", left: M, top: 200, width: 1680, fontSize: headFs, fontWeight: 600, letterSpacing: "-0.045em", lineHeight: 0.95, color: INK }}>
          {p.headline}
        </div>
      ) : null}
      <div style={{ position: "absolute", left: M, right: M, top: 540, height: 460, display: "flex", gap }}>
        {steps.map((s, i) => (
          <div key={i} className="sw-col" style={{ width: colW, flex: "none", position: "relative" }}>
            <div className="sw-line" style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: INK, transformOrigin: "0 50%" }} />
            <div style={{ overflow: "hidden", marginTop: 18, height: numFs * 0.9 }}>
              <div className="sw-num" style={{ fontSize: numFs, fontWeight: 600, letterSpacing: "-0.06em", lineHeight: 0.86 }}>
                <span className="sw-numin" style={{ color: INK }}>{String(i + 1).padStart(2, "0")}</span>
              </div>
            </div>
            <div className="sw-txt" style={{ marginTop: 28, fontSize: labelFs, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1, color: INK }}>
              {s.label}
            </div>
            {s.hint ? (
              <div className="sw-txt" style={{ marginTop: 14, fontSize: hintFs, lineHeight: 1.3, color: MUTED }}>
                {s.hint}
              </div>
            ) : null}
          </div>
        ))}
        <div className="sw-marker" style={{ position: "absolute", left: 0, top: -5, width: colW, height: 12, background: accent, transformOrigin: "0 50%" }} />
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- stack */

const Stack: React.FC<StackProps> = (p) => {
  const accent = p.accent ?? RED;
  const layers = p.layers.slice(0, 5);
  const n = Math.max(1, layers.length);
  const hi = Math.min(Math.max(0, p.highlight ?? 0), n - 1);
  const tTitle = beatAt(p.beats, "title", 0.25);
  const tLayers = beatAt(p.beats, "layers", tTitle + 0.55);
  const tHi = beatAt(p.beats, "highlight", tLayers + n * 0.12 + 0.5);
  const top = 400;
  const areaH = 600;
  const rowH = areaH / n;
  const labelFs = Math.min(
    rowH * 0.62,
    ...layers.map((l) => fitSize(l.label, COL * 6.2, rowH * 0.8, 120, { charW: CHAR, lineH: 1, min: 28, maxLines: 1 })),
  );
  const hintFs = Math.min(30, rowH * 0.26);
  const headFs = p.headline ? fitSize(p.headline, 1680, 170, 100, { charW: CHAR, lineH: 0.95, min: 40 }) : 0;

  const scope = useGsapTimeline((tl, q) => {
    tl.from(q(".sw-rule"), { scaleX: 0, duration: 0.6, ease: "emcee.inOut" }, Math.max(0, tTitle - 0.2));
    tl.from(q(".sw-kicker"), { x: -40, autoAlpha: 0, duration: 0.4, ease: CUT }, tTitle - 0.1);
    landWords(tl, q, ".sw-words", tTitle);
    q(".sw-row").forEach((r, i) => {
      const at = tLayers + i * 0.12;
      tl.from(r.querySelector(".sw-sep"), { scaleX: 0, duration: 0.5, ease: CUT }, at);
      tl.from(r.querySelectorAll(".sw-rin"), { yPercent: 100, duration: 0.5, ease: CUT, stagger: 0.04 }, at + 0.05);
    });
    const row = q(".sw-row")[hi];
    if (row) {
      tl.from(row.querySelector(".sw-fill"), { scaleX: 0, duration: 0.55, ease: "expo.inOut" }, tHi);
      tl.to(row.querySelectorAll(".sw-ink"), { color: "#FFFFFF", duration: 0.2 }, tHi + 0.2);
    }
  }, [depKey(p)]);

  return (
    <Stage ref={scope} bg={BG} font={fontSans}>
      <TopRule />
      <div style={{ position: "absolute", left: M, top: 128 }}>
        <Kicker text={p.kicker} accent={accent} />
      </div>
      {p.headline ? (
        <div className="sw-words" style={{ position: "absolute", left: M, top: 196, width: 1680, fontSize: headFs, fontWeight: 600, letterSpacing: "-0.045em", lineHeight: 0.95, color: INK }}>
          {p.headline}
        </div>
      ) : null}
      {layers.map((l, i) => (
        <div key={i} className="sw-row" style={{ position: "absolute", left: 0, right: 0, top: top + i * rowH, height: rowH }}>
          {i === hi ? <div className="sw-fill" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, background: accent, transformOrigin: "0 50%" }} /> : null}
          <div className="sw-sep" style={{ position: "absolute", left: M, right: M, top: 0, height: 2, background: INK, transformOrigin: "0 50%" }} />
          {i === n - 1 ? <div className="sw-sep" style={{ position: "absolute", left: M, right: M, bottom: 0, height: 2, background: INK, transformOrigin: "0 50%" }} /> : null}
          <div style={{ position: "absolute", left: M, right: M, top: 0, bottom: 0, display: "flex", alignItems: "center", overflow: "hidden" }}>
            <div className="sw-rin sw-ink" style={{ width: COL, flex: "none", fontSize: Math.min(34, rowH * 0.3), fontWeight: 600, color: INK }}>
              {String(i + 1).padStart(2, "0")}
            </div>
            <div className="sw-rin sw-ink" style={{ width: COL * 7, flex: "none", fontSize: labelFs, fontWeight: 600, letterSpacing: "-0.04em", lineHeight: 1, color: INK, whiteSpace: "nowrap" }}>
              {l.label}
            </div>
            <div className="sw-rin sw-ink" style={{ flex: 1, minWidth: 0, fontSize: hintFs, lineHeight: 1.25, color: MUTED, textAlign: "right", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 24 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.hint}</span>
              {l.glyph ? (
                <span className="sw-ink" style={{ color: INK, flex: "none" }}>
                  <GlyphSvg name={l.glyph} size={Math.min(48, rowH * 0.4)} stroke="currentColor" accent="currentColor" />
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </Stage>
  );
};

/* ---------------------------------------------------------------- metrics */

const Metrics: React.FC<MetricsProps> = (p) => {
  const accent = p.accent ?? RED;
  const ms = p.metrics.slice(0, 4);
  const n = Math.max(1, ms.length);
  const tTitle = beatAt(p.beats, "title", 0.25);
  const tNum = beatAt(p.beats, "numbers", tTitle + 0.6);
  const gap = 40;
  const colW = (1920 - 2 * M - gap * (n - 1)) / n;
  const numFs = Math.min(
    n === 1 ? 420 : 300,
    ...ms.map((m) => colW / Math.max(1, metricText(m).length * 0.6)),
  );
  const labelFs = Math.min(...ms.map((m) => fitSize(m.label, colW, 110, 40, { lineH: 1.2, min: 20 })));
  const headFs = p.headline ? fitSize(p.headline, 1680, 200, 110, { charW: CHAR, lineH: 0.95, min: 40 }) : 0;

  const scope = useGsapTimeline((tl, q) => {
    tl.from(q(".sw-rule"), { scaleX: 0, duration: 0.6, ease: "emcee.inOut" }, Math.max(0, tTitle - 0.2));
    tl.from(q(".sw-kicker"), { x: -40, autoAlpha: 0, duration: 0.4, ease: CUT }, tTitle - 0.1);
    landWords(tl, q, ".sw-words", tTitle);
    q(".sw-metric").forEach((c, i) => {
      const at = tNum + i * 0.14;
      const num = c.querySelector(".sw-val")!;
      const { o, write } = countTo(num, ms[i]);
      tl.from(c.querySelector(".sw-valwrap"), { yPercent: 100, duration: 0.55, ease: CUT }, at);
      tl.to(o, { v: ms[i].value, duration: 1.3, ease: "power3.out", onUpdate: write }, at);
      tl.from(c.querySelector(".sw-line"), { scaleX: 0, duration: 0.5, ease: CUT }, at + 0.1);
      tl.from(c.querySelector(".sw-lab"), { y: 24, autoAlpha: 0, duration: 0.45, ease: CUT }, at + 0.2);
    });
  }, [depKey(p)]);

  return (
    <Stage ref={scope} bg={BG} font={fontSans}>
      <TopRule />
      <div style={{ position: "absolute", left: M, top: 128 }}>
        <Kicker text={p.kicker} accent={accent} />
      </div>
      {p.headline ? (
        <div className="sw-words" style={{ position: "absolute", left: M, top: 196, width: 1680, fontSize: headFs, fontWeight: 600, letterSpacing: "-0.045em", lineHeight: 0.95, color: INK }}>
          {p.headline}
        </div>
      ) : null}
      <div style={{ position: "absolute", left: M, right: M, bottom: 110, display: "flex", gap, alignItems: "flex-end" }}>
        {ms.map((m, i) => (
          <div key={i} className="sw-metric" style={{ width: colW, flex: "none" }}>
            <div style={{ overflow: "hidden", paddingBottom: 6 }}>
              <div className="sw-valwrap" style={{ fontSize: numFs, fontWeight: 600, letterSpacing: "-0.06em", lineHeight: 0.9, color: i === 0 ? accent : INK, whiteSpace: "nowrap" }}>
                <span className="sw-val">{metricText(m)}</span>
              </div>
            </div>
            <div className="sw-line" style={{ height: 2, background: INK, marginTop: 20, transformOrigin: "0 50%" }} />
            <div className="sw-lab" style={{ marginTop: 20, fontSize: labelFs, lineHeight: 1.2, color: INK, fontWeight: 400, minHeight: labelFs * 2.4 }}>
              {m.label}
            </div>
          </div>
        ))}
      </div>
    </Stage>
  );
};

/* ---------------------------------------------------------------- endcard */

const Endcard: React.FC<EndcardProps> = (p) => {
  const accent = p.accent ?? RED;
  const tMark = beatAt(p.beats, "mark", 0.2);
  const tTitle = beatAt(p.beats, "title", tMark + 0.5);
  const fs = fitSize(p.title, 1300, 420, 230, { charW: CHAR, lineH: 0.92, min: 60 });

  const scope = useGsapTimeline((tl, q) => {
    tl.from(q(".sw-mark"), { yPercent: -110, duration: 0.6, ease: "expo.out" }, tMark);
    tl.from(q(".sw-markg"), { scale: 0.5, autoAlpha: 0, duration: 0.4, ease: "emcee.pop" }, tMark + 0.3);
    landWords(tl, q, ".sw-words", tTitle, 0.08);
    tl.from(q(".sw-kicker"), { x: -40, autoAlpha: 0, duration: 0.4, ease: CUT }, tTitle + 0.3);
    tl.from(q(".sw-tag"), { y: 24, autoAlpha: 0, duration: 0.5, ease: CUT }, tTitle + 0.45);
    tl.from(q(".sw-rule"), { scaleX: 0, duration: 0.7, ease: "emcee.inOut" }, tTitle + 0.3);
  }, [depKey(p)]);

  const markSize = COL * 2;
  return (
    <Stage ref={scope} bg={BG} font={fontSans}>
      <div style={{ position: "absolute", left: M, top: 0, width: markSize, height: 120 + markSize, overflow: "hidden" }}>
        <div className="sw-mark" style={{ position: "absolute", left: 0, bottom: 0, width: markSize, height: markSize, background: isFile(p.mark) ? "transparent" : accent }}>
          <div className="sw-markg" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isFile(p.mark) ? (
              <Img src={staticFile(p.mark!)} style={{ width: markSize, height: markSize, objectFit: "contain" }} />
            ) : (
              <GlyphSvg name={p.mark} size={markSize * 0.6} stroke="#FFFFFF" accent={INK} strokeWidth={1.5} />
            )}
          </div>
        </div>
      </div>
      <div style={{ position: "absolute", left: M, top: 440, width: 1680 }}>
        <Kicker text={p.kicker} accent={accent} />
      </div>
      <div className="sw-words" style={{ position: "absolute", left: M - fs * 0.05, top: 510, width: 1500, fontSize: fs, fontWeight: 600, letterSpacing: "-0.05em", lineHeight: 0.92, color: INK }}>
        {p.title}
      </div>
      <div className="sw-rule" style={{ position: "absolute", left: M, right: M, top: 960, height: 2, background: INK, transformOrigin: "0 50%" }} />
      {p.tagline ? (
        <div className="sw-tag" style={{ position: "absolute", left: M, top: 984, width: 1680, fontSize: fitSize(p.tagline, 1680, 50, 34, { min: 18, maxLines: 1 }), color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {p.tagline}
        </div>
      ) : null}
    </Stage>
  );
};

export const style: StyleDef = {
  id: "swiss",
  label: "Swiss kinetic type",
  description: "Huge grotesk words, one red, landing on the narration's beats.",
  bestFor: "launches, hooks",
  tone: "light",
  swatch: ["#FFFFFF", "#16181D", "#E5231B"],
  templates: { hero: Hero, pipeline: Pipeline, stack: Stack, metrics: Metrics, endcard: Endcard },
};
