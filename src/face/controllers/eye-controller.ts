/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import type { VRMExpressionController } from "../expression-controller";
import type { VRMFaceController } from "../face-controller";
import {
  BLINK_LEFT_PATTERNS,
  BLINK_PATTERNS,
  BLINK_RIGHT_PATTERNS,
} from "../face-utils";
import type { AutoBlinkOptions } from "../face-type";
import { AutoBlinkController } from "./auto-blink";

/** Expression-based look direction weights (0..1 per axis). */
export interface LookDirection {
  up?: number;
  down?: number;
  left?: number;
  right?: number;
}

/**
 * Groups the two "eyes" concerns of a VRM avatar:
 *
 * - **Eyelids** — blink / wink and procedural auto-blinking. Prefers the
 *   standard `blink`/`blinkLeft`/`blinkRight` expressions and falls back to
 *   fuzzy morph matching for rigs that lack them.
 * - **Gaze** — procedural {@link VRMLookAt} tracking, fixed-point look, or
 *   direct yaw/pitch, plus an expression-based look fallback for rigs whose
 *   eyes move via `lookUp`/`lookDown`/`lookLeft`/`lookRight` expressions.
 *
 * Weights set through the expression system are flushed on the next
 * `vrm.update(delta)`; wire {@link update} into your render loop (e.g.
 * `avatar.registerUpdate`) so the auto-blink FSM advances each frame.
 *
 * ```ts
 * const eyes = new EyeController(vrm, expr, face);
 * eyes.autoBlink({ minDelay: 3 });
 * eyes.gaze(camera);
 * // in the render loop:
 * eyes.update(delta);
 * ```
 */
export class EyeController {
  private _autoBlink: AutoBlinkController | null = null;

  constructor(
    private readonly vrm: VRM,
    private readonly expr: VRMExpressionController,
    private readonly face: VRMFaceController,
  ) {}

  // --- eyelids ---

  /** Close both eyes (0..1). Standard `blink` expression, else fuzzy morph. */
  blink(weight: number): this {
    if (this.expr.available && this.expr.has("blink")) {
      this.expr.set("blink", weight);
    } else {
      this.face.setMorphByPatterns(BLINK_PATTERNS, weight);
    }

    return this;
  }

  /** Close the left eye (0..1). Standard `blinkLeft` expression, else fuzzy morph. */
  blinkLeft(weight: number): this {
    if (this.expr.available && this.expr.has("blinkLeft")) {
      this.expr.set("blinkLeft", weight);
    } else {
      this.face.setMorphByPatterns(BLINK_LEFT_PATTERNS, weight);
    }

    return this;
  }

  /** Close the right eye (0..1). Standard `blinkRight` expression, else fuzzy morph. */
  blinkRight(weight: number): this {
    if (this.expr.available && this.expr.has("blinkRight")) {
      this.expr.set("blinkRight", weight);
    } else {
      this.face.setMorphByPatterns(BLINK_RIGHT_PATTERNS, weight);
    }

    return this;
  }

  /** Start procedural auto-blinking; returns the controller (also driven by {@link update}). */
  autoBlink(options?: AutoBlinkOptions): AutoBlinkController {
    this._autoBlink = new AutoBlinkController((w) => this.blink(w), options);
    return this._autoBlink;
  }

  /** Stop auto-blink and open the eyes. */
  stopAutoBlink(): this {
    if (this._autoBlink) {
      this._autoBlink.reset();
      this._autoBlink = null;
      this.blink(0);
    }

    return this;
  }

  // --- gaze (procedural VRMLookAt) ---

  /** Continuously track a scene object with the eyes. */
  gaze(target: THREE.Object3D): this {
    if (this.vrm.lookAt) {
      this.vrm.lookAt.target = target;
      this.vrm.lookAt.autoUpdate = true;
    }

    return this;
  }

  /** Point the eyes at a fixed world position once. */
  lookAt(position: THREE.Vector3): this {
    if (this.vrm.lookAt) {
      this.vrm.lookAt.autoUpdate = false;
      this.vrm.lookAt.lookAt(position);
    }

    return this;
  }

  /** Set gaze yaw/pitch in degrees. */
  setGazeAngles(yawDegrees: number, pitchDegrees: number): this {
    if (this.vrm.lookAt) {
      this.vrm.lookAt.autoUpdate = false;
      this.vrm.lookAt.yaw = yawDegrees;
      this.vrm.lookAt.pitch = pitchDegrees;
    }

    return this;
  }

  /** Stop tracking / reset gaze to center. */
  clearGaze(): this {
    if (this.vrm.lookAt) {
      this.vrm.lookAt.target = null;
      this.vrm.lookAt.reset();
    }

    return this;
  }

  /** Expression-based look direction (for eyes that move via expressions). */
  look(direction: LookDirection): this {
    if (typeof direction.up === "number") {
      this.expr.set("lookUp", direction.up);
    }

    if (typeof direction.down === "number") {
      this.expr.set("lookDown", direction.down);
    }

    if (typeof direction.left === "number") {
      this.expr.set("lookLeft", direction.left);
    }

    if (typeof direction.right === "number") {
      this.expr.set("lookRight", direction.right);
    }

    return this;
  }

  /** Per-frame tick — advances auto-blink if active. Wire into `avatar.registerUpdate`. */
  update(delta: number): this {
    if (this._autoBlink) {
      this._autoBlink.update(delta);
    }

    return this;
  }

  /** Reset eyelids, gaze, and look expressions. */
  reset(): this {
    this.stopAutoBlink();
    this.look({ up: 0, down: 0, left: 0, right: 0 });
    this.clearGaze();

    return this;
  }
}
