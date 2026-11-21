/**
 * The five templates drawn in isometric, once, for any isometric skin.
 *
 * iso-clay and iso-blueprint share their geometry: the same slabs, blocks and
 * layout, so a film switched between them keeps its composition. The skin
 * decides how it is drawn and how it moves:
 *
 *   fill   flat-shaded faces, no outlines; pieces pop in on a spring and float
 *   line   the visible edges only, over faces filled with the ground; every
 *          edge and glyph stroke draws itself on (DrawSVG), labels in mono
 *
 * Layout is in the 1920x1080 design space (kit/layout.tsx). Every timing comes
 * from a named beat in catalog.json, with the fallbacks below; entrances are
 * done by ~2.5 s and only the slow float runs after that.
 */
import React from "react";
import { Img, staticFile } from "remotion";

import { fontMono, fontSans } from "../../fonts";
import { Glyph, GlyphG, hasGlyph } from "../../glyphs/Glyph";
import { beatAt, useGsapTimeline } from "../../motion/gsap";
import type { EndcardProps, HeroProps, MetricsProps, PipelineProps, StackProps, TemplateId, TemplateProps } from "../types";
import { countText, finalText } from "./format";
import { CentredBox, ContactShadow, type Faces, faceMatrix, IsoDiamond, iso, type Origin } from "./iso";
import { Box, DH, DW, Layer, SAFE, Stage, slots, within } from "./layout";
import { float, progressAt, useSceneTime } from "./motion";
import { FitText, fitText, fittedHeight } from "./text";

export type IsoSkin = {
  mode: "fill" | "line";
  ground: string;
  /** Full-frame layer under the design space (grid paper, a floor glow). */
  backdrop?: React.ReactNode;
  ink: string;
  sub: string;
  muted: string;
  accent: string;
  /** Labels (step names, captions): Geist for clay, mono for blueprint. */
  labelFamily: string;
  /** Kickers and small captions upper-case, tracked (blueprint), or sentence case. */
  capsLabels: boolean;
  faces: {
    /** Plain blocks. */
    block: Faces;
    /** Pedestals and pads. */
    slab: Faces;
    /** Lit pieces, from the accent. */
    lit: (accent: string) => Faces;
  };
  /** Glyph ink on plain blocks, and on lit ones. */
  glyphInk: string;
  glyphOnLit: string;
  /** line mode: edge colour. */
  line: string;
  shadow: string;
};

type Ctx = { skin: IsoSkin; accent: string };

/* ------------------------------------------------------------------ shared pieces */

const S = (s: string | undefined, caps: boolean) => (s ? (caps ? s.toUpperCase() : s) : "");

function Kicker({ text, ctx, x, y, w, align = "left" }: { text?: string; ctx: Ctx; x: number; y: number; w: number; align?: "left" | "center" }) {
  if (!text) return null;
  const { skin, accent } = ctx;
  const caps = skin.capsLabels;
  return (
    <Box x={x} y={y} w={w} className="t-kicker" style={{ display: "flex", alignItems: "center", gap: 16, justifyContent: align === "center" ? "center" : "flex-start" }}>
      {caps ? null : <div style={{ width: 34, height: 4, borderRadius: 2, background: accent, flex: "none" }} />}
      <FitText
        text={S(text, caps)}
        maxWidth={w - (caps ? 0 : 50)}
        max={caps ? 24 : 30}
        min={16}
        weight={caps ? 500 : 600}
        family={caps ? skin.labelFamily : fontSans}
        letterSpacing={caps ? 0.14 : 0}
        color={accent}
        align={align}
        style={{ width: "auto" }}
      />
    </Box>
  );
}

/** Kicker + headline (+ sub) as one stacked column; returns the node and its height. */
function heading(
  ctx: Ctx,
  { kicker, headline, sub, x, y, w, max = 96, lines = 3, subMax = 34, align = "left", center = false }: {
    kicker?: string;
    headline?: string;
    sub?: string;
    x: number;
    y: number;
    w: number;
    max?: number;
    lines?: number;
    subMax?: number;
    align?: "left" | "center";
    /** y is the vertical centre of the block, not its top. */
    center?: boolean;
  },
) {
  const { skin } = ctx;
  const hl = headline ? fitText(headline, { maxWidth: w, maxLines: lines, max, min: Math.round(max * 0.5), weight: 600, letterSpacing: -0.025 }) : null;
  const sb = sub ? fitText(sub, { maxWidth: Math.min(w, 760), maxLines: 3, max: subMax, min: 22, weight: 400 }) : null;
  const kH = kicker ? 64 : 0;
  const hH = hl ? fittedHeight(hl, 1.04) : 0;
  const sH = sb ? fittedHeight(sb, 1.4) + 30 : 0;
  const total = kH + hH + sH;
  const top = center ? y - total / 2 : y;
  const node = (
    <>
      <Kicker text={kicker} ctx={ctx} x={x} y={top} w={w} align={align} />
      {headline ? (
        <Box x={x} y={top + kH} w={w}>
          <FitText className="t-hl" wordClassName="w" text={headline} maxWidth={w} maxLines={lines} max={max} min={Math.round(max * 0.5)} weight={600} letterSpacing={-0.025} lineHeight={1.04} color={skin.ink} align={align} />
        </Box>
      ) : null}
      {sub ? (
        <Box x={align === "center" ? x + (w - Math.min(w, 760)) / 2 : x} y={top + kH + hH + 30} w={Math.min(w, 760)}>
          <FitText className="t-sub" text={sub} maxWidth={Math.min(w, 760)} maxLines={3} max={subMax} min={22} weight={400} lineHeight={1.4} color={skin.sub} align={align} />
        </Box>
      ) : null}
    </>
  );
  return { node, height: total, top };
}

