/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { describe, it, expect } from "vitest";
import {
  addSignals,
  clampSignal,
  constant,
  cosine,
  createSpring,
  envelope,
  invertSignal,
  multiplySignals,
  noise,
  scaleSignal,
  sine,
  smooth,
  toSignal,
} from "./signals";

// Signals are pure math with no VRM/three dependency at all, so these run
// against the real implementations with nothing faked.

describe("constant / toSignal", () => {
  it("constant ignores time and delta", () => {
    const signal = constant(4);
    expect(signal(0, 0)).toBe(4);
    expect(signal(99, 0.016)).toBe(4);
  });

  it("toSignal wraps a number and passes a function through", () => {
    expect(toSignal(7)(0, 0)).toBe(7);

    const original = sine();
    expect(toSignal(original)).toBe(original);
  });
});

describe("sine / cosine", () => {
  it("starts at the offset and peaks a quarter cycle later", () => {
    const signal = sine({ hz: 1, amp: 2, offset: 1 });

    expect(signal(0, 0)).toBeCloseTo(1, 6); // offset
    expect(signal(0.25, 0)).toBeCloseTo(3, 6); // offset + amp
    expect(signal(0.75, 0)).toBeCloseTo(-1, 6); // offset - amp
  });

  it("hz sets the period", () => {
    const slow = sine({ hz: 0.25, amp: 1 });

    // A 0.25 Hz wave peaks at t=1s (a quarter of its 4s period).
    expect(slow(1, 0)).toBeCloseTo(1, 6);
    expect(slow(4, 0)).toBeCloseTo(0, 6);
  });

  it("phase is measured in turns, not radians", () => {
    const shifted = sine({ hz: 1, amp: 1, phase: 0.25 });
    expect(shifted(0, 0)).toBeCloseTo(1, 6);
  });

  it("cosine is sine a quarter turn ahead", () => {
    const signal = cosine({ hz: 1, amp: 1 });
    expect(signal(0, 0)).toBeCloseTo(1, 6);
  });

  it("stays within amp", () => {
    const signal = sine({ hz: 3, amp: 5 });

    for (let t = 0; t < 2; t += 0.01) {
      expect(Math.abs(signal(t, 0))).toBeLessThanOrEqual(5 + 1e-9);
    }
  });
});

describe("noise", () => {
  it("is fully deterministic for a given seed", () => {
    // This is the property that makes `bakeAnimator` reproducible — if noise
    // ever reached for Math.random() this test is what would catch it.
    const a = noise({ seed: 42 });
    const b = noise({ seed: 42 });

    for (let t = 0; t < 5; t += 0.1) {
      expect(a(t, 0)).toBe(b(t, 0));
    }
  });

  it("decorrelates different seeds", () => {
    const a = noise({ seed: 1 });
    const b = noise({ seed: 2 });

    const differences = Array.from({ length: 50 }, (_, i) =>
      Math.abs(a(i * 0.3, 0) - b(i * 0.3, 0)),
    );

    expect(Math.max(...differences)).toBeGreaterThan(0.1);
  });

  it("stays within amp across octave counts", () => {
    for (const octaves of [1, 2, 4]) {
      const signal = noise({ amp: 3, seed: 7, octaves });

      for (let t = 0; t < 10; t += 0.05) {
        expect(Math.abs(signal(t, 0))).toBeLessThanOrEqual(3 + 1e-9);
      }
    }
  });

  it("is continuous — no jumps between lattice cells", () => {
    const signal = noise({ hz: 1, amp: 1, seed: 3 });
    let previous = signal(0, 0);

    for (let t = 0.001; t < 5; t += 0.001) {
      const value = signal(t, 0);
      expect(Math.abs(value - previous)).toBeLessThan(0.02);
      previous = value;
    }
  });
});

