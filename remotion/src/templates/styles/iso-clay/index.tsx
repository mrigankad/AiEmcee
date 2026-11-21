/**
 * Isometric · Clay light.
 *
 * Soft 2:1 blocks with no outlines on a pale ground, one hot accent. Faces are
 * three flat tones (top lightest), shadows are soft contact ellipses, pieces
 * pop in on a spring and then float. The geometry is shared with
 * iso-blueprint (kit/iso-scenes.tsx); this file is the look.
 */
import React from "react";
import { AbsoluteFill } from "remotion";

import { fontSans } from "../../../fonts";
import { facesOf, mix } from "../../kit/iso";
import { type IsoSkin, makeIsoTemplates } from "../../kit/iso-scenes";
import type { StyleDef } from "../../types";

const GROUND = "#F7F7F8";
const INK = "#16181D";
const ACCENT = "#C9480A";

/** A barely-there floor light, so the pale ground has depth without a gradient you notice. */
const Backdrop = () => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse 70% 60% at 62% 58%, #FFFFFF 0%, rgba(255,255,255,0) 70%), linear-gradient(180deg, ${GROUND} 0%, #F1F1F3 100%)`,
    }}
  />
);

export const skin: IsoSkin = {
  mode: "fill",
  ground: GROUND,
  backdrop: <Backdrop />,
  ink: INK,
  sub: "#5E6370",
  muted: "#A3A7B1",
  accent: ACCENT,
  labelFamily: fontSans,
  capsLabels: false,
  faces: {
    block: { top: "#FFFFFF", left: "#E8E9ED", right: "#D3D6DC" },
    slab: { top: "#EEEFF2", left: "#DDDEE3", right: "#CBCDD4" },
    // A touch of warmth on the top face keeps a saturated accent from going flat.
    lit: (a) => {
      const f = facesOf(a, 0.15, 0.27);
      return { ...f, top: mix(a, "#FFFFFF", 0.06) };
    },
  },
  glyphInk: "#8D93A0",
  glyphOnLit: "#FFFFFF",
  line: INK,
  shadow: INK,
};

export const style: StyleDef = {
  id: "iso-clay",
  label: "Isometric · Clay light",
  description: "Soft 2:1 blocks with no outlines and one hot accent; pieces pop on a spring and float.",
  bestFor: "systems, plants, flows",
  tone: "light",
  swatch: [GROUND, INK, ACCENT],
  templates: makeIsoTemplates(skin),
};

export default style;
