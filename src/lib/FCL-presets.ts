/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

/**
 * VRoid `Fcl_*` blendshape catalog.
 *
 * VRoid Studio (Pixiv) exports a fixed set of `Fcl_*` ("FaCiaL") morph targets
 * grouped by region: `ALL` (whole-face emotions), `BRW` (eyebrows), `EYE`,
 * `MTH` (mouth), and `HA` (teeth/tongue). The VRM standard expression system
 * has no eyebrow preset, so brows and other fine morphs are only reachable
 * through these raw names — this catalog is what the eyebrow / fine-morph
 * controls resolve against.
 *
 * Reference: VRM spec (https://vrm.dev) and VRoid
 * (https://vroid.com / https://vroid.pixiv.help).
 */
export const VRM_FCL_MORPH_TARGETS = [
  "Fcl_ALL_Neutral",
  "Fcl_ALL_Angry",
  "Fcl_ALL_Fun",
  "Fcl_ALL_Joy",
  "Fcl_ALL_Sorrow",
  "Fcl_ALL_Surprised",
  "Fcl_BRW_Angry",
  "Fcl_BRW_Fun",
  "Fcl_BRW_Joy",
  "Fcl_BRW_Sorrow",
  "Fcl_BRW_Surprised",
  "Fcl_EYE_Natural",
  "Fcl_EYE_Angry",
  "Fcl_EYE_Close",
  "Fcl_EYE_Close_R",
  "Fcl_EYE_Close_L",
  "Fcl_EYE_Fun",
  "Fcl_EYE_Joy",
  "Fcl_EYE_Joy_R",
  "Fcl_EYE_Joy_L",
  "Fcl_EYE_Sorrow",
  "Fcl_EYE_Surprised",
  "Fcl_EYE_Spread",
  "Fcl_EYE_Iris_Hide",
  "Fcl_EYE_Highlight_Hide",
  "Fcl_MTH_Close",
  "Fcl_MTH_Up",
  "Fcl_MTH_Down",
  "Fcl_MTH_Angry",
  "Fcl_MTH_Small",
  "Fcl_MTH_Large",
  "Fcl_MTH_Neutral",
  "Fcl_MTH_Fun",
  "Fcl_MTH_Joy",
  "Fcl_MTH_Sorrow",
  "Fcl_MTH_Surprised",
  "Fcl_MTH_SkinFung",
  "Fcl_MTH_SkinFung_R",
  "Fcl_MTH_SkinFung_L",
  "Fcl_MTH_A",
  "Fcl_MTH_I",
  "Fcl_MTH_U",
  "Fcl_MTH_E",
  "Fcl_MTH_O",
  "Fcl_HA_Hide",
  "Fcl_HA_Fung1",
  "Fcl_HA_Fung1_Low",
  "Fcl_HA_Fung1_Up",
  "Fcl_HA_Fung2",
  "Fcl_HA_Fung2_Low",
  "Fcl_HA_Fung2_Up",
  "Fcl_HA_Fung3",
  "Fcl_HA_Fung3_Up",
  "Fcl_HA_Fung3_Low",
  "Fcl_HA_Short",
  "Fcl_HA_Short_Up",
  "Fcl_HA_Short_Low",
] as const;

export type VRMFclMorphTarget = (typeof VRM_FCL_MORPH_TARGETS)[number];

