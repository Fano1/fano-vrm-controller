/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type { VRM } from "@pixiv/three-vrm";
import { VRMExpressionPreset } from "./expression-preset";

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

/**
 * Any expression name: a standard {@link VRMExpressionPreset} (autocompleted),
 * or a custom expression name the model author defined. The `& {}` keeps preset
 * literals suggested while still allowing arbitrary strings.
 */
export type VRMExpressionName = VRMExpressionPreset | (string & {});

/**
 * High-level face control via the VRM standard expression system
 * (`vrm.expressionManager`). Works across VRM 0.x and 1.0 models regardless of
 * how their blendshapes are named — prefer this over the raw morph-target
 * {@link VRMFaceController} unless you need to poke individual `Fcl_*` targets.
 *
 * Weights set here are applied to the mesh on the next `vrm.update(delta)`,
 * which `loadVRM`'s avatar (and the `<Vrm>` R3F component) already calls each
 * frame — so you just set values and let the render loop flush them.
 *
 * ```ts
 * const face = createVRMExpressionController(vrm);
 * face.setExpression("happy", 0.8).setExpression("blink", 1);
 * face.setExpressions({ aa: 0.5, happy: 1 });
 * face.reset();
 * ```
 */
export class VRMExpressionController {
  constructor(private readonly vrm: VRM) {}

  /**
   * Whether this model actually exposes an expression manager. When false every
   * getter returns an empty/zero result and every setter is a no-op, so callers
   * can use the controller unconditionally without guarding each call.
   */
  get available(): boolean {
    return this.vrm.expressionManager != null;
  }

  /** Every expression this model defines (presets + custom), unsorted. */
  getExpressionNames(): string[] {
    const manager = this.vrm.expressionManager;
    return manager ? Object.keys(manager.expressionMap) : [];
  }

  /** Whether the model defines an expression with this name. */
  hasExpression(name: VRMExpressionName): boolean {
    return this.vrm.expressionManager?.getExpression(name) != null;
  }

  /** Current weight of an expression, or 0 if it is absent. */
  getExpression(name: VRMExpressionName): number {
    return this.vrm.expressionManager?.getValue(name) ?? 0;
  }

  /** Set an expression weight (clamped to 0..1). Chainable. */
  setExpression(name: VRMExpressionName, weight: number): this {
    this.vrm.expressionManager?.setValue(name, clamp01(weight));
    return this;
  }

  /** Set several expressions at once. Undefined entries are skipped. Chainable. */
  setExpressions(weights: Partial<Record<VRMExpressionName, number>>): this {
    for (const [name, weight] of Object.entries(weights)) {
      if (typeof weight === "number") {
        this.setExpression(name, weight);
      }
    }
    return this;
  }

  /** Set a single expression back to 0. Chainable. */
  resetExpression(name: VRMExpressionName): this {
    return this.setExpression(name, 0);
  }

  /** Reset every expression weight to 0. Chainable. */
  reset(): this {
    this.vrm.expressionManager?.resetValues();
    return this;
  }

  // --- Short aliases (uniform verbs used across the createVRMFace facade) ---

  /** Alias of {@link setExpression}. */
  set(name: VRMExpressionName, weight: number): this {
    return this.setExpression(name, weight);
  }

  /** Alias of {@link getExpression}. */
  get(name: VRMExpressionName): number {
    return this.getExpression(name);
  }

  /** Alias of {@link hasExpression}. */
  has(name: VRMExpressionName): boolean {
    return this.hasExpression(name);
  }

  /** Alias of {@link getExpressionNames}. */
  list(): string[] {
    return this.getExpressionNames();
  }

  /** Snapshot of the current state, handy while debugging. */
  debug() {
    const names = this.getExpressionNames();

    return {
      available: this.available,
      expressions: names,
      values: Object.fromEntries(
        names.map((name) => [name, this.getExpression(name)]),
      ) as Record<string, number>,
    };
  }
}

export function createVRMExpressionController(vrm: VRM) {
  return new VRMExpressionController(vrm);
}
