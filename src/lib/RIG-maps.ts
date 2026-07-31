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
 * Mixamo's standard "mixamorig" rig, mapped onto VRM humanoid bone names.
 *
 * Mixamo (Adobe's free character-animation library) exports every rig with a
 * fixed bone-naming convention: `mixamorigHips`, `mixamorigSpine`, … This is
 * what `retargetMixamoToVRM` resolves each animation track's bone name
 * against to find the matching {@link VRMHumanBoneName}.
 *
 * Keyed by the exact Mixamo name. For renamed variants (multi-character
 * scenes produce `mixamorig1Hips`/`mixamorig2Hips`, some DCC re-exports
 * produce `mixamorig:Hips`), see {@link resolveMixamoBoneName}.
 *
 * Reference: https://www.mixamo.com, VRM humanoid spec
 * (https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/humanoid.md)
 */
export const MIXAMO_VRM_RIG_MAP: Record<string, VRMHumanBoneName> = {
  mixamorigHips: "hips",
  mixamorigSpine: "spine",
  mixamorigSpine1: "chest",
  mixamorigSpine2: "upperChest",
  mixamorigNeck: "neck",
  mixamorigHead: "head",
  mixamorigLeftShoulder: "leftShoulder",
  mixamorigLeftArm: "leftUpperArm",
  mixamorigLeftForeArm: "leftLowerArm",
  mixamorigLeftHand: "leftHand",
  mixamorigLeftHandThumb1: "leftThumbMetacarpal",
  mixamorigLeftHandThumb2: "leftThumbProximal",
  mixamorigLeftHandThumb3: "leftThumbDistal",
  mixamorigLeftHandIndex1: "leftIndexProximal",
  mixamorigLeftHandIndex2: "leftIndexIntermediate",
  mixamorigLeftHandIndex3: "leftIndexDistal",
  mixamorigLeftHandMiddle1: "leftMiddleProximal",
  mixamorigLeftHandMiddle2: "leftMiddleIntermediate",
  mixamorigLeftHandMiddle3: "leftMiddleDistal",
  mixamorigLeftHandRing1: "leftRingProximal",
  mixamorigLeftHandRing2: "leftRingIntermediate",
  mixamorigLeftHandRing3: "leftRingDistal",
  mixamorigLeftHandPinky1: "leftLittleProximal",
  mixamorigLeftHandPinky2: "leftLittleIntermediate",
  mixamorigLeftHandPinky3: "leftLittleDistal",
  mixamorigRightShoulder: "rightShoulder",
  mixamorigRightArm: "rightUpperArm",
  mixamorigRightForeArm: "rightLowerArm",
  mixamorigRightHand: "rightHand",
  mixamorigRightHandThumb1: "rightThumbMetacarpal",
  mixamorigRightHandThumb2: "rightThumbProximal",
  mixamorigRightHandThumb3: "rightThumbDistal",
  mixamorigRightHandIndex1: "rightIndexProximal",
  mixamorigRightHandIndex2: "rightIndexIntermediate",
  mixamorigRightHandIndex3: "rightIndexDistal",
  mixamorigRightHandMiddle1: "rightMiddleProximal",
  mixamorigRightHandMiddle2: "rightMiddleIntermediate",
  mixamorigRightHandMiddle3: "rightMiddleDistal",
  mixamorigRightHandRing1: "rightRingProximal",
  mixamorigRightHandRing2: "rightRingIntermediate",
  mixamorigRightHandRing3: "rightRingDistal",
  mixamorigRightHandPinky1: "rightLittleProximal",
  mixamorigRightHandPinky2: "rightLittleIntermediate",
  mixamorigRightHandPinky3: "rightLittleDistal",
  mixamorigLeftUpLeg: "leftUpperLeg",
  mixamorigLeftLeg: "leftLowerLeg",
  mixamorigLeftFoot: "leftFoot",
  mixamorigLeftToeBase: "leftToes",
  mixamorigRightUpLeg: "rightUpperLeg",
  mixamorigRightLeg: "rightLowerLeg",
  mixamorigRightFoot: "rightFoot",
  mixamorigRightToeBase: "rightToes",
};

/**
 * {@link MIXAMO_VRM_RIG_MAP} keyed by bone name with the `mixamorig` prefix
 * stripped (`Hips`, `LeftArm`, …) — what {@link resolveMixamoBoneName}'s fuzzy
 * fallback matches renamed rigs against.
 */
const MIXAMO_SUFFIX_RIG_MAP: Record<string, VRMHumanBoneName> =
  Object.fromEntries(
    Object.entries(MIXAMO_VRM_RIG_MAP).map(([mixamoName, vrmBone]) => [
      mixamoName.replace(/^mixamorig/i, ""),
      vrmBone,
    ]),
  );

/**
 * Resolve a raw Mixamo bone name (e.g. the left side of
 * `"mixamorigLeftArm.quaternion".split(".")`) to the {@link VRMHumanBoneName}
 * it drives, or `null` if it isn't a recognized humanoid bone.
 *
 * Resolution order: an exact hit in `customMap`, then an exact hit in the
 * standard {@link MIXAMO_VRM_RIG_MAP}, then a fuzzy fallback that strips a
 * `mixamorig<N>?[:_]?` prefix and matches the remaining suffix — so
 * `mixamorig1Hips` / `mixamorig2:LeftArm` (renamed by multi-character scenes
 * or DCC re-exports) still resolve. `customMap` is matched exactly only (no
 * fuzz applied to caller-supplied overrides), keeping overrides predictable.
 */
export function resolveMixamoBoneName(
  rawName: string,
  customMap?: Record<string, VRMHumanBoneName>,
): VRMHumanBoneName | null {
  if (customMap?.[rawName]) {
    return customMap[rawName];
  }

  if (MIXAMO_VRM_RIG_MAP[rawName]) {
    return MIXAMO_VRM_RIG_MAP[rawName];
  }

  const suffix = rawName.replace(/^mixamorig\d*[:_]?/i, "");
  return MIXAMO_SUFFIX_RIG_MAP[suffix] ?? null;
}