/** Text entrance: kicker, headline words, sub. Same in both modes. */
function textIn(tl: gsap.core.Timeline, q: (s: string) => Element[], at: number) {
  tl.from(q(".t-kicker"), { y: 14, autoAlpha: 0, duration: 0.6, ease: "emcee.out" }, at);
  tl.from(q(".t-hl .w"), { y: 34, autoAlpha: 0, duration: 0.8, ease: "emcee.out", stagger: 0.045 }, at + 0.08);
  tl.from(q(".t-sub"), { y: 16, autoAlpha: 0, duration: 0.7, ease: "emcee.out" }, at + 0.45);
}

/** Pieces with class `cls` arrive: pop on a spring (fill) or draw their edges on (line). */
function piecesIn(tl: gsap.core.Timeline, q: (s: string) => Element[], skin: IsoSkin, cls: string, at: number, stagger = 0.12) {
  if (skin.mode === "fill") {
    tl.from(q(`.${cls}`), { y: -70, scale: 0.86, autoAlpha: 0, duration: 0.8, ease: "emcee.pop", transformOrigin: "50% 100%", stagger }, at);
  } else {
    const groups = q(`.${cls}`);
    groups.forEach((g, i) => {
      const t = at + i * stagger;
      const edges = Array.from(g.querySelectorAll(".iso-edge, .bp-line"));
      const strokes = Array.from(g.querySelectorAll(".glyph-stroke"));
      const fills = Array.from(g.querySelectorAll(".glyph-fill, .bp-fade"));
      const faces = Array.from(g.querySelectorAll(".bp-face"));
      if (faces.length) tl.from(faces, { autoAlpha: 0, duration: 0.5, ease: "power1.out" }, t);
      if (edges.length) tl.from(edges, { drawSVG: "0%", duration: 0.9, ease: "emcee.inOut", stagger: 0.05 }, t);
      if (strokes.length) tl.from(strokes, { drawSVG: "0%", duration: 0.7, ease: "emcee.inOut", stagger: 0.06 }, t + 0.45);
      if (fills.length) tl.from(fills, { autoAlpha: 0, duration: 0.4, ease: "power1.out" }, t + 0.9);
    });
  }
}

/** A block, in the skin's look. Line mode fills the faces with the ground, so hidden edges stay hidden. */
function Piece({ ctx, o, w, d, h, z = 0, lit = false, faces, children, edgeClass }: { ctx: Ctx; o: Origin; w: number; d: number; h: number; z?: number; lit?: boolean; faces?: Faces; children?: React.ReactNode; edgeClass?: string }) {
  const { skin, accent } = ctx;
  if (skin.mode === "fill") {
    return (
      <CentredBox {...o} w={w} d={d} h={h} z={z} faces={faces ?? (lit ? skin.faces.lit(accent) : skin.faces.block)}>
        {children}
      </CentredBox>
    );
  }
  const g = skin.ground;
  const tint = lit ? { top: mixA("#3D6A9E", 0.32, g), left: mixA("#3D6A9E", 0.18, g), right: mixA("#3D6A9E", 0.1, g) } : { top: g, left: g, right: g };
  return (
    <CentredBox {...o} w={w} d={d} h={h} z={z} faces={tint} mode="line" stroke={lit ? accent : skin.line} strokeWidth={lit ? 2.6 : 2} edgeClassName={edgeClass}>
      {children}
    </CentredBox>
  );
}

