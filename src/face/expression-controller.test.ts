import { describe, it, expect, vi } from "vitest";
import type { VRM } from "@pixiv/three-vrm";
import { VRMExpressionController } from "./expression-controller";

/** Minimal in-memory stand-in for VRMExpressionManager. */
function fakeExpressionManager(initial: Record<string, number> = {}) {
  const values: Record<string, number> = { ...initial };

  return {
    values,
    expressionMap: Object.fromEntries(
      Object.keys(initial).map((name) => [name, { expressionName: name }]),
    ),
    getExpression: vi.fn((name: string) =>
      name in values ? { expressionName: name } : null,
    ),
    getValue: vi.fn((name: string) => (name in values ? values[name] : null)),
    setValue: vi.fn((name: string, weight: number) => {
      values[name] = weight;
    }),
    resetValues: vi.fn(() => {
      for (const key of Object.keys(values)) values[key] = 0;
    }),
  };
}

function makeVrm(manager: unknown): VRM {
  return { expressionManager: manager } as unknown as VRM;
}

describe("VRMExpressionController", () => {
  it("reports availability and lists expression names", () => {
    const controller = new VRMExpressionController(
      makeVrm(fakeExpressionManager({ happy: 0, blink: 0 })),
    );

    expect(controller.available).toBe(true);
    expect(controller.getExpressionNames().sort()).toEqual(["blink", "happy"]);
    expect(controller.hasExpression("happy")).toBe(true);
    expect(controller.hasExpression("nope")).toBe(false);
  });

  it("clamps weights to 0..1 and reads them back", () => {
    const manager = fakeExpressionManager({ happy: 0 });
    const controller = new VRMExpressionController(makeVrm(manager));

    controller.setExpression("happy", 5);
    expect(manager.setValue).toHaveBeenLastCalledWith("happy", 1);

    controller.setExpression("happy", -2);
    expect(manager.setValue).toHaveBeenLastCalledWith("happy", 0);

    controller.setExpression("happy", 0.42);
    expect(controller.getExpression("happy")).toBe(0.42);
  });

  it("returns 0 for an absent expression's weight", () => {
    const controller = new VRMExpressionController(
      makeVrm(fakeExpressionManager({ happy: 0 })),
    );

    expect(controller.getExpression("missing")).toBe(0);
  });

  it("sets several expressions at once, skipping undefined entries", () => {
    const manager = fakeExpressionManager({ aa: 0, happy: 0, sad: 0 });
    const controller = new VRMExpressionController(makeVrm(manager));

    controller.setExpressions({ aa: 0.5, happy: 1, sad: undefined });

    expect(manager.values.aa).toBe(0.5);
    expect(manager.values.happy).toBe(1);
    expect(manager.setValue).toHaveBeenCalledTimes(2);
  });

  it("is chainable and resets", () => {
    const manager = fakeExpressionManager({ happy: 0, blink: 0 });
    const controller = new VRMExpressionController(makeVrm(manager));

    const returned = controller
      .setExpression("happy", 1)
      .setExpression("blink", 1);
    expect(returned).toBe(controller);

    controller.reset();
    expect(manager.resetValues).toHaveBeenCalledTimes(1);
    expect(manager.values.happy).toBe(0);
  });

  it("degrades safely when the VRM has no expression manager", () => {
    const controller = new VRMExpressionController(makeVrm(undefined));

    expect(controller.available).toBe(false);
    expect(controller.getExpressionNames()).toEqual([]);
    expect(controller.hasExpression("happy")).toBe(false);
    expect(controller.getExpression("happy")).toBe(0);
    // No throw on mutation:
    expect(() => controller.setExpression("happy", 1).reset()).not.toThrow();
  });
});
