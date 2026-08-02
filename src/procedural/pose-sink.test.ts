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
import { createVRMBody } from "../body/vrm-body";
import { quaternionToEulerDegrees } from "../body/body-utils";
import { createBodySink, createRecordingSink } from "./pose-sink";
import { createRigFrame } from "./rig-frame";
import { createProceduralAnimator } from "./animator";
import { createGestureAnimator } from "./behaviors/gesture";
import { createIdleAnimator } from "./behaviors/idle";
import { bakeAnimator } from "./bake";

// --- Fakes -------------------------------------------------------------
// `vrm.humanoid` is faked; bone nodes and all quaternion math are real
// three.js, so the frame conversion is checked against actual rotations.

function makeVrm(
  boneNames: VRMHumanBoneName[],
  metaVersion: "0" | "1" = "1",
  hipsRestY = 0.9,
) {
  const nodes = {} as Record<VRMHumanBoneName, THREE.Object3D>;

  for (const name of boneNames) {
    const node = new THREE.Object3D();
    node.name = `Normalized_${name}`;
    if (name === "hips") node.position.set(0, hipsRestY, 0);
    nodes[name] = node;
  }

  const vrm = {
    scene: new THREE.Object3D(),
    humanoid: {
      getNormalizedBoneNode: (name: VRMHumanBoneName) => nodes[name] ?? null,
      getRawBoneNode: (name: VRMHumanBoneName) => nodes[name] ?? null,
    },
    meta: { metaVersion },
  } as unknown as VRM;

  return { vrm, nodes };
}

describe("createRigFrame", () => {
  it("is identity for VRM 1.0", () => {
    const { vrm } = makeVrm([], "1");
    const frame = createRigFrame(vrm);

    expect(frame.mirrored).toBe(false);

    const rotation = new THREE.Quaternion(0.1, 0.2, 0.3, 0.9);
    frame.rotation(rotation);
    expect(rotation.toArray()).toEqual([0.1, 0.2, 0.3, 0.9]);
  });

  it("negates x and z (not y or w) for VRM 0.x", () => {
    // The same correction retargetMixamoToVRM applies — conjugating by a 180°
    // Y turn, which is what separates the two humanoid conventions.
    const { vrm } = makeVrm([], "0");
    const frame = createRigFrame(vrm);

    expect(frame.mirrored).toBe(true);

    const rotation = new THREE.Quaternion(0.1, 0.2, 0.3, 0.9);
    frame.rotation(rotation);
    expect(rotation.toArray()).toEqual([-0.1, 0.2, -0.3, 0.9]);

    const vector = new THREE.Vector3(1, 2, 3);
    frame.vector(vector);
    expect(vector.toArray()).toEqual([-1, 2, -3]);
  });

  it("leaves yaw untouched — a turn is a turn on either rig", () => {
    // Y rotations commute with the frame flip. Only pitch and roll reverse.
    const { vrm } = makeVrm([], "0");
    const frame = createRigFrame(vrm);

    const yaw = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, THREE.MathUtils.degToRad(40), 0),
    );
    const before = yaw.clone();

    frame.rotation(yaw);
    expect(yaw.angleTo(before)).toBeCloseTo(0, 6);
  });

  it("round-trips — the conversion is its own inverse", () => {
    const { vrm } = makeVrm([], "0");
    const frame = createRigFrame(vrm);

    const rotation = new THREE.Quaternion(0.1, 0.2, 0.3, 0.9);
    const original = rotation.clone();

    frame.rotation(frame.rotation(rotation));
    expect(rotation.toArray()).toEqual(original.toArray());
  });
});

describe("createBodySink — frame conversion", () => {
  it("writes authored rotations straight through on VRM 1.0", () => {
    const { vrm, nodes } = makeVrm(["head"], "1");
    const sink = createBodySink(createVRMBody(vrm));

    sink.setBoneRotation(
      "head",
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(THREE.MathUtils.degToRad(30), 0, 0),
      ),
    );

    expect(quaternionToEulerDegrees(nodes.head.quaternion).x).toBeCloseTo(30, 4);
  });

  it("mirrors pitch and roll on VRM 0.x", () => {
    const { vrm, nodes } = makeVrm(["head"], "0");
    const sink = createBodySink(createVRMBody(vrm));

    sink.setBoneRotation(
      "head",
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(THREE.MathUtils.degToRad(30), 0, 0),
      ),
    );

    expect(quaternionToEulerDegrees(nodes.head.quaternion).x).toBeCloseTo(-30, 4);
  });

  it("does not mutate the caller's quaternion", () => {
    // The accumulator hands the sink a live reference it reuses next frame.
    const { vrm } = makeVrm(["head"], "0");
    const sink = createBodySink(createVRMBody(vrm));

    const rotation = new THREE.Quaternion(0.1, 0.2, 0.3, 0.9);
    sink.setBoneRotation("head", rotation);

    expect(rotation.toArray()).toEqual([0.1, 0.2, 0.3, 0.9]);
  });

  it("adds a position offset onto the bone's rest position", () => {
    const { vrm, nodes } = makeVrm(["hips"], "1", 0.85);
    const sink = createBodySink(createVRMBody(vrm));

    sink.setBonePosition("hips", new THREE.Vector3(0, 0.01, 0));

    expect(nodes.hips.position.y).toBeCloseTo(0.86, 6);
  });

  it("mirrors x/z of a position offset on VRM 0.x, but never y", () => {
    const { vrm, nodes } = makeVrm(["hips"], "0", 0.85);
    const sink = createBodySink(createVRMBody(vrm));

    sink.setBonePosition("hips", new THREE.Vector3(0.1, 0.01, 0.2));

    expect(nodes.hips.position.x).toBeCloseTo(-0.1, 6);
    expect(nodes.hips.position.y).toBeCloseTo(0.86, 6); // rest + offset, unmirrored
    expect(nodes.hips.position.z).toBeCloseTo(-0.2, 6);
  });

  it("captures rest lazily, so repeated writes don't compound", () => {
    const { vrm, nodes } = makeVrm(["hips"], "1", 0.85);
    const sink = createBodySink(createVRMBody(vrm));

    for (let i = 0; i < 50; i += 1) {
      sink.setBonePosition("hips", new THREE.Vector3(0, 0.01, 0));
    }

    expect(nodes.hips.position.y).toBeCloseTo(0.86, 6);
  });

  it("ignores a bone the model doesn't have", () => {
    const { vrm } = makeVrm([], "1");
    const sink = createBodySink(createVRMBody(vrm));

    expect(() =>
      sink.setBonePosition("hips", new THREE.Vector3(0, 1, 0)),
    ).not.toThrow();
  });
});

