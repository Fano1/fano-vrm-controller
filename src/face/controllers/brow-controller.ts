/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type { VRMFaceController } from "../face-controller";
import { createBrowPatterns } from "../face-utils";

/** The VRoid eyebrow shapes. Aliases (happy/sad/relaxed/surprise) also work. */
export const BROW_SHAPES = ["angry", "fun", "joy", "sorrow", "surprised"] as const;

export type BrowShape = (typeof BROW_SHAPES)[number];

/**
 * Eyebrow control through the raw morph channel.
 *
 * The VRM 1.0 standard defines no eyebrow expression preset, so brows only ever
 * exist as raw morph targets — VRoid `Fcl_BRW_*` or generic `brow* / eyebrow*` on
 * other rigs. This controller drives them purely via the universal fuzzy
 * matcher ({@link createBrowPatterns}) layered over {@link VRMFaceController}.
 */
export class BrowController {
  /**
   * @param face The low-level face controller backing this brow controller.
   */
  constructor(private readonly face: VRMFaceController) {}

  /** The canonical eyebrow shape names. */
  readonly shapes = BROW_SHAPES;

  /**
   * Set an eyebrow shape weight (0..1). Accepts a canonical shape or an English
   * alias; resolves via the universal fuzzy matcher so it works on VRoid and
   * generic rigs. Returns this (chainable).
   *
   * @param shape The eyebrow shape (canonical name or English alias).
   * @param weight The target weight, clamped to 0..1.
   * @param options When `resetOthers` is true, zero every brow morph first.
   * @returns This controller, for chaining.
   */
  set(
    shape: BrowShape | (string & {}),
    weight: number,
    options?: { resetOthers?: boolean },
  ): this {
    if (options?.resetOthers) {
      this.reset();
    }

    this.face.setMorphByPatterns(createBrowPatterns(shape), weight);

    return this;
  }

  /**
   * Set one brow shape and zero the others.
   *
   * @param shape The eyebrow shape (canonical name or English alias).
   * @param weight The target weight, clamped to 0..1. Defaults to 1.
   * @returns This controller, for chaining.
   */
  setExclusive(shape: BrowShape | (string & {}), weight = 1): this {
    return this.set(shape, weight, { resetOthers: true });
  }

  /** Whether the model exposes any eyebrow morphs at all. */
  get available(): boolean {
    return this.list().length > 0;
  }

  /**
   * The eyebrow morph-target names found on this model.
   *
   * @returns The de-duplicated union of VRoid `Fcl_BRW_*` targets and any
   * generic `brow* / eyebrow*` morphs.
   */
  list(): string[] {
    return Array.from(
      new Set([
        ...this.face.getFclBrowTargets(),
        ...this.face.findMorphTargets("brow|eyebrow"),
      ]),
    );
  }

  /**
   * Zero every eyebrow morph.
   *
   * @returns This controller, for chaining.
   */
  reset(): this {
    for (const name of this.list()) {
      this.face.setMorph(name, 0);
    }

    return this;
  }
}