/** `Fcl_*` targets grouped by facial region. */
export const VRM_FCL_GROUPS = {
  all: [
    "Fcl_ALL_Neutral",
    "Fcl_ALL_Angry",
    "Fcl_ALL_Fun",
    "Fcl_ALL_Joy",
    "Fcl_ALL_Sorrow",
    "Fcl_ALL_Surprised",
  ],
  brow: [
    "Fcl_BRW_Angry",
    "Fcl_BRW_Fun",
    "Fcl_BRW_Joy",
    "Fcl_BRW_Sorrow",
    "Fcl_BRW_Surprised",
  ],
  eye: [
    "Fcl_EYE_Natural",
    "Fcl_EYE_Angry",
    "Fcl_EYE_Close",
    "Fcl_EYE_Close_R",
    "Fcl_EYE_Close_L",
    "Fcl_EYE_Fun",
    "Fcl_EYE_Joy",
    "Fcl_EYE_Joy_R",
    "Fcl_EYE_Joy_L",
    "Fcl_EYE_Sorrow",
    "Fcl_EYE_Surprised",
    "Fcl_EYE_Spread",
    "Fcl_EYE_Iris_Hide",
    "Fcl_EYE_Highlight_Hide",
  ],
  mouth: [
    "Fcl_MTH_Close",
    "Fcl_MTH_Up",
    "Fcl_MTH_Down",
    "Fcl_MTH_Angry",
    "Fcl_MTH_Small",
    "Fcl_MTH_Large",
    "Fcl_MTH_Neutral",
    "Fcl_MTH_Fun",
    "Fcl_MTH_Joy",
    "Fcl_MTH_Sorrow",
    "Fcl_MTH_Surprised",
    "Fcl_MTH_SkinFung",
    "Fcl_MTH_SkinFung_R",
    "Fcl_MTH_SkinFung_L",
    "Fcl_MTH_A",
    "Fcl_MTH_I",
    "Fcl_MTH_U",
    "Fcl_MTH_E",
    "Fcl_MTH_O",
  ],
  hair: [
    "Fcl_HA_Hide",
    "Fcl_HA_Fung1",
    "Fcl_HA_Fung1_Low",
    "Fcl_HA_Fung1_Up",
    "Fcl_HA_Fung2",
    "Fcl_HA_Fung2_Low",
    "Fcl_HA_Fung2_Up",
    "Fcl_HA_Fung3",
    "Fcl_HA_Fung3_Up",
    "Fcl_HA_Fung3_Low",
    "Fcl_HA_Short",
    "Fcl_HA_Short_Up",
    "Fcl_HA_Short_Low",
  ],
} as const satisfies Record<string, readonly VRMFclMorphTarget[]>;

export type VRMFclGroupName = keyof typeof VRM_FCL_GROUPS;

/** Human-friendly alias → raw `Fcl_*` name, grouped by face part. */
export const VRM_FCL_FACE_PARTS = {
  brow: {
    angry: "Fcl_BRW_Angry",
    fun: "Fcl_BRW_Fun",
    joy: "Fcl_BRW_Joy",
    sorrow: "Fcl_BRW_Sorrow",
    surprised: "Fcl_BRW_Surprised",
  },
  eye: {
    natural: "Fcl_EYE_Natural",
    angry: "Fcl_EYE_Angry",
    close: "Fcl_EYE_Close",
    closeRight: "Fcl_EYE_Close_R",
    closeLeft: "Fcl_EYE_Close_L",
    fun: "Fcl_EYE_Fun",
    joy: "Fcl_EYE_Joy",
    joyRight: "Fcl_EYE_Joy_R",
    joyLeft: "Fcl_EYE_Joy_L",
    sorrow: "Fcl_EYE_Sorrow",
    surprised: "Fcl_EYE_Surprised",
    spread: "Fcl_EYE_Spread",
    irisHide: "Fcl_EYE_Iris_Hide",
    highlightHide: "Fcl_EYE_Highlight_Hide",
  },
  mouth: {
    close: "Fcl_MTH_Close",
    up: "Fcl_MTH_Up",
    down: "Fcl_MTH_Down",
    angry: "Fcl_MTH_Angry",
    small: "Fcl_MTH_Small",
    large: "Fcl_MTH_Large",
    neutral: "Fcl_MTH_Neutral",
    fun: "Fcl_MTH_Fun",
    joy: "Fcl_MTH_Joy",
    sorrow: "Fcl_MTH_Sorrow",
    surprised: "Fcl_MTH_Surprised",
    skinFung: "Fcl_MTH_SkinFung",
    skinFungRight: "Fcl_MTH_SkinFung_R",
    skinFungLeft: "Fcl_MTH_SkinFung_L",
    a: "Fcl_MTH_A",
    i: "Fcl_MTH_I",
    u: "Fcl_MTH_U",
    e: "Fcl_MTH_E",
    o: "Fcl_MTH_O",
  },
  hair: {
    hide: "Fcl_HA_Hide",
    fung1: "Fcl_HA_Fung1",
    fung1Low: "Fcl_HA_Fung1_Low",
    fung1Up: "Fcl_HA_Fung1_Up",
    fung2: "Fcl_HA_Fung2",
    fung2Low: "Fcl_HA_Fung2_Low",
    fung2Up: "Fcl_HA_Fung2_Up",
    fung3: "Fcl_HA_Fung3",
    fung3Up: "Fcl_HA_Fung3_Up",
    fung3Low: "Fcl_HA_Fung3_Low",
    short: "Fcl_HA_Short",
    shortUp: "Fcl_HA_Short_Up",
    shortLow: "Fcl_HA_Short_Low",
  },
} as const;

