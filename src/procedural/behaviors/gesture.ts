/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import * as THREE from "three";
import type { VRMHumanBoneName, VRMPose } from "@pixiv/three-vrm";
import {
  eulerDegreesToQuaternion,
  quaternionToEulerDegrees,
} from "../../body/body-utils";
import type { EulerDegrees, EulerOrder } from "../../body/body-type";
import { resolveEasing, type EasingLike } from "../easing";
import type { Animator, AnimatorContext, PoseDegrees } from "../procedural-type";

/** One pose held at one moment on a gesture's timeline. */
export interface GestureKeyframe {
  /** Seconds from the start of the gesture. */
  time: number;
  /** The pose to hit, in degrees. Bones left out are at rest. */
  pose: PoseDegrees;
  /**
   * Curve used to approach *this* keyframe from the previous one. Default
   * `easeInOutCubic` — see {@link EASINGS} for the named options.
   */
  ease?: EasingLike;
}

/** A named gesture: keyframes, plus how they play. */
export interface GestureClip {
  keyframes: GestureKeyframe[];
  /** Repeat from the top instead of releasing at the end. Default false. */
  loop?: boolean;
  /**
   * Total length in seconds. Defaults to the last keyframe's time — set it
   * longer to hold the final pose before the gesture releases or loops.
   */
  duration?: number;
}

/** A gesture, or just its keyframes when the defaults are fine. */
export type GestureLike = GestureClip | GestureKeyframe[];

export interface PlayOptions {
  /** Override the clip's own `loop`. */
  loop?: boolean;
  /** Seconds to blend in from whatever is currently posed. Default 0.25. */
  crossFade?: number;
  /** Playback rate. 2 is twice as fast. Default 1. */
  speed?: number;
}

export interface GestureAnimator extends Animator {
  /** Start a gesture, blending out of whatever was playing. */
  play(name: string, options?: PlayOptions): this;
  /** Blend back to rest. */
  stop(options?: { crossFade?: number }): this;
  /** The gesture currently playing, or null. */
  readonly current: string | null;
  /** Whether a gesture is playing (a blend-out alone doesn't count). */
  readonly playing: boolean;
  /** Every gesture name registered. */
  list(): string[];
}

export interface GestureAnimatorOptions {
  /** Default blend duration for {@link GestureAnimator.play} / `stop`. Default 0.25. */
  crossFade?: number;
  /** Euler order used to turn keyframe degrees into rotations. Default "XYZ". */
  order?: EulerOrder;
}

const DEFAULT_CROSS_FADE = 0.25;
const DEFAULT_EASE: EasingLike = "easeInOutCubic";

/** Per-bone degrees, the internal working format for a sampled pose. */
type SampledPose = Map<VRMHumanBoneName, EulerDegrees>;

function toClip(gesture: GestureLike): GestureClip {
  return Array.isArray(gesture) ? { keyframes: gesture } : gesture;
}

/** Keyframes sorted by time, so authors can list them in any order. */
function sortKeyframes(keyframes: GestureKeyframe[]): GestureKeyframe[] {
  return [...keyframes].sort((a, b) => a.time - b.time);
}

function clipDuration(clip: GestureClip, keyframes: GestureKeyframe[]): number {
  if (clip.duration !== undefined) return clip.duration;
  return keyframes.length > 0 ? keyframes[keyframes.length - 1].time : 0;
}

function readAxis(pose: PoseDegrees, bone: VRMHumanBoneName): EulerDegrees {
  const entry = pose[bone];
  return { x: entry?.x ?? 0, y: entry?.y ?? 0, z: entry?.z ?? 0 };
}

/** Linear blend of two poses over the union of their bones (missing = rest). */
function blendPoses(from: SampledPose, to: SampledPose, t: number): SampledPose {
  const result: SampledPose = new Map();
  const bones = new Set([...from.keys(), ...to.keys()]);

  for (const bone of bones) {
    const a = from.get(bone) ?? { x: 0, y: 0, z: 0 };
    const b = to.get(bone) ?? { x: 0, y: 0, z: 0 };

    result.set(bone, {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    });
  }

  return result;
}

/**
 * Sample a keyframe timeline at `time`, interpolating in degree space.
 *
 * Degrees (rather than quaternion slerp) because that's the authoring format —
 * a keyframe you wrote as `{ z: -80 }` interpolates through the angles you'd
 * expect, and the single conversion to a quaternion happens once at write time.
 */
function samplePose(
  keyframes: GestureKeyframe[],
  time: number,
): SampledPose {
  const result: SampledPose = new Map();

  if (keyframes.length === 0) return result;

  if (time <= keyframes[0].time) {
    for (const bone of Object.keys(keyframes[0].pose) as VRMHumanBoneName[]) {
      result.set(bone, readAxis(keyframes[0].pose, bone));
    }
    return result;
  }

  const last = keyframes[keyframes.length - 1];

  if (time >= last.time) {
    for (const bone of Object.keys(last.pose) as VRMHumanBoneName[]) {
      result.set(bone, readAxis(last.pose, bone));
    }
    return result;
  }

  let index = 0;
  while (index < keyframes.length - 1 && keyframes[index + 1].time <= time) {
    index += 1;
  }

  const from = keyframes[index];
  const to = keyframes[index + 1];
  const span = to.time - from.time;
  const raw = span > 0 ? (time - from.time) / span : 1;
  const t = resolveEasing(to.ease ?? DEFAULT_EASE)(raw);

  // Union of both keyframes' bones — a bone in only one of them animates from
  // (or to) rest rather than popping.
  const bones = new Set<VRMHumanBoneName>([
    ...(Object.keys(from.pose) as VRMHumanBoneName[]),
    ...(Object.keys(to.pose) as VRMHumanBoneName[]),
  ]);

  for (const bone of bones) {
    const a = readAxis(from.pose, bone);
    const b = readAxis(to.pose, bone);

    result.set(bone, {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    });
  }

  return result;
}

