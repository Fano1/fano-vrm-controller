/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { describe, it, expect, vi } from "vitest";
import type { VRM } from "@pixiv/three-vrm";
import { createVRMFace } from "./vrm-face";
import { AutoBlinkController } from "./controllers/auto-blink";

// --- Fakes -----------------------------------------------------------------
// The whole face module imports `three` / `@pixiv/three-vrm` as types only, so
// nothing pulls the real libraries at runtime — a plain object cast to VRM is
// all these controllers need.

function makeExpressionManager(names: string[]) {
  const values: Record<string, number> = {};
  const expressionMap: Record<string, object> = {};

  for (const name of names) {
    values[name] = 0;
    expressionMap[name] = {};
  }

  return {
    expressionMap,
    getExpression: (name: string) => expressionMap[name] ?? null,
    getValue: (name: string) => (name in values ? values[name] : null),
    setValue: vi.fn((name: string, weight: number) => {
      values[name] = weight;
    }),
    resetValues: vi.fn(() => {
      for (const key of Object.keys(values)) values[key] = 0;
    }),
    _values: values,
  };
}

type FakeMesh = {
  morphTargetDictionary: Record<string, number>;
  morphTargetInfluences: number[];
};

function makeMorphMesh(names: string[]): FakeMesh {
  const morphTargetDictionary: Record<string, number> = {};
  const morphTargetInfluences: number[] = [];

  names.forEach((name, index) => {
    morphTargetDictionary[name] = index;
    morphTargetInfluences[index] = 0;
  });

  return { morphTargetDictionary, morphTargetInfluences };
}

function makeLookAt() {
  return {
    target: null as unknown,
    autoUpdate: true,
    yaw: 0,
    pitch: 0,
    lookAt: vi.fn(),
    reset: vi.fn(),
  };
}

function makeVrm(opts: {
  expressions?: string[];
  morphs?: string[];
  lookAt?: ReturnType<typeof makeLookAt>;
}) {
  const mesh = opts.morphs ? makeMorphMesh(opts.morphs) : null;
  const scene = {
    traverse: (cb: (node: unknown) => void) => {
      if (mesh) cb(mesh);
    },
  };

  const expressionManager = opts.expressions
    ? makeExpressionManager(opts.expressions)
    : undefined;

  const vrm = {
    expressionManager,
    scene,
    lookAt: opts.lookAt,
    update: vi.fn(),
  } as unknown as VRM;

  return { vrm, mesh, expressionManager };
}

const STANDARD_EXPRESSIONS = [
  "happy",
  "angry",
  "sad",
  "relaxed",
  "surprised",
  "neutral",
  "aa",
  "ih",
  "ou",
  "ee",
  "oh",
  "blink",
  "blinkLeft",
  "blinkRight",
  "lookUp",
  "lookDown",
  "lookLeft",
  "lookRight",
];

const VROID_MORPHS = [
  "Fcl_ALL_Joy",
  "Fcl_ALL_Fun",
  "Fcl_ALL_Angry",
  "Fcl_BRW_Joy",
  "Fcl_BRW_Fun",
  "Fcl_BRW_Angry",
  "Fcl_EYE_Joy",
  "Fcl_EYE_Fun",
  "Fcl_EYE_Angry",
  "Fcl_EYE_Close",
  "Fcl_EYE_Close_L",
  "Fcl_EYE_Close_R",
  "Fcl_MTH_Joy",
  "Fcl_MTH_Fun",
  "Fcl_MTH_Angry",
  "Fcl_MTH_A",
  "Fcl_MTH_I",
  "Fcl_MTH_U",
  "Fcl_MTH_E",
  "Fcl_MTH_O",
];

function morphValue(mesh: FakeMesh, name: string): number {
  return mesh.morphTargetInfluences[mesh.morphTargetDictionary[name]];
}

// --- Tests -----------------------------------------------------------------

describe("createVRMFace facade", () => {
  it("exposes one controller per concern and reports availability", () => {
    const { vrm } = makeVrm({ expressions: STANDARD_EXPRESSIONS });
    const face = createVRMFace(vrm);

    expect(face.available).toBe(true);
    expect(face.emotion).toBeDefined();
    expect(face.viseme).toBeDefined();
    expect(face.eye).toBeDefined();
    expect(face.brow).toBeDefined();
    expect(face.expression).toBeDefined();
    expect(face.morph).toBeDefined();
  });

  it("reports unavailable when the model has no expression manager", () => {
    const { vrm } = makeVrm({ morphs: VROID_MORPHS });
    const face = createVRMFace(vrm);
    expect(face.available).toBe(false);
  });
});

