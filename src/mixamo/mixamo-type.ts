/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type { VRMHumanBoneName } from "@pixiv/three-vrm";

/** Options shared by {@link retargetMixamoToVRM} and {@link loadMixamoAnimation}. */
export type RetargetMixamoOptions = {
  /**
   * Override or extend the default `MIXAMO_VRM_RIG_MAP`. Checked before (and
   * takes precedence over) the standard map and its fuzzy fallback — see
   * `resolveMixamoBoneName`.
   */
  boneMap?: Record<string, VRMHumanBoneName>;

  /**
   * Override the auto-computed hips position scale
   * (`targetHipsHeight / sourceHipsHeight`). Set this if the automatic ratio
   * looks wrong for a stylized/chibi-proportioned VRM.
   */
  hipsPositionScale?: number;
};

/** Options for {@link loadMixamoAnimation}. */
export type LoadMixamoAnimationOptions = RetargetMixamoOptions & {
  /**
   * Pick a specific clip by name if the FBX contains more than one. Defaults
   * to the first clip (`asset.animations[0]`) — standard Mixamo downloads
   * only ever contain a single clip, usually named `"mixamo.com"`.
   */
  animationName?: string;
};