/**
 * A pose timeline — named gestures you fire on demand, blended in and out.
 *
 * ```ts
 * const gestures = createGestureAnimator({
 *   wave: [
 *     { time: 0,   pose: {} },
 *     { time: 0.3, pose: { rightUpperArm: { z: -75 }, rightLowerArm: { z: -20 } } },
 *     { time: 0.6, pose: { rightUpperArm: { z: -75 }, rightLowerArm: { z: -50 } } },
 *     { time: 0.9, pose: { rightUpperArm: { z: -75 }, rightLowerArm: { z: -20 } } },
 *     { time: 1.4, pose: {} },
 *   ],
 * });
 *
 * gestures.play("wave");
 * ```
 *
 * A non-looping gesture releases when it reaches the end, blending back to
 * rest over `crossFade` — so the idle layer underneath takes over again
 * without you scheduling anything. Playing a new gesture mid-flight blends out
 * of the current pose rather than snapping.
 *
 * Bones the model lacks are written and harmlessly ignored (fingers,
 * shoulders, and toes are all optional in the VRM spec), so one gesture
 * library works across rigs.
 */
export function createGestureAnimator(
  gestures: Record<string, GestureLike> = {},
  options: GestureAnimatorOptions = {},
): GestureAnimator {
  const defaultCrossFade = options.crossFade ?? DEFAULT_CROSS_FADE;

  const clips = new Map<
    string,
    { keyframes: GestureKeyframe[]; loop: boolean; duration: number }
  >();

  for (const [name, gesture] of Object.entries(gestures)) {
    const clip = toClip(gesture);
    const keyframes = sortKeyframes(clip.keyframes);

    clips.set(name, {
      keyframes,
      loop: clip.loop ?? false,
      duration: clipDuration(clip, keyframes),
    });
  }

  let current: string | null = null;
  let playhead = 0;
  let speed = 1;
  let looping = false;

  /** Blend state: where we came from, and how far through the blend we are. */
  let fadeFrom: SampledPose | null = null;
  let fadeElapsed = 0;
  let fadeDuration = 0;

  /** Last pose written — the snapshot a new blend starts from. */
  let lastPose: SampledPose = new Map();

  const scratchQuaternion = new THREE.Quaternion();

  function beginFade(duration: number): void {
    if (duration <= 0) {
      fadeFrom = null;
      return;
    }

    fadeFrom = new Map(lastPose);
    fadeElapsed = 0;
    fadeDuration = duration;
  }

  function update({ delta, sink }: AnimatorContext): void {
    const clip = current ? clips.get(current) : undefined;

    if (clip) {
      playhead += delta * speed;

      if (playhead >= clip.duration) {
        if (looping && clip.duration > 0) {
          playhead %= clip.duration;
        } else {
          // Ran off the end — release, blending back to rest.
          current = null;
          beginFade(defaultCrossFade);
        }
      }
    }

    const active = current ? clips.get(current) : undefined;
    let pose: SampledPose = active
      ? samplePose(active.keyframes, playhead)
      : new Map();

    if (fadeFrom) {
      fadeElapsed += delta;
      const t = fadeDuration > 0 ? Math.min(fadeElapsed / fadeDuration, 1) : 1;
      pose = blendPoses(fadeFrom, pose, t);
      if (t >= 1) fadeFrom = null;
    }

    for (const [bone, degrees] of pose) {
      sink.setBoneRotation(
        bone,
        eulerDegreesToQuaternion(degrees, options.order, scratchQuaternion),
      );
    }

    lastPose = pose;
  }

  return {
    update,

    reset() {
      current = null;
      playhead = 0;
      speed = 1;
      looping = false;
      fadeFrom = null;
      fadeElapsed = 0;
      fadeDuration = 0;
      lastPose = new Map();
    },

    play(name: string, playOptions: PlayOptions = {}) {
      const clip = clips.get(name);

      if (!clip) {
        throw new Error(
          `[fano-vrmkit] Unknown gesture "${name}". Registered: ${
            clips.size > 0 ? [...clips.keys()].join(", ") : "(none)"
          }.`,
        );
      }

      beginFade(playOptions.crossFade ?? defaultCrossFade);

      current = name;
      playhead = 0;
      speed = playOptions.speed ?? 1;
      looping = playOptions.loop ?? clip.loop;

      return this;
    },

    stop(stopOptions: { crossFade?: number } = {}) {
      if (current === null && !fadeFrom) return this;

      beginFade(stopOptions.crossFade ?? defaultCrossFade);
      current = null;
      playhead = 0;

      return this;
    },

    get current() {
      return current;
    },

    get playing() {
      return current !== null;
    },

    list() {
      return [...clips.keys()];
    },
  };
}

/**
 * Convert a `VRMPose` snapshot into gesture keyframe degrees — so you can pose
 * a model however you like (a UI, `body.setEulerDegrees`, a paused clip), take
 * `body.getPose()`, and drop the result straight into a keyframe.
 *
 * Only rotations carry over; `VRMPose` positions are dropped, since gesture
 * keyframes describe joint angles.
 */
export function gesturePoseFromVRMPose(
  pose: VRMPose,
  order?: EulerOrder,
): PoseDegrees {
  const result: PoseDegrees = {};
  const quaternion = new THREE.Quaternion();

  for (const [bone, state] of Object.entries(pose)) {
    const rotation = state?.rotation;
    if (!rotation) continue;

    quaternion.fromArray(rotation as number[]);
    result[bone as VRMHumanBoneName] = quaternionToEulerDegrees(
      quaternion,
      order,
    );
  }

  return result;
}
