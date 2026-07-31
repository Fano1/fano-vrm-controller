/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import type { VRM, VRMHumanBoneName, VRMPose } from "@pixiv/three-vrm";
import { createVRMBody } from "./vrm-body";

// --- Fakes -------------------------------------------------------------
// `vrm.humanoid` is faked (plain object cast to VRM, matching vrm-face.test.ts's
// convention) but bone nodes are REAL THREE.Object3D/Quaternion/Euler
// instances, so the actual quaternion<->euler math is checked against
// three.js itself rather than a reimplementation of it.

function makeVrm(opts: {
  normalizedBones?: Partial<Record<VRMHumanBoneName, THREE.Object3D>>;
  rawBones?: Partial<Record<VRMHumanBoneName, THREE.Object3D>>;
  pose?: VRMPose;
}) {
  const normalizedBones = opts.normalizedBones ?? {};
  const rawBones = opts.rawBones ?? {};
  let pose: VRMPose = opts.pose ?? {};

  const humanoid = {
    getNormalizedBoneNode: vi.fn(
      (name: VRMHumanBoneName) => normalizedBones[name] ?? null,
    ),
    getRawBoneNode: vi.fn((name: VRMHumanBoneName) => rawBones[name] ?? null),
    getNormalizedPose: vi.fn(() => pose),
    setNormalizedPose: vi.fn((p: VRMPose) => {
      pose = p;
    }),
    resetNormalizedPose: vi.fn(() => {
      pose = {};
    }),
  };

  const vrm = { humanoid } as unknown as VRM;
  return { vrm, humanoid };
}

function bone(name: string): THREE.Object3D {
  const obj = new THREE.Object3D();
  obj.name = name;
  return obj;
}

describe("VRMBody — introspection", () => {
  it("hasBone / listBones reflect only the bones the model actually exposes", () => {
    const hips = bone("hips");
    const spine = bone("spine");
    const { vrm } = makeVrm({ normalizedBones: { hips, spine } });
    const body = createVRMBody(vrm);

    expect(body.hasBone("hips")).toBe(true);
    expect(body.hasBone("upperChest")).toBe(false);
    // VRMHumanBoneList order: "hips" precedes "spine".
    expect(body.listBones()).toEqual(["hips", "spine"]);
  });

  it("getBoneNode / getRawBoneNode return the right node or null", () => {
    const normalized = bone("Normalized_hips");
    const raw = bone("J_Bip_C_Hips");
    const { vrm } = makeVrm({
      normalizedBones: { hips: normalized },
      rawBones: { hips: raw },
    });
    const body = createVRMBody(vrm);

    expect(body.getBoneNode("hips")).toBe(normalized);
    expect(body.getRawBoneNode("hips")).toBe(raw);
    expect(body.getBoneNode("head")).toBeNull();
    expect(body.getRawBoneNode("head")).toBeNull();
  });
});

