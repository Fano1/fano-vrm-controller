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
 * Compose degrees around each axis back into a quaternion — the inverse of
 * {@link quaternionToEulerDegrees}.
 *
 * Writes into `target` when given, so per-frame callers (the procedural
 * animation channels) can avoid allocating a quaternion every bone every frame.
 */
export function eulerDegreesToQuaternion(
  euler: EulerDegrees,
  order: EulerOrder = DEFAULT_ORDER,
  target: THREE.Quaternion = new THREE.Quaternion(),
): THREE.Quaternion {
  return target.setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(euler.x),
      THREE.MathUtils.degToRad(euler.y),
      THREE.MathUtils.degToRad(euler.z),
      order,
    ),
  );
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
 *
 * Note that the procedural animation module never round-trips through this —
 * it composes its euler degrees from rest each frame and converts once with
 * {@link eulerDegreesToQuaternion}, so it is not exposed to this singularity.
 */
export function mergeEulerDegrees(
  current: THREE.Quaternion,
  partial: PartialEulerDegrees,
  order: EulerOrder = DEFAULT_ORDER,
): THREE.Quaternion {
  const base = quaternionToEulerDegrees(current, order);

  return eulerDegreesToQuaternion(
    {
      x: partial.x ?? base.x,
      y: partial.y ?? base.y,
      z: partial.z ?? base.z,
    },
    order,
  );
}
