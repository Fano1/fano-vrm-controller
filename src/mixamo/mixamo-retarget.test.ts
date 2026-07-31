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
import { retargetMixamoToVRM } from "./mixamo-retarget";

// --- Fakes -------------------------------------------------------------
// Only `vrm.humanoid`/`vrm.scene`/`vrm.meta` are touched by the retargeter,
// so a plain object cast to VRM is enough — but the bone hierarchy itself
// uses REAL `THREE.Object3D`/`Quaternion`/`AnimationClip`/`KeyframeTrack`
// instances (all pure math/data, no GPU) so the retargeting math is checked
// against three.js's actual quaternion algebra, not a reimplementation of it.

function makeVrm(opts: {
  bones: Partial<Record<VRMHumanBoneName, THREE.Object3D>>;
  metaVersion?: "0" | "1";
  sceneWorldY?: number;
}): VRM {
  const scene = new THREE.Object3D();
  if (opts.sceneWorldY !== undefined) scene.position.y = opts.sceneWorldY;

  const humanoid = {
    getNormalizedBoneNode: (name: VRMHumanBoneName) => opts.bones[name] ?? null,
  };

  return {
    scene,
    humanoid,
    meta: { metaVersion: opts.metaVersion ?? "1" },
  } as unknown as VRM;
}

function bone(name: string, parent?: THREE.Object3D): THREE.Object3D {
  const obj = new THREE.Object3D();
  obj.name = name;
  parent?.add(obj);
  return obj;
}

function findTrack(
  clip: THREE.AnimationClip,
  suffix: string,
): THREE.KeyframeTrack | undefined {
  return clip.tracks.find((t) => t.name.endsWith(suffix));
}

describe("retargetMixamoToVRM — quaternion tracks", () => {
  it("outputs the raw input rotation when both rest poses are identity", () => {
    const mixamoRoot = new THREE.Object3D();
    bone("mixamorigHips", mixamoRoot); // identity local rotation, parent also identity

    const vrmHipsNode = bone("Normalized_hips");
    const vrm = makeVrm({ bones: { hips: vrmHipsNode } });

    const animatedQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI / 6,
    );

    const clip = new THREE.AnimationClip("clip", 1, [
      new THREE.QuaternionKeyframeTrack(
        "mixamorigHips.quaternion",
        [0],
        animatedQuat.toArray() as number[],
      ),
    ]);

    const result = retargetMixamoToVRM(vrm, mixamoRoot, clip);
    const track = findTrack(result, ".quaternion") as THREE.QuaternionKeyframeTrack;

    expect(track.name).toBe("Normalized_hips.quaternion");
    const out = new THREE.Quaternion().fromArray(track.values);
    expect(out.x).toBeCloseTo(animatedQuat.x, 5);
    expect(out.y).toBeCloseTo(animatedQuat.y, 5);
    expect(out.z).toBeCloseTo(animatedQuat.z, 5);
    expect(out.w).toBeCloseTo(animatedQuat.w, 5);
  });

  it("cancels an arbitrary source rest pose when the keyframe equals rest (non-identity parent+bone chain)", () => {
    // hips has a 90deg-about-X rest rotation, and its child spine ADDS a
    // 45deg-about-Y rest rotation on top — a non-trivial, non-commuting
    // chain. If the keyframe value is exactly the bone's rest local
    // rotation (i.e. "no change from rest"), the retargeted output must be
    // identity for ANY rest-pose configuration — a strong regression guard
    // against premultiply/multiply order or inversion-side bugs.
    const hipsRestLocal = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI / 2,
    );
    const spineRestLocal = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      Math.PI / 4,
    );

    const mixamoRoot = new THREE.Object3D();
    const hips = bone("mixamorigHips", mixamoRoot);
    hips.quaternion.copy(hipsRestLocal);
    const spine = bone("mixamorigSpine", hips);
    spine.quaternion.copy(spineRestLocal);

    const vrmSpineNode = bone("Normalized_spine"); // normalized rig: identity rest
    const vrm = makeVrm({ bones: { spine: vrmSpineNode } });

    const clip = new THREE.AnimationClip("clip", 1, [
      new THREE.QuaternionKeyframeTrack(
        "mixamorigSpine.quaternion",
        [0],
        spineRestLocal.toArray() as number[],
      ),
    ]);

    const result = retargetMixamoToVRM(vrm, mixamoRoot, clip);
    const track = findTrack(result, ".quaternion") as THREE.QuaternionKeyframeTrack;
    const out = new THREE.Quaternion().fromArray(track.values);

    expect(out.x).toBeCloseTo(0, 5);
    expect(out.y).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(0, 5);
    expect(out.w).toBeCloseTo(1, 5);
  });

  it("negates x/z (not y/w) for VRM0 models", () => {
    const mixamoRoot = new THREE.Object3D();
    bone("mixamorigHips", mixamoRoot);

    const vrmHipsNode = bone("Normalized_hips");
    const vrm = makeVrm({ bones: { hips: vrmHipsNode }, metaVersion: "0" });

    const animatedQuat = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 0, 1),
      Math.PI / 6,
    );

    const clip = new THREE.AnimationClip("clip", 1, [
      new THREE.QuaternionKeyframeTrack(
        "mixamorigHips.quaternion",
        [0],
        animatedQuat.toArray() as number[],
      ),
    ]);

    const result = retargetMixamoToVRM(vrm, mixamoRoot, clip);
    const track = findTrack(result, ".quaternion") as THREE.QuaternionKeyframeTrack;
    const out = new THREE.Quaternion().fromArray(track.values);

    expect(out.x).toBeCloseTo(-animatedQuat.x, 5);
    expect(out.y).toBeCloseTo(animatedQuat.y, 5);
    expect(out.z).toBeCloseTo(-animatedQuat.z, 5);
    expect(out.w).toBeCloseTo(animatedQuat.w, 5);
  });
});