/** Accent over the ground at strength t (blueprint tints). */
function mixA(c: string, t: number, g: string) {
  const h = (s: string) => {
    const n = parseInt(s.replace("#", "").slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [a1, a2, a3] = h(g);
  const [b1, b2, b3] = h(c);
  const m = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, "0");
  return `#${m(a1, b1)}${m(a2, b2)}${m(a3, b3)}`;
}

/** A glyph painted on the left face of a centred box. */
function FaceGlyph({ name, o, w, d, h, z = 0, size, ink, accent, face = "left" }: { name?: string; o: Origin; w: number; d: number; h: number; z?: number; size: number; ink: string; accent: string; face?: "left" | "right" | "top" }) {
  if (!name) return null;
  const geom = { x: -w / 2, y: -d / 2, z, w, d, h };
  const faceW = face === "right" ? d : w;
  const faceH = face === "top" ? d : h;
  return (
    <g transform={faceMatrix(face, geom, o)}>
      <GlyphG name={hasGlyph(name) ? name : "film"} x={(faceW - size) / 2} y={(faceH - size) / 2} size={size} stroke={ink} accent={accent} strokeWidth={2} />
    </g>
  );
}

/** A slab (pedestal) with its contact shadow; fill mode only draws the shadow. */
function Pedestal({ ctx, o, a, t, className }: { ctx: Ctx; o: Origin; a: number; t: number; className?: string }) {
  const { skin } = ctx;
  return (
    <g className={className}>
      {skin.mode === "fill" ? <ContactShadow cx={o.ox} cy={o.oy + t + a * 0.12} r={a * 1.08} color={skin.shadow} opacity={0.07} /> : null}
      {skin.mode === "line" ? <IsoDiamond ox={o.ox} oy={o.oy + t} a={a * 1.35} stroke={skin.line} strokeWidth={1.2} dash="4 8" className="bp-fade" /> : null}
      <Piece ctx={ctx} o={{ ox: o.ox, oy: o.oy + t }} w={a * 2} d={a * 2} h={t} faces={skin.mode === "fill" ? skin.faces.slab : undefined} edgeClass="bp-slab" />
    </g>
  );
}

/** Blueprint caption: "FIG. 01 — NAME", mono, with a short leader. */
function Caption({ ctx, x, y, text, align = "middle", className }: { ctx: Ctx; x: number; y: number; text: string; align?: "start" | "middle" | "end"; className?: string }) {
  const { skin } = ctx;
  return (
    <text className={className} x={x} y={y} fill={skin.muted} fontFamily={skin.labelFamily} fontSize={18} letterSpacing={2.4} textAnchor={align}>
      {text.toUpperCase()}
    </text>
  );
}

/** Accent parts of a glyph on a lit block: the glyph ink in fill mode (accent on accent would vanish). */
const litAccent = (ctx: Ctx) => (ctx.skin.mode === "fill" ? ctx.skin.glyphOnLit : ctx.accent);

function useAccent(skin: IsoSkin, accent?: string): Ctx {
  return { skin, accent: accent ?? skin.accent };
}

const key = (p: unknown) => JSON.stringify(p);

/* ------------------------------------------------------------------ hero */

function makeHero(skin: IsoSkin): React.FC<HeroProps> {
  return function IsoHero(props) {
    const ctx = useAccent(skin, props.accent);
    const tTitle = beatAt(props.beats, "title", 0.3);
    const tObject = beatAt(props.beats, "object", 0.9);
    const scope = useGsapTimeline((tl, q) => {
      textIn(tl, q, tTitle);
      piecesIn(tl, q, skin, "p-base", Math.max(0, tObject - 0.35));
      piecesIn(tl, q, skin, "p-main", tObject);
      piecesIn(tl, q, skin, "p-side", tObject + 0.3, 0.14);
      if (skin.mode === "line") tl.from(q(".p-dim"), { drawSVG: "0%", autoAlpha: 0, duration: 0.8, ease: "emcee.inOut", stagger: 0.1 }, tObject + 0.9);
      tl.from(q(".p-cap"), { autoAlpha: 0, duration: 0.6 }, tObject + 1.1);
      float(tl, q(".f-main"), { at: tObject + 1.0, amp: 7, period: 3.6 });
      float(tl, q(".f-hover"), { at: tObject + 0.9, amp: 12, period: 3 });
    }, [key(props)]);

    const h = heading(ctx, { kicker: props.kicker, headline: props.headline, sub: props.sub, x: SAFE.x, y: DH / 2, w: 780, max: 100, lines: 3, center: true });
    const o = { ox: 1395, oy: 650 };
    const A = 160; // pedestal half-size
    const T = 34; // pedestal thickness
    const top = { ox: o.ox, oy: o.oy - 0 }; // the slab's top sits at o
    const cube = { w: 180, d: 180, h: 196 };
    const glyph = props.glyph ?? "film";
    return (
      <Stage ref={scope} ground={skin.ground} backdrop={skin.backdrop} fontFamily={fontSans}>
        <Layer>
          <Pedestal ctx={ctx} o={o} a={A} t={T} className="p-base" />
          {/* back-right tile, behind the cube */}
          <g className="p-side">
            <Piece ctx={ctx} o={{ ox: top.ox + 0, oy: top.oy - 95 }} w={56} d={56} h={14} lit />
          </g>
          <g className="f-main">
            <g className="p-main">
              <Piece ctx={ctx} o={top} w={cube.w} d={cube.d} h={cube.h} lit>
                <FaceGlyph name={glyph} o={top} {...cube} size={136} ink={skin.glyphOnLit} accent={litAccent(ctx)} />
              </Piece>
            </g>
          </g>
          {/* front-left small block, in front of the cube */}
          <g className="p-side">
            <Piece ctx={ctx} o={{ ox: top.ox - 190, oy: top.oy + 40 }} w={62} d={62} h={62} />
          </g>
          <g className="p-side">
            <Piece ctx={ctx} o={{ ox: top.ox + 170, oy: top.oy + 52 }} w={40} d={40} h={30} />
          </g>
          {/* hovering accent piece */}
          <g className="f-hover">
            <g className="p-side">
              <Piece ctx={ctx} o={{ ox: top.ox + 215, oy: top.oy - 300 }} w={46} d={46} h={46} lit={skin.mode === "fill"} />
            </g>
          </g>
          {skin.mode === "line" ? (
            <g stroke={skin.muted} strokeWidth={1.4} fill="none">
              {/* height dimension, left of the cube */}
              {(() => {
                const [x0, y0] = iso(-cube.w / 2, cube.d / 2, 0, top);
                const [, y1] = iso(-cube.w / 2, cube.d / 2, cube.h, top);
                const x = x0 - 46;
                return <path className="p-dim" d={`M${x} ${y0} L${x} ${y1} M${x - 9} ${y0} L${x + 9} ${y0} M${x - 9} ${y1} L${x + 9} ${y1}`} />;
              })()}
            </g>
          ) : null}
          {skin.mode === "line" ? <Caption ctx={ctx} className="p-cap" x={o.ox} y={o.oy + A + T + 92} text={`Fig. 01 — ${glyph}`} /> : null}
        </Layer>
        {h.node}
      </Stage>
    );
  };
}

/* ------------------------------------------------------------------ pipeline */

function makePipeline(skin: IsoSkin): React.FC<PipelineProps> {
  return function IsoPipeline(props) {
    const ctx = useAccent(skin, props.accent);
    const steps = within<PipelineProps["steps"][number]>(props.steps, 3, 6, (i) => ({ label: `Step ${i + 1}` }));
    const n = steps.length;
    const tTitle = beatAt(props.beats, "title", 0.3);
    const tSteps = beatAt(props.beats, "steps", 0.8);
    const tTravel = beatAt(props.beats, "travel", tSteps + 0.25 + n * 0.12 + 0.5);
    const hop = Math.min(0.55, 1.5 / (n - 1));
    const { centers, width: slotW } = slots(n, SAFE.x, DW - SAFE.x);
    const a = Math.min(74, slotW * 0.2);
    const T = 18;
    const rowY = 600;
    const block = { w: a * 1.12, d: a * 1.12, h: a * 1.05 };

    const scope = useGsapTimeline((tl, q) => {
      textIn(tl, q, tTitle);
      piecesIn(tl, q, skin, "p-step", tSteps, 0.12);
      tl.from(q(".p-label"), { y: 16, autoAlpha: 0, duration: 0.6, ease: "emcee.out", stagger: 0.12 }, tSteps + 0.25);
      if (skin.mode === "line") tl.from(q(".p-link"), { drawSVG: "0%", duration: 0.5, ease: "power1.inOut", stagger: 0.12 }, tSteps + 0.4);
      else tl.from(q(".p-link"), { autoAlpha: 0, duration: 0.5, stagger: 0.12 }, tSteps + 0.4);
      // The marker hops from step to step; each step lights as it arrives and
      // settles to "done" (accent glyph) when the marker moves on.
      const marker = q(".p-marker");
      tl.fromTo(marker, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 }, tTravel - 0.1);
      steps.forEach((_, i) => {
        const at = tTravel + i * hop;
        if (i > 0) tl.to(marker, { x: centers[i] - centers[0], duration: hop * 0.9, ease: "emcee.inOut" }, at - hop * 0.9);
        tl.to(q(`.p-lit-${i}`), { autoAlpha: 1, duration: 0.25, ease: "power1.out" }, at);
        if (i < n - 1) {
          tl.to(q(`.p-lit-${i}`), { autoAlpha: 0, duration: 0.35, ease: "power1.inOut" }, at + hop);
          tl.to(q(`.p-done-${i}`), { autoAlpha: 1, duration: 0.35 }, at + hop);
        }
        tl.to(q(`.p-label-${i} .p-name`), { color: ctx.accent, duration: 0.25 }, at);
        if (i < n - 1) tl.to(q(`.p-label-${i} .p-name`), { color: skin.ink, duration: 0.35 }, at + hop);
      });
      float(tl, q(`.p-lit-${n - 1} .f`), { at: tTravel + n * hop + 0.4, amp: 6, period: 3.4 });
    }, [key(props)]);

    const h = heading(ctx, { kicker: props.kicker, headline: props.headline, x: SAFE.x, y: SAFE.y + 10, w: 1300, max: 76, lines: 2 });
    const linkY = rowY - T / 2 - 4;
    const labelTop = rowY + a + 70;
    const labelW = slotW - 36;

    return (
      <Stage ref={scope} ground={skin.ground} backdrop={skin.backdrop} fontFamily={fontSans}>
        <Layer>
          {/* links, behind the tiles */}
          {centers.slice(0, -1).map((cx, i) => (
            <line
              key={i}
              className="p-link"
              x1={cx + a * 2 + 14}
              y1={linkY}
              x2={centers[i + 1] - a * 2 - 14}
              y2={linkY}
              stroke={skin.mode === "fill" ? skin.muted : skin.line}
              strokeWidth={skin.mode === "fill" ? 4 : 2}
              strokeLinecap="round"
              strokeDasharray={skin.mode === "fill" ? "0.1 14" : undefined}
              opacity={skin.mode === "fill" ? 1 : 0.7}
            />
          ))}
          {/* marker: rides the links and slips behind each station */}
          <g className="p-marker">
            {skin.mode === "fill" ? (
              <>
                <circle cx={centers[0]} cy={linkY} r={22} fill={ctx.accent} opacity={0.16} />
                <circle cx={centers[0]} cy={linkY} r={11} fill={ctx.accent} />
              </>
            ) : (
              <>
                <rect x={centers[0] - 11} y={linkY - 11} width={22} height={22} transform={`rotate(45 ${centers[0]} ${linkY})`} fill={ctx.accent} />
                <circle cx={centers[0]} cy={linkY} r={22} fill="none" stroke={ctx.accent} strokeWidth={1.5} opacity={0.6} />
              </>
            )}
          </g>
          {centers.map((cx, i) => {
            const o = { ox: cx, oy: rowY - T };
            const glyph = steps[i].glyph ?? "film";
            return (
              <g key={i}>
                <g className="p-step">
                  <Pedestal ctx={ctx} o={{ ox: cx, oy: rowY - T }} a={a} t={T} />
                  <Piece ctx={ctx} o={o} {...block}>
                    <FaceGlyph name={glyph} o={o} {...block} size={block.w * 0.6} ink={skin.glyphInk} accent={skin.glyphInk} />
                  </Piece>
                </g>
                {/* done: plain block, accent glyph */}
                <g className={`p-done-${i}`} style={{ opacity: 0, visibility: "hidden" }}>
                  <Piece ctx={ctx} o={o} {...block}>
                    <FaceGlyph name={glyph} o={o} {...block} size={block.w * 0.6} ink={skin.mode === "fill" ? skin.glyphInk : skin.line} accent={ctx.accent} />
                  </Piece>
                </g>
                {/* lit: accent block */}
                <g className={`p-lit-${i}`} style={{ opacity: 0, visibility: "hidden" }}>
                  <g className="f">
                    <Piece ctx={ctx} o={o} {...block} lit>
                      <FaceGlyph name={glyph} o={o} {...block} size={block.w * 0.6} ink={skin.glyphOnLit} accent={litAccent(ctx)} />
                    </Piece>
                  </g>
                </g>
              </g>
            );
          })}
        </Layer>
        {centers.map((cx, i) => (
          <Box key={i} x={cx - labelW / 2} y={labelTop} w={labelW} className={`p-label p-label-${i}`} style={{ textAlign: "center" }}>
            <div style={{ fontFamily: skin.labelFamily, fontSize: 18, letterSpacing: "0.14em", color: skin.muted, marginBottom: 12 }}>{String(i + 1).padStart(2, "0")}</div>
            <div className="p-name" style={{ color: skin.ink }}>
              <FitText text={steps[i].label} maxWidth={labelW} maxLines={2} max={n > 4 ? 32 : 36} min={20} weight={600} lineHeight={1.12} align="center" />
            </div>
            {steps[i].hint ? (
              <div style={{ marginTop: 10 }}>
                <FitText text={steps[i].hint!} maxWidth={labelW} maxLines={2} max={n > 4 ? 21 : 24} min={15} weight={400} lineHeight={1.35} color={skin.sub} align="center" family={skin.mode === "line" ? skin.labelFamily : fontSans} />
              </div>
            ) : null}
          </Box>
        ))}
        {h.node}
      </Stage>
    );
  };
}

