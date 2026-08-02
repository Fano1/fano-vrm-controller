/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import * as THREE from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { eulerDegreesToQuaternion } from "../../body/body-utils";
import { createSpring, type SpringOptions } from "../signals";
import { createRigFrame, type RigFrame } from "../rig-frame";
import type { Animator, AnimatorContext } from "../procedural-type";

/** What the eyes/head can be pointed at. */
export type LookAtTarget = THREE.Object3D | THREE.Vector3 | null;

/** How much of the total turn each joint carries. Absent bones are redistributed. */
export type LookAtWeights = Partial<Record<VRMHumanBoneName, number>>;

export interface LookAtLimits {
  /** Max horizontal turn from center, degrees. Default 70. */
  yaw?: number;
  /** Max vertical turn from center, degrees. Default 45. */
  pitch?: number;
}

export interface LookAtOptions {
  /** What to track. Can be changed later with {@link LookAtAnimator.setTarget}. */
  target?: LookAtTarget;

  /**
   * Per-bone share of the total turn. Defaults to head 0.6 / neck 0.3 /
   * upperChest 0.1 — a shoulder-led turn, not a swivelling neck. Weights are
   * renormalized over the bones the model actually has.
   */
  weights?: LookAtWeights;

  /** Clamps on the total turn. */
  limits?: LookAtLimits;

  /** Spring tuning for how the turn eases toward the target. */
  spring?: SpringOptions;

  /**
   * The direction the rig faces, **in authoring space**. Defaults to `+Z`,
   * the VRM 1.0 convention every behavior in this module authors in; a VRM 0.x
   * model's `-Z` facing is handled by the write boundary, not here. Override
   * only for a rig that disagrees with both.
   */
  faceFront?: THREE.Vector3;
}

export interface LookAtAnimator extends Animator {
  /** Point at an object (tracked every frame) or a fixed world position. */
  setTarget(target: LookAtTarget): this;
  /** Stop tracking; the turn springs back to center. */
  clearTarget(): this;
  /** Current smoothed horizontal turn, degrees. */
  readonly yaw: number;
  /** Current smoothed vertical turn, degrees. */
  readonly pitch: number;
}

const DEFAULT_WEIGHTS: LookAtWeights = {
  head: 0.6,
  neck: 0.3,
  upperChest: 0.1,
};

const DEFAULT_LIMITS: Required<LookAtLimits> = { yaw: 70, pitch: 45 };

const DEFAULT_SPRING: SpringOptions = { stiffness: 90, damping: 18 };

/** Wrap an angle in radians into `[-PI, PI]`, so a target behind the avatar
 * turns the short way round rather than winding up. */
