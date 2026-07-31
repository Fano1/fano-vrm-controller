/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type { VRM } from "@pixiv/three-vrm";
import { VRMExpressionController } from "./expression-controller";
import { VRMFaceController } from "./face-controller";
import { EmotionController } from "./controllers/emotion-controller";
import { VisemeController } from "./controllers/viseme-controller";
import { EyeController } from "./controllers/eye-controller";
import { BrowController } from "./controllers/brow-controller";

/**
 * Unified face facade with one clearly-separated controller per concern.
 *
 * Each sub-controller owns exactly one part of the face, so callers never mix
 * unrelated blendshapes through a single generic call:
 *
 * | Accessor        | Concern                              | VRM presets driven          |
 * | --------------- | ------------------------------------ | --------------------------- |
 * | {@link emotion} | mood / expression presets            | happy, angry, sad, relaxed, surprised, neutral |
 * | {@link viseme}  | vowels / lip-sync                    | aa, ih, ou, ee, oh          |
 * | {@link eye}     | eyelids (blink/wink) + gaze (lookAt) | blink, blinkLeft/Right, lookUp/Down/Left/Right |
 * | {@link brow}    | eyebrows (no VRM preset — raw morphs)| Fcl_BRW_* / generic brow    |
 * | {@link expression} | raw standard-preset + custom escape hatch | any preset or custom name |
 * | {@link morph}   | raw morph-target escape hatch        | any blendshape (Fcl_*, …)   |
 *
 * The concern controllers prefer the portable VRM standard expression system
 * and fall back to a universal fuzzy morph matcher, so the same code drives
 * VRoid, VRChat, and generic rigs.
 *
 * Expression weights are flushed on `vrm.update(delta)` (which `loadVRM`'s
 * avatar and the `<Vrm>` R3F component already call each frame). Anything that
 * needs a per-frame tick — the auto-blink FSM — is advanced by {@link update};
 * wire it into the avatar's `registerUpdate` so it runs before `vrm.update`:
 *
 * ```ts
 * const face = createVRMFace(avatar.vrm);
 * avatar.registerUpdate((delta) => face.update(delta));
 *
 * face.emotion.setExclusive("happy");
 * face.viseme.set("aa", 0.8);
 * face.eye.autoBlink();
 * face.eye.gaze(camera);
 * face.brow.set("angry", 1);
 * face.expression.set("myCustomShape", 1);
 * ```
 */
export class VRMFace {
  /** Mood / expression presets (happy, angry, sad, relaxed, surprised, neutral). */
  readonly emotion: EmotionController;

  /** Vowels / lip-sync visemes (aa, ih, ou, ee, oh). */
  readonly viseme: VisemeController;

  /** Eyelids (blink / wink + auto-blink) and gaze (procedural look-at). */
  readonly eye: EyeController;

  /** Eyebrows — raw morphs, since the VRM standard has no eyebrow preset. */
  readonly brow: BrowController;

  /** Escape hatch: the raw VRM standard expression system (presets + custom). */
  readonly expression: VRMExpressionController;

  /** Escape hatch: direct morph-target manipulation by name / pattern. */
  readonly morph: VRMFaceController;

  constructor(private readonly vrm: VRM) {
    this.expression = new VRMExpressionController(vrm);
    this.morph = new VRMFaceController(vrm);
    this.emotion = new EmotionController(this.expression, this.morph);
    this.viseme = new VisemeController(this.expression, this.morph);
    this.eye = new EyeController(vrm, this.expression, this.morph);
    this.brow = new BrowController(this.morph);
  }

  /** Whether this model exposes the VRM standard expression system. */
  get available(): boolean {
    return this.expression.available;
  }

  /**
   * Advance per-frame face state (currently the auto-blink FSM). Call once per
   * frame — ideally via `avatar.registerUpdate` so it runs before the VRM
   * update flushes expression weights. Chainable.
   */
  update(delta: number): this {
    this.eye.update(delta);
    return this;
  }

  /** Reset every face concern to its neutral state. Chainable. */
  reset(): this {
    this.emotion.reset();
    this.viseme.reset();
    this.eye.reset();
    this.brow.reset();
    this.expression.reset();
    return this;
  }

  /** Snapshot of every channel, handy while debugging. */
  debug() {
    return {
      available: this.available,
      emotions: this.emotion.list(),
      visemes: this.viseme.list(),
      brows: this.brow.list(),
      expression: this.expression.debug(),
      morph: this.morph.debug(),
    };
  }
}

/** Create a {@link VRMFace} facade for a loaded VRM. */
export function createVRMFace(vrm: VRM): VRMFace {
  return new VRMFace(vrm);
}
