/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type { VRMExpressionController } from "../expression-controller";
import type { VRMFaceController } from "../face-controller";
import { createExpressionPatterns } from "../face-utils";
import type { EmotionPreset } from "../expression-preset";
import { EMOTION_PRESETS } from "../expression-preset";
import type { SetEmotionOptions } from "../face-type";
import { getVRMEmotionPresetTargets } from "../../lib/FCL-presets";

/**
 * High-level emotion / mood control.
 *
 * Prefers the portable VRM standard expression system (`happy`, `angry`, …)
 * and transparently falls back to the raw VRoid `Fcl_*` emotion morphs
 * (universal, then fuzzy pattern matching) on models that don't expose a
 * standard expression of that name — so `set("happy", 1)` does the right thing
 * whether the rig ships VRM 1.0 expressions or only VRoid blendshapes.
 *
 * ```ts
 * emotion.set("happy", 0.8);
 * emotion.setExclusive("angry");
 * emotion.reset();
 * ```
 */
export class EmotionController {
  constructor(
    private readonly expr: VRMExpressionController,
    private readonly face: VRMFaceController,
  ) {}

  /** The standard VRM emotion preset names. */
  readonly presets = EMOTION_PRESETS;

  /**
   * Set an emotion weight (0..1). Prefers the portable VRM standard expression;
   * falls back to the raw VRoid Fcl_* emotion morphs (universal/fuzzy) when the
   * model has no standard expression of that name.
   */
  set(
    name: EmotionPreset | (string & {}),
    weight: number,
    options?: SetEmotionOptions,
  ): this {
    if (options?.resetOthers) {
      this.reset();
    }

    if (this.expr.available && this.expr.has(name)) {
      this.expr.set(name, weight);
      return this;
    }

    let applied = false;

    for (const target of getVRMEmotionPresetTargets(name)) {
      if (this.face.setMorph(target, weight)) {
        applied = true;
      }
    }

    if (!applied) {
      this.face.setMorphByPatterns(createExpressionPatterns(name), weight);
    }

    return this;
  }

  /** Set one emotion and zero every other emotion (exclusive). */
  setExclusive(name: EmotionPreset | (string & {}), weight = 1): this {
    return this.set(name, weight, { resetOthers: true });
  }

  /**
   * Current weight of an emotion. Reads the standard expression when present,
   * otherwise the strongest of the raw VRoid morphs that back it (0 if none).
   */
  get(name: EmotionPreset | (string & {})): number {
    if (this.expr.available && this.expr.has(name)) {
      return this.expr.get(name);
    }

    const targets = getVRMEmotionPresetTargets(name);

    return targets.reduce(
      (max, target) => Math.max(max, this.face.getMorph(target)),
      0,
    );
  }

  /**
   * Which emotion presets this model can actually show — via the standard
   * expression system and/or the raw VRoid morphs it ships.
   */
  list(): string[] {
    return EMOTION_PRESETS.filter((p) => this.canShow(p));
  }

  /** Whether a preset is drivable through either channel. */
  private canShow(name: EmotionPreset | (string & {})): boolean {
    if (this.expr.available && this.expr.has(name)) {
      return true;
    }

    return getVRMEmotionPresetTargets(name).some((t) => this.face.hasMorph(t));
  }

  /** Zero every emotion (both channels). Chainable. */
  reset(): this {
    for (const p of EMOTION_PRESETS) {
      this.set(p, 0);
    }

    return this;
  }
}
