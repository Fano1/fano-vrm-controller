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
import { createLookAtAnimator, type LookAtAnimator } from "./look-at";
import { quaternionToEulerDegrees } from "../../body/body-utils";
import type { PoseSink } from "../procedural-type";

// --- Fakes -------------------------------------------------------------
// The humanoid is faked, but the scene graph, world transforms, and all the
// yaw/pitch trigonometry run through real three.js objects — the direction
// math is only meaningful if three computes the world positions.

function makeVrm(options: {
  bones?: VRMHumanBoneName[];
  metaVersion?: "0" | "1";
  headWorld?: THREE.Vector3;
  rootRotationY?: number;
}) {
  const boneNames = options.bones ?? ["head", "neck", "upperChest"];
  const scene = new THREE.Object3D();

  if (options.rootRotationY !== undefined) {
    scene.rotation.y = options.rootRotationY;
  }

  const nodes = {} as Record<VRMHumanBoneName, THREE.Object3D>;

  for (const name of boneNames) {
    const node = new THREE.Object3D();
    node.name = `Normalized_${name}`;
    scene.add(node);
    nodes[name] = node;
  }

  if (nodes.head && options.headWorld) {
    nodes.head.position.copy(options.headWorld);
  }

  scene.updateMatrixWorld(true);

  const vrm = {
    scene,
    humanoid: {
      getNormalizedBoneNode: (name: VRMHumanBoneName) => nodes[name] ?? null,
      getRawBoneNode: (name: VRMHumanBoneName) => nodes[name] ?? null,
    },
    meta: { metaVersion: options.metaVersion ?? "1" },
  } as unknown as VRM;

  return { vrm, nodes, scene };
}

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

/** Run until the springs have settled, then read the result. */
function settle(animator: LookAtAnimator, vrm: VRM, frames = 400) {
  const { sink, rotations } = fakeSink();

  for (let frame = 0; frame < frames; frame += 1) {
    animator.update({ delta: 1 / 60, time: frame / 60, sink, vrm });
  }

  return {
    rotations,
    degrees(bone: VRMHumanBoneName) {
      const rotation = rotations.get(bone);
      return rotation ? quaternionToEulerDegrees(rotation, "YXZ") : null;
    },
  };
}

describe("createLookAtAnimator — direction", () => {
  it("stays centered with no target", () => {
    const { vrm } = makeVrm({});
    const look = createLookAtAnimator();

    settle(look, vrm);

    expect(look.yaw).toBeCloseTo(0, 3);
    expect(look.pitch).toBeCloseTo(0, 3);
  });

  it("turns right for a target on +X (VRM 1.0 faces +Z)", () => {
    const { vrm } = makeVrm({});
    const look = createLookAtAnimator({
      target: new THREE.Vector3(10, 0, 10),
    });

    settle(look, vrm);

    // 45° round from straight ahead, toward the target's side.
    expect(look.yaw).toBeCloseTo(45, 1);
  });

  it("turns the other way for a target on -X", () => {
    const { vrm } = makeVrm({});
    const look = createLookAtAnimator({
      target: new THREE.Vector3(-10, 0, 10),
    });

    settle(look, vrm);
    expect(look.yaw).toBeCloseTo(-45, 1);
  });

  it("pitches up for a target above and down for one below", () => {
    const { vrm } = makeVrm({});

    const up = createLookAtAnimator({ target: new THREE.Vector3(0, 10, 10) });
    settle(up, vrm);
    expect(up.pitch).toBeCloseTo(45, 1);

    const down = createLookAtAnimator({ target: new THREE.Vector3(0, -10, 10) });
    settle(down, vrm);
    expect(down.pitch).toBeCloseTo(-45, 1);
  });

  it("rotates the head backward to look up, in authoring space", () => {
    // +X tips a +Z-facing head down, so looking up must produce negative X.
    const { vrm } = makeVrm({});
    const look = createLookAtAnimator({
      target: new THREE.Vector3(0, 10, 10),
      weights: { head: 1 },
    });

    const result = settle(look, vrm);
    expect(result.degrees("head")!.x).toBeLessThan(0);
  });

  it("emits the SAME authoring-space pose for a VRM 0.x rig", () => {
    // Look-at no longer special-cases VRM0 — it converts the measured
    // direction into authoring space and the write boundary mirrors the result
    // back out. So the pose it emits here is identical to the VRM1 case above;
    // pose-sink.test.ts covers the mirroring that follows.
    const { vrm } = makeVrm({ metaVersion: "0" });
    const look = createLookAtAnimator({
      target: new THREE.Vector3(0, 10, -10), // "up and in front of" a -Z rig
      weights: { head: 1 },
    });

    const result = settle(look, vrm);
    expect(look.pitch).toBeCloseTo(45, 1);
    expect(result.degrees("head")!.x).toBeLessThan(0);
  });

  it("treats -Z as straight ahead on a VRM 0.x rig", () => {
    const { vrm } = makeVrm({ metaVersion: "0" });
    const look = createLookAtAnimator({ target: new THREE.Vector3(0, 0, -10) });

    settle(look, vrm);
    expect(look.yaw).toBeCloseTo(0, 2);
  });

  it("turns toward the model's right on a VRM 0.x rig, whose right is +X", () => {
    // A -Z-facing rig has its right side at +X (a +Z-facing one at -X). The
    // measured turn must account for that before the frame conversion.
    const { vrm } = makeVrm({ metaVersion: "0" });
    const look = createLookAtAnimator({ target: new THREE.Vector3(10, 0, -10) });

    settle(look, vrm);
    // Authoring space puts the model's right at -X, hence a negative yaw.
    expect(look.yaw).toBeCloseTo(-45, 1);
  });

  it("honors an explicit faceFront override", () => {
    const { vrm } = makeVrm({});
    const look = createLookAtAnimator({
      target: new THREE.Vector3(10, 0, 0),
      faceFront: new THREE.Vector3(1, 0, 0),
    });

    settle(look, vrm);
    expect(look.yaw).toBeCloseTo(0, 2); // already facing the target
  });

  it("measures the turn in the avatar's own frame, not the world's", () => {
    // The model is rotated 90° in the scene; a target that is dead ahead of
    // the *model* must read as zero turn regardless of world orientation.
    const { vrm } = makeVrm({ rootRotationY: Math.PI / 2 });
    const look = createLookAtAnimator({ target: new THREE.Vector3(10, 0, 0) });

    settle(look, vrm);
    expect(look.yaw).toBeCloseTo(0, 1);
  });

  it("tracks an Object3D as it moves", () => {
    const { vrm } = makeVrm({});
    const target = new THREE.Object3D();
    target.position.set(10, 0, 10);
    target.updateMatrixWorld(true);

    const look = createLookAtAnimator({ target });
    settle(look, vrm);
    expect(look.yaw).toBeCloseTo(45, 1);

    target.position.set(-10, 0, 10);
    target.updateMatrixWorld(true);
    settle(look, vrm);
    expect(look.yaw).toBeCloseTo(-45, 1);
  });
});

