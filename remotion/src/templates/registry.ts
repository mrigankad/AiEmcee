/**
 * The style registry: every style the film can draw, by id.
 *
 * The ids, labels and swatches must match catalog.json (the studio and the
 * web app read the catalog; the film reads this). scripts/templates.test.mjs
 * checks that they agree and that every template renders.
 *
 * Style resolution (docs/15-styles-and-boards.md): entry style -> board style
 * -> boards.json style -> config style -> catalog.defaultStyle. The timeline
 * writer resolves it; `resolveStyle` is the same rule for anything that only
 * holds the candidates.
 */
import type React from "react";

import catalog from "./catalog.json";
import { style as darkCinematic } from "./styles/dark-cinematic/index";
import { style as glass } from "./styles/glass/index";
import { style as handDrawn } from "./styles/hand-drawn/index";
import { style as isoBlueprint } from "./styles/iso-blueprint/index";
import { style as isoClay } from "./styles/iso-clay/index";
import { style as swiss } from "./styles/swiss/index";
import { type StyleDef, TEMPLATE_IDS, type TemplateId, type TemplateProps } from "./types";

export const STYLE_LIST: StyleDef[] = [isoClay, isoBlueprint, swiss, glass, handDrawn, darkCinematic];

export const STYLES: Record<string, StyleDef> = Object.fromEntries(STYLE_LIST.map((s) => [s.id, s]));

export const DEFAULT_STYLE: string = catalog.defaultStyle;

export const isStyle = (id: unknown): id is string => typeof id === "string" && id in STYLES;
export const isTemplate = (id: unknown): id is TemplateId => typeof id === "string" && (TEMPLATE_IDS as string[]).includes(id);

/** The first known style id among the candidates, in order; else the catalog default. */
export function resolveStyle(...candidates: (string | null | undefined)[]): string {
  return candidates.find(isStyle) ?? DEFAULT_STYLE;
}

/** The style, falling back to the default style for an unknown id. */
export function getStyle(id?: string | null): StyleDef {
  return STYLES[resolveStyle(id)];
}

/** The template component for a style; throws on an unknown template id. */
export function getTemplate<K extends TemplateId>(styleId: string | null | undefined, templateId: K): React.FC<TemplateProps[K]> {
  if (!isTemplate(templateId)) throw new Error(`unknown template "${templateId}" — one of: ${TEMPLATE_IDS.join(", ")}`);
  return getStyle(styleId).templates[templateId] as React.FC<TemplateProps[K]>;
}

/** Example props for a template, from catalog.json. */
export function exampleProps<K extends TemplateId>(templateId: K): TemplateProps[K] {
  const t = catalog.templates.find((x) => x.id === templateId);
  return (t?.example ?? {}) as unknown as TemplateProps[K];
}

export { catalog, TEMPLATE_IDS };
