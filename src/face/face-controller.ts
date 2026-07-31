/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type { VRM } from "@pixiv/three-vrm";
import type { FclGroup, MorphTargetBinding } from "./face-type";
import { clamp01, collectMorphTargets } from "./face-utils";

/**
 * Low-level escape hatch: direct manipulation of raw morph targets by name.
 *
 * Prefer {@link createVRMFace} / the standard {@link VRMExpressionController}
 * for portable control. Reach for this only when you need to poke individual
 * blendshapes the expression system does not expose — e.g. VRoid `Fcl_*`
 * targets, or fuzzy-matching morphs on a non-standard rig.
 *
 * Writes go straight to `mesh.morphTargetInfluences`. For a morph the VRM
 * expression system does NOT manage, the write is immediate and persistent.
 * But for a morph that some expression binds, `vrm.update(delta)` re-applies
 * that expression's weight every frame and overwrites the raw write — so use
 * this layer for morphs the expression system doesn't cover (e.g. eyebrows),
 * and drive expression-bound morphs through {@link VRMExpressionController}.
 */
export class VRMFaceController {
  private morphTargets = new Map<string, MorphTargetBinding[]>();

  constructor(private readonly vrm: VRM) {
    this.rebuild();
  }

  /** Re-scan the scene graph. Call after swapping meshes on the model. */
  rebuild() {
    this.morphTargets = collectMorphTargets(this.vrm.scene);
  }

  /** Every morph-target name found on the model. */
  getAvailableMorphTargets(): string[] {
    return Array.from(this.morphTargets.keys());
  }

  hasMorph(name: string): boolean {
    return this.morphTargets.has(name);
  }

  /** Current influence of a morph target (0 if absent or unset). */
  getMorph(name: string): number {
    const bindings = this.morphTargets.get(name);

    if (!bindings || bindings.length === 0) {
      return 0;
    }

    const { mesh, index } = bindings[0];
    return mesh.morphTargetInfluences?.[index] ?? 0;
  }

  /**
   * The first morph-target name matching any of `patterns` (tried in order),
   * or `null` if none match. Useful for reading back a fuzzy-matched morph.
   */
  matchMorph(patterns: RegExp[]): string | null {
    for (const pattern of patterns) {
      for (const name of this.morphTargets.keys()) {
        if (pattern.test(name)) {
          return name;
        }
      }
    }

    return null;
  }

  /** Set one morph target by exact name (clamped). Returns false if absent. */
  setMorph(name: string, value: number): boolean {
    const bindings = this.morphTargets.get(name);

    if (!bindings) {
      return false;
    }

    const clampedValue = clamp01(value);

    for (const { mesh, index } of bindings) {
      mesh.morphTargetInfluences![index] = clampedValue;
    }

    return true;
  }

  resetMorph(name: string): boolean {
    return this.setMorph(name, 0);
  }

  /** Set every morph whose name matches `pattern`. Returns true if any hit. */
  setMorphByPattern(pattern: RegExp, value: number): boolean {
    let found = false;

    for (const name of this.morphTargets.keys()) {
      if (!pattern.test(name)) continue;
      this.setMorph(name, value);
      found = true;
    }

    return found;
  }

  /**
   * Try each pattern in order and apply the FIRST one that matches anything,
   * then stop. Lets callers list fallbacks most-specific-first (e.g. the exact
   * preset name, then VRoid, then a generic guess) without double-driving.
   */
  setMorphByPatterns(patterns: RegExp[], value: number): boolean {
    for (const pattern of patterns) {
      if (this.setMorphByPattern(pattern, value)) {
        return true;
      }
    }

    return false;
  }

  /** Case-insensitive substring/regex search over morph-target names. */
  findMorphTargets(query: string): string[] {
    const pattern = new RegExp(query, "i");

    return this.getAvailableMorphTargets().filter((name) =>
      pattern.test(name),
    );
  }

  getFclMorphTargets(): string[] {
    return this.getAvailableMorphTargets().filter((name) =>
      /^Fcl_/i.test(name),
    );
  }

  getFclGroups(): Record<string, string[]> {
    return this.getFclMorphTargets().reduce<Record<string, string[]>>(
      (groups, name) => {
        const group = this.getFclGroupFromName(name);

        groups[group] ??= [];
        groups[group].push(name);

        return groups;
      },
      {},
    );
  }

  getFclGroupNames(): FclGroup[] {
    return Object.keys(this.getFclGroups()) as FclGroup[];
  }

  getFclTargetsByGroup(group: FclGroup | string): string[] {
    const normalizedGroup = group.toUpperCase();

    return this.getFclMorphTargets().filter((name) => {
      return this.getFclGroupFromName(name) === normalizedGroup;
    });
  }

  /** VRoid `Fcl_ALL_*` whole-face emotion morphs. */
  getFclEmotionTargets(): string[] {
    return this.getFclTargetsByGroup("ALL");
  }

  /** VRoid `Fcl_EYE_*` morphs (blink + gaze + eye emotion). */
  getFclEyeTargets(): string[] {
    return this.getFclTargetsByGroup("EYE");
  }

  /** VRoid `Fcl_MTH_*` mouth/viseme morphs. */
  getFclMouthTargets(): string[] {
    return this.getFclTargetsByGroup("MTH");
  }

  /** VRoid `Fcl_BRW_*` eyebrow morphs. */
  getFclBrowTargets(): string[] {
    return this.getFclTargetsByGroup("BRW");
  }

  debug() {
    return {
      morphTargetCount: this.morphTargets.size,
      morphTargets: this.getAvailableMorphTargets(),
      fclGroups: this.getFclGroups(),
    };
  }

  private getFclGroupFromName(name: string): string {
    return name.match(/^Fcl_([^_]+)/i)?.[1]?.toUpperCase() ?? "UNKNOWN";
  }
}

export function createVRMFaceController(vrm: VRM): VRMFaceController {
  return new VRMFaceController(vrm);
}