describe("createLookAtAnimator — limits and distribution", () => {
  it("clamps the turn rather than breaking the neck", () => {
    const { vrm } = makeVrm({});
    const look = createLookAtAnimator({
      target: new THREE.Vector3(0, 0, -10), // directly behind
      limits: { yaw: 70 },
    });

    settle(look, vrm);
    expect(Math.abs(look.yaw)).toBeCloseTo(70, 1);
  });

  it("splits the turn across bones by weight", () => {
    const { vrm } = makeVrm({});
    const look = createLookAtAnimator({
      target: new THREE.Vector3(10, 0, 10),
      weights: { head: 0.5, neck: 0.5 },
    });

    const result = settle(look, vrm);

    expect(result.degrees("head")!.y).toBeCloseTo(22.5, 1);
    expect(result.degrees("neck")!.y).toBeCloseTo(22.5, 1);
  });

  it("renormalizes weights over the bones the model actually has", () => {
    // No upperChest on this rig, so head+neck must still deliver the full turn
    // rather than only the 90% their raw weights add up to.
    const { vrm } = makeVrm({ bones: ["head", "neck"] });
    const look = createLookAtAnimator({ target: new THREE.Vector3(10, 0, 10) });

    const result = settle(look, vrm);
    const total = result.degrees("head")!.y + result.degrees("neck")!.y;

    expect(total).toBeCloseTo(45, 1);
    expect(result.rotations.has("upperChest")).toBe(false);
  });

  it("writes nothing when the model has none of the weighted bones", () => {
    const { vrm } = makeVrm({ bones: [] });
    const look = createLookAtAnimator({ target: new THREE.Vector3(10, 0, 10) });

    const result = settle(look, vrm, 10);
    expect(result.rotations.size).toBe(0);
  });
});

describe("createLookAtAnimator — smoothing and state", () => {
  it("eases toward the target instead of snapping to it", () => {
    const { vrm } = makeVrm({});
    const look = createLookAtAnimator({ target: new THREE.Vector3(10, 0, 10) });

    settle(look, vrm, 1);
    expect(Math.abs(look.yaw)).toBeLessThan(45);
    expect(Math.abs(look.yaw)).toBeGreaterThan(0);
  });

  it("springs back to center when the target is cleared", () => {
    const { vrm } = makeVrm({});
    const look = createLookAtAnimator({ target: new THREE.Vector3(10, 0, 10) });

    settle(look, vrm);
    expect(look.yaw).toBeCloseTo(45, 1);

    look.clearTarget();
    settle(look, vrm);
    expect(look.yaw).toBeCloseTo(0, 2);
  });

  it("setTarget swaps the target at runtime", () => {
    const { vrm } = makeVrm({});
    const look = createLookAtAnimator();

    look.setTarget(new THREE.Vector3(10, 0, 10));
    settle(look, vrm);

    expect(look.yaw).toBeCloseTo(45, 1);
  });

  it("reset returns the springs to center", () => {
    const { vrm } = makeVrm({});
    const look = createLookAtAnimator({ target: new THREE.Vector3(10, 0, 10) });

    settle(look, vrm);
    look.reset!();

    expect(look.yaw).toBe(0);
    expect(look.pitch).toBe(0);
  });

  it("stays centered when the target sits exactly on the head", () => {
    const { vrm } = makeVrm({ headWorld: new THREE.Vector3(1, 2, 3) });
    const look = createLookAtAnimator({ target: new THREE.Vector3(1, 2, 3) });

    settle(look, vrm, 20);

    expect(Number.isFinite(look.yaw)).toBe(true);
    expect(look.yaw).toBeCloseTo(0, 6);
  });
});
