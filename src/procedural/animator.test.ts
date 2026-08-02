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
import {
  combineAnimators,
  createAnimator,
  createChannelAnimator,
  createProceduralAnimator,
} from "./animator";
import { channel, channels, EulerAccumulator, PoseAccumulator } from "./channels";
import { constant, sine } from "./signals";
import { quaternionToEulerDegrees } from "../body/body-utils";
import type { Animator, PoseSink } from "./procedural-type";

// --- Fakes -------------------------------------------------------------
// Same convention as vrm-body.test.ts: `vrm.humanoid` is a plain object cast
// to VRM, but bone nodes and all rotation math use REAL three.js instances.

function bone(name: string): THREE.Object3D {
  const node = new THREE.Object3D();
  node.name = name;
  return node;
}

function makeVrm(boneNames: VRMHumanBoneName[]) {
  const nodes = {} as Record<VRMHumanBoneName, THREE.Object3D>;
  for (const name of boneNames) nodes[name] = bone(`Normalized_${name}`);

  const vrm = {
    scene: new THREE.Object3D(),
    humanoid: {
      getNormalizedBoneNode: (name: VRMHumanBoneName) => nodes[name] ?? null,
      getRawBoneNode: (name: VRMHumanBoneName) => nodes[name] ?? null,
    },
    meta: { metaVersion: "1" },
  } as unknown as VRM;

  return { vrm, nodes };
}

/** A sink that just remembers the last write per bone. */
function fakeSink() {
  const rotations = new Map<VRMHumanBoneName, THREE.Quaternion>();
  const positions = new Map<VRMHumanBoneName, THREE.Vector3>();

  const sink: PoseSink = {
    setBoneRotation(name, rotation) {
      rotations.set(name, rotation.clone());
    },
    setBonePosition(name, offset) {
      positions.set(name, offset.clone());
    },
  };

  return { sink, rotations, positions };
}

/** Degrees of a bone's recorded rotation, for readable assertions. */
function degreesOf(
  rotations: Map<VRMHumanBoneName, THREE.Quaternion>,
  name: VRMHumanBoneName,
) {
  return quaternionToEulerDegrees(rotations.get(name)!);
}

function run(animator: Animator, vrm: VRM, frames: number, dt = 1 / 60) {
  const { sink, rotations, positions } = fakeSink();
  const accumulator = new PoseAccumulator();

  for (let frame = 0; frame < frames; frame += 1) {
    accumulator.beginFrame();
    animator.update({
      delta: frame === 0 ? 0 : dt,
      time: frame * dt,
      sink: accumulator,
      vrm,
    });
    accumulator.writeTo(sink);
  }

  return { rotations, positions };
}

