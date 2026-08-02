/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { VRM, VRMHumanBoneName, VRMPose } from "@pixiv/three-vrm";
import {
  createGestureAnimator,
  gesturePoseFromVRMPose,
  type GestureKeyframe,
} from "./gesture";
import { quaternionToEulerDegrees } from "../../body/body-utils";
import type { PoseSink } from "../procedural-type";

// Gestures never read the VRM, so a bare object is enough here; the rotation
// math still runs through real three.js quaternions.
const vrm = {} as unknown as VRM;

function fakeSink() {
  const rotations = new Map<VRMHumanBoneName, THREE.Quaternion>();

  const sink: PoseSink = {
    setBoneRotation(name, rotation) {
      rotations.set(name, rotation.clone());
    },
    setBonePosition() {},
  };

  return { sink, rotations };
}

/** Advance an animator by `frames` steps and read back the degrees written. */
function step(
  animator: { update: (context: never) => void },
  frames: number,
  dt = 1 / 60,
) {
  const { sink, rotations } = fakeSink();

  for (let frame = 0; frame < frames; frame += 1) {
    animator.update({
      delta: dt,
      time: frame * dt,
      sink,
      vrm,
    } as never);
  }

  return {
    degrees(bone: VRMHumanBoneName) {
      const rotation = rotations.get(bone);
      return rotation ? quaternionToEulerDegrees(rotation) : null;
    },
    bones: () => [...rotations.keys()],
  };
}

const WAVE: GestureKeyframe[] = [
  { time: 0, pose: {} },
  { time: 1, pose: { rightUpperArm: { z: -80 } }, ease: "linear" },
  { time: 2, pose: {} , ease: "linear" },
];

describe("createGestureAnimator — playback", () => {
  it("does nothing until a gesture is played", () => {
    const gestures = createGestureAnimator({ wave: WAVE });
    expect(step(gestures, 10).bones()).toEqual([]);
    expect(gestures.playing).toBe(false);
    expect(gestures.current).toBeNull();
  });

  it("interpolates between keyframes", () => {
    const gestures = createGestureAnimator({ wave: WAVE }, { crossFade: 0 });
    gestures.play("wave");

    // Halfway to the first keyframe on a linear ease.
    const half = step(gestures, 30, 1 / 60);
    expect(half.degrees("rightUpperArm")!.z).toBeCloseTo(-40, 0);
  });

  it("reaches the keyframe pose exactly", () => {
    const gestures = createGestureAnimator({ wave: WAVE }, { crossFade: 0 });
    gestures.play("wave");

    const atPeak = step(gestures, 60, 1 / 60);
    expect(atPeak.degrees("rightUpperArm")!.z).toBeCloseTo(-80, 1);
  });

  it("applies the easing curve attached to the incoming keyframe", () => {
    const eased = createGestureAnimator(
      {
        g: [
          { time: 0, pose: { head: { y: 0 } } },
          { time: 1, pose: { head: { y: 100 } }, ease: "easeInQuad" },
        ],
      },
      { crossFade: 0 },
    );

    eased.play("g");

    // easeInQuad(0.5) = 0.25 → a quarter of the way, not half.
    expect(step(eased, 30, 1 / 60).degrees("head")!.y).toBeCloseTo(25, 0);
  });

  it("honors the speed multiplier", () => {
    const gestures = createGestureAnimator({ wave: WAVE }, { crossFade: 0 });
    gestures.play("wave", { speed: 2 });

    // Twice as fast, so half a second in we're already at the 1s keyframe.
    expect(step(gestures, 30, 1 / 60).degrees("rightUpperArm")!.z).toBeCloseTo(
      -80,
      1,
    );
  });

  it("sorts keyframes given out of order", () => {
    const gestures = createGestureAnimator(
      {
        g: [
          { time: 1, pose: { head: { y: 90 } }, ease: "linear" },
          { time: 0, pose: { head: { y: 0 } } },
        ],
      },
      { crossFade: 0 },
    );

    gestures.play("g");
    expect(step(gestures, 30, 1 / 60).degrees("head")!.y).toBeCloseTo(45, 0);
  });

  it("throws with a useful message for an unknown gesture", () => {
    const gestures = createGestureAnimator({ wave: WAVE });
    expect(() => gestures.play("nope")).toThrow(/Unknown gesture "nope"/);
    expect(() => gestures.play("nope")).toThrow(/wave/);
  });
});