export type VRMFacePartName = keyof typeof VRM_FCL_FACE_PARTS;

/**
 * VRoid emotion presets: the set of `Fcl_*` morphs that move together to
 * produce a whole-face emotion (mouth + brow + eyes + all).
 */
export const VRM_EMOTION_PRESETS = {
  neutral: ["Fcl_ALL_Neutral", "Fcl_EYE_Natural", "Fcl_MTH_Neutral"],
  angry: ["Fcl_ALL_Angry", "Fcl_BRW_Angry", "Fcl_EYE_Angry", "Fcl_MTH_Angry"],
  fun: ["Fcl_ALL_Fun", "Fcl_BRW_Fun", "Fcl_EYE_Fun", "Fcl_MTH_Fun"],
  joy: ["Fcl_ALL_Joy", "Fcl_BRW_Joy", "Fcl_EYE_Joy", "Fcl_MTH_Joy"],
  sorrow: [
    "Fcl_ALL_Sorrow",
    "Fcl_BRW_Sorrow",
    "Fcl_EYE_Sorrow",
    "Fcl_MTH_Sorrow",
  ],
  surprised: [
    "Fcl_ALL_Surprised",
    "Fcl_BRW_Surprised",
    "Fcl_EYE_Surprised",
    "Fcl_MTH_Surprised",
  ],
} as const satisfies Record<string, readonly VRMFclMorphTarget[]>;

export type VRMEmotionPresetName = keyof typeof VRM_EMOTION_PRESETS;

/**
 * Maps the English VRM-standard emotion words to VRoid emotion presets, so the
 * standard preset names (`happy`, `sad`, `relaxed`, `surprised`) resolve to the
 * right `Fcl_*` sets on models that only ship VRoid morphs.
 */
export const VRM_EMOTION_ALIASES: Readonly<
  Record<string, readonly VRMEmotionPresetName[]>
> = {
  happy: ["joy", "fun"],
  sad: ["sorrow"],
  relaxed: ["fun"],
  surprise: ["surprised"],
} as const;

/**
 * Resolve an emotion name (VRoid preset OR English alias, case-insensitive) to
 * the list of `Fcl_*` morph targets that make up that emotion. Returns `[]` for
 * unknown names.
 */
export function getVRMEmotionPresetTargets(
  name: string,
): readonly VRMFclMorphTarget[] {
  const normalizedName = name.trim().toLowerCase();

  if (normalizedName in VRM_EMOTION_PRESETS) {
    return VRM_EMOTION_PRESETS[normalizedName as VRMEmotionPresetName];
  }

  const aliases = VRM_EMOTION_ALIASES[normalizedName];

  if (!aliases) return [];

  return aliases.flatMap((alias) => [...VRM_EMOTION_PRESETS[alias]]);
}

/** Type guard: is `name` one of the known VRoid `Fcl_*` morph targets? */
export function isVRMFclMorphTarget(name: string): name is VRMFclMorphTarget {
  return VRM_FCL_MORPH_TARGETS.includes(name as VRMFclMorphTarget);
}