function normalizeRadians(radians: number): number {
  const twoPi = Math.PI * 2;
  return ((((radians + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

function clampTo(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/**
 * Turn the head, neck, and upper chest toward a target — the bone-level
 * counterpart to the eye-only `VRMLookAt` gaze that `face.eye.gaze()` drives.
 *
 * The two compose: run both and the eyes lead while the head follows, which is
 * what actually reads as "looking at you". Neither one knows about the other.
 *
 * ```ts
 * const look = createLookAtAnimator({ target: camera });
 * const anim = createProceduralAnimator(avatar.vrm, [idle, look]);
 *
 * face.eye.gaze(camera); // eyes, via VRMLookAt
 * look.setTarget(camera); // head/neck/chest, via bones
 * ```
 *
 * The turn is computed in the avatar's own local frame, so it stays correct
 * however the model is rotated in the scene, and is clamped to
 * {@link LookAtLimits} so a target behind the avatar produces a look toward
 * the edge of its range rather than a broken neck.
 */
export function createLookAtAnimator(
  options: LookAtOptions = {},
): LookAtAnimator {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const requestedWeights = options.weights ?? DEFAULT_WEIGHTS;

  const yawSpring = createSpring({ ...DEFAULT_SPRING, ...options.spring });
  const pitchSpring = createSpring({ ...DEFAULT_SPRING, ...options.spring });

  let target: LookAtTarget = options.target ?? null;

  // Resolved once the first frame tells us which bones this model has.
  let resolvedWeights: Array<[VRMHumanBoneName, number]> | null = null;
  let frame: RigFrame | null = null;

  // Straight ahead is +Z in authoring space unless overridden.
  const front = options.faceFront ?? new THREE.Vector3(0, 0, 1);
  const faceFrontYaw = Math.atan2(front.x, front.z);

  // Rotating +X tips a +Z-facing head down, so looking up needs a negative X.
  // A custom -Z faceFront flips that.
  const pitchSign = front.z < 0 ? 1 : -1;

  const targetWorld = new THREE.Vector3();
  const headWorld = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const inverseRootRotation = new THREE.Quaternion();
  const boneRotation = new THREE.Quaternion();

  /** Renormalize the requested weights over the bones this model exposes. */
  function resolveWeights(vrm: VRM): Array<[VRMHumanBoneName, number]> {
    const present = (Object.entries(requestedWeights) as Array<
      [VRMHumanBoneName, number]
    >).filter(
      ([bone, weight]) =>
        weight > 0 && vrm.humanoid.getNormalizedBoneNode(bone) !== null,
    );

    const total = present.reduce((sum, [, weight]) => sum + weight, 0);

    if (total === 0) return [];

    return present.map(([bone, weight]) => [bone, weight / total]);
  }

  /** World position of the thing being looked at, or false if there isn't one. */
  function readTargetWorld(): boolean {
    if (!target) return false;

    if (target instanceof THREE.Vector3) {
      targetWorld.copy(target);
    } else {
      target.getWorldPosition(targetWorld);
    }

    return true;
  }

  function updateSpringTargets(vrm: VRM): void {
    if (!readTargetWorld()) {
      yawSpring.target = 0;
      pitchSpring.target = 0;
      return;
    }

    // Prefer the raw head bone — it's the one actually rendered, so its world
    // transform is what a viewer perceives the avatar as looking from.
    const head =
      vrm.humanoid.getRawBoneNode("head") ??
      vrm.humanoid.getNormalizedBoneNode("head");

    if (!head) {
      yawSpring.target = 0;
      pitchSpring.target = 0;
      return;
    }

    head.getWorldPosition(headWorld);
    direction.subVectors(targetWorld, headWorld);

    if (direction.lengthSq() === 0) {
      yawSpring.target = 0;
      pitchSpring.target = 0;
      return;
    }

    // Into the avatar's local frame, so the turn is independent of how the
    // model is placed/rotated in the scene...
    vrm.scene.getWorldQuaternion(inverseRootRotation).invert();
    direction.applyQuaternion(inverseRootRotation).normalize();

    // ...and then into authoring space, so the trigonometry below can assume
    // +Z is forward on every model. The write boundary converts back.
    frame!.vector(direction);

    const yaw = THREE.MathUtils.radToDeg(
      normalizeRadians(Math.atan2(direction.x, direction.z) - faceFrontYaw),
    );
    const pitch = THREE.MathUtils.radToDeg(
      Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)),
    );

    yawSpring.target = clampTo(yaw, limits.yaw);
    pitchSpring.target = clampTo(pitch, limits.pitch);
  }

  function update({ delta, sink, vrm }: AnimatorContext): void {
    if (!resolvedWeights || !frame) {
      frame = createRigFrame(vrm);
      resolvedWeights = resolveWeights(vrm);
    }

    updateSpringTargets(vrm);

    const yaw = yawSpring.update(delta);
    const pitch = pitchSpring.update(delta);

    for (const [bone, weight] of resolvedWeights) {
      // "YXZ" is yaw-then-pitch, the order that keeps an aimed joint from
      // rolling as it turns.
      eulerDegreesToQuaternion(
        { x: pitchSign * pitch * weight, y: yaw * weight, z: 0 },
        "YXZ",
        boneRotation,
      );

      sink.setBoneRotation(bone, boneRotation);
    }
  }

  return {
    update,

    reset() {
      yawSpring.reset();
      pitchSpring.reset();
    },

    setTarget(next: LookAtTarget) {
      target = next;
      return this;
    },

    clearTarget() {
      target = null;
      return this;
    },

    get yaw() {
      return yawSpring.value;
    },

    get pitch() {
      return pitchSpring.value;
    },
  };
}