/* ------------------------------------------------------------------ stack */

function makeStack(skin: IsoSkin): React.FC<StackProps> {
  return function IsoStack(props) {
    const ctx = useAccent(skin, props.accent);
    const layers = within<StackProps["layers"][number]>(props.layers, 2, 5, (i) => ({ label: `Layer ${i + 1}` }));
    const n = layers.length;
    const lit = Math.max(0, Math.min(n - 1, props.highlight ?? 0));
    const tTitle = beatAt(props.beats, "title", 0.3);
    const tLayers = beatAt(props.beats, "layers", 0.7);
    const tLit = beatAt(props.beats, "highlight", tLayers + n * 0.16 + 0.8);

    const a = 128;
    const LH = 36;
    const gap = n <= 2 ? 170 : n === 3 ? 148 : n === 4 ? 112 : 90;
    const zOf = (i: number) => (n - 1 - i) * gap; // top first
    const z0 = zOf(0);
    const ox = 1115;
    const oy = 560 + (z0 + LH) / 2;
    const pull = { x: 34, y: 17 };

    const scope = useGsapTimeline((tl, q) => {
      textIn(tl, q, tTitle);
      // Bottom layer lands first, so the stack builds up like the real thing.
      const order = q(".p-layer").reverse();
      if (skin.mode === "fill") {
        tl.from(order, { y: -120, autoAlpha: 0, duration: 0.8, ease: "emcee.pop", stagger: 0.16 }, tLayers);
      } else {
        order.forEach((g, i) => {
          tl.from(g.querySelectorAll(".iso-edge"), { drawSVG: "0%", duration: 0.8, ease: "emcee.inOut" }, tLayers + i * 0.16);
        });
      }
      tl.from(q(".p-axis"), skin.mode === "line" ? { drawSVG: "0%", duration: 1, ease: "emcee.inOut" } : { autoAlpha: 0, duration: 0.8 }, tLayers);
      tl.from(q(".p-row").reverse(), { x: -18, autoAlpha: 0, duration: 0.6, ease: "emcee.out", stagger: 0.16 }, tLayers + 0.3);
      tl.from(q(".p-lead").reverse(), skin.mode === "line" ? { drawSVG: "0%", duration: 0.5, stagger: 0.16 } : { autoAlpha: 0, duration: 0.5, stagger: 0.16 }, tLayers + 0.35);
      // The lit layer slides out along x and takes the accent.
      tl.to(q(".p-pull"), { x: pull.x, y: pull.y, duration: 0.8, ease: "emcee.out" }, tLit);
      tl.to(q(".p-glow"), { autoAlpha: 1, duration: 0.6, ease: "power1.out" }, tLit);
      tl.to(q(".p-row-dim"), { opacity: 0.5, duration: 0.6 }, tLit);
      tl.to(q(".p-row-lit .p-name"), { color: ctx.accent, duration: 0.4 }, tLit);
      tl.to(q(".p-row-lit"), { x: 14, duration: 0.8, ease: "emcee.out" }, tLit);
      float(tl, q(".p-float"), { at: tLit + 0.9, amp: 5, period: 3.8 });
    }, [key(props)]);

    const h = heading(ctx, { kicker: props.kicker, headline: props.headline, x: SAFE.x, y: DH / 2, w: 640, max: 84, lines: 3, center: true });
    const labelX = ox + a * 2 + 96;
    const labelW = DW - 90 - labelX;

    return (
      <Stage ref={scope} ground={skin.ground} backdrop={skin.backdrop} fontFamily={fontSans}>
        <Layer>
          {skin.mode === "fill" ? <ContactShadow cx={ox} cy={oy + LH + a * 0.1} r={a * 1.1} color={skin.shadow} opacity={0.07} /> : null}
          {/* the spine through the stack */}
          <line className="p-axis" x1={ox} y1={oy - z0 - LH - 30} x2={ox} y2={oy + 10} stroke={skin.mode === "fill" ? skin.faces.slab.right : skin.muted} strokeWidth={2} strokeDasharray={skin.mode === "fill" ? undefined : "3 7"} />
          {layers
            .map((L, i) => ({ L, i }))
            .reverse()
            .map(({ L, i }) => {
              const z = zOf(i);
              const o = { ox, oy };
              const isLit = i === lit;
              const [, ry] = iso(a, -a, z + LH / 2, o);
              return (
                <g key={i} className="p-layer">
                  <g className={isLit ? "p-pull" : undefined}>
                    <g className={isLit ? "p-float" : undefined}>
                      <Piece ctx={ctx} o={o} w={a * 2} d={a * 2} h={LH} z={z} faces={skin.mode === "fill" ? skin.faces.block : undefined} />
                      {isLit ? (
                        <g className="p-glow" style={{ opacity: 0, visibility: "hidden" }}>
                          <Piece ctx={ctx} o={o} w={a * 2} d={a * 2} h={LH} z={z} lit />
                        </g>
                      ) : null}
                      {/* glyph on the top face */}
                      {L.glyph && i === 0 ? (
                        <g opacity={skin.mode === "fill" ? 0.9 : 1}>
                          <FaceGlyph name={L.glyph} o={o} w={a * 2} d={a * 2} h={LH} z={z} size={62} face="top" ink={skin.mode === "fill" ? (isLit ? skin.faces.block.right : skin.faces.block.right) : skin.line} accent={ctx.accent} />
                        </g>
                      ) : null}
                    </g>
                  </g>
                  <line className="p-lead" x1={ox + a * 2 + 18} y1={ry} x2={labelX - 22} y2={ry} stroke={skin.mode === "fill" ? skin.faces.slab.right : skin.muted} strokeWidth={skin.mode === "fill" ? 2 : 1.4} />
                </g>
              );
            })}
        </Layer>
        {layers.map((L, i) => {
          const [, ry] = iso(a, -a, zOf(i) + LH / 2, { ox, oy });
          return (
            <Box key={i} x={labelX} y={ry - 40} w={labelW} h={80} className={`p-row ${i === lit ? "p-row-lit" : "p-row-dim"}`} style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div className="p-name" style={{ color: skin.ink, display: "flex", alignItems: "center", gap: 14 }}>
                {L.glyph ? <Glyph name={L.glyph} size={34} stroke="currentColor" accent={ctx.accent} strokeWidth={1.9} /> : null}
                <FitText text={L.label} maxWidth={labelW - (L.glyph ? 48 : 0)} maxLines={1} max={38} min={22} weight={600} lineHeight={1.1} />
              </div>
              {L.hint ? (
                <div style={{ marginTop: 6, marginLeft: L.glyph ? 48 : 0 }}>
                  <FitText text={L.hint} maxWidth={labelW - (L.glyph ? 48 : 0)} maxLines={1} max={23} min={15} weight={400} lineHeight={1.3} color={skin.sub} family={skin.mode === "line" ? skin.labelFamily : fontSans} />
                </div>
              ) : null}
            </Box>
          );
        })}
        {h.node}
      </Stage>
    );
  };
}

