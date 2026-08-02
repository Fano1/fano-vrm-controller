/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import * as THREE from "three";
import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { eulerDegreesToQuaternion } from "../body/body-utils";
import type { EulerDegrees, EulerOrder } from "../body/body-type";
import type { Channel, EulerAxis, PoseSink, SignalLike } from "./procedural-type";
import { toSignal } from "./signals";

/**
 * Bind a signal to one axis of one bone's rotation, in **degrees**.
 *
 * ```ts
 * channel("spine", "x", sine({ hz: 0.25, amp: 3 })) // breathe ±3° at 0.25 Hz
 * channel("head", "y", 15)                           // constant 15° turn
 * ```
 */
export function channel(
  bone: VRMHumanBoneName,
  axis: EulerAxis,
  signal: SignalLike,
): Channel {
  return { bone, axis, signal: toSignal(signal) };
}

/**
 * Bind several axes of one bone at once.
 *
 * ```ts
 * channels("head", { x: noise({ seed: 1 }), y: noise({ seed: 2 }) })
 * ```
 */
export function channels(
  bone: VRMHumanBoneName,
  axes: Partial<Record<EulerAxis, SignalLike>>,
): Channel[] {
  return (Object.keys(axes) as EulerAxis[])
    .filter((axis) => axes[axis] !== undefined)
    .map((axis) => channel(bone, axis, axes[axis]!));
}

/**
 * Sums per-axis degree contributions for one bone and converts them to a
 * quaternion exactly once.
 *
 * Summing in degree space is the right call *within* a layer: two channels on
 * the same axis are intentionally blending the same conceptual motion (a
 * breath plus a sway on `spine.x`), and one conversion at the end avoids the
 * decompose → merge → recompose round-trip that would expose gimbal lock.
 * Composition *across* layers is a quaternion multiply instead — see
 * {@link PoseAccumulator}.
 */
export class EulerAccumulator {
  private readonly degrees: EulerDegrees = { x: 0, y: 0, z: 0 };

  add(axis: EulerAxis, value: number): void {
    this.degrees[axis] += value;
  }

  clear(): void {
    this.degrees.x = 0;
    this.degrees.y = 0;
    this.degrees.z = 0;
  }

  /** The summed degrees so far (live reference — don't retain it). */
  get value(): Readonly<EulerDegrees> {
    return this.degrees;
  }

  toQuaternion(
    order?: EulerOrder,
    target?: THREE.Quaternion,
  ): THREE.Quaternion {
    return eulerDegreesToQuaternion(this.degrees, order, target);
  }
}

/**
 * The {@link PoseSink} that composes every layer's contribution into one pose.
 *
 * - **Rotations multiply**, in the order layers write them. A large gesture
 *   rotation followed by a few degrees of breathing composes correctly;
 *   summing the two in degree space would distort the result.
 * - **Positions add**, since they are offsets from rest in metres.
 * - Bones written on a *previous* frame but not this one are re-emitted as
 *   identity/zero, so a gesture that ends releases its joints instead of
 *   leaving them stuck at their last pose.
 */
export class PoseAccumulator implements PoseSink {
  private readonly rotations = new Map<VRMHumanBoneName, THREE.Quaternion>();
  private readonly positions = new Map<VRMHumanBoneName, THREE.Vector3>();

  /** Bones touched this frame — the rest get reset on flush. */
  private readonly activeRotated = new Set<VRMHumanBoneName>();
  private readonly activePositioned = new Set<VRMHumanBoneName>();

  setBoneRotation(name: VRMHumanBoneName, rotation: THREE.Quaternion): void {
    const existing = this.rotations.get(name);

    if (existing && this.activeRotated.has(name)) {
      existing.multiply(rotation);
    } else if (existing) {
      existing.copy(rotation);
    } else {
      this.rotations.set(name, rotation.clone());
    }

    this.activeRotated.add(name);
  }

  setBonePosition(name: VRMHumanBoneName, offset: THREE.Vector3): void {
    const existing = this.positions.get(name);

    if (existing && this.activePositioned.has(name)) {
      existing.add(offset);
    } else if (existing) {
      existing.copy(offset);
    } else {
      this.positions.set(name, offset.clone());
    }

    this.activePositioned.add(name);
  }

  /** Start a new frame. Keeps the bone set so released bones can be reset. */
  beginFrame(): void {
    this.activeRotated.clear();
    this.activePositioned.clear();
  }

  /**
   * Write the composed pose to `sink`. Bones no longer driven this frame are
   * written as identity (rotation) / zero (position) rather than skipped.
   */
  writeTo(sink: PoseSink): void {
    for (const [name, rotation] of this.rotations) {
      if (!this.activeRotated.has(name)) rotation.identity();
      sink.setBoneRotation(name, rotation);
    }

    for (const [name, offset] of this.positions) {
      if (!this.activePositioned.has(name)) offset.set(0, 0, 0);
      sink.setBonePosition(name, offset);
    }
  }

  /** Forget every bone. Callers should flush an identity pose first. */
  clear(): void {
    this.rotations.clear();
    this.positions.clear();
    this.activeRotated.clear();
    this.activePositioned.clear();
  }

  /** Every bone this accumulator has ever written, in first-write order. */
  trackedBones(): VRMHumanBoneName[] {
    return Array.from(
      new Set([...this.rotations.keys(), ...this.positions.keys()]),
    );
  }
}