describe("retargetMixamoToVRM — hips position track", () => {
  function setupHipsScale() {
    const mixamoRoot = new THREE.Object3D();
    const hips = bone("mixamorigHips", mixamoRoot);
    hips.position.set(0, 2, 0); // source rest hip height = 2 units

    const vrmHipsNode = bone("Normalized_hips");
    vrmHipsNode.position.set(0, 1, 0); // target hip world height = 1 unit

    return { mixamoRoot, vrmHipsNode };
  }

  it("scales hips translation by targetHipsHeight / sourceHipsHeight", () => {
    const { mixamoRoot, vrmHipsNode } = setupHipsScale();
    const vrm = makeVrm({ bones: { hips: vrmHipsNode } });

    const clip = new THREE.AnimationClip("clip", 1, [
      new THREE.VectorKeyframeTrack(
        "mixamorigHips.position",
        [0, 1],
        [0, 2, 0, 3, 2.5, -1],
      ),
    ]);

    const result = retargetMixamoToVRM(vrm, mixamoRoot, clip);
    const track = findTrack(result, ".position") as THREE.VectorKeyframeTrack;

    // scale = 1 / 2 = 0.5
    expect(Array.from(track.values)).toEqual(
      [0, 2, 0, 3, 2.5, -1].map((v) => v * 0.5),
    );
  });

  it("honors an explicit hipsPositionScale override", () => {
    const { mixamoRoot, vrmHipsNode } = setupHipsScale();
    const vrm = makeVrm({ bones: { hips: vrmHipsNode } });

    const clip = new THREE.AnimationClip("clip", 1, [
      new THREE.VectorKeyframeTrack("mixamorigHips.position", [0], [0, 2, 0]),
    ]);

    const result = retargetMixamoToVRM(vrm, mixamoRoot, clip, {
      hipsPositionScale: 10,
    });
    const track = findTrack(result, ".position") as THREE.VectorKeyframeTrack;

    expect(track.values[0]).toBeCloseTo(0, 5);
    expect(track.values[1]).toBeCloseTo(20, 5);
    expect(track.values[2]).toBeCloseTo(0, 5);
  });

  it("negates x/z (not y) for VRM0 models", () => {
    const { mixamoRoot, vrmHipsNode } = setupHipsScale();
    const vrm = makeVrm({
      bones: { hips: vrmHipsNode },
      metaVersion: "0",
    });

    const clip = new THREE.AnimationClip("clip", 1, [
      new THREE.VectorKeyframeTrack(
        "mixamorigHips.position",
        [0],
        [3, 2, -1],
      ),
    ]);

    const result = retargetMixamoToVRM(vrm, mixamoRoot, clip, {
      hipsPositionScale: 1,
    });
    const track = findTrack(result, ".position") as THREE.VectorKeyframeTrack;

    expect(track.values[0]).toBeCloseTo(-3, 5);
    expect(track.values[1]).toBeCloseTo(2, 5);
    expect(track.values[2]).toBeCloseTo(1, 5);
  });
});

