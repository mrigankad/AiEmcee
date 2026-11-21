/**
 * Isometric geometry, 2:1 (dimetric): one world unit along x or y is one
 * screen px across and half a px down; z is straight up, one px per unit.
 *
 *   screen x = ox + (x - y)
 *   screen y = oy + (x + y) / 2 - z
 *
 * The viewer looks from +x +y, so a box shows its top, its "left" face (the one
 * at y + d, running up-left from the front corner) and its "right" face (at
 * x + w, running up-right). Faces are flat colours, no outlines, in `fill`
 * mode; `line` mode draws the visible edges as one path (class `iso-edge` plus
 * `edgeClassName`) over faces filled with the ground, for blueprint drawings
 * that GSAP DrawSVG can draw on.
 *
 * `faceMatrix` maps flat 2D content (a glyph, a label) onto a face, so it sits
 * on the block instead of floating in front of it.
 */
import React from "react";

export type Faces = { top: string; left: string; right: string };
export type Pt = [number, number];
export type Origin = { ox: number; oy: number };

export const iso = (x: number, y: number, z: number, o: Origin = { ox: 0, oy: 0 }): Pt => [
  o.ox + (x - y),
  o.oy + (x + y) / 2 - z,
];

const pts = (list: Pt[]) => list.map(([a, b]) => `${a.toFixed(2)},${b.toFixed(2)}`).join(" ");
const path = (list: Pt[], close = false) =>
  list.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(2)} ${b.toFixed(2)}`).join(" ") + (close ? " Z" : "");

/* ------------------------------------------------------------------ colour */

const hex = (c: string): [number, number, number] => {
  const h = c.replace("#", "");
  const full = h.length === 3 ? h.split("").map((x) => x + x).join("") : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");

/** Mix colour a toward b by t (0..1). Hex colours only. */
export function mix(a: string, b: string, t: number): string {
  if (!/^#[0-9a-f]{3,8}$/i.test(a) || !/^#[0-9a-f]{3,8}$/i.test(b)) return a;
  const [r1, g1, b1] = hex(a);
  const [r2, g2, b2] = hex(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
export const darken = (c: string, t: number) => mix(c, "#000000", t);
export const lighten = (c: string, t: number) => mix(c, "#FFFFFF", t);
/** `c` at alpha a, as rgba(). */
export function alpha(c: string, a: number): string {
  if (!/^#[0-9a-f]{3,8}$/i.test(c)) return c;
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}

/** Three faces from one colour: the top is the colour, the sides step down in light. */
export const facesOf = (c: string, side = 0.14, shade = 0.26): Faces => ({ top: c, left: darken(c, side), right: darken(c, shade) });

/* ------------------------------------------------------------------ boxes */

export type BoxGeom = { x?: number; y?: number; z?: number; w: number; d: number; h: number };

/** Screen corners of a box: top face A (back) B (right) C (front) D (left); bottom B0 C0 D0. */
export function boxCorners({ x = 0, y = 0, z = 0, w, d, h }: BoxGeom, o?: Origin) {
  return {
    A: iso(x, y, z + h, o),
    B: iso(x + w, y, z + h, o),
    C: iso(x + w, y + d, z + h, o),
    D: iso(x, y + d, z + h, o),
    A0: iso(x, y, z, o),
    B0: iso(x + w, y, z, o),
    C0: iso(x + w, y + d, z, o),
    D0: iso(x, y + d, z, o),
  };
}

export type IsoBoxProps = BoxGeom &
  Origin & {
    faces: Faces;
    mode?: "fill" | "line";
    /** line mode: edge colour and width. */
    stroke?: string;
    strokeWidth?: number;
    edgeClassName?: string;
    className?: string;
    opacity?: number;
    /** Children are drawn after the faces, in the same group (glyphs on faces). */
    children?: React.ReactNode;
  };

/** A box by world position (x, y, z = its back-bottom corner) and size, drawn at origin (ox, oy). */
export function IsoBox({ ox, oy, x = 0, y = 0, z = 0, w, d, h, faces, mode = "fill", stroke, strokeWidth = 2, edgeClassName, className, opacity, children }: IsoBoxProps) {
  const c = boxCorners({ x, y, z, w, d, h }, { ox, oy });
  const top = [c.A, c.B, c.C, c.D];
  const left = [c.D, c.C, c.C0, c.D0];
  const right = [c.C, c.B, c.B0, c.C0];
  return (
    <g className={className} opacity={opacity}>
      <polygon points={pts(left)} fill={faces.left} />
      <polygon points={pts(right)} fill={faces.right} />
      <polygon points={pts(top)} fill={faces.top} />
      {mode === "line" ? (
        <path
          className={`iso-edge ${edgeClassName ?? ""}`}
          d={`${path([c.D, c.A, c.B, c.C, c.D, c.D0, c.C0, c.B0, c.B])} ${path([c.C, c.C0])}`}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : null}
      {children}
    </g>
  );
}

/** A box whose footprint is centred on world (0, 0) at origin (ox, oy): the usual way to place a piece. */
export function CentredBox(p: Omit<IsoBoxProps, "x" | "y">) {
  return <IsoBox {...p} x={-p.w / 2} y={-p.d / 2} />;
}

/** Screen point of the centre of a centred box's top face. */
export const topCentre = (o: Origin, h: number, z = 0): Pt => iso(0, 0, z + h, o);

/**
 * SVG `matrix(...)` that maps flat content onto a face of a box.
 * Content units are world units: on the top face x runs along the box's x and y
 * along its y, from the back corner; on the left face x runs along the box's x
 * and y down from the top edge; on the right face x runs from the front corner
 * toward the right one and y down from the top edge.
 */
export function faceMatrix(face: "top" | "left" | "right", { x = 0, y = 0, z = 0, w, d, h }: BoxGeom, o: Origin): string {
  if (face === "top") {
    const [e, f] = iso(x, y, z + h, o);
    return `matrix(1 0.5 -1 0.5 ${e.toFixed(2)} ${f.toFixed(2)})`;
  }
  if (face === "left") {
    const [e, f] = iso(x, y + d, z + h, o);
    return `matrix(1 0.5 0 1 ${e.toFixed(2)} ${f.toFixed(2)})`;
  }
  const [e, f] = iso(x + w, y + d, z + h, o);
  return `matrix(1 -0.5 0 1 ${e.toFixed(2)} ${f.toFixed(2)})`;
}

/** A soft elliptical contact shadow under a footprint of half-diagonal `r`, at screen (cx, cy). */
export function ContactShadow({ cx, cy, r, color = "#16181D", opacity = 0.08, className }: { cx: number; cy: number; r: number; color?: string; opacity?: number; className?: string }) {
  return (
    <g className={className}>
      <ellipse cx={cx} cy={cy} rx={r * 1.15} ry={r * 0.42} fill={color} opacity={opacity * 0.55} />
      <ellipse cx={cx} cy={cy} rx={r * 0.85} ry={r * 0.28} fill={color} opacity={opacity} />
    </g>
  );
}

/** A flat diamond on the ground (a tile outline or pad), half-size a, at origin. */
export function IsoDiamond({ ox, oy, a, z = 0, fill = "none", stroke, strokeWidth = 2, className, dash }: Origin & { a: number; z?: number; fill?: string; stroke?: string; strokeWidth?: number; className?: string; dash?: string }) {
  const o = { ox, oy };
  const corners = [iso(-a, -a, z, o), iso(a, -a, z, o), iso(a, a, z, o), iso(-a, a, z, o)];
  return <path className={className} d={path(corners, true)} fill={fill} stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} strokeLinejoin="round" />;
}

export { path as polyPath, pts as polyPoints };