describe("createGestureAnimator — release and looping", () => {
  it("releases at the end of a non-looping gesture", () => {
    const gestures = createGestureAnimator({ wave: WAVE }, { crossFade: 0 });
    gestures.play("wave");

    step(gestures, 130, 1 / 60); // past the 2s clip
    expect(gestures.playing).toBe(false);
    expect(gestures.current).toBeNull();
  });

  it("returns the joint to rest after releasing", () => {
    // Without this an ended gesture would leave the arm stuck in the air.
    const gestures = createGestureAnimator(
      { g: [{ time: 0, pose: { head: { y: 45 } } }, { time: 0.5, pose: { head: { y: 45 } } }] },
      { crossFade: 0.1 },
    );

    gestures.play("g", { crossFade: 0 });
    const settled = step(gestures, 60, 1 / 60);

    expect(Math.abs(settled.degrees("head")!.y)).toBeLessThan(1);
  });

  it("wraps around instead of releasing when looping", () => {
    const gestures = createGestureAnimator(
      { g: { keyframes: WAVE, loop: true } },
      { crossFade: 0 },
    );

    gestures.play("g");
    step(gestures, 200, 1 / 60);

    expect(gestures.playing).toBe(true);
    expect(gestures.current).toBe("g");
  });

  it("lets play() override the clip's own loop flag", () => {
    const gestures = createGestureAnimator(
      { g: { keyframes: WAVE, loop: true } },
      { crossFade: 0 },
    );

    gestures.play("g", { loop: false });
    step(gestures, 200, 1 / 60);

    expect(gestures.playing).toBe(false);
  });

  it("holds the last pose until `duration` when one is set", () => {
    const gestures = createGestureAnimator(
      {
        g: {
          keyframes: [
            { time: 0, pose: {} },
            { time: 0.5, pose: { head: { y: 60 } }, ease: "linear" },
          ],
          duration: 2,
        },
      },
      { crossFade: 0 },
    );

    gestures.play("g");

    // At 1s the keyframes are exhausted but the clip runs to 2s, so the final
    // pose is held rather than released.
    expect(step(gestures, 60, 1 / 60).degrees("head")!.y).toBeCloseTo(60, 1);
    expect(gestures.playing).toBe(true);
  });
});

describe("createGestureAnimator — blending", () => {
  it("blends out of the current pose instead of snapping", () => {
    const gestures = createGestureAnimator(
      {
        a: [{ time: 0, pose: { head: { y: 60 } } }, { time: 5, pose: { head: { y: 60 } } }],
        b: [{ time: 0, pose: { head: { y: -60 } } }, { time: 5, pose: { head: { y: -60 } } }],
      },
      { crossFade: 0 },
    );

    gestures.play("a");
    step(gestures, 30, 1 / 60);

    gestures.play("b", { crossFade: 1 });
    // A tenth of the way through a 1s blend from +60 to -60 — nowhere near
    // either endpoint yet.
    const midBlend = step(gestures, 6, 1 / 60).degrees("head")!.y;

    expect(midBlend).toBeLessThan(60);
    expect(midBlend).toBeGreaterThan(0);
  });

  it("stop() blends back to rest", () => {
    const gestures = createGestureAnimator(
      { a: [{ time: 0, pose: { head: { y: 60 } } }, { time: 5, pose: { head: { y: 60 } } }] },
      { crossFade: 0 },
    );

    gestures.play("a");
    step(gestures, 30, 1 / 60);

    gestures.stop({ crossFade: 0.5 });
    expect(gestures.playing).toBe(false);

    const settled = step(gestures, 60, 1 / 60);
    expect(Math.abs(settled.degrees("head")!.y)).toBeLessThan(1);
  });

  it("stop() on an idle animator is a no-op", () => {
    const gestures = createGestureAnimator({ a: WAVE });
    expect(() => gestures.stop()).not.toThrow();
  });

  it("animates a bone present in only one of two keyframes from rest", () => {
    const gestures = createGestureAnimator(
      {
        g: [
          { time: 0, pose: { head: { y: 30 } } },
          { time: 1, pose: { head: { y: 30 }, neck: { y: 40 } }, ease: "linear" },
        ],
      },
      { crossFade: 0 },
    );

    gestures.play("g");
    const half = step(gestures, 30, 1 / 60);

    expect(half.degrees("head")!.y).toBeCloseTo(30, 1);
    expect(half.degrees("neck")!.y).toBeCloseTo(20, 0); // 0 -> 40, halfway
  });
});

describe("createGestureAnimator — introspection and reset", () => {
  it("lists registered gestures", () => {
    const gestures = createGestureAnimator({ wave: WAVE, nod: WAVE });
    expect(gestures.list().sort()).toEqual(["nod", "wave"]);
  });

  it("reset clears playback state", () => {
    const gestures = createGestureAnimator({ wave: WAVE }, { crossFade: 0 });

    gestures.play("wave");
    step(gestures, 30, 1 / 60);
    gestures.reset!();

    expect(gestures.playing).toBe(false);
    expect(step(gestures, 1).bones()).toEqual([]);
  });
});

describe("gesturePoseFromVRMPose", () => {
  it("converts a captured pose's rotations into keyframe degrees", () => {
    // The "pose the model, snapshot it, replay it as a gesture" workflow.
    const rotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, THREE.MathUtils.degToRad(45), 0, "XYZ"),
    );

    const pose: VRMPose = {
      head: { rotation: rotation.toArray() as [number, number, number, number] },
    };

    const converted = gesturePoseFromVRMPose(pose);
    expect(converted.head!.y).toBeCloseTo(45, 4);
  });

  it("drops entries without a rotation", () => {
    const pose: VRMPose = { hips: { position: [0, 1, 0] } };
    expect(gesturePoseFromVRMPose(pose)).toEqual({});
  });
});
