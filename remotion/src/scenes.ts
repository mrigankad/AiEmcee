/**
 * The copy for every motion scene, and the registry the Film looks scenes up in.
 *
 * Root.tsx registers these for the studio; the Film renders them inline at the
 * length of their narration slot, so there is no duration to keep in sync here.
 * The `at` frames inside a scene are still hand-placed against its line: when
 * you rewrite the narration, re-time them (play the MP3, note where each claim
 * is spoken, multiply by fps).
 */
import type React from "react";

import { EndCard, type EndCardProps } from "./compositions/EndCard";
import { Pipeline, type PipelineProps } from "./compositions/Pipeline";
import { Problem, type ProblemProps } from "./compositions/Problem";
import { sec } from "./theme";

export const problemProps = {
  eyebrow: "The cost today",
  headline: ["The record exists.", "It just cannot be followed."],
  highlight: ["followed."],
  beats: [
    {
      at: sec(0.3),
      kicker: "Scattered",
      title: "It lives in spreadsheets",
      body: "Flash data in one workbook, inspection reports in another, serials on paper at the gate.",
      visual: "sheet",
    },
    {
      at: sec(4.4),
      kicker: "Nothing joins up",
      title: "Two modules, same serial",
      body: "The factory flash-test and the panel on the table are separate records that never meet.",
      visual: "split",
    },
    {
      at: sec(8.4),
      kicker: "Three years in",
      title: "Nobody can prove it",
      body: "A string underperforms, and its history cannot be rebuilt from what was kept.",
      visual: "void",
    },
  ],
} satisfies ProblemProps;

export const pipelineProps = {
  eyebrow: "One chain of custody",
  headline: ["From the factory line", "to the row it stands in."],
  highlight: ["row"],
  steps: [
    { id: "01", label: "Upload", hint: "Flash and EL data", icon: "upload" },
    { id: "02", label: "Verify", hint: "PDI against the file", icon: "verify" },
    { id: "03", label: "Inspect", hint: "Every stage, on spec", icon: "inspect" },
    { id: "04", label: "Ship", hint: "Pallet and container", icon: "ship" },
    { id: "05", label: "Scan", hint: "Panel into position", icon: "scan" },
    { id: "06", label: "Reconcile", hint: "Against the plan", icon: "reconcile" },
  ],
  payoff: {
    labelBefore: "Untraced",
    labelAfter: "Resolved",
    before: "serial ?   pallet ?   row ?",
    after: "WS09249038922215   18242226671   9-T/23 Panel 11",
  },
  plate: {
    kicker: "Module record",
    fields: [
      { label: "Serial", pending: "—", value: "WS09249038922215", at: 0 },
      { label: "Pallet", pending: "—", value: "18242226671", at: 3 },
      { label: "Position", pending: "—", value: "9-T/23 Panel 11", at: 4 },
    ],
  },
} satisfies PipelineProps;

export const endCardProps = {
  mark: "mark.svg",
  title: "RE-DOMS",
  kicker: "Solar module chain of custody",
  tagline: "Every module, on the record.",
} satisfies EndCardProps;

type Entry = { component: React.FC<any>; props: object };

/** Composition id (as named in video.config.mjs) -> component + copy. */
export const MOTION: Record<string, Entry> = {
  Problem: { component: Problem, props: problemProps },
  Pipeline: { component: Pipeline, props: pipelineProps },
  EndCard: { component: EndCard, props: endCardProps },
};