describe("VRMBody — rotation", () => {
  it("get/setRotation round-trip a quaternion", () => {
    const hips = bone("hips");
    const { vrm } = makeVrm({ normalizedBones: { hips } });
    const body = createVRMBody(vrm);

    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 3,
    );
    expect(body.setRotation("hips", q)).toBe(true);

    const readBack = body.getRotation("hips")!;
    expect(readBack.x).toBeCloseTo(q.x, 6);
    expect(readBack.y).toBeCloseTo(q.y, 6);
    expect(readBack.z).toBeCloseTo(q.z, 6);
    expect(readBack.w).toBeCloseTo(q.w, 6);
  });

  it("getRotation copies into a provided target instead of allocating", () => {
    const hips = bone("hips");
    hips.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 4);
    const { vrm } = makeVrm({ normalizedBones: { hips } });
    const body = createVRMBody(vrm);

    const target = new THREE.Quaternion();
    const result = body.getRotation("hips", target);
    expect(result).toBe(target);
  });

  it("returns null / false for a bone the model doesn't have", () => {
    const { vrm } = makeVrm({});
    const body = createVRMBody(vrm);

    expect(body.getRotation("head")).toBeNull();
    expect(body.setRotation("head", new THREE.Quaternion())).toBe(false);
  });

  it("setEulerDegrees / getEulerDegrees round-trip in degrees", () => {
    const head = bone("head");
    const { vrm } = makeVrm({ normalizedBones: { head } });
    const body = createVRMBody(vrm);

    expect(body.setEulerDegrees("head", { x: 30, y: -45, z: 0 })).toBe(true);

    const readBack = body.getEulerDegrees("head")!;
    expect(readBack.x).toBeCloseTo(30, 4);
    expect(readBack.y).toBeCloseTo(-45, 4);
    expect(readBack.z).toBeCloseTo(0, 4);
  });

  it("setEulerDegrees merges partial input against the current rotation", () => {
    const head = bone("head");
    const { vrm } = makeVrm({ normalizedBones: { head } });
    const body = createVRMBody(vrm);

    body.setEulerDegrees("head", { x: 10, y: 20, z: 30 });
    body.setEulerDegrees("head", { y: 60 }); // only touch Y

    const result = body.getEulerDegrees("head")!;
    expect(result.x).toBeCloseTo(10, 3);
    expect(result.y).toBeCloseTo(60, 3);
    expect(result.z).toBeCloseTo(30, 3);
  });

  it("hits gimbal lock at Y=90 for XYZ order — sum of X/Z is preserved, not each individually", () => {
    // Documents a real limitation of Euler-angle partial updates (not specific
    // to this package): at the middle-axis singularity, X and Z decomposition
    // is ambiguous, so only their sum survives a decompose->merge->recompose
    // round-trip. UI built on setEulerDegrees should avoid driving the middle
    // axis all the way to +/-90 if independent X/Z control matters.
    const head = bone("head");
    const { vrm } = makeVrm({ normalizedBones: { head } });
    const body = createVRMBody(vrm);

    body.setEulerDegrees("head", { x: 10, y: 20, z: 30 });
    body.setEulerDegrees("head", { y: 90 });

    const result = body.getEulerDegrees("head")!;
    expect(result.y).toBeCloseTo(90, 3);
    expect(result.x + result.z).toBeCloseTo(40, 3); // 10 + 30, not individually preserved
  });

  it("resetBoneRotation sets the joint back to identity", () => {
    const head = bone("head");
    head.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.2);
    const { vrm } = makeVrm({ normalizedBones: { head } });
    const body = createVRMBody(vrm);

    expect(body.resetBoneRotation("head")).toBe(true);
    const q = body.getRotation("head")!;
    expect(q.x).toBeCloseTo(0, 6);
    expect(q.y).toBeCloseTo(0, 6);
    expect(q.z).toBeCloseTo(0, 6);
    expect(q.w).toBeCloseTo(1, 6);
  });

  it("resetBoneRotation returns false for a missing bone", () => {
    const { vrm } = makeVrm({});
    const body = createVRMBody(vrm);
    expect(body.resetBoneRotation("head")).toBe(false);
  });
});

describe("VRMBody — position", () => {
  it("get/setPosition round-trip a plain {x,y,z}", () => {
    const hips = bone("hips");
    const { vrm } = makeVrm({ normalizedBones: { hips } });
    const body = createVRMBody(vrm);

    expect(body.setPosition("hips", { x: 0, y: 1.2, z: 0.1 })).toBe(true);
    const pos = body.getPosition("hips")!;
    expect(pos.x).toBeCloseTo(0, 6);
    expect(pos.y).toBeCloseTo(1.2, 6);
    expect(pos.z).toBeCloseTo(0.1, 6);
  });

  it("accepts a real THREE.Vector3 too", () => {
    const hips = bone("hips");
    const { vrm } = makeVrm({ normalizedBones: { hips } });
    const body = createVRMBody(vrm);

    body.setPosition("hips", new THREE.Vector3(1, 2, 3));
    const pos = body.getPosition("hips")!;
    expect([pos.x, pos.y, pos.z]).toEqual([1, 2, 3]);
  });

  it("returns null / false for a bone the model doesn't have", () => {
    const { vrm } = makeVrm({});
    const body = createVRMBody(vrm);

    expect(body.getPosition("hips")).toBeNull();
    expect(body.setPosition("hips", { x: 0, y: 0, z: 0 })).toBe(false);
  });
});

describe("VRMBody — whole pose", () => {
  it("getPose/setPose/resetPose delegate to vrm.humanoid", () => {
    const { vrm, humanoid } = makeVrm({});
    const body = createVRMBody(vrm);
    const pose: VRMPose = { hips: { rotation: [0, 0, 0, 1] } };

    body.getPose();
    expect(humanoid.getNormalizedPose).toHaveBeenCalledTimes(1);

    body.setPose(pose);
    expect(humanoid.setNormalizedPose).toHaveBeenCalledWith(pose);

    body.resetPose();
    expect(humanoid.resetNormalizedPose).toHaveBeenCalledTimes(1);
  });
});
