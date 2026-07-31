/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import * as THREE from "three";
import { VRMHumanBoneList } from "@pixiv/three-vrm";
import type { VRM, VRMHumanBoneName, VRMPose } from "@pixiv/three-vrm";
import { mergeEulerDegrees, quaternionToEulerDegrees } from "./body-utils";
import type { EulerDegrees, EulerOrder, PartialEulerDegrees } from "./body-type";

/**
 * Direct control over every joint of a VRM's humanoid skeleton — the "body"
 * counterpart to `VRMFace`'s morph/expression control.
 *
 * Operates on `vrm.humanoid`'s *normalized* bone rig (`getNormalizedBoneNode`)
 * — the same portable rig `retargetMixamoToVRM` targets. Every VRM exposes it
 * at an identical, identity rest pose, so a joint's rest rotation is always
 * identity regardless of the model's actual raw skeleton orientation; that's
 * what makes {@link VRMBody.resetBoneRotation} a plain `quaternion.identity()`
 * rather than a per-model lookup. `vrm.update(delta)` copies the result onto
 * the model's raw bones every frame (`humanoid.autoUpdateHumanBones`), same
 * as everything else in this package — no extra wiring needed.
 *
 * ```ts
 * const body = createVRMBody(avatar.vrm);
 *
 * body.setEulerDegrees("leftUpperArm", { z: -45 }); // raise the left arm
 * body.getRotation("head");                          // read it back (quaternion)
 * body.listBones();                                  // every joint this model has
 *
 * const pose = body.getPose(); // snapshot
 * body.resetPose();            // back to rest (T-pose)
 * body.setPose(pose);          // restore the snapshot
 * ```
 */
export class VRMBody {
  constructor(private readonly vrm: VRM) {}

  /** Whether this model exposes `name` at all. */
  hasBone(name: VRMHumanBoneName): boolean {
    return this.vrm.humanoid.getNormalizedBoneNode(name) !== null;
  }

  /** Every joint this specific model actually has (not every VRM ships all of them). */
  listBones(): VRMHumanBoneName[] {
    return VRMHumanBoneList.filter((name) => this.hasBone(name));
  }

  /** Escape hatch: the normalized bone node itself, or `null` if absent. */
  getBoneNode(name: VRMHumanBoneName): THREE.Object3D | null {
    return this.vrm.humanoid.getNormalizedBoneNode(name);
  }

  /** Escape hatch: the raw (model-space) bone node, or `null` if absent. */
  getRawBoneNode(name: VRMHumanBoneName): THREE.Object3D | null {
    return this.vrm.humanoid.getRawBoneNode(name);
  }

  // -- Rotation -------------------------------------------------------------

  /** Current local rotation of `name` (copied into `target`), or `null` if absent. */
  getRotation(
    name: VRMHumanBoneName,
    target: THREE.Quaternion = new THREE.Quaternion(),
  ): THREE.Quaternion | null {
    const node = this.getBoneNode(name);
    return node ? target.copy(node.quaternion) : null;
  }

  /** Set `name`'s local rotation directly. Returns `false` if the model lacks it. */
  setRotation(name: VRMHumanBoneName, rotation: THREE.Quaternion): boolean {
    const node = this.getBoneNode(name);
    if (!node) return false;
    node.quaternion.copy(rotation);
    return true;
  }

  /** Current rotation of `name` as degrees around each axis, or `null` if absent. */
  getEulerDegrees(name: VRMHumanBoneName, order?: EulerOrder): EulerDegrees | null {
    const node = this.getBoneNode(name);
    return node ? quaternionToEulerDegrees(node.quaternion, order) : null;
  }

  /**
   * Set one or more axes of `name`'s rotation in degrees — axes left out of
   * `euler` keep their current value, so independent X/Y/Z sliders can each
   * update just their own axis. Returns `false` if the model lacks `name`.
   */
  setEulerDegrees(
    name: VRMHumanBoneName,
    euler: PartialEulerDegrees,
    order?: EulerOrder,
  ): boolean {
    const node = this.getBoneNode(name);
    if (!node) return false;
    node.quaternion.copy(mergeEulerDegrees(node.quaternion, euler, order));
    return true;
  }

  /**
   * Reset one joint to its rest rotation. Normalized bones rest at identity
   * by construction, so this never needs a per-model lookup. Returns `false`
   * if the model lacks `name`.
   */
  resetBoneRotation(name: VRMHumanBoneName): boolean {
    const node = this.getBoneNode(name);
    if (!node) return false;
    node.quaternion.identity();
    return true;
  }

  // -- Position (meaningful mainly for hips) ---------------------------------

  /** Current local position of `name` (copied into `target`), or `null` if absent. */
  getPosition(
    name: VRMHumanBoneName,
    target: THREE.Vector3 = new THREE.Vector3(),
  ): THREE.Vector3 | null {
    const node = this.getBoneNode(name);
    return node ? target.copy(node.position) : null;
  }

  /** Set `name`'s local position directly. Returns `false` if the model lacks it. */
  setPosition(
    name: VRMHumanBoneName,
    position: THREE.Vector3 | { x: number; y: number; z: number },
  ): boolean {
    const node = this.getBoneNode(name);
    if (!node) return false;
    node.position.set(position.x, position.y, position.z);
    return true;
  }

  // -- Whole pose -------------------------------------------------------------

  /** Snapshot every joint's current transform, relative to rest. */
  getPose(): VRMPose {
    return this.vrm.humanoid.getNormalizedPose();
  }

  /** Apply a previously-captured (or hand-built) pose. */
  setPose(pose: VRMPose): void {
    this.vrm.humanoid.setNormalizedPose(pose);
  }

  /** Reset every joint to its rest pose (T-pose). */
  resetPose(): void {
    this.vrm.humanoid.resetNormalizedPose();
  }
}

/** Create a {@link VRMBody} controller for a loaded VRM. */
export function createVRMBody(vrm: VRM): VRMBody {
  return new VRMBody(vrm);
}
