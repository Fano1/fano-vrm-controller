/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type * as THREE from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { PartialEulerDegrees } from "../body/body-type";

/**
 * A scalar value sampled once per frame — the atom every procedural behavior
 * is built from.
 *
 * Called with the animator's accumulated `time` and the frame `delta`, both in
 * seconds. Most signals are pure functions of `time` (a sine wave), which is
 * what makes {@link bakeAnimator} reproducible. Signals that carry state
 * across frames (a spring chasing a moving target) additionally implement
 * {@link Signal.reset} so the baker can rewind them to a known start.
 */
export interface Signal {
  (time: number, delta: number): number;

  /** Rewind any internal state. Stateless signals omit this. */
  reset?(): void;
}

/** A {@link Signal}, or a plain number for a constant. */
export type SignalLike = Signal | number;

/** The axis of a bone's local rotation a {@link Channel} drives. */
export type EulerAxis = "x" | "y" | "z";

/** Normalized easing curve: maps a 0..1 progress to a 0..1 eased progress. */
export type EasingFn = (t: number) => number;

/**
 * Where an {@link Animator} writes its pose.
 *
 * Animators never touch a `VRMBody` (or a `VRM`) directly — they write here,
 * which is what lets the exact same animator drive the live model
 * (`createBodySink`) or be sampled offline into an `AnimationClip`
 * (`createRecordingSink`, used by {@link bakeAnimator}).
 *
 * Both writes are expressed **relative to the normalized rig's rest pose**:
 * rotations are absolute local rotations (rest is identity by construction, so
 * an absolute rotation *is* the offset from rest) and positions are offsets in
 * metres added to the bone's rest position. A layer that writes nothing for a
 * bone this frame is treated as contributing no rotation, not as "hold".
 */
export interface PoseSink {
  /** Contribute a local rotation for `name`. */
  setBoneRotation(name: VRMHumanBoneName, rotation: THREE.Quaternion): void;

  /** Contribute a positional offset from rest for `name` (metres). */
  setBonePosition(name: VRMHumanBoneName, offset: THREE.Vector3): void;
}

/** Everything an {@link Animator} is handed each frame. */
export interface AnimatorContext {
  /** Seconds since the previous frame. */
  delta: number;

  /** Seconds accumulated since the animator started (or was last reset). */
  time: number;

  /** Where to write the pose. */
  sink: PoseSink;

  /**
   * The model being driven — **read-only**. Present so scene-dependent
   * behaviors (look-at needs world positions) can query it; writing to it
   * directly bypasses layering and baking, so don't.
   */
  vrm: VRM;
}

/**
 * A per-frame source of pose. The whole procedural system is built out of
 * these — {@link createAnimator} wraps a bare function into one,
 * {@link createChannelAnimator} builds one from {@link Channel}s, and the
 * ready-made behaviors (idle / look-at / gesture) are just animators too.
 */
export interface Animator {
  update(context: AnimatorContext): void;

  /** Rewind internal state (signal phase, gesture playhead, springs). */
  reset?(): void;
}

/** One {@link Signal} bound to one axis of one bone's rotation, in degrees. */
export interface Channel {
  bone: VRMHumanBoneName;
  axis: EulerAxis;
  /** Sampled every frame; the result is read as **degrees**. */
  signal: Signal;
}

/**
 * A bone pose expressed in degrees — the authoring format for gesture
 * keyframes. Axes left out of a bone's entry are treated as 0 (rest).
 */
export type PoseDegrees = Partial<Record<VRMHumanBoneName, PartialEulerDegrees>>;