describe("EmotionController", () => {
  it("drives the standard expression on models that have it", () => {
    const { vrm, expressionManager } = makeVrm({
      expressions: STANDARD_EXPRESSIONS,
    });
    const face = createVRMFace(vrm);

    face.emotion.set("happy", 0.8);
    expect(expressionManager!.setValue).toHaveBeenCalledWith("happy", 0.8);
    expect(expressionManager!._values.happy).toBe(0.8);
  });

  it("does NOT touch raw Fcl morphs when the standard expression exists (no double-drive)", () => {
    const { vrm, mesh } = makeVrm({
      expressions: STANDARD_EXPRESSIONS,
      morphs: VROID_MORPHS,
    });
    const face = createVRMFace(vrm);

    face.emotion.set("happy", 1);
    expect(morphValue(mesh!, "Fcl_ALL_Joy")).toBe(0);
  });

  it("falls back to VRoid Fcl morphs (via alias) on raw-only models", () => {
    const { vrm, mesh } = makeVrm({ morphs: VROID_MORPHS });
    const face = createVRMFace(vrm);

    // "happy" → aliases joy + fun
    face.emotion.set("happy", 1);
    expect(morphValue(mesh!, "Fcl_ALL_Joy")).toBe(1);
    expect(morphValue(mesh!, "Fcl_ALL_Fun")).toBe(1);
  });

  it("reads back and lists emotions via the raw channel on raw-only models", () => {
    const { vrm } = makeVrm({ morphs: VROID_MORPHS });
    const face = createVRMFace(vrm);

    face.emotion.set("happy", 1);
    expect(face.emotion.get("happy")).toBe(1);
    // happy/angry are backed by Fcl morphs on this rig; sad is not present.
    expect(face.emotion.list()).toEqual(
      expect.arrayContaining(["happy", "angry"]),
    );
    expect(face.emotion.list()).not.toContain("sad");
  });

  it("setExclusive zeroes the other emotions first", () => {
    const { vrm, expressionManager } = makeVrm({
      expressions: STANDARD_EXPRESSIONS,
    });
    const face = createVRMFace(vrm);

    face.emotion.set("angry", 1);
    face.emotion.setExclusive("happy");
    expect(expressionManager!._values.angry).toBe(0);
    expect(expressionManager!._values.happy).toBe(1);
  });
});

describe("VisemeController", () => {
  it("drives standard vowel presets", () => {
    const { vrm, expressionManager } = makeVrm({
      expressions: STANDARD_EXPRESSIONS,
    });
    const face = createVRMFace(vrm);

    face.viseme.set("aa", 0.5);
    expect(expressionManager!._values.aa).toBe(0.5);
  });

  it("maps preset → viseme letter and fuzzy-matches on raw-only models", () => {
    const { vrm, mesh } = makeVrm({ morphs: VROID_MORPHS });
    const face = createVRMFace(vrm);

    face.viseme.set("aa", 1); // aa → A → Fcl_MTH_A
    expect(morphValue(mesh!, "Fcl_MTH_A")).toBe(1);
    // Regression guard: "aa" must NOT also drive Fcl_MTH_Angry (unanchored
    // `MTH_A` used to match `...MTH_Angry`).
    expect(morphValue(mesh!, "Fcl_MTH_Angry")).toBe(0);
  });

  it("reads back the fuzzy-matched viseme on raw-only models", () => {
    const { vrm } = makeVrm({ morphs: VROID_MORPHS });
    const face = createVRMFace(vrm);

    face.viseme.set("aa", 0.7);
    expect(face.viseme.get("aa")).toBeCloseTo(0.7, 5);
    expect(face.viseme.list()).toContain("aa");
  });

  it("setAll blends and zeroes the rest", () => {
    const { vrm, expressionManager } = makeVrm({
      expressions: STANDARD_EXPRESSIONS,
    });
    const face = createVRMFace(vrm);

    face.viseme.set("ih", 1);
    face.viseme.setAll({ aa: 0.6 });
    expect(expressionManager!._values.aa).toBe(0.6);
    expect(expressionManager!._values.ih).toBe(0);
  });
});

describe("EyeController", () => {
  it("blinks via the standard expression, wink via per-eye presets", () => {
    const { vrm, expressionManager } = makeVrm({
      expressions: STANDARD_EXPRESSIONS,
    });
    const face = createVRMFace(vrm);

    face.eye.blink(1);
    face.eye.blinkLeft(0.5);
    expect(expressionManager!._values.blink).toBe(1);
    expect(expressionManager!._values.blinkLeft).toBe(0.5);
  });

  it("blinks via fuzzy morph on raw-only models", () => {
    const { vrm, mesh } = makeVrm({ morphs: VROID_MORPHS });
    const face = createVRMFace(vrm);

    face.eye.blink(1); // → Fcl_EYE_Close
    expect(morphValue(mesh!, "Fcl_EYE_Close")).toBe(1);
  });

  it("gaze tracks a target; lookAt pins a fixed position and disables autoUpdate", () => {
    const lookAt = makeLookAt();
    const { vrm } = makeVrm({ expressions: STANDARD_EXPRESSIONS, lookAt });
    const face = createVRMFace(vrm);

    const target = {} as never;
    face.eye.gaze(target);
    expect(lookAt.target).toBe(target);
    expect(lookAt.autoUpdate).toBe(true);

    const pos = {} as never;
    face.eye.lookAt(pos);
    expect(lookAt.autoUpdate).toBe(false);
    expect(lookAt.lookAt).toHaveBeenCalledWith(pos);
  });

  it("clearGaze resets the look-at", () => {
    const lookAt = makeLookAt();
    const { vrm } = makeVrm({ expressions: STANDARD_EXPRESSIONS, lookAt });
    const face = createVRMFace(vrm);

    face.eye.gaze({} as never);
    face.eye.clearGaze();
    expect(lookAt.target).toBeNull();
    expect(lookAt.reset).toHaveBeenCalled();
  });

  it("look() drives the gaze expressions", () => {
    const { vrm, expressionManager } = makeVrm({
      expressions: STANDARD_EXPRESSIONS,
    });
    const face = createVRMFace(vrm);

    face.eye.look({ up: 0.3, right: 0.7 });
    expect(expressionManager!._values.lookUp).toBe(0.3);
    expect(expressionManager!._values.lookRight).toBe(0.7);
    expect(expressionManager!._values.lookDown).toBe(0);
  });
});

