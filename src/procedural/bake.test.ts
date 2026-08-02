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
import { bakeAnimator } from "./bake";
import { createAnimator, createChannelAnimator } from "./animator";
import { channel } from "./channels";
import { noise, sine, smooth, constant } from "./signals";
import { createIdleAnimator } from "./behaviors/idle";
import type { Animator } from "./procedural-type";

// --- Fakes -------------------------------------------------------------
// `vrm.humanoid` is faked; the clip, tracks, and quaternions are REAL three.js
// instances, so track naming/lengths are validated against three itself —
// same approach as mixamo-retarget.test.ts, whose output these clips must be
// interchangeable with.

function makeVrm(boneNames: VRMHumanBoneName[], hipsRestY = 0.9) {
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
    meta: { metaVersion: "1" },
  } as unknown as VRM;

  return { vrm, nodes };
}

function trackNamed(clip: THREE.AnimationClip, name: string) {
  return clip.tracks.find((track) => track.name === name);
}

describe("bakeAnimator — clip shape", () => {
  const { vrm } = makeVrm(["head", "spine"]);

  const animator = () =>
    createChannelAnimator([
      channel("head", "y", sine({ hz: 1, amp: 20 })),
      channel("spine", "x", sine({ hz: 0.5, amp: 5 })),
    ]);

  it("names tracks the same way retargetMixamoToVRM does", () => {
    // Both must address the normalized bone node by name, or a baked clip
    // wouldn't play on the same `new THREE.AnimationMixer(vrm.scene)`.
    const clip = bakeAnimator(vrm, animator(), { duration: 1, fps: 10 });

    expect(clip.tracks.map((t) => t.name).sort()).toEqual([
      "Normalized_head.quaternion",
      "Normalized_spine.quaternion",
    ]);
  });

  it("samples duration * fps + 1 frames, spanning [0, duration]", () => {
    const clip = bakeAnimator(vrm, animator(), { duration: 2, fps: 30 });
    const track = trackNamed(clip, "Normalized_head.quaternion")!;

    expect(track.times.length).toBe(61);
    expect(track.times[0]).toBeCloseTo(0, 6);
    expect(track.times[60]).toBeCloseTo(2, 6);
    expect(track.values.length).toBe(61 * 4);
    expect(clip.duration).toBeCloseTo(2, 6);
  });

  it("defaults to 30 fps and the name \"procedural\"", () => {
    const clip = bakeAnimator(vrm, animator(), { duration: 1 });

    expect(clip.name).toBe("procedural");
    expect(trackNamed(clip, "Normalized_head.quaternion")!.times.length).toBe(31);
  });

  it("honors an explicit clip name", () => {
    const clip = bakeAnimator(vrm, animator(), { duration: 1, name: "idle" });
    expect(clip.name).toBe("idle");
  });

  it("rejects a non-positive duration or fps", () => {
    expect(() => bakeAnimator(vrm, animator(), { duration: 0 })).toThrow(/duration/);
    expect(() =>
      bakeAnimator(vrm, animator(), { duration: 1, fps: 0 }),
    ).toThrow(/fps/);
  });

  it("skips bones the model doesn't expose", () => {
    const clip = bakeAnimator(
      vrm,
      createChannelAnimator([channel("leftLittleDistal", "z", 30)]),
      { duration: 1, fps: 10 },
    );

    expect(clip.tracks).toHaveLength(0);
  });

  it("accepts a stack of layers, composing them exactly as the live path does", () => {
    const clip = bakeAnimator(
      vrm,
      [
        createChannelAnimator([channel("head", "y", 20)]),
        createChannelAnimator([channel("head", "y", 15)]),
      ],
      { duration: 1, fps: 10 },
    );

    const track = trackNamed(clip, "Normalized_head.quaternion")!;
    const first = new THREE.Quaternion().fromArray(
      Array.from(track.values.slice(0, 4)),
    );
    const degrees = new THREE.Euler().setFromQuaternion(first, "XYZ");

    expect(THREE.MathUtils.radToDeg(degrees.y)).toBeCloseTo(35, 4);
  });
});

