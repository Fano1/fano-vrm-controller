/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { describe, it, expect } from "vitest";
import { MIXAMO_VRM_RIG_MAP, resolveMixamoBoneName } from "./RIG-maps";

describe("MIXAMO_VRM_RIG_MAP", () => {
  it("maps core body bones", () => {
    expect(MIXAMO_VRM_RIG_MAP.mixamorigHips).toBe("hips");
    expect(MIXAMO_VRM_RIG_MAP.mixamorigSpine).toBe("spine");
    expect(MIXAMO_VRM_RIG_MAP.mixamorigSpine1).toBe("chest");
    expect(MIXAMO_VRM_RIG_MAP.mixamorigSpine2).toBe("upperChest");
    expect(MIXAMO_VRM_RIG_MAP.mixamorigHead).toBe("head");
  });

  it("maps finger bones", () => {
    expect(MIXAMO_VRM_RIG_MAP.mixamorigLeftHandThumb1).toBe(
      "leftThumbMetacarpal",
    );
    expect(MIXAMO_VRM_RIG_MAP.mixamorigRightHandPinky3).toBe(
      "rightLittleDistal",
    );
  });

  it("maps leg bones", () => {
    expect(MIXAMO_VRM_RIG_MAP.mixamorigLeftUpLeg).toBe("leftUpperLeg");
    expect(MIXAMO_VRM_RIG_MAP.mixamorigRightToeBase).toBe("rightToes");
  });
});

describe("resolveMixamoBoneName", () => {
  it("resolves the exact standard Mixamo name", () => {
    expect(resolveMixamoBoneName("mixamorigHips")).toBe("hips");
    expect(resolveMixamoBoneName("mixamorigLeftArm")).toBe("leftUpperArm");
  });

  it("resolves numeric-namespaced variants (multi-character scenes)", () => {
    expect(resolveMixamoBoneName("mixamorig1Hips")).toBe("hips");
    expect(resolveMixamoBoneName("mixamorig2LeftArm")).toBe("leftUpperArm");
  });

  it("resolves colon- and underscore-namespaced variants (DCC re-exports)", () => {
    expect(resolveMixamoBoneName("mixamorig:Hips")).toBe("hips");
    expect(resolveMixamoBoneName("mixamorig2:LeftArm")).toBe("leftUpperArm");
    expect(resolveMixamoBoneName("mixamorig_Hips")).toBe("hips");
  });

  it("returns null for unrecognized bone names", () => {
    expect(resolveMixamoBoneName("mixamorigTail")).toBeNull();
    expect(resolveMixamoBoneName("SomeRandomBone")).toBeNull();
  });

  it("honors a custom bone map and lets it override the default", () => {
    expect(
      resolveMixamoBoneName("mixamorigHips", { mixamorigHips: "spine" }),
    ).toBe("spine");

    expect(resolveMixamoBoneName("Root", { Root: "hips" })).toBe("hips");
  });

  it("matches the custom map exactly only — no fuzz applied to it", () => {
    // "CustomHips" isn't a key three-vrm/mixamo would ever fuzz-match on its
    // own; confirm the *raw* name has to hit the custom map verbatim.
    expect(
      resolveMixamoBoneName("mixamorig1CustomHips", {
        CustomHips: "hips",
      }),
    ).toBeNull();
  });
});