describe("BrowController", () => {
  it("resolves eyebrow shapes through the fuzzy matcher", () => {
    const { vrm, mesh } = makeVrm({ morphs: VROID_MORPHS });
    const face = createVRMFace(vrm);

    face.brow.set("angry", 1);
    expect(morphValue(mesh!, "Fcl_BRW_Angry")).toBe(1);
    expect(face.brow.available).toBe(true);
    expect(face.brow.list()).toContain("Fcl_BRW_Angry");
  });

  it("setExclusive zeroes other brow morphs first", () => {
    const { vrm, mesh } = makeVrm({ morphs: VROID_MORPHS });
    const face = createVRMFace(vrm);

    face.brow.set("joy", 1);
    face.brow.setExclusive("angry");
    expect(morphValue(mesh!, "Fcl_BRW_Joy")).toBe(0);
    expect(morphValue(mesh!, "Fcl_BRW_Angry")).toBe(1);
  });
});

describe("clamping", () => {
  it("clamps expression weights to 0..1", () => {
    const { vrm, expressionManager } = makeVrm({
      expressions: STANDARD_EXPRESSIONS,
    });
    const face = createVRMFace(vrm);

    face.emotion.set("happy", 5);
    face.emotion.set("angry", -3);
    expect(expressionManager!._values.happy).toBe(1);
    expect(expressionManager!._values.angry).toBe(0);
  });

  it("clamps raw morph influences to 0..1", () => {
    const { vrm, mesh } = makeVrm({ morphs: VROID_MORPHS });
    const face = createVRMFace(vrm);

    face.brow.set("angry", 9);
    expect(morphValue(mesh!, "Fcl_BRW_Angry")).toBe(1);
  });
});

describe("facade update + reset", () => {
  it("update() advances an active auto-blink", () => {
    const { vrm, expressionManager } = makeVrm({
      expressions: STANDARD_EXPRESSIONS,
    });
    const face = createVRMFace(vrm);

    // Zero delay window makes the FSM deterministic: it blinks immediately.
    face.eye.autoBlink({ minDelay: 0, maxDelay: 0, closeDuration: 0.1 });
    face.update(0.05); // enters "closing"
    face.update(0.1); // fully closed
    expect(expressionManager!._values.blink).toBeGreaterThan(0);
  });

  it("reset() clears every channel", () => {
    const { vrm, expressionManager } = makeVrm({
      expressions: STANDARD_EXPRESSIONS,
    });
    const face = createVRMFace(vrm);

    face.emotion.set("happy", 1);
    face.viseme.set("aa", 1);
    face.reset();
    expect(expressionManager!.resetValues).toHaveBeenCalled();
    expect(expressionManager!._values.happy).toBe(0);
    expect(expressionManager!._values.aa).toBe(0);
  });
});

describe("AutoBlinkController FSM", () => {
  it("closes then reopens the eyes across a full cycle", () => {
    const setBlink = vi.fn();
    const blink = new AutoBlinkController(setBlink, {
      minDelay: 0,
      maxDelay: 0,
      closeDuration: 0.1,
      openDuration: 0.1,
      intensity: 1,
    });

    blink.update(0.01); // waiting → closing (nextBlinkTime is 0)
    blink.update(0.1); // closing complete → value ~1
    const peak = Math.max(...setBlink.mock.calls.map((c) => c[0] as number));
    expect(peak).toBeCloseTo(1, 5);

    blink.update(0.1); // opening complete → back to 0
    expect(setBlink).toHaveBeenLastCalledWith(0);
  });

  it("manualBlink overrides the automatic cycle", () => {
    const setBlink = vi.fn();
    const blink = new AutoBlinkController(setBlink);
    blink.update(0.016, 1);
    expect(setBlink).toHaveBeenCalled();
    expect(setBlink.mock.calls[0][0]).toBeGreaterThan(0);
  });

  it("never emits NaN with zero durations and zero delta", () => {
    const setBlink = vi.fn();
    const blink = new AutoBlinkController(setBlink, {
      minDelay: 0,
      maxDelay: 0,
      closeDuration: 0,
      openDuration: 0,
    });

    blink.update(0); // waiting → closing
    blink.update(0); // closing → opening
    blink.update(0); // opening → waiting

    for (const [value] of setBlink.mock.calls) {
      expect(Number.isNaN(value as number)).toBe(false);
    }
  });
});
