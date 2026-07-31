/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import * as THREE from "three";
import type { EulerDegrees, EulerOrder, PartialEulerDegrees } from "./body-type";

const DEFAULT_ORDER: EulerOrder = "XYZ";

/** Decompose a quaternion into degrees around each axis (UI-slider-friendly). */
export function quaternionToEulerDegrees(
  quaternion: THREE.Quaternion,
  order: EulerOrder = DEFAULT_ORDER,
): EulerDegrees {
  const euler = new THREE.Euler().setFromQuaternion(quaternion, order);

  return {
    x: THREE.MathUtils.radToDeg(euler.x),
    y: THREE.MathUtils.radToDeg(euler.y),
    z: THREE.MathUtils.radToDeg(euler.z),
  };
}

/**
 * Build a quaternion from degrees around each axis, merging any axis left out
 * of `partial` from `current`'s existing rotation — so a UI with three
 * independent X/Y/Z sliders can update one axis at a time without clobbering
 * the other two.
 *
 * Like any Euler-angle scheme, this hits gimbal lock at the middle axis's
 * +/-90° singularity (`order[1]`, "Y" for the "XYZ" default): decomposing the
 * current quaternion back into Euler angles there can no longer separate the
 * outer two axes, so only their sum/difference survives, not each
 * individually. Avoid driving the middle axis all the way to +/-90° if
 * independent control of the other two matters.
 */
export function mergeEulerDegrees(
  current: THREE.Quaternion,
  partial: PartialEulerDegrees,
  order: EulerOrder = DEFAULT_ORDER,
): THREE.Quaternion {
  const base = quaternionToEulerDegrees(current, order);

  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(partial.x ?? base.x),
    THREE.MathUtils.degToRad(partial.y ?? base.y),
    THREE.MathUtils.degToRad(partial.z ?? base.z),
    order,
  );

  return new THREE.Quaternion().setFromEuler(euler);
}
