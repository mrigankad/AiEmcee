/**
 * The active tone, available to every primitive without prop drilling.
 *
 * Standalone renders of a composition (studio, `npm run motion`) get the
 * polished preset. Inside the Film, the timeline's tone is provided instead,
 * so a motion scene springs the same way the footage around it moves.
 */
import React, { createContext, useContext } from "react";

import tones from "./tones.json";
import type { Tone } from "./types";

const { $comment: _comment, ...presets } = tones;

export const DEFAULT_TONE: Tone = { name: "polished", ...presets.polished } as Tone;

const ToneContext = createContext<Tone>(DEFAULT_TONE);

export const ToneProvider = ({ tone, children }: { tone: Tone; children: React.ReactNode }) => (
  <ToneContext.Provider value={tone}>{children}</ToneContext.Provider>
);

export const useTone = () => useContext(ToneContext);
