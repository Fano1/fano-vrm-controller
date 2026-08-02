/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";

/**
 * Bridges the two VRM humanoid conventions so procedural motion is authored
 * once and plays correctly on either.
 *
 * **The problem.** A VRM 1.0 rig faces `+Z`; a VRM 0.x rig faces `-Z`. The two
 * are therefore related by a 180° rotation about Y, which means a pose
 * authored for one is *mirrored* on the other: an arm raise becomes an arm
 * drop, a forward lean becomes a backward lean. Anything symmetric (a sine
 * sway) survives it; anything with a left/right or front/back sense does not.
 *
 * **The fix.** Every animator in this module authors in the **VRM 1.0
 * convention** — `+Z` forward, `+X` toward the model's left — and the write
 * boundary (`createBodySink`, `bakeAnimator`) converts to whatever the model
 * actually uses. This is the same correction `retargetMixamoToVRM` applies to
 * Mixamo clips, for the same reason and by the same rule: conjugating a
 * rotation by a 180° Y turn negates its `x` and `z` components while leaving
 * `y` and `w` alone.
 *
 * Note what that rule implies — **yaw passes through untouched**. Rotations
 * about Y commute with the frame flip, so a turn is a turn on either rig; only
 * pitch and roll reverse. That's the correct behavior, not an oversight.
 *
 * Both conversions are *involutions*: applying one twice returns the original,
 * so the same call converts authoring→rig and rig→authoring.
 */
export interface RigFrame {
  /** True when the model is VRM 0.x and needs mirroring. */
  readonly mirrored: boolean;

  /** Convert a rotation between authoring and rig space, **in place**. */
  rotation(quaternion: THREE.Quaternion): THREE.Quaternion;

  /** Convert an offset or direction between authoring and rig space, **in place**. */
  vector(vector: THREE.Vector3): THREE.Vector3;
}

/** Read a model's humanoid convention. VRM 0.x mirrors; VRM 1.0 is identity. */
export function createRigFrame(vrm: VRM): RigFrame {
  // Same version check as `retargetMixamoToVRM`.
  const mirrored = vrm.meta?.metaVersion === "0";

  return {
    mirrored,

    rotation(quaternion) {
      if (mirrored) {
        quaternion.x = -quaternion.x;
        quaternion.z = -quaternion.z;
      }
      return quaternion;
    },

    vector(vector) {
      if (mirrored) {
        vector.x = -vector.x;
        vector.z = -vector.z;
      }
      return vector;
    },
  };
}