describe("createSpring", () => {
  it("converges on its target", () => {
    const spring = createSpring({ stiffness: 120, damping: 20 });
    spring.target = 10;

    for (let i = 0; i < 300; i += 1) spring.update(1 / 60);

    expect(spring.value).toBeCloseTo(10, 3);
    expect(spring.velocity).toBeCloseTo(0, 3);
  });

  it("lags rather than teleporting", () => {
    const spring = createSpring({ stiffness: 120, damping: 20 });
    spring.target = 10;

    spring.update(1 / 60);
    expect(spring.value).toBeGreaterThan(0);
    expect(spring.value).toBeLessThan(10);
  });

  it("ignores a zero or negative delta", () => {
    const spring = createSpring();
    spring.target = 5;

    expect(spring.update(0)).toBe(0);
    expect(spring.update(-1)).toBe(0);
  });

  it("stays finite across an absurd delta (a backgrounded tab)", () => {
    const spring = createSpring({ stiffness: 400, damping: 10 });
    spring.target = 1;

    spring.update(600);

    expect(Number.isFinite(spring.value)).toBe(true);
    expect(Math.abs(spring.value)).toBeLessThan(100);
  });

  it("snap jumps without velocity; reset returns to initial", () => {
    const spring = createSpring({ initial: 2 });

    spring.target = 50;
    spring.update(1 / 60);
    spring.snap(9);
    expect(spring.value).toBe(9);
    expect(spring.velocity).toBe(0);

    spring.reset();
    expect(spring.value).toBe(2);
    expect(spring.target).toBe(2);
  });

  it("works when update is destructured off the spring", () => {
    const spring = createSpring();
    const { update } = spring;
    spring.target = 3;

    for (let i = 0; i < 200; i += 1) update(1 / 60);

    expect(spring.value).toBeCloseTo(3, 3);
  });
});

describe("smooth", () => {
  it("chases a constant source and settles on it", () => {
    const signal = smooth(constant(5));

    let value = 0;
    for (let i = 0; i < 300; i += 1) value = signal(i / 60, 1 / 60);

    expect(value).toBeCloseTo(5, 3);
  });

  it("resets its spring back to zero", () => {
    const signal = smooth(constant(5));

    for (let i = 0; i < 100; i += 1) signal(i / 60, 1 / 60);
    signal.reset!();

    expect(signal(0, 0)).toBeCloseTo(0, 6);
  });
});

describe("envelope", () => {
  const options = { attack: 1, hold: 1, release: 1, amp: 2 };

  it("ramps up, holds, ramps down, then stays at zero", () => {
    const signal = envelope(options);

    expect(signal(0, 0)).toBe(0);
    expect(signal(0.5, 0)).toBeCloseTo(1, 6);
    expect(signal(1.5, 0)).toBeCloseTo(2, 6);
    expect(signal(2.5, 0)).toBeCloseTo(1, 6);
    expect(signal(3.5, 0)).toBe(0);
  });

  it("restarts each cycle when looping", () => {
    const signal = envelope({ ...options, loop: true });
    expect(signal(3.5, 0)).toBeCloseTo(1, 6); // 3.5 % 3 = 0.5
  });
});

describe("combinators", () => {
  it("addSignals sums, multiplySignals multiplies", () => {
    expect(addSignals(1, 2, constant(3))(0, 0)).toBe(6);
    expect(multiplySignals(2, 3, constant(4))(0, 0)).toBe(24);
  });

  it("scaleSignal and invertSignal scale by a factor", () => {
    expect(scaleSignal(constant(3), 4)(0, 0)).toBe(12);
    expect(invertSignal(constant(3))(0, 0)).toBe(-3);
  });

  it("clampSignal constrains the range", () => {
    const signal = clampSignal(sine({ hz: 1, amp: 10 }), -2, 2);

    for (let t = 0; t < 2; t += 0.01) {
      const value = signal(t, 0);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThanOrEqual(2);
    }
  });

  it("forwards reset to stateful inputs", () => {
    // A combinator that swallowed reset() would silently break `bakeAnimator`'s
    // determinism guarantee for any composed signal containing a spring.
    const inner = smooth(constant(10));
    const composed = scaleSignal(inner, 2);

    for (let i = 0; i < 200; i += 1) composed(i / 60, 1 / 60);
    expect(composed(200 / 60, 1 / 60)).toBeCloseTo(20, 2);

    composed.reset!();
    expect(composed(0, 0)).toBeCloseTo(0, 6);
  });

  it("leaves reset undefined when nothing in the chain is stateful", () => {
    expect(addSignals(sine(), constant(1)).reset).toBeUndefined();
  });
});
