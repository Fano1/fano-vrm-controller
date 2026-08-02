/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import * as THREE from "three";
import { combineAnimators, createAnimator, createChannelAnimator } from "../animator";
import { channel } from "../channels";
import { noise, sine } from "../signals";
import type { Animator, Channel } from "../procedural-type";

/**
 * Resolve a `false | true | Options` field to fully-defaulted options, or null
 * if that part of the idle is switched off.
 */
function resolveSection<T extends object>(
  value: boolean | Partial<T> | undefined,
  defaults: T,
  enabledByDefault: boolean,
): T | null {
  if (value === false) return null;
  if (value === undefined) return enabledByDefault ? defaults : null;
  if (value === true) return defaults;
  return { ...defaults, ...value };
}

export interface BreathingOptions {
  /** Breaths per second. Default 0.25 (one every four seconds — resting rate). */
  hz?: number;
  /** Peak chest rotation, degrees. Default 2.2. */
  amp?: number;
  /** How much of `amp` the spine carries. Default 0.35. */
  spineRatio?: number;
  /**
   * How much of `amp` the head counter-rotates by, to keep the gaze level as
   * the chest rises. Default 0.5. Set 0 to let the head ride the chest.
   */
  headCounterRatio?: number;
}

export interface SwayOptions {
  /** Weight-shift cycles per second. Default 0.11 (one every ~9s). */
  hz?: number;
  /** Peak hip roll, degrees. Default 1.6. */
  amp?: number;
  /** How much of `amp` the spine counter-rotates by. Default 0.5. */
  spineCounterRatio?: number;
  /**
   * Hip yaw amplitude as a fraction of `amp`, run at an unrelated rate so the
   * two never line up into an obvious loop. Default 0.7.
   */
  yawRatio?: number;
}

export interface IdleNoiseOptions {
  /** How fast the wander evolves. Default 0.22. */
  hz?: number;
  /** Peak head deflection, degrees. Default 0.8. */
  amp?: number;
  /** Seed for the noise. Same seed ⇒ same wander. Default 1. */
  seed?: number;
  /** Shoulder deflection as a fraction of `amp`. Default 0.5. */
  shoulderRatio?: number;
}

export interface BobOptions {
  /** Bob cycles per second. Default 0.25 (matched to a resting breath). */
  hz?: number;
  /** Peak vertical hip travel, **metres**. Default 0.006. */
  amp?: number;
}

export interface IdleOptions {
  /** Chest/spine breathing. On by default. */
  breathing?: boolean | BreathingOptions;
  /** Slow hip weight-shift. On by default. */
  sway?: boolean | SwayOptions;
  /** Seeded micro-wander on head and shoulders. On by default. */
  noise?: boolean | IdleNoiseOptions;
  /**
   * Vertical hip bob. **Off by default** — translating the hips lifts the feet
   * off the floor, which reads as floating on models whose legs aren't
   * IK-corrected. Enable it if your scene can absorb that.
   */
  bob?: boolean | BobOptions;
}

const BREATHING_DEFAULTS: Required<BreathingOptions> = {
  hz: 0.25,
  amp: 2.2,
  spineRatio: 0.35,
  headCounterRatio: 0.5,
};

const SWAY_DEFAULTS: Required<SwayOptions> = {
  hz: 0.11,
  amp: 1.6,
  spineCounterRatio: 0.5,
  yawRatio: 0.7,
};

const NOISE_DEFAULTS: Required<IdleNoiseOptions> = {
  hz: 0.22,
  amp: 0.8,
  seed: 1,
  shoulderRatio: 0.5,
};

const BOB_DEFAULTS: Required<BobOptions> = {
  hz: 0.25,
  amp: 0.006,
};

/**
 * The "alive idle" — the layer that keeps a model from looking like a
 * mannequin between gestures.
 *
 * Three independent motions at deliberately unrelated rates (a 4s breath, a
 * ~9s weight shift, an aperiodic noise wander) so the loop never becomes
 * visible. Every amplitude defaults to *subtle*; these are degrees, and 2°
 * of chest rotation is already clearly readable on a humanoid.
 *
 * ```ts
 * const idle = createIdleAnimator();                       // sensible defaults
 * const calm = createIdleAnimator({ breathing: { hz: 0.2, amp: 1.5 }, noise: false });
 * ```
 *
 * Bones the model lacks are simply never reached — `upperChest` and
 * `leftShoulder`/`rightShoulder` are optional in the VRM spec, and writing to
 * an absent bone is a no-op rather than an error.
 */
export function createIdleAnimator(options: IdleOptions = {}): Animator {
  const breathing = resolveSection<Required<BreathingOptions>>(
    options.breathing,
    BREATHING_DEFAULTS,
    true,
  );
  const sway = resolveSection<Required<SwayOptions>>(
    options.sway,
    SWAY_DEFAULTS,
    true,
  );
  const wander = resolveSection<Required<IdleNoiseOptions>>(
    options.noise,
    NOISE_DEFAULTS,
    true,
  );
  const bob = resolveSection<Required<BobOptions>>(
    options.bob,
    BOB_DEFAULTS,
    false,
  );

  const channels: Channel[] = [];

  if (breathing) {
    const { hz, amp, spineRatio, headCounterRatio } = breathing;

    channels.push(
      channel("chest", "x", sine({ hz, amp })),
      channel("spine", "x", sine({ hz, amp: amp * spineRatio })),
    );

    if (headCounterRatio > 0) {
      // Counter-rotate so the head stays level while the ribcage rises —
      // rotations are hierarchical, so the head inherits chest + spine.
      channels.push(
        channel("head", "x", sine({ hz, amp: -amp * headCounterRatio })),
      );
    }
  }

  if (sway) {
    const { hz, amp, spineCounterRatio, yawRatio } = sway;

    channels.push(
      channel("hips", "z", sine({ hz, amp })),
      channel("spine", "z", sine({ hz, amp: -amp * spineCounterRatio })),
    );

    if (yawRatio > 0) {
      // An irrational-ish rate ratio keeps roll and yaw from re-syncing into
      // a short, obvious loop.
      channels.push(
        channel("hips", "y", sine({ hz: hz / 1.618, amp: amp * yawRatio })),
      );
    }
  }

  if (wander) {
    const { hz, amp, seed, shoulderRatio } = wander;

    // Distinct seeds per channel — sharing one would move every joint in
    // lockstep, which reads as a glitch rather than as life.
    channels.push(
      channel("head", "y", noise({ hz, amp, seed })),
      channel("head", "z", noise({ hz, amp: amp * 0.6, seed: seed + 1 })),
      channel("neck", "x", noise({ hz, amp: amp * 0.5, seed: seed + 2 })),
    );

    if (shoulderRatio > 0) {
      channels.push(
        channel("leftShoulder", "z", noise({ hz: hz * 0.8, amp: amp * shoulderRatio, seed: seed + 3 })),
        channel("rightShoulder", "z", noise({ hz: hz * 0.8, amp: amp * shoulderRatio, seed: seed + 4 })),
      );
    }
  }

  const animators: Animator[] = [createChannelAnimator(channels)];

  if (bob) {
    const { hz, amp } = bob;
    const wave = sine({ hz, amp });
    const offset = new THREE.Vector3();

    animators.push(
      createAnimator(({ time, delta, sink }) => {
        offset.set(0, wave(time, delta), 0);
        sink.setBonePosition("hips", offset);
      }),
    );
  }

  return combineAnimators(...animators);
}
