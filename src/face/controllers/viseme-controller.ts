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
import { createMouthPatterns } from "../face-utils";
import { VISEME_PRESETS } from "../expression-preset";
import type { VisemePreset } from "../expression-preset";
import type { SetMouthOptions, VRMViseme } from "../face-type";

/**
 * Maps each VRM standard vowel preset onto its phonetic viseme letter, the
 * form the fuzzy mouth matcher understands: aa→A, ih→I, ou→U, ee→E, oh→O.
 */
const PRESET_TO_VISEME: Record<VisemePreset, VRMViseme> = {
  aa: "A",
  ih: "I",
  ou: "U",
  ee: "E",
  oh: "O",
};

/**
 * Drives lip-sync visemes — the VRM standard vowel presets (`aa/ih/ou/ee/oh`).
 *
 * Prefers the portable VRM standard vowel expressions (via the
 * {@link VRMExpressionController}) and falls back to the universal fuzzy
 * mouth-morph matcher (via the {@link VRMFaceController}) for non-standard
 * rigs, so lip-sync works whether or not the model exposes the presets.
 *
 * ```ts
 * const visemes = new VisemeController(expr, face);
 * visemes.set("aa", 0.8);
 * visemes.setAll({ aa: 0.6, ih: 0.2 });
 * visemes.reset();
 * ```
 */
export class VisemeController {
  constructor(
    private readonly expr: VRMExpressionController,
    private readonly face: VRMFaceController,
  ) {}

  /** The standard VRM vowel/viseme preset names. */
  readonly presets = VISEME_PRESETS;

  /**
   * Set one viseme weight (0..1). Prefers the portable VRM standard vowel
   * expression; falls back to the universal fuzzy mouth matcher otherwise.
   */
  set(viseme: VisemePreset, weight: number, options?: SetMouthOptions): this {
    if (options?.resetOthers) {
      this.reset();
    }

    if (this.expr.available && this.expr.has(viseme)) {
      this.expr.set(viseme, weight);
    } else {
      this.face.setMorphByPatterns(
        createMouthPatterns(PRESET_TO_VISEME[viseme]),
        weight,
      );
    }

    return this;
  }

  /** Set several visemes at once as a blend; zeroes the rest first. */
  setAll(shape: Partial<Record<VisemePreset, number>>): this {
    this.reset();

    for (const preset of VISEME_PRESETS) {
      this.set(preset, shape[preset] ?? 0);
    }

    return this;
  }

  /**
   * Current weight of a viseme. Reads the standard vowel expression when
   * present, otherwise the fuzzy-matched mouth morph (0 if none).
   */
  get(viseme: VisemePreset): number {
    if (this.expr.available && this.expr.has(viseme)) {
      return this.expr.get(viseme);
    }

    const name = this.face.matchMorph(
      createMouthPatterns(PRESET_TO_VISEME[viseme]),
    );

    return name ? this.face.getMorph(name) : 0;
  }

  /** Which vowel presets this model can drive — standard and/or raw morphs. */
  list(): string[] {
    return VISEME_PRESETS.filter((preset) => this.canShow(preset));
  }

  /** Whether a viseme is drivable through either channel. */
  private canShow(viseme: VisemePreset): boolean {
    if (this.expr.available && this.expr.has(viseme)) {
      return true;
    }

    return (
      this.face.matchMorph(createMouthPatterns(PRESET_TO_VISEME[viseme])) !==
      null
    );
  }

  /** Zero every viseme. Chainable. */
  reset(): this {
    for (const preset of VISEME_PRESETS) {
      this.set(preset, 0);
    }

    return this;
  }
}
