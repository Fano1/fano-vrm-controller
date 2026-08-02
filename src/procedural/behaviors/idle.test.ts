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
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { createIdleAnimator } from "./idle";
import { quaternionToEulerDegrees } from "../../body/body-utils";
import type { Animator, PoseSink } from "../procedural-type";

// Idle is pure signal math over channels — it never reads the VRM, so a bare
// object suffices while the rotations stay real three.js quaternions.
const vrm = {} as unknown as VRM;

/** Sample an idle animator over `seconds`, keeping every frame's degrees. */
function sample(animator: Animator, seconds = 20, fps = 30) {
  const perBone = new Map<VRMHumanBoneName, Array<{ x: number; y: number; z: number }>>();
  const positions = new Map<VRMHumanBoneName, THREE.Vector3[]>();

  const sink: PoseSink = {
    setBoneRotation(name, rotation) {
      const list = perBone.get(name) ?? [];
      list.push(quaternionToEulerDegrees(rotation));
      perBone.set(name, list);
    },
    setBonePosition(name, offset) {
      const list = positions.get(name) ?? [];
      list.push(offset.clone());
      positions.set(name, list);
    },
  };

  const frames = Math.round(seconds * fps);

  for (let frame = 0; frame <= frames; frame += 1) {
    animator.update({ delta: 1 / fps, time: frame / fps, sink, vrm });
  }

  return {
    bones: () => [...perBone.keys()],
    positionBones: () => [...positions.keys()],
    peak(bone: VRMHumanBoneName, axis: "x" | "y" | "z") {
      const list = perBone.get(bone);
      if (!list) return 0;
      return Math.max(...list.map((degrees) => Math.abs(degrees[axis])));
    },
    positionPeak(bone: VRMHumanBoneName, axis: "x" | "y" | "z") {
      const list = positions.get(bone);
      if (!list) return 0;
      return Math.max(...list.map((offset) => Math.abs(offset[axis])));
    },
  };
}

describe("createIdleAnimator — defaults", () => {
  it("drives breathing, sway and wander out of the box", () => {
    const bones = sample(createIdleAnimator()).bones().sort();

    expect(bones).toContain("chest");
    expect(bones).toContain("spine");
    expect(bones).toContain("hips");
    expect(bones).toContain("head");
    expect(bones).toContain("neck");
  });

  it("keeps every default amplitude subtle", () => {
    // These are degrees on a humanoid — anything past a few degrees of idle
    // reads as a twitch, not as breathing.
    const idle = sample(createIdleAnimator());

    expect(idle.peak("chest", "x")).toBeLessThan(4);
    expect(idle.peak("hips", "z")).toBeLessThan(4);
    expect(idle.peak("head", "y")).toBeLessThan(4);
  });

  it("leaves the hips on the floor unless bobbing is asked for", () => {
    // Translating the hips lifts the feet, so it can't be a default.
    expect(sample(createIdleAnimator()).positionBones()).toEqual([]);
  });

  it("is deterministic — the same options replay identically", () => {
    const first = sample(createIdleAnimator({ noise: { seed: 3 } }), 5);
    const second = sample(createIdleAnimator({ noise: { seed: 3 } }), 5);

    expect(first.peak("head", "y")).toBe(second.peak("head", "y"));
    expect(first.peak("chest", "x")).toBe(second.peak("chest", "x"));
  });
});

describe("createIdleAnimator — switching parts off", () => {
  it("breathing: false drops the chest entirely", () => {
    const bones = sample(
      createIdleAnimator({ breathing: false, noise: false }),
    ).bones();

    expect(bones).not.toContain("chest");
    expect(bones).toContain("hips"); // sway still on
  });

  it("sway: false leaves the hips alone", () => {
    const bones = sample(createIdleAnimator({ sway: false, noise: false })).bones();

    expect(bones).not.toContain("hips");
    expect(bones).toContain("chest");
  });

  it("noise: false drops the shoulder wander", () => {
    const bones = sample(createIdleAnimator({ noise: false })).bones();

    expect(bones).not.toContain("leftShoulder");
    expect(bones).not.toContain("rightShoulder");
  });

  it("everything off writes nothing at all", () => {
    const idle = sample(
      createIdleAnimator({
        breathing: false,
        sway: false,
        noise: false,
        bob: false,
      }),
    );

    expect(idle.bones()).toEqual([]);
    expect(idle.positionBones()).toEqual([]);
  });
});