describe("EulerAccumulator", () => {
  it("sums per axis and converts once", () => {
    const accumulator = new EulerAccumulator();

    accumulator.add("x", 10);
    accumulator.add("x", 5);
    accumulator.add("y", -20);

    expect(accumulator.value).toEqual({ x: 15, y: -20, z: 0 });

    const degrees = quaternionToEulerDegrees(accumulator.toQuaternion());
    expect(degrees.x).toBeCloseTo(15, 4);
    expect(degrees.y).toBeCloseTo(-20, 4);
  });

  it("clear zeroes every axis", () => {
    const accumulator = new EulerAccumulator();
    accumulator.add("z", 30);
    accumulator.clear();
    expect(accumulator.value).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("PoseAccumulator", () => {
  it("multiplies rotations from successive layers, in order", () => {
    // Two 30° rotations about the same axis must compose to 60°, which is what
    // distinguishes quaternion composition from summing degrees per layer.
    const accumulator = new PoseAccumulator();
    const { sink, rotations } = fakeSink();

    const thirtyDegrees = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 6,
    );

    accumulator.beginFrame();
    accumulator.setBoneRotation("head", thirtyDegrees);
    accumulator.setBoneRotation("head", thirtyDegrees);
    accumulator.writeTo(sink);

    expect(degreesOf(rotations, "head").y).toBeCloseTo(60, 4);
  });

  it("adds position offsets from successive layers", () => {
    const accumulator = new PoseAccumulator();
    const { sink, positions } = fakeSink();

    accumulator.beginFrame();
    accumulator.setBonePosition("hips", new THREE.Vector3(0, 0.01, 0));
    accumulator.setBonePosition("hips", new THREE.Vector3(0, 0.02, 0));
    accumulator.writeTo(sink);

    expect(positions.get("hips")!.y).toBeCloseTo(0.03, 6);
  });

  it("releases a bone to rest once nothing drives it any more", () => {
    // Without this, removing a layer would leave its joints frozen at their
    // last pose instead of relaxing.
    const accumulator = new PoseAccumulator();
    const { sink, rotations, positions } = fakeSink();

    accumulator.beginFrame();
    accumulator.setBoneRotation(
      "head",
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1),
    );
    accumulator.setBonePosition("hips", new THREE.Vector3(0, 0.05, 0));
    accumulator.writeTo(sink);

    accumulator.beginFrame(); // nobody writes this frame
    accumulator.writeTo(sink);

    const released = rotations.get("head")!;
    expect(released.x).toBeCloseTo(0, 6);
    expect(released.y).toBeCloseTo(0, 6);
    expect(released.z).toBeCloseTo(0, 6);
    expect(released.w).toBeCloseTo(1, 6);
    expect(positions.get("hips")!.y).toBeCloseTo(0, 6);
  });

  it("starts each frame fresh rather than compounding across frames", () => {
    const accumulator = new PoseAccumulator();
    const { sink, rotations } = fakeSink();

    const thirtyDegrees = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 6,
    );

    for (let frame = 0; frame < 100; frame += 1) {
      accumulator.beginFrame();
      accumulator.setBoneRotation("head", thirtyDegrees);
      accumulator.writeTo(sink);
    }

    expect(degreesOf(rotations, "head").y).toBeCloseTo(30, 4);
  });

  it("reports every bone it has ever touched", () => {
    const accumulator = new PoseAccumulator();

    accumulator.beginFrame();
    accumulator.setBoneRotation("head", new THREE.Quaternion());
    accumulator.setBonePosition("hips", new THREE.Vector3());

    expect(accumulator.trackedBones().sort()).toEqual(["head", "hips"]);
  });
});

describe("channel / channels", () => {
  it("wraps a bare number as a constant signal", () => {
    const item = channel("head", "y", 15);
    expect(item.signal(0, 0)).toBe(15);
  });

  it("channels() builds one entry per provided axis", () => {
    const built = channels("head", { x: 1, z: constant(2) });

    expect(built).toHaveLength(2);
    expect(built.map((c) => c.axis).sort()).toEqual(["x", "z"]);
    expect(built.every((c) => c.bone === "head")).toBe(true);
  });
});

describe("createChannelAnimator", () => {
  const { vrm } = makeVrm(["head", "spine"]);

  it("sums channels sharing a bone and axis into one write", () => {
    const animator = createChannelAnimator([
      channel("spine", "x", 10),
      channel("spine", "x", 5),
    ]);

    const { rotations } = run(animator, vrm, 1);
    expect(degreesOf(rotations, "spine").x).toBeCloseTo(15, 4);
  });

  it("keeps separate axes independent", () => {
    const animator = createChannelAnimator([
      channel("head", "x", 10),
      channel("head", "y", -20),
    ]);

    const { rotations } = run(animator, vrm, 1);
    const degrees = degreesOf(rotations, "head");

    expect(degrees.x).toBeCloseTo(10, 4);
    expect(degrees.y).toBeCloseTo(-20, 4);
    expect(degrees.z).toBeCloseTo(0, 4);
  });

  it("does not drift over thousands of frames", () => {
    // Every frame writes an absolute rotation derived from rest, so a constant
    // signal must read back identically at frame 5000 as at frame 1. A
    // read-modify-write implementation would creep here.
    const animator = createChannelAnimator([channel("head", "y", 25)]);

    const first = run(animator, vrm, 1);
    const later = run(animator, vrm, 5000);

    expect(degreesOf(later.rotations, "head").y).toBeCloseTo(
      degreesOf(first.rotations, "head").y,
      6,
    );
  });

  it("resets the signals it was built from", () => {
    const wave = sine({ hz: 1, amp: 10 });
    let resets = 0;
    wave.reset = () => {
      resets += 1;
    };

    createChannelAnimator([channel("head", "x", wave)]).reset!();
    expect(resets).toBe(1);
  });
});

describe("combineAnimators", () => {
  it("runs its members in order and forwards reset", () => {
    const order: string[] = [];
    const resets: string[] = [];

    const make = (id: string): Animator => ({
      update: () => order.push(id),
      reset: () => resets.push(id),
    });

    const combined = combineAnimators(make("a"), make("b"));
    const { vrm } = makeVrm([]);

    run(combined, vrm, 1);
    combined.reset!();

    expect(order).toEqual(["a", "b"]);
    expect(resets).toEqual(["a", "b"]);
  });
});

describe("ProceduralAnimator", () => {
  it("writes the composed pose onto the model's normalized bones", () => {
    const { vrm, nodes } = makeVrm(["head"]);
    const animator = createProceduralAnimator(vrm, [
      createChannelAnimator([channel("head", "y", 30)]),
    ]);

    animator.update(1 / 60);

    expect(quaternionToEulerDegrees(nodes.head.quaternion).y).toBeCloseTo(30, 4);
  });

  it("accumulates time across frames", () => {
    const { vrm } = makeVrm([]);
    const animator = createProceduralAnimator(vrm);

    animator.update(0.5);
    animator.update(0.25);

    expect(animator.time).toBeCloseTo(0.75, 6);
  });

  it("composes layers in stack order", () => {
    const { vrm, nodes } = makeVrm(["head"]);
    const animator = createProceduralAnimator(vrm, [
      createChannelAnimator([channel("head", "y", 20)]),
      createChannelAnimator([channel("head", "y", 15)]),
    ]);

    animator.update(1 / 60);
    expect(quaternionToEulerDegrees(nodes.head.quaternion).y).toBeCloseTo(35, 4);
  });

  it("relaxes a removed layer's bones back to rest", () => {
    const { vrm, nodes } = makeVrm(["head"]);
    const layer = createChannelAnimator([channel("head", "y", 40)]);
    const animator = createProceduralAnimator(vrm, [layer]);

    animator.update(1 / 60);
    expect(quaternionToEulerDegrees(nodes.head.quaternion).y).toBeCloseTo(40, 4);

    animator.remove(layer);
    animator.update(1 / 60);

    expect(quaternionToEulerDegrees(nodes.head.quaternion).y).toBeCloseTo(0, 4);
  });

  it("reset returns the rig to rest and rewinds time", () => {
    // This is what you call before handing the rig to a Mixamo mixer.
    const { vrm, nodes } = makeVrm(["head"]);
    const animator = createProceduralAnimator(vrm, [
      createChannelAnimator([channel("head", "y", 45)]),
    ]);

    animator.update(1 / 60);
    animator.reset();

    expect(nodes.head.quaternion.w).toBeCloseTo(1, 6);
    expect(animator.time).toBe(0);
  });

  it("add appends a layer on top of the stack", () => {
    const { vrm, nodes } = makeVrm(["head"]);
    const animator = createProceduralAnimator(vrm);

    animator.add(createChannelAnimator([channel("head", "y", 10)]));
    animator.update(1 / 60);

    expect(animator.getLayers()).toHaveLength(1);
    expect(quaternionToEulerDegrees(nodes.head.quaternion).y).toBeCloseTo(10, 4);
  });

  it("writing a bone the model lacks is a harmless no-op", () => {
    const { vrm } = makeVrm([]); // no bones at all
    const animator = createProceduralAnimator(vrm, [
      createChannelAnimator([channel("leftLittleDistal", "z", 30)]),
    ]);

    expect(() => animator.update(1 / 60)).not.toThrow();
  });

  it("routes through a custom sink when given one", () => {
    const { vrm } = makeVrm(["head"]);
    const { sink, rotations } = fakeSink();

    createProceduralAnimator(
      vrm,
      [createChannelAnimator([channel("head", "x", 12)])],
      { sink },
    ).update(1 / 60);

    expect(degreesOf(rotations, "head").x).toBeCloseTo(12, 4);
  });
});

describe("createAnimator", () => {
  it("wraps a bare function and passes the frame context through", () => {
    const { vrm } = makeVrm(["hips"]);
    const seen: Array<{ time: number; delta: number }> = [];

    const animator = createAnimator(({ time, delta, sink }) => {
      seen.push({ time, delta });
      sink.setBonePosition("hips", new THREE.Vector3(0, 0.01, 0));
    });

    const { positions } = run(animator, vrm, 3, 0.5);

    expect(seen.map((s) => s.time)).toEqual([0, 0.5, 1]);
    expect(positions.get("hips")!.y).toBeCloseTo(0.01, 6);
  });
});
