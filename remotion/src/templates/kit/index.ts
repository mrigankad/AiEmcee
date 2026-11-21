/**
 * The shared drawing kit for every style: the design space and layout, text
 * fitting, isometric geometry, count-up numbers and small motion helpers.
 * Styles import from here; nothing here knows about a particular style.
 */
export { Box, clamp, DH, DW, Layer, SAFE, slots, Stage, type StageProps, within } from "./layout";
export { cssFamily, FitText, type FitTextProps, fitText, fittedHeight, measure, type Fitted, type FitOptions } from "./text";
export { countText, finalText, formatNumber, type Metric } from "./format";
export {
  alpha,
  boxCorners,
  type BoxGeom,
  CentredBox,
  ContactShadow,
  darken,
  faceMatrix,
  type Faces,
  facesOf,
  IsoBox,
  type IsoBoxProps,
  IsoDiamond,
  iso,
  lighten,
  mix,
  type Origin,
  polyPath,
  polyPoints,
  type Pt,
  topCentre,
} from "./iso";
export { ease, float, progressAt, useSceneTime, useTween } from "./motion";
export { type IsoSkin, makeIsoTemplates } from "./iso-scenes";