describe("createIdleAnimator — tuning", () => {
  it("scales breathing to the requested amplitude", () => {
    const idle = sample(
      createIdleAnimator({ breathing: { amp: 10 }, sway: false, noise: false }),
    );

    expect(idle.peak("chest", "x")).toBeCloseTo(10, 0);
  });

  it("counter-rotates the head so the gaze stays level", () => {
    // The head inherits the chest's rotation, so it leans back by a fraction
    // of the breath to stay put.
    const idle = sample(
      createIdleAnimator({
        breathing: { amp: 10, headCounterRatio: 0.5 },
        sway: false,
        noise: false,
      }),
    );

    expect(idle.peak("head", "x")).toBeCloseTo(5, 0);
  });

  it("headCounterRatio: 0 lets the head ride the chest", () => {
    const bones = sample(
      createIdleAnimator({
        breathing: { headCounterRatio: 0 },
        sway: false,
        noise: false,
      }),
    ).bones();

    expect(bones).not.toContain("head");
  });

  it("merges partial options over the defaults", () => {
    // Passing only `amp` must keep the default 0.25 Hz rate rather than
    // resetting the rest of the section to undefined.
    const idle = sample(
      createIdleAnimator({ breathing: { amp: 6 }, sway: false, noise: false }),
      8,
    );

    expect(idle.peak("chest", "x")).toBeCloseTo(6, 0);
  });

  it("bob: true translates the hips vertically", () => {
    const idle = sample(
      createIdleAnimator({ breathing: false, sway: false, noise: false, bob: true }),
    );

    expect(idle.positionBones()).toEqual(["hips"]);
    expect(idle.positionPeak("hips", "y")).toBeGreaterThan(0);
    expect(idle.positionPeak("hips", "y")).toBeLessThan(0.01);
    expect(idle.positionPeak("hips", "x")).toBe(0);
  });

  it("bob amplitude is in metres", () => {
    const idle = sample(
      createIdleAnimator({ breathing: false, sway: false, noise: false, bob: { amp: 0.05 } }),
    );

    expect(idle.positionPeak("hips", "y")).toBeCloseTo(0.05, 3);
  });
});

describe("createIdleAnimator — motion quality", () => {
  it("actually moves rather than holding a constant offset", () => {
    const perFrame: number[] = [];

    const sink: PoseSink = {
      setBoneRotation(name, rotation) {
        if (name === "chest") perFrame.push(quaternionToEulerDegrees(rotation).x);
      },
      setBonePosition() {},
    };

    const idle = createIdleAnimator({ sway: false, noise: false });

    for (let frame = 0; frame <= 300; frame += 1) {
      idle.update({ delta: 1 / 30, time: frame / 30, sink, vrm });
    }

    expect(Math.max(...perFrame) - Math.min(...perFrame)).toBeGreaterThan(1);
  });

  it("does not resync roll and yaw into a short, obvious loop", () => {
    // Hip roll and hip yaw run at rates in an irrational-ish ratio, so the
    // combined pose should not repeat within a short window.
    const rolls: number[] = [];
    const yaws: number[] = [];

    const sink: PoseSink = {
      setBoneRotation(name, rotation) {
        if (name !== "hips") return;
        const degrees = quaternionToEulerDegrees(rotation);
        rolls.push(degrees.z);
        yaws.push(degrees.y);
      },
      setBonePosition() {},
    };

    const idle = createIdleAnimator({ breathing: false, noise: false });

    for (let frame = 0; frame <= 600; frame += 1) {
      idle.update({ delta: 1 / 30, time: frame / 30, sink, vrm });
    }

    // A full roll period is ~9s; if yaw were locked to it, the pose at t and
    // t+9s would match. It shouldn't.
    const period = Math.round(9 * 30);
    expect(Math.abs(yaws[0] - yaws[period])).toBeGreaterThan(0.05);
  });
});