/* ------------------------------------------------------------------ metrics */

function makeMetrics(skin: IsoSkin): React.FC<MetricsProps> {
  return function IsoMetrics(props) {
    const ctx = useAccent(skin, props.accent);
    const metrics = within<MetricsProps["metrics"][number]>(props.metrics, 1, 4, () => ({ value: 0, label: "" }));
    const n = metrics.length;
    const tTitle = beatAt(props.beats, "title", 0.3);
    const tNum = beatAt(props.beats, "numbers", 0.8);
    const t = useSceneTime();
    const p = progressAt(t, tNum + 0.15, 1.7, "emcee.out");

    const scope = useGsapTimeline((tl, q) => {
      textIn(tl, q, tTitle);
      tl.from(q(".p-col"), { y: 24, autoAlpha: 0, duration: 0.7, ease: "emcee.out", stagger: 0.12 }, tNum);
      piecesIn(tl, q, skin, "p-pad", tNum - 0.1, 0.1);
      float(tl, q(".p-bar-0"), { at: tNum + 2.2, amp: 5, period: 3.6 });
    }, [key(props)]);

    const h = heading(ctx, { kicker: props.kicker, headline: props.headline, x: SAFE.x, y: SAFE.y + 10, w: 1300, max: 72, lines: 2 });
    const { centers, width: slotW } = slots(n, SAFE.x, DW - SAFE.x);
    const colW = Math.min(520, slotW - 60);
    const max = Math.max(...metrics.map((m) => Math.abs(m.value)), 0) || 1;
    const sameUnit = metrics.every((m) => (m.prefix ?? "") === (metrics[0].prefix ?? "") && (m.suffix ?? "") === (metrics[0].suffix ?? ""));
    const b = Math.min(64, slotW * 0.14);
    const baseY = 900;
    const numTop = 330;
    const numFit = Math.min(...metrics.map((m) => fitText(finalText(m), { maxWidth: colW, max: n > 3 ? 120 : 150, min: 56, weight: 600, letterSpacing: -0.03 }).fontSize));

    return (
      <Stage ref={scope} ground={skin.ground} backdrop={skin.backdrop} fontFamily={fontSans}>
        <Layer>
          {centers.map((cx, i) => {
            const m = metrics[i];
            // Bars compare only when the numbers share a unit; otherwise they are equal plinths.
            const full = sameUnit ? 40 + 170 * (Math.abs(m.value) / max) : 150;
            const hNow = Math.max(4, full * p);
            const o = { ox: cx, oy: baseY - 16 };
            const isLit = i === 0;
            return (
              <g key={i} className="p-pad">
                <Pedestal ctx={ctx} o={{ ox: cx, oy: baseY - 16 }} a={b * 1.5} t={16} />
                <g className={`p-bar-${i}`}>
                  <Piece ctx={ctx} o={o} w={b * 1.5} d={b * 1.5} h={hNow} lit={isLit} />
                </g>
              </g>
            );
          })}
        </Layer>
        {centers.map((cx, i) => {
          const m = metrics[i];
          return (
            <Box key={i} x={cx - colW / 2} y={numTop} w={colW} className="p-col" style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: numFit,
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                  lineHeight: 1,
                  color: i === 0 ? ctx.accent : skin.ink,
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                {countText(m, p)}
              </div>
              <div style={{ marginTop: 22 }}>
                <FitText text={S(m.label, skin.capsLabels)} maxWidth={colW} maxLines={2} max={skin.capsLabels ? 22 : 30} min={16} weight={skin.capsLabels ? 500 : 400} letterSpacing={skin.capsLabels ? 0.1 : 0} family={skin.capsLabels ? skin.labelFamily : fontSans} lineHeight={1.35} color={skin.sub} align="center" />
              </div>
            </Box>
          );
        })}
        {h.node}
      </Stage>
    );
  };
}

