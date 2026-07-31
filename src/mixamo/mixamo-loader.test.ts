/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { loadMixamoAnimation } from "./mixamo-loader";

const mocks = vi.hoisted(() => {
  return {
    loadAsyncMock: vi.fn(),
  };
});

// vitest hoists vi.mock calls above all imports, so this applies before
// mixamo-loader.ts's own `import { FBXLoader } ...` resolves — same pattern
// as loader.test.ts's GLTFLoader mock.
vi.mock("three/addons/loaders/FBXLoader.js", () => {
  function FBXLoaderMock(this: { loadAsync: typeof mocks.loadAsyncMock }) {
    this.loadAsync = mocks.loadAsyncMock;
  }

  return { FBXLoader: vi.fn(FBXLoaderMock) };
});

function makeVrm(): VRM {
  return {
    scene: new THREE.Object3D(),
    humanoid: { getNormalizedBoneNode: () => null },
    meta: { metaVersion: "1" },
  } as unknown as VRM;
}

function makeAsset(
  animations: THREE.AnimationClip[],
): THREE.Object3D & { animations: THREE.AnimationClip[] } {
  const asset = new THREE.Object3D() as THREE.Object3D & {
    animations: THREE.AnimationClip[];
  };
  asset.animations = animations;
  return asset;
}

describe("loadMixamoAnimation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retargets the first clip by default", async () => {
    const idle = new THREE.AnimationClip("idle", 1, []);
    const walk = new THREE.AnimationClip("walk", 2, []);
    mocks.loadAsyncMock.mockResolvedValue(makeAsset([idle, walk]));

    const result = await loadMixamoAnimation("/anim.fbx", makeVrm());

    expect(mocks.loadAsyncMock).toHaveBeenCalledWith("/anim.fbx");
    expect(result.name).toBe("idle");
    expect(result.duration).toBe(1);
  });

  it("retargets the clip matching animationName when given", async () => {
    const idle = new THREE.AnimationClip("idle", 1, []);
    const walk = new THREE.AnimationClip("walk", 2, []);
    mocks.loadAsyncMock.mockResolvedValue(makeAsset([idle, walk]));

    const result = await loadMixamoAnimation("/anim.fbx", makeVrm(), {
      animationName: "walk",
    });

    expect(result.name).toBe("walk");
    expect(result.duration).toBe(2);
  });

  it("throws a [fano-vrmkit]-prefixed error when the FBX has no clips", async () => {
    mocks.loadAsyncMock.mockResolvedValue(makeAsset([]));

    await expect(
      loadMixamoAnimation("/empty.fbx", makeVrm()),
    ).rejects.toThrow('[fano-vrmkit] No animation clip found in "/empty.fbx"');
  });

  it("throws when animationName doesn't match any clip", async () => {
    const idle = new THREE.AnimationClip("idle", 1, []);
    mocks.loadAsyncMock.mockResolvedValue(makeAsset([idle]));

    await expect(
      loadMixamoAnimation("/anim.fbx", makeVrm(), {
        animationName: "missing",
      }),
    ).rejects.toThrow('[fano-vrmkit] No animation clip found in "/anim.fbx"');
  });

  it("propagates FBXLoader's own parse failure (e.g. an empty/corrupt download) unmodified", async () => {
    // Real failure mode: an interrupted Mixamo download leaves a 0-byte .fbx,
    // and FBXLoader.parse() throws before any clip/animations array exists —
    // loadAsync rejects, and that rejection must reach the caller as-is
    // rather than being swallowed or reworded.
    mocks.loadAsyncMock.mockRejectedValue(
      new Error("THREE.FBXLoader: Cannot find the version number for the file given."),
    );

    await expect(loadMixamoAnimation("/broken.fbx", makeVrm())).rejects.toThrow(
      "THREE.FBXLoader: Cannot find the version number for the file given.",
    );
  });
});
