/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import * as THREE from "three";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { EulerOrder } from "../body/body-type";
import { createVRMBody, type VRMBody } from "../body/vrm-body";
import { EulerAccumulator, PoseAccumulator } from "./channels";
import { createBodySink } from "./pose-sink";
import type {
  Animator,
  AnimatorContext,
  Channel,
  PoseSink,
} from "./procedural-type";

/**
 * Wrap a plain function into an {@link Animator} — the imperative escape hatch
 * under the whole declarative layer. Anything the signal/channel primitives
 * can't express, write here.
 *
 * ```ts
 * const wobble = createAnimator(({ time, sink }) => {
 *   sink.setBoneRotation(
 *     "leftUpperArm",
 *     new THREE.Quaternion().setFromAxisAngle(AXIS_Z, Math.sin(time * 2) * 0.2),
 *   );
 * });
 * ```
 */
export function createAnimator(
  update: (context: AnimatorContext) => void,
  options: { reset?: () => void } = {},
): Animator {
  return { update, reset: options.reset };
}

/**
 * Build an {@link Animator} from {@link Channel}s — the declarative path.
 *
 * Channels are grouped by bone at construction; each frame every channel for a
 * bone is sampled, the degrees are summed per axis, and the result becomes one
 * quaternion write. See {@link EulerAccumulator} for why the sum happens in
 * degree space and the conversion happens exactly once.
 *
 * ```ts
 * createChannelAnimator([
 *   channel("spine", "x", sine({ hz: 0.25, amp: 2 })),
 *   channel("chest", "x", sine({ hz: 0.25, amp: 3 })),
 * ]);
 * ```
 */
export function createChannelAnimator(
  channels: Channel[],
  options: { order?: EulerOrder } = {},
): Animator {
  // Group once, not per frame.
  const byBone = new Map<VRMHumanBoneName, Channel[]>();

  for (const item of channels) {
    const existing = byBone.get(item.bone);
    if (existing) existing.push(item);
    else byBone.set(item.bone, [item]);
  }

  // One scratch accumulator + quaternion per bone, reused every frame — the
  // sink clones on first write, so handing it a reused instance is safe.
  const scratch = new Map<
    VRMHumanBoneName,
    { euler: EulerAccumulator; quaternion: THREE.Quaternion }
  >();

  for (const bone of byBone.keys()) {
    scratch.set(bone, {
      euler: new EulerAccumulator(),
      quaternion: new THREE.Quaternion(),
    });
  }

  return {
    update({ time, delta, sink }) {
      for (const [bone, boneChannels] of byBone) {
        const { euler, quaternion } = scratch.get(bone)!;

        euler.clear();

        for (const item of boneChannels) {
          euler.add(item.axis, item.signal(time, delta));
        }

        sink.setBoneRotation(
          bone,
          euler.toQuaternion(options.order, quaternion),
        );
      }
    },

    reset() {
      for (const item of channels) item.signal.reset?.();
    },
  };
}

/** Run several animators as one, in order. */
export function combineAnimators(...animators: Animator[]): Animator {
  return {
    update(context) {
      for (const animator of animators) animator.update(context);
    },

    reset() {
      for (const animator of animators) animator.reset?.();
    },
  };
}

export interface ProceduralAnimatorOptions {
  /**
   * Where the composed pose goes. Defaults to a {@link createBodySink} over a
   * fresh {@link VRMBody} — override only if you're routing the output
   * somewhere unusual.
   */
  sink?: PoseSink;
}

/**
 * The layer stack: runs a list of {@link Animator}s each frame, composes their
 * contributions, and writes the result to the model.
 *
 * Later layers compose *on top of* earlier ones (rotations multiply, position
 * offsets add), so order matters — put the base motion first and the small
 * additions after it:
 *
 * ```ts
 * const anim = createProceduralAnimator(avatar.vrm, [gesture, idle, look]);
 * avatar.registerUpdate((delta) => anim.update(delta));
 * ```
 *
 * **Do not run a Mixamo `AnimationMixer` on the same model at the same time.**
 * Both write `vrm.humanoid`'s normalized rig, and this one writes every bone it
 * owns on every frame, so whichever runs later in `registerUpdate` order simply
 * overwrites the other. Use pre-authored clips *or* procedural animation —
 * switching between them at runtime is fine (call {@link reset} first), running
 * both at once is not.
 */
export class ProceduralAnimator {
  private readonly accumulator = new PoseAccumulator();
  private readonly output: PoseSink;
  private readonly body: VRMBody;
  private readonly layers: Animator[];
  private elapsed = 0;

  constructor(
    private readonly vrm: VRM,
    layers: Animator[] = [],
    options: ProceduralAnimatorOptions = {},
  ) {
    this.layers = [...layers];
    this.body = createVRMBody(vrm);
    this.output = options.sink ?? createBodySink(this.body);
  }

  /** Seconds this animator has been running since the last {@link reset}. */
  get time(): number {
    return this.elapsed;
  }

  /** The layers currently in the stack, in composition order. */
  getLayers(): readonly Animator[] {
    return this.layers;
  }

  /** Append a layer on top of the stack. Chainable. */
  add(...layers: Animator[]): this {
    this.layers.push(...layers);
    return this;
  }

  /**
   * Remove a layer. The bones it was driving relax to rest on the next frame,
   * since the accumulator re-emits untouched bones as identity. Chainable.
   */
  remove(layer: Animator): this {
    const index = this.layers.indexOf(layer);
    if (index !== -1) this.layers.splice(index, 1);
    return this;
  }

  /** Advance every layer by `delta` seconds and flush the composed pose. */
  update(delta: number): this {
    this.elapsed += delta;
    this.accumulator.beginFrame();

    const context: AnimatorContext = {
      delta,
      time: this.elapsed,
      sink: this.accumulator,
      vrm: this.vrm,
    };

    for (const layer of this.layers) {
      layer.update(context);
    }

    this.accumulator.writeTo(this.output);
    return this;
  }

  /**
   * Rewind every layer's state, return the driven bones to rest, and forget
   * them. Call this before handing the rig over to a Mixamo mixer. Chainable.
   */
  reset(): this {
    for (const layer of this.layers) layer.reset?.();

    this.elapsed = 0;

    // An empty frame flushes identity to every bone the stack ever touched.
    this.accumulator.beginFrame();
    this.accumulator.writeTo(this.output);
    this.accumulator.clear();

    return this;
  }
}

/** Create a {@link ProceduralAnimator} for a loaded VRM. */
export function createProceduralAnimator(
  vrm: VRM,
  layers: Animator[] = [],
  options: ProceduralAnimatorOptions = {},
): ProceduralAnimator {
  return new ProceduralAnimator(vrm, layers, options);
}