describe("retargetMixamoToVRM — skip / resolution behavior", () => {
  it("drops tracks for bone names the rig map doesn't recognize", () => {
    const mixamoRoot = new THREE.Object3D();
    const vrm = makeVrm({ bones: {} });

    const clip = new THREE.AnimationClip("clip", 1, [
      new THREE.QuaternionKeyframeTrack(
        "mixamorigTail.quaternion",
        [0],
        [0, 0, 0, 1],
      ),
    ]);

    const result = retargetMixamoToVRM(vrm, mixamoRoot, clip);
    expect(result.tracks.length).toBe(0);
  });

  it("drops tracks for a mapped bone the target VRM doesn't expose", () => {
    const mixamoRoot = new THREE.Object3D();
    bone("mixamorigSpine2", mixamoRoot); // maps to "upperChest"
    const vrm = makeVrm({ bones: {} }); // no upperChest on this model

    const clip = new THREE.AnimationClip("clip", 1, [
      new THREE.QuaternionKeyframeTrack(
        "mixamorigSpine2.quaternion",
        [0],
        [0, 0, 0, 1],
      ),
    ]);

    const result = retargetMixamoToVRM(vrm, mixamoRoot, clip);
    expect(result.tracks.length).toBe(0);
  });

  it("resolves fuzzy-namespaced source bone names", () => {
    const mixamoRoot = new THREE.Object3D();
    bone("mixamorig1Hips", mixamoRoot);

    const vrmHipsNode = bone("Normalized_hips");
    const vrm = makeVrm({ bones: { hips: vrmHipsNode } });

    const clip = new THREE.AnimationClip("clip", 1, [
      new THREE.QuaternionKeyframeTrack(
        "mixamorig1Hips.quaternion",
        [0],
        [0, 0, 0, 1],
      ),
    ]);

    const result = retargetMixamoToVRM(vrm, mixamoRoot, clip);
    expect(result.tracks.length).toBe(1);
    expect(result.tracks[0].name).toBe("Normalized_hips.quaternion");
  });

  it("honors a custom boneMap override", () => {
    const mixamoRoot = new THREE.Object3D();
    bone("CustomRoot", mixamoRoot);

    const vrmHipsNode = bone("Normalized_hips");
    const vrm = makeVrm({ bones: { hips: vrmHipsNode } });

    const clip = new THREE.AnimationClip("clip", 1, [
      new THREE.QuaternionKeyframeTrack("CustomRoot.quaternion", [0], [0, 0, 0, 1]),
    ]);

    const result = retargetMixamoToVRM(vrm, mixamoRoot, clip, {
      boneMap: { CustomRoot: "hips" },
    });

    expect(result.tracks.length).toBe(1);
    expect(result.tracks[0].name).toBe("Normalized_hips.quaternion");
  });

  it("preserves the source clip's name and duration", () => {
    const mixamoRoot = new THREE.Object3D();
    const vrm = makeVrm({ bones: {} });
    const clip = new THREE.AnimationClip("mixamo.com", 2.5, []);

    const result = retargetMixamoToVRM(vrm, mixamoRoot, clip);
    expect(result.name).toBe("mixamo.com");
    expect(result.duration).toBe(2.5);
  });
});