describe("bakeAnimator — determinism", () => {
  const { vrm } = makeVrm(["head", "spine", "chest", "neck", "hips"]);

  it("produces byte-identical output for the same animator and options", () => {
    // The whole point of forbidding Math.random() in the signal library.
    const bake = () =>
      bakeAnimator(vrm, createIdleAnimator({ noise: { seed: 5 } }), {
        duration: 3,
        fps: 24,
      });

    const a = bake();
    const b = bake();

    expect(a.tracks.map((t) => t.name)).toEqual(b.tracks.map((t) => t.name));

    for (let i = 0; i < a.tracks.length; i += 1) {
      expect(Array.from(a.tracks[i].values)).toEqual(
        Array.from(b.tracks[i].values),
      );
    }
  });

  it("re-bakes identically after the animator has already been baked once", () => {
    // Baking resets the animator on the way in AND out, so a stateful signal
    // can't leak state from one bake into the next.
    const animator = createChannelAnimator([
      channel("head", "y", smooth(constant(30))),
    ]);

    const first = bakeAnimator(vrm, animator, { duration: 1, fps: 20 });
    const second = bakeAnimator(vrm, animator, { duration: 1, fps: 20 });

    expect(Array.from(first.tracks[0].values)).toEqual(
      Array.from(second.tracks[0].values),
    );
  });

  it("differs for a different noise seed", () => {
    const a = bakeAnimator(vrm, createIdleAnimator({ noise: { seed: 1 } }), {
      duration: 2,
      fps: 20,
    });
    const b = bakeAnimator(vrm, createIdleAnimator({ noise: { seed: 2 } }), {
      duration: 2,
      fps: 20,
    });

    // The head track specifically — the seed drives the noise channels, while
    // the sine-driven breathing on chest/spine is identical either way.
    expect(Array.from(trackNamed(a, "Normalized_head.quaternion")!.values)).not.toEqual(
      Array.from(trackNamed(b, "Normalized_head.quaternion")!.values),
    );
  });
});

describe("bakeAnimator — the live model", () => {
  it("never touches the rig it bakes from", () => {
    // Baking runs against a recording sink, so an avatar on screen doesn't
    // twitch while a clip is being generated.
    const { vrm, nodes } = makeVrm(["head", "hips"]);

    nodes.head.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);
    const headBefore = nodes.head.quaternion.clone();
    const hipsBefore = nodes.hips.position.clone();

    bakeAnimator(
      vrm,
      createChannelAnimator([channel("head", "y", sine({ hz: 1, amp: 40 }))]),
      { duration: 2, fps: 30 },
    );

    expect(nodes.head.quaternion.equals(headBefore)).toBe(true);
    expect(nodes.hips.position.equals(hipsBefore)).toBe(true);
  });
});

describe("bakeAnimator — looping", () => {
  const { vrm } = makeVrm(["head"]);

  // 0.7 Hz over 1s deliberately doesn't land on a whole cycle, so the raw
  // endpoints differ and `loop` has something to fix.
  const animator = () =>
    createChannelAnimator([channel("head", "y", sine({ hz: 0.7, amp: 30 }))]);

  function endpoints(clip: THREE.AnimationClip) {
    const values = Array.from(clip.tracks[0].values);
    return {
      first: values.slice(0, 4),
      last: values.slice(values.length - 4),
    };
  }

  it("leaves the seam alone by default", () => {
    const { first, last } = endpoints(
      bakeAnimator(vrm, animator(), { duration: 1, fps: 30 }),
    );

    expect(last).not.toEqual(first);
  });

  it("makes the last sample equal the first when loop is set", () => {
    const { first, last } = endpoints(
      bakeAnimator(vrm, animator(), { duration: 1, fps: 30, loop: true }),
    );

    expect(last).toEqual(first);
  });
});

