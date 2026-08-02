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
import { PoseAccumulator } from "./channels";
import { createRecordingSink } from "./pose-sink";
import { createRigFrame } from "./rig-frame";
import type { Animator, AnimatorContext } from "./procedural-type";

export interface BakeOptions {
  /** Length of the clip in seconds. */
  duration: number;
  /** Samples per second. Default 30. */
  fps?: number;
  /**
   * Make the last sample identical to the first, so `THREE.LoopRepeat` has no
   * visible seam. Default false.
   */
  loop?: boolean;
  /** Clip name. Default "procedural". */
  name?: string;
}

/**
 * Sample an animator into a plain `THREE.AnimationClip`.
 *
 * This is the other half of the {@link PoseSink} seam: the animator runs
 * against a recording sink at a fixed timestep, so **the live model is never
 * touched** and the result is an ordinary clip — the same type
 * `loadMixamoAnimation` returns, playable through a plain
 * `new THREE.AnimationMixer(vrm.scene)` with the full three.js animation API
 * (crossfade, weights, time-scaling) available:
 *
 * ```ts
 * const clip = bakeAnimator(avatar.vrm, createIdleAnimator(), {
 *   duration: 8,
 *   fps: 30,
 *   loop: true,
 * });
 *
 * const mixer = new THREE.AnimationMixer(avatar.vrm.scene);
 * mixer.clipAction(clip).play();
 * avatar.registerUpdate((delta) => mixer.update(delta));
 * ```
 *
 * **Reproducible.** Nothing in the signal library calls `Math.random()`, the
 * animator is reset before sampling, and the timestep is fixed — so the same
 * animator and options always produce the same clip.
 *
 * Two things to know:
 * - Baking **resets** the animators it's given (before and after), so don't
 *   bake a stack that is mid-gesture and expect it to keep playing.
 * - Position tracks are emitted as rest + offset, where rest is read from the
 *   rig at bake time. Bake from a rig at rest — i.e. not while a procedural
 *   animator is live on the same model, which the exclusivity contract already
 *   rules out.
 * - Scene-dependent behaviors bake against the scene as it stands *now*: a
 *   look-at animator will bake a turn toward wherever its target happens to be,
 *   not a live-tracking clip.
 */
export function bakeAnimator(
  vrm: VRM,
  animator: Animator | Animator[],
  options: BakeOptions,
): THREE.AnimationClip {
  const layers = Array.isArray(animator) ? animator : [animator];
  const fps = options.fps ?? 30;
  const name = options.name ?? "procedural";

  if (!(fps > 0)) {
    throw new Error(`[fano-vrmkit] bakeAnimator needs fps > 0, got ${fps}.`);
  }

  if (!(options.duration > 0)) {
    throw new Error(
      `[fano-vrmkit] bakeAnimator needs duration > 0, got ${options.duration}.`,
    );
  }

  const step = 1 / fps;
  const frameCount = Math.max(1, Math.round(options.duration * fps));

  // Rest positions must be read before anything runs — position writes are
  // offsets from rest, and the clip needs absolute values.
  const restPositions = new Map<VRMHumanBoneName, THREE.Vector3>();

  const accumulator = new PoseAccumulator();
  const recorder = createRecordingSink();

  for (const layer of layers) layer.reset?.();

  // frameCount + 1 samples so the clip spans [0, duration] inclusive.
  for (let frame = 0; frame <= frameCount; frame += 1) {
    const time = frame * step;

    recorder.beginFrame(time);
    accumulator.beginFrame();

    const context: AnimatorContext = {
      // The first sample is the animator's initial state, not a step into it.
      delta: frame === 0 ? 0 : step,
      time,
      sink: accumulator,
      vrm,
    };

    for (const layer of layers) layer.update(context);

    accumulator.writeTo(recorder);
    recorder.endFrame();
  }

  for (const layer of layers) layer.reset?.();

  if (options.loop) {
    closeTheLoop(recorder.bones);
  }

  const tracks: THREE.KeyframeTrack[] = [];
  const times = recorder.times;

  // The other write boundary: the recorder holds authoring-convention values,
  // so a VRM 0.x model needs the same mirroring the live sink applies. Without
  // this a baked clip and its live counterpart would disagree.
  const frame = createRigFrame(vrm);

  for (const [bone, track] of recorder.bones) {
    const node = vrm.humanoid.getNormalizedBoneNode(bone);

    // A bone this model doesn't have — the animator wrote it harmlessly, and
    // there's nothing to name a track after.
    if (!node) continue;

    if (track.rotations.length > 0) {
      // x and z negated, y and w untouched — see createRigFrame.
      const rotations = frame.mirrored
        ? track.rotations.map((value, index) =>
            index % 4 === 0 || index % 4 === 2 ? -value : value,
          )
        : track.rotations;

      tracks.push(
        // Same naming as `retargetMixamoToVRM`, so a baked clip and a
        // retargeted one are interchangeable on the same mixer.
        new THREE.QuaternionKeyframeTrack(
          `${node.name}.quaternion`,
          times,
          rotations,
        ),
      );
    }

    if (track.positions.length > 0) {
      let rest = restPositions.get(bone);

      if (!rest) {
        rest = node.position.clone();
        restPositions.set(bone, rest);
      }

      // Rest comes off the model, so it's already in rig space; only the
      // authored offset is converted before being added to it.
      const absolute = track.positions.map((value, index) => {
        const axis = index % 3;
        const offset = frame.mirrored && axis !== 1 ? -value : value;
        return offset + (axis === 0 ? rest.x : axis === 1 ? rest.y : rest.z);
      });

      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${node.name}.position`,
          times,
          absolute,
        ),
      );
    }
  }

  return new THREE.AnimationClip(name, frameCount * step, tracks);
}

/**
 * Overwrite the final sample of every channel with its first, so a looped clip
 * has no discontinuity at the wrap point. Signals rarely land on a whole
 * number of cycles at the clip boundary; this is what makes `loop: true` mean
 * something.
 */
function closeTheLoop(
  bones: ReturnType<typeof createRecordingSink>["bones"],
): void {
  for (const track of bones.values()) {
    copyFirstOntoLast(track.rotations, 4);
    copyFirstOntoLast(track.positions, 3);
  }
}

function copyFirstOntoLast(values: number[], stride: number): void {
  if (values.length < stride * 2) return;

  const start = values.length - stride;

  for (let i = 0; i < stride; i += 1) {
    values[start + i] = values[i];
  }
}