describe("gestures across both VRM conventions", () => {
  // The regression this whole frame layer exists for: a wave authored as
  // "raise the right arm" drove the arm DOWN on a VRM 0.x model, because a
  // -Z-facing rig has its right arm along +X instead of -X.
  const WAVE = [
    { time: 0, pose: {} },
    { time: 1, pose: { rightUpperArm: { z: -95 } } },
    { time: 5, pose: { rightUpperArm: { z: -95 } } },
  ];

  function playWave(metaVersion: "0" | "1") {
    const { vrm, nodes } = makeVrm(["rightUpperArm"], metaVersion);
    const gestures = createGestureAnimator({ wave: WAVE }, { crossFade: 0 });
    const animator = createProceduralAnimator(vrm, [gestures]);

    gestures.play("wave");
    for (let frame = 0; frame < 90; frame += 1) animator.update(1 / 60);

    return quaternionToEulerDegrees(nodes.rightUpperArm.quaternion).z;
  }

  it("raises the right arm on a VRM 1.0 rig", () => {
    expect(playWave("1")).toBeCloseTo(-95, 0);
  });

  it("raises it on a VRM 0.x rig too — mirrored, so the motion matches", () => {
    expect(playWave("0")).toBeCloseTo(95, 0);
  });

  it("means one gesture library really does work on both", () => {
    expect(playWave("1")).toBeCloseTo(-playWave("0"), 0);
  });
});

describe("baked clips match the live path on both conventions", () => {
  function firstRotation(clip: THREE.AnimationClip, trackName: string) {
    const track = clip.tracks.find((t) => t.name === trackName)!;
    return new THREE.Quaternion().fromArray(Array.from(track.values.slice(0, 4)));
  }

  it("bakes VRM 0.x clips mirrored, exactly as the live sink writes them", () => {
    // A baked clip and its live counterpart must agree, or switching between
    // the two paths would visibly change the pose.
    for (const metaVersion of ["0", "1"] as const) {
      const { vrm, nodes } = makeVrm(["chest", "spine", "head", "neck", "hips"], metaVersion);
      const idle = () => createIdleAnimator({ noise: false, sway: false });

      const clip = bakeAnimator(vrm, idle(), { duration: 1, fps: 30 });
      const baked = firstRotation(clip, "Normalized_chest.quaternion");

      // Drive the live path for a single frame at t=0 and compare.
      createProceduralAnimator(vrm, [idle()]).update(0);
      const live = nodes.chest.quaternion;

      expect(baked.angleTo(live)).toBeCloseTo(0, 6);
    }
  });

  it("mirrors baked position offsets but keeps rest absolute", () => {
    const { vrm } = makeVrm(["hips"], "0", 0.85);
    const recorder = createRecordingSink();

    // Sanity-check the recorder itself stays in authoring space.
    recorder.beginFrame(0);
    recorder.setBonePosition("hips", new THREE.Vector3(0.1, 0.01, 0));
    recorder.endFrame();
    expect(recorder.bones.get("hips")!.positions.slice(0, 3)).toEqual([0.1, 0.01, 0]);

    const clip = bakeAnimator(
      vrm,
      {
        update({ sink }) {
          sink.setBonePosition("hips", new THREE.Vector3(0.1, 0.01, 0));
        },
      },
      { duration: 1, fps: 10 },
    );

    const track = clip.tracks.find((t) => t.name === "Normalized_hips.position")!;
    expect(track.values[0]).toBeCloseTo(-0.1, 6); // x mirrored
    expect(track.values[1]).toBeCloseTo(0.86, 6); // rest 0.85 + 0.01, unmirrored
  });
});