/* ------------------------------------------------------------------ endcard */

function makeEndcard(skin: IsoSkin): React.FC<EndcardProps> {
  return function IsoEndcard(props) {
    const ctx = useAccent(skin, props.accent);
    const tMark = beatAt(props.beats, "mark", 0.2);
    const tTitle = beatAt(props.beats, "title", 0.8);
    const scope = useGsapTimeline((tl, q) => {
      piecesIn(tl, q, skin, "p-base", tMark);
      piecesIn(tl, q, skin, "p-main", tMark + 0.25);
      tl.from(q(".p-img"), { y: -30, autoAlpha: 0, duration: 0.8, ease: "emcee.pop" }, tMark + 0.25);
      textIn(tl, q, tTitle);
      tl.from(q(".t-foot"), { autoAlpha: 0, duration: 0.8 }, tTitle + 0.7);
      float(tl, q(".f-main"), { at: tMark + 1.4, amp: 6, period: 3.6 });
    }, [key(props)]);

    const mark = props.mark ?? "film";
    const isFile = !hasGlyph(mark) && /\.[a-z0-9]+$/i.test(mark);
    const o = { ox: DW / 2, oy: 360 };
    const cube = { w: 132, d: 132, h: 140 };
    const h = heading(ctx, { headline: props.title, sub: props.tagline, x: 260, y: 540, w: DW - 520, max: 112, lines: 2, subMax: 34, align: "center" });
    return (
      <Stage ref={scope} ground={skin.ground} backdrop={skin.backdrop} fontFamily={fontSans}>
        <Layer>
          {isFile ? null : (
            <>
              <Pedestal ctx={ctx} o={o} a={118} t={24} className="p-base" />
              <g className="f-main">
                <g className="p-main">
                  <Piece ctx={ctx} o={o} {...cube} lit>
                    <FaceGlyph name={hasGlyph(mark) ? mark : "film"} o={o} {...cube} size={96} ink={skin.glyphOnLit} accent={litAccent(ctx)} />
                  </Piece>
                </g>
              </g>
            </>
          )}
        </Layer>
        {isFile ? (
          <Box x={DW / 2 - 140} y={170} w={280} h={280} className="p-img" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Img src={staticFile(mark)} style={{ maxWidth: 280, maxHeight: 280, objectFit: "contain" }} />
          </Box>
        ) : null}
        {h.node}
        {props.kicker ? (
          <Box x={0} y={DH - SAFE.y - 30} w={DW} className="t-foot" style={{ textAlign: "center" }}>
            <FitText text={S(props.kicker, skin.capsLabels)} maxWidth={DW} max={skin.capsLabels ? 20 : 24} min={14} weight={500} family={skin.capsLabels ? skin.labelFamily : fontSans} letterSpacing={skin.capsLabels ? 0.16 : 0.01} color={skin.muted} align="center" />
          </Box>
        ) : null}
      </Stage>
    );
  };
}

/* ------------------------------------------------------------------ */

export function makeIsoTemplates(skin: IsoSkin): { [K in TemplateId]: React.FC<TemplateProps[K]> } {
  return {
    hero: makeHero(skin),
    pipeline: makePipeline(skin),
    stack: makeStack(skin),
    metrics: makeMetrics(skin),
    endcard: makeEndcard(skin),
  };
}

export { fontMono };
