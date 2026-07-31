/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type * as THREE from "three";
import type { MorphTargetBinding, VRMViseme } from "./face-type";
import { getVRMEmotionPresetTargets } from "../lib/FCL-presets";

/** A mesh that actually carries morph targets (dictionary + influences). */
export type MorphTargetMesh = (THREE.Mesh | THREE.SkinnedMesh) & {
  morphTargetDictionary: Record<string, number>;
  morphTargetInfluences: number[];
};

/** Clamp a weight into the VRM-legal 0..1 range. */
export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Narrow an Object3D to a morph-target-bearing mesh. */
export function isMorphTargetMesh(
  node: THREE.Object3D,
): node is MorphTargetMesh {
  const maybeMesh = node as Partial<MorphTargetMesh>;

  return Boolean(
    maybeMesh.morphTargetDictionary &&
      maybeMesh.morphTargetInfluences &&
      typeof maybeMesh.morphTargetDictionary === "object",
  );
}

/**
 * Walk a VRM scene and collect every morph-target name → its `{mesh, index}`
 * bindings. A single blendshape name can be spread across several meshes
 * (face + eyelashes + …), so each name maps to an array.
 */
export function collectMorphTargets(
  scene: THREE.Object3D,
): Map<string, MorphTargetBinding[]> {
  const morphTargets = new Map<string, MorphTargetBinding[]>();

  scene.traverse((node) => {
    if (!isMorphTargetMesh(node)) return;

    for (const [name, index] of Object.entries(node.morphTargetDictionary)) {
      const bindings = morphTargets.get(name) ?? [];
      bindings.push({ mesh: node, index });
      morphTargets.set(name, bindings);
    }
  });

  return morphTargets;
}

/** Escape a string for safe inclusion in a `RegExp`. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the ordered list of regexes that could name a given viseme across
 * toolchains — bare letter, VRoid `Fcl_MTH_*`, generic `mouth_/viseme_`,
 * VRChat `vrc.v_*`, and the lowercase VRM preset (`aa/ih/ou/ee/oh`).
 *
 * This is what makes lip-sync work on non-VRoid rigs too.
 */
export function createMouthPatterns(viseme: VRMViseme): RegExp[] {
  const presetByViseme: Record<VRMViseme, string> = {
    A: "aa",
    I: "ih",
    U: "ou",
    E: "ee",
    O: "oh",
  };

  // NOTE: the letter is END-anchored. An unanchored `MTH_A` would also match
  // `Fcl_MTH_Angry` (…mth_**a**ngry), so viseme "aa" would drive the angry
  // mouth morph during lip-sync. VRoid vowel morphs end in the bare letter.
  return [
    new RegExp(`^${viseme}$`, "i"),
    new RegExp(`Fcl_MTH_${viseme}$`, "i"),
    new RegExp(`MTH_${viseme}$`, "i"),
    new RegExp(`mouth_${viseme}$`, "i"),
    new RegExp(`viseme_${viseme}$`, "i"),
    new RegExp(`^vrc\\.v_.*\\.${viseme}$`, "i"),
    new RegExp(`^${presetByViseme[viseme]}$`, "i"),
  ];
}

/**
 * Build the regexes that could name an expression/emotion across toolchains.
 * Expands the name through the VRoid emotion aliases first, then tries the
 * common prefixes (`Fcl_ALL_/BRW_/EYE_/MTH_/HA_`, `expr_`, `face_`, `*_Blend`).
 */
export function createExpressionPatterns(name: string): RegExp[] {
  const normalizedName = name.trim();
  const emotionTargets = getVRMEmotionPresetTargets(normalizedName);
  const names = [normalizedName, ...emotionTargets];

  return [
    ...names.map(
      (expressionName) => new RegExp(`^${escapeRegExp(expressionName)}$`, "i"),
    ),
    ...names.flatMap((expressionName) => [
      new RegExp(`Fcl_ALL_${expressionName}`, "i"),
      new RegExp(`Fcl_BRW_${expressionName}`, "i"),
      new RegExp(`Fcl_EYE_${expressionName}`, "i"),
      new RegExp(`Fcl_MTH_${expressionName}`, "i"),
      new RegExp(`Fcl_HA_${expressionName}`, "i"),
      new RegExp(`expr_${expressionName}`, "i"),
      new RegExp(`face_${expressionName}`, "i"),
      new RegExp(`${expressionName}_Blend`, "i"),
    ]),
  ];
}

/** English/VRoid brow-shape word → the token used inside a `Fcl_BRW_*` name. */
const BROW_SHAPE_ALIASES: Record<string, string[]> = {
  angry: ["Angry"],
  fun: ["Fun"],
  relaxed: ["Fun"],
  joy: ["Joy"],
  happy: ["Joy", "Fun"],
  sorrow: ["Sorrow"],
  sad: ["Sorrow"],
  surprised: ["Surprised"],
  surprise: ["Surprised"],
};

/**
 * Build the regexes that could name an eyebrow shape. The VRM standard has no
 * eyebrow preset, so brows only live as raw morphs — this resolves them on
 * VRoid (`Fcl_BRW_*`) and generic `brow* / eyebrow*` rigs.
 */
export function createBrowPatterns(shape: string): RegExp[] {
  const normalized = shape.trim().toLowerCase();
  const tokens = BROW_SHAPE_ALIASES[normalized] ?? [
    shape.trim().replace(/^\w/, (c) => c.toUpperCase()),
  ];

  return tokens.flatMap((token) => [
    new RegExp(`Fcl_BRW_${token}`, "i"),
    new RegExp(`BRW_${token}`, "i"),
    new RegExp(`brow.*${escapeRegExp(token)}`, "i"),
    new RegExp(`eyebrow.*${escapeRegExp(token)}`, "i"),
  ]);
}

/**
 * Regexes that could name the "both eyes closed" blink morph, for models
 * without a standard `blink` expression.
 */
export const BLINK_PATTERNS: RegExp[] = [
  /^blink$/i,
  /^Fcl_EYE_Close$/i,
  // End-anchored so the both-eyes morph is preferred over the per-eye winks
  // (`Fcl_EYE_Close_L/_R`), which would otherwise be dragged in too.
  /eye.*close$/i,
  /close.*eye$/i,
  /blink/i,
];

/** Left-eye blink/wink regexes. */
export const BLINK_LEFT_PATTERNS: RegExp[] = [
  /^blinkLeft$/i,
  /blink.*left/i,
  /Fcl_EYE_Close_L/i,
  /eye.*close.*_l/i,
];

/** Right-eye blink/wink regexes. */
export const BLINK_RIGHT_PATTERNS: RegExp[] = [
  /^blinkRight$/i,
  /blink.*right/i,
  /Fcl_EYE_Close_R/i,
  /eye.*close.*_r/i,
];
