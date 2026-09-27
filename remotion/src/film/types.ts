/**
 * The shape of work/timeline.json, written by scripts/lib/timeline.mjs.
 * All times are in seconds; the Film converts to frames at the last moment.
 */
export type TransitionType = "cut" | "fade" | "dip" | "zoom" | "push" | "wipe";

export type Transition = { type: TransitionType; duration: number };

export type SpringConfig = { damping: number; mass: number; stiffness: number };

export type Tone = {
  name: string;
  about: string;
  transition: Transition;
  spring: SpringConfig;
  /** How far product footage drifts in over a scene, as a fraction of scale. 0 = locked. */
  push: number;
  focus: { zoomMax: number; dim: number; ease: number };
  grade: { contrast: number; saturate: number; vignette: number };
  lowerThird: { hold: number };
};

/**
 * A directed moment inside a piece of footage: the camera eases in on `box`,
 * the rest of the frame dims, and an optional label names what is shown.
 * `at` / `until` are seconds into the footage itself.
 */
export type Focus = {
  at: number;
  until: number;
  /** [x, y, w, h] as fractions of the frame. */
  box: [number, number, number, number];
  label?: string;
  /** Override the computed zoom. 1 = no zoom, just the spotlight. */
  zoom?: number;
  spotlight?: boolean;
};

export type AvatarMode = "host" | "corner" | "off";
export type AvatarMood = "neutral" | "happy" | "curious" | "focused";

export type AvatarCue = {
  id: string;
  start: number;
  end: number;
  text: string;
  words: { w: string; start: number; end: number }[];
};

export type AvatarTrack = {
  /** Diameter of the corner presenter, px. */
  size: number;
  captions: boolean;
  /** Voice level per film frame, 0..1. */
  envelope: number[];
  cues: AvatarCue[];
};

export type LowerThirdCue = { kicker: string; title: string; at: number; hold: number };

type SegmentBase = {
  id: string;
  start: number;
  slot: number;
  /** Seconds before `start` the scene is already on screen, under the transition. */
  lead: number;
  transition: Transition;
  look: "push" | "lock";
  focus: Focus[];
  lowerThird?: LowerThirdCue | null;
  avatar: { mode: AvatarMode; mood: AvatarMood };
};

export type VideoSegment = SegmentBase & { kind: "video"; src: string; srcDuration: number };
export type MotionSegment = SegmentBase & { kind: "motion"; composition: string };
export type Segment = VideoSegment | MotionSegment;

export type Timeline = {
  version: 1;
  fps: number;
  width: number;
  height: number;
  total: number;
  fadeIn: number;
  fadeOut: number;
  tone: Tone;
  segments: Segment[];
  avatar: AvatarTrack | null;
};
