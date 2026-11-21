/**
 * The template contract. A *style* (isometric clay, blueprint, Swiss type, ...)
 * draws the same five *scene templates*, with the same props, so switching a
 * film's style re-skins it without rewriting it.
 *
 * Sequence entries pick one:
 *   { id: "03-survey", from: "motion", template: "pipeline", style: "iso-clay", props: { ... } }
 * or a board (projects/<film>/boards.json) does the same; see docs/15-styles-and-boards.md.
 *
 * Every template gets `TemplateBase` too. Times are seconds into the scene.
 */
import type React from "react";

export type TemplateId = "hero" | "pipeline" | "stack" | "metrics" | "endcard";
export const TEMPLATE_IDS: TemplateId[] = ["hero", "pipeline", "stack", "metrics", "endcard"];

/** A glyph name from Emcee Glyphs (assets/glyphs/emcee-glyphs.json), e.g. "secure". */
export type GlyphName = string;

export type TemplateBase = {
  /** Named beats in seconds, e.g. { title: 0.4, steps: 2.1 }. Each template documents its names. */
  beats?: Record<string, number>;
  /** Overrides the style's accent colour (the film's brand). */
  accent?: string;
};

export type HeroProps = TemplateBase & {
  kicker?: string;
  headline: string;
  sub?: string;
  glyph?: GlyphName;
};

export type PipelineProps = TemplateBase & {
  kicker?: string;
  headline?: string;
  /** 3 to 6 steps. */
  steps: { label: string; hint?: string; glyph?: GlyphName }[];
};

export type StackProps = TemplateBase & {
  kicker?: string;
  headline?: string;
  /** 2 to 5 layers, top first. */
  layers: { label: string; hint?: string; glyph?: GlyphName }[];
  /** Index of the layer to light up (default 0, the top). */
  highlight?: number;
};

export type MetricsProps = TemplateBase & {
  kicker?: string;
  headline?: string;
  /** 1 to 4 numbers; they count up from 0. */
  metrics: { value: number; prefix?: string; suffix?: string; decimals?: number; label: string }[];
};

export type EndcardProps = TemplateBase & {
  title: string;
  kicker?: string;
  tagline?: string;
  /** A file in the film's public folder (e.g. "mark.svg"), or a glyph name. */
  mark?: string;
};

export type TemplateProps = {
  hero: HeroProps;
  pipeline: PipelineProps;
  stack: StackProps;
  metrics: MetricsProps;
  endcard: EndcardProps;
};

export type StyleDef = {
  /** kebab-case, e.g. "iso-clay". */
  id: string;
  /** Shown in the dropdown, e.g. "Isometric · Clay light". */
  label: string;
  /** One sentence. */
  description: string;
  /** e.g. "systems, plants, flows". */
  bestFor: string;
  /** Light or dark ground: the studio uses it for thumbnails and text colour. */
  tone: "light" | "dark";
  /** Swatches for the picker: [ground, ink, accent]. */
  swatch: [string, string, string];
  templates: { [K in TemplateId]: React.FC<TemplateProps[K]> };
};
// Label, description, swatch and example props per template live in catalog.json
// (read by the studio server and the web app too); a StyleDef must match its entry there.
