/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { JiggleBoneOptions, JiggleZone } from "./jiggle-type";

/** What any option left out falls back to. Also what a bare `enable(node)` gets. */
export const JIGGLE_BASE = {
  hz: 3,
  damping: 0.2,
  gain: 0.5,
  length: 0.15,
  maxAngle: 8,
} as const;

/**
 * Tuned starting points per humanoid bone.
 *
 * Remember what a humanoid bone *is*: rotating `chest` rotates everything
 * parented to it — arms, neck, head. So these are deliberately small, slow
 * secondary motions that read as the upper body settling after a bounce, not as
 * a localised wobble. For that, give the model's own non-humanoid bones (a bust
 * bone, say) to `enable()` by name — see `listJiggleCandidates`.
 */
export const JIGGLE_BONE_DEFAULTS: Partial<Record<VRMHumanBoneName, JiggleBoneOptions>> = {
  upperChest: { hz: 3.4, damping: 0.22, gain: 0.45, length: 0.14, lever: { y: 0.7, z: 0.7 }, maxAngle: 6 },
  chest: { hz: 3.0, damping: 0.2, gain: 0.5, length: 0.15, lever: { y: 0.7, z: 0.7 }, maxAngle: 7 },
  spine: { hz: 2.6, damping: 0.28, gain: 0.3, length: 0.2, lever: { y: 1 }, maxAngle: 4 },
  // The mass hangs below and behind the pivot.
  hips: { hz: 2.2, damping: 0.3, gain: 0.25, length: 0.2, lever: { y: -0.8, z: -0.6 }, maxAngle: 3 },
  neck: { hz: 3.2, damping: 0.3, gain: 0.3, length: 0.1, lever: { y: 1 }, maxAngle: 4 },
  head: { hz: 2.8, damping: 0.3, gain: 0.35, length: 0.2, lever: { y: 1 }, maxAngle: 5 },
  leftShoulder: { hz: 3.6, damping: 0.25, gain: 0.3, length: 0.1, lever: { x: 0.6, y: 0.8 }, maxAngle: 4 },
  rightShoulder: { hz: 3.6, damping: 0.25, gain: 0.3, length: 0.1, lever: { x: -0.6, y: 0.8 }, maxAngle: 4 },
  leftUpperLeg: { hz: 3.2, damping: 0.25, gain: 0.3, length: 0.25, lever: { y: -1 }, maxAngle: 4 },
  rightUpperLeg: { hz: 3.2, damping: 0.25, gain: 0.3, length: 0.25, lever: { y: -1 }, maxAngle: 4 },
};

/** Which humanoid bones each {@link JiggleZone} turns on. */
export const JIGGLE_ZONES: Record<JiggleZone, VRMHumanBoneName[]> = {
  chest: ["upperChest", "chest"],
  torso: ["spine"],
  hips: ["hips"],
  head: ["neck", "head"],
  shoulders: ["leftShoulder", "rightShoulder"],
  thighs: ["leftUpperLeg", "rightUpperLeg"],
};
