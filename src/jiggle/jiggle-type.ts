/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type { VRMHumanBoneName } from "@pixiv/three-vrm";

/**
 * What a jiggle attaches to: a humanoid bone name, or the **name of any other
 * node** in the model (a bust bone, a tail, a ribbon — whatever the artist put in
 * the skeleton). A humanoid name the model lacks, or a node name that doesn't
 * exist, is simply not found; nothing throws.
 */
export type JiggleTarget = VRMHumanBoneName | (string & {});

/** A direction or velocity. Missing components are 0. */
export interface Vec3Like {
  x?: number;
  y?: number;
  z?: number;
}

/**
 * How one bone jiggles.
 *
 * The model is a **soft mass on a lever** hanging off the bone: when the bone's
 * lever point accelerates, the mass lags behind on a damped spring, and the bone
 * leans toward wherever the mass has gone. Everything is a physical quantity you
 * can reason about — metres, hertz, degrees.
 */
export interface JiggleBoneOptions {
  /**
   * Natural frequency of the spring, in hertz — how fast it wobbles. Low is a
   * slow, heavy sway; high is a tight shiver. Default 3.
   */
  hz?: number;

  /**
   * Damping ratio. `0` never settles, `~0.15–0.3` rings for a few cycles (the
   * jiggle look), `1` returns without overshoot. Default 0.2.
   */
  damping?: number;

  /**
   * How strongly the bone's motion drives the mass. `1` is the full physical
   * response, which is a lot for soft tissue — the defaults sit well below it.
   * Scales the whole effect without changing its character. Default 0.5.
   */
  gain?: number;

  /**
   * Distance from the bone to the soft mass, in **metres**. A longer lever turns
   * the same displacement into a smaller angle. Default 0.15.
   */
  length?: number;

  /**
   * Which way the mass hangs from the bone, in the bone's own frame, authored in
   * the **VRM 1.0 convention** (+Z forward, +Y up) like every other animator in
   * the package. Default straight up the bone `{ y: 1 }`.
   *
   * Tilting it matters: motion *along* the lever can't bend the bone, so a
   * chest lever pointing up-and-forward `{ y: 0.7, z: 0.7 }` turns a vertical
   * bounce into a visible nod.
   *
   * For a node that isn't a humanoid bone there is no convention to convert: the
   * lever is in that node's own frame, and the default is the direction toward
   * its first child — the bone's own axis — with `length` defaulting to that
   * child's distance.
   */
  lever?: Vec3Like;

  /**
   * The most the bone is ever allowed to lean, in **degrees**. A hard ceiling —
   * a landing from a jump can't fold the model in half. Default 8.
   */
  maxAngle?: number;
}

/**
 * {@link JiggleBoneOptions} with every default filled in — what a jiggling bone
 * is actually running with, including a lever resolved from a preset or from the
 * node's own axis.
 */
export interface ResolvedJiggleBone {
  hz: number;
  damping: number;
  gain: number;
  length: number;
  maxAngle: number;
  lever: { x: number; y: number; z: number };
}

/** A named region of the body: a set of humanoid bones that jiggle together. */
export type JiggleZone = "chest" | "torso" | "hips" | "head" | "shoulders" | "thighs";

export interface JiggleOptions {
  /**
   * Regions to enable with their tuned defaults. Bones the model lacks are
   * skipped. Default `["chest", "hips"]`.
   */
  zones?: JiggleZone[];

  /**
   * Per-target overrides and additions, applied after `zones`. A value is the
   * options for that target; `true` enables it with defaults; `false` removes
   * it (use that to drop one bone of a zone).
   */
  bones?: Partial<Record<JiggleTarget, JiggleBoneOptions | boolean>>;

  /** Global multiplier on every bone's `gain`. Default 1. */
  intensity?: number;

  /**
   * Constant background wobble in **m/s²** — a seeded, deterministic drift that
   * keeps a standing model faintly alive. Default 0: with no motion there is no
   * jiggle, which is what a physics model should do.
   */
  ambient?: number;

  /**
   * Seconds over which measured acceleration is smoothed before it drives the
   * spring. Acceleration is a second derivative of position, so it amplifies
   * frame-timing noise; a little smoothing keeps that out. Default 0.03.
   */
  smoothing?: number;
}
