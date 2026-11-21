/**
 * Isometric · Blueprint.
 *
 * The iso-clay geometry drawn as a technical drawing: navy grid paper, pale
 * line work, one yellow accent for what matters. Every edge and glyph stroke
 * draws itself on (DrawSVG on the film clock); labels and captions are mono.
 * Faces are filled with the paper colour, so hidden edges stay hidden, and a
 * lit piece takes a faint yellow wash.
 */
import React from "react";
import { AbsoluteFill } from "remotion";

import { fontMono } from "../../../fonts";
import { type IsoSkin, makeIsoTemplates } from "../../kit/iso-scenes";
import type { StyleDef } from "../../types";

const PAPER = "#0E2A47";
const LINE = "#DCEBFF";
const ACCENT = "#FFC857";

/** Grid paper: a fine 30 px grid, a 150 px major grid, and a soft vignette. */
const Backdrop = () => (
  <AbsoluteFill
    style={{
      backgroundColor: PAPER,
      backgroundImage: [
        "radial-gradient(ellipse 85% 75% at 50% 50%, rgba(14,42,71,0) 55%, rgba(6,22,40,0.55) 100%)",
        "linear-gradient(rgba(220,235,255,0.11) 1px, transparent 1px)",
        "linear-gradient(90deg, rgba(220,235,255,0.11) 1px, transparent 1px)",
        "linear-gradient(rgba(220,235,255,0.045) 1px, transparent 1px)",
        "linear-gradient(90deg, rgba(220,235,255,0.045) 1px, transparent 1px)",
      ].join(", "),
      backgroundSize: "100% 100%, 150px 150px, 150px 150px, 30px 30px, 30px 30px",
      backgroundPosition: "0 0, -1px -1px, -1px -1px, -1px -1px, -1px -1px",
    }}
  />
);

export const skin: IsoSkin = {
  mode: "line",
  ground: PAPER,
  backdrop: <Backdrop />,
  ink: "#F2F7FF",
  sub: "#9FB8D6",
  muted: "#7F9CC0",
  accent: ACCENT,
  labelFamily: fontMono,
  capsLabels: true,
  faces: {
    block: { top: PAPER, left: PAPER, right: PAPER },
    slab: { top: PAPER, left: PAPER, right: PAPER },
    lit: () => ({ top: PAPER, left: PAPER, right: PAPER }),
  },
  glyphInk: LINE,
  glyphOnLit: LINE,
  line: LINE,
  shadow: "#000000",
};

export const style: StyleDef = {
  id: "iso-blueprint",
  label: "Isometric · Blueprint",
  description: "The same isometric geometry drawn as lines on a grid; strokes draw themselves on.",
  bestFor: "architecture, infrastructure",
  tone: "dark",
  swatch: [PAPER, LINE, ACCENT],
  templates: makeIsoTemplates(skin),
};

export default style;