describe("bakeAnimator — position tracks", () => {
  it("emits rest + offset, so the clip carries absolute positions", () => {
    const { vrm } = makeVrm(["hips"], 0.85);

    const clip = bakeAnimator(
      vrm,
      createAnimator(({ sink }) => {
        sink.setBonePosition("hips", new THREE.Vector3(0, 0.01, 0));
      }),
      { duration: 1, fps: 10 },
    );

    const track = trackNamed(clip, "Normalized_hips.position")!;

    expect(track.values[0]).toBeCloseTo(0, 6);
    expect(track.values[1]).toBeCloseTo(0.86, 6); // rest 0.85 + offset 0.01
    expect(track.values[2]).toBeCloseTo(0, 6);
    expect(track.values.length).toBe(11 * 3);
  });

  it("keeps a rotation and a position track for the same bone in sync", () => {
    const { vrm } = makeVrm(["hips"]);

    const clip = bakeAnimator(
      vrm,
      createIdleAnimator({ breathing: false, noise: false, bob: true }),
      { duration: 1, fps: 15 },
    );

    const rotation = trackNamed(clip, "Normalized_hips.quaternion")!;
    const position = trackNamed(clip, "Normalized_hips.position")!;

    expect(rotation.times.length).toBe(16);
    expect(position.times.length).toBe(16);
    expect(rotation.values.length).toBe(16 * 4);
    expect(position.values.length).toBe(16 * 3);
  });

  it("pads a channel that starts partway through the clip", () => {
    // A bone first driven at frame 3 must still have samples for frames 0-2,
    // otherwise its track would desync from the shared `times` array.
    const { vrm } = makeVrm(["head"]);
    let frame = 0;

    const lateStarter: Animator = {
      update({ sink }) {
        if (frame >= 3) {
          sink.setBoneRotation(
            "head",
            new THREE.Quaternion().setFromAxisAngle(
              new THREE.Vector3(0, 1, 0),
              0.4,
            ),
          );
        }
        frame += 1;
      },
      reset() {
        frame = 0;
      },
    };

    const clip = bakeAnimator(vrm, lateStarter, { duration: 1, fps: 10 });
    const track = trackNamed(clip, "Normalized_head.quaternion")!;

    expect(track.times.length).toBe(11);
    expect(track.values.length).toBe(11 * 4);
    // Frames 0-2 backfilled with identity.
    expect(Array.from(track.values.slice(0, 4))).toEqual([0, 0, 0, 1]);
    expect(track.values[3 * 4 + 3]).toBeLessThan(1);
  });
});

describe("bakeAnimator — playable output", () => {
  it("drives the rig through a real AnimationMixer", () => {
    // End-to-end: the clip is an ordinary THREE.AnimationClip, so three's own
    // mixer resolves the track names against the rig and animates it.
    const { vrm, nodes } = makeVrm(["head"]);
    const root = new THREE.Object3D();
    root.add(nodes.head);

    const clip = bakeAnimator(
      vrm,
      createChannelAnimator([channel("head", "y", constant(45))]),
      { duration: 1, fps: 10 },
    );

    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(clip).play();
    mixer.update(0.5);

    const euler = new THREE.Euler().setFromQuaternion(nodes.head.quaternion, "XYZ");
    expect(THREE.MathUtils.radToDeg(euler.y)).toBeCloseTo(45, 3);
  });
});

describe("bakeAnimator — noise sampling", () => {
  it("samples at a fixed timestep regardless of the live frame rate", () => {
    const { vrm } = makeVrm(["head"]);

    const clip = bakeAnimator(
      vrm,
      createChannelAnimator([channel("head", "y", noise({ hz: 2, amp: 10, seed: 9 }))]),
      { duration: 1, fps: 60 },
    );

    const track = trackNamed(clip, "Normalized_head.quaternion")!;

    for (let i = 0; i < track.times.length; i += 1) {
      expect(track.times[i]).toBeCloseTo(i / 60, 6);
    }
  });
});
