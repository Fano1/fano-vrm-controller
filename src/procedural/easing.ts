/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type { EasingFn } from "./procedural-type";

/**
 * Easing curves for gesture keyframe interpolation.
 *
 * Each maps a 0..1 progress to a 0..1 eased progress, with `f(0) === 0` and
 * `f(1) === 1` — the overshooting curves (`easeOutBack`, `easeOutElastic`)
 * leave that range in between on purpose, which is what makes a wave or a nod
 * read as motion rather than a slide.
 */

export const linear: EasingFn = (t) => t;

export const easeInQuad: EasingFn = (t) => t * t;

export const easeOutQuad: EasingFn = (t) => t * (2 - t);

export const easeInOutQuad: EasingFn = (t) =>
  t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;

export const easeInCubic: EasingFn = (t) => t * t * t;

export const easeOutCubic: EasingFn = (t) => 1 - (1 - t) ** 3;

export const easeInOutCubic: EasingFn = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** Overshoots past the target, then settles — good for a snappy gesture hit. */
export const easeOutBack: EasingFn = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/** Springy overshoot with a few decaying wobbles. */
export const easeOutElastic: EasingFn = (t) => {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

/** Smoothstep — the curve used to interpolate the noise lattice. */
export const smoothstep: EasingFn = (t) => t * t * (3 - 2 * t);

/** Every named curve, for looking one up by string. */
export const EASINGS = {
  linear,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeOutBack,
  easeOutElastic,
  smoothstep,
} as const satisfies Record<string, EasingFn>;

export type EasingName = keyof typeof EASINGS;

/** A curve, or the name of one — what gesture keyframes accept. */
export type EasingLike = EasingFn | EasingName;

/** Resolve an {@link EasingLike} to a function. Unknown names fall back to linear. */
export function resolveEasing(easing: EasingLike | undefined): EasingFn {
  if (typeof easing === "function") return easing;
  if (easing && easing in EASINGS) return EASINGS[easing];
  return linear;
}
