/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { smoothstep } from "./easing";
import type { Signal, SignalLike } from "./procedural-type";

/**
 * The signal library — small pure functions of time that compose into motion.
 *
 * **Nothing here calls `Math.random()`.** Randomness would make
 * {@link bakeAnimator} non-reproducible, so {@link noise} is seeded instead:
 * the same seed always yields the same waveform. (The auto-blink FSM in
 * `src/face/controllers/auto-blink.ts` *does* use `Math.random()` — that's
 * fine, because expressions are never baked.)
 */

/** Longest sub-step a stateful integrator will take, for numerical stability. */
const MAX_SUBSTEP = 1 / 120;

/** Longest frame delta a spring will integrate — guards a backgrounded tab. */
const MAX_SPRING_DELTA = 0.1;

/** Attach a `reset` that forwards to every stateful input signal. */
function withReset(signal: Signal, sources: readonly SignalLike[]): Signal {
  const resettable = sources.filter(
    (source): source is Signal => typeof source === "function" && !!source.reset,
  );

  if (resettable.length > 0) {
    signal.reset = () => {
      for (const source of resettable) source.reset!();
    };
  }

  return signal;
}

/** A signal that always returns `value`. */
export function constant(value: number): Signal {
  return () => value;
}

/** Coerce a {@link SignalLike} to a {@link Signal} (numbers become constants). */
export function toSignal(value: SignalLike): Signal {
  return typeof value === "function" ? value : constant(value);
}

export interface SineOptions {
  /** Cycles per second. Default 1. */
  hz?: number;
  /** Peak deviation from `offset`. Default 1. */
  amp?: number;
  /** Phase shift in **turns** (0.25 = a quarter cycle), not radians. Default 0. */
  phase?: number;
  /** Value the wave oscillates around. Default 0. */
  offset?: number;
}

/**
 * A sine wave — the workhorse behind breathing and sway.
 *
 * ```ts
 * sine({ hz: 0.25, amp: 3 }) // ±3 (degrees, in a channel) every 4 seconds
 * ```
 */
export function sine({
  hz = 1,
  amp = 1,
  phase = 0,
  offset = 0,
}: SineOptions = {}): Signal {
  return (time) => offset + amp * Math.sin(2 * Math.PI * (hz * time + phase));
}

/** A cosine wave — {@link sine} a quarter turn ahead. */
export function cosine(options: SineOptions = {}): Signal {
  return sine({ ...options, phase: (options.phase ?? 0) + 0.25 });
}

/**
 * Deterministic integer hash → `[0, 1)`. Two different `(cell, seed)` pairs
 * decorrelate, and the same pair always produces the same value — which is
 * what makes a baked clip reproducible.
 */
function hashToUnit(cell: number, seed: number): number {
  let h = Math.imul(cell ^ seed, 0x27d4eb2d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

/** Smoothly-interpolated value noise over the integer lattice, in `[-1, 1]`. */
function valueNoise(x: number, seed: number): number {
  const cell = Math.floor(x);
  const t = smoothstep(x - cell);
  const a = hashToUnit(cell, seed);
  const b = hashToUnit(cell + 1, seed);
  return (a + (b - a) * t) * 2 - 1;
}

export interface NoiseOptions {
  /** How fast the noise evolves, in lattice cells per second. Default 1. */
  hz?: number;
  /** Peak deviation. Default 1. */
  amp?: number;
  /** Changes the waveform. Same seed ⇒ same output, always. Default 0. */
  seed?: number;
  /**
   * Layer this many octaves of increasingly fine detail (fBm). 1 is a smooth
   * wander; 3 adds jitter. Default 1.
   */
  octaves?: number;
}

/**
 * Seeded smooth noise — an organic wander that never repeats on a fixed
 * period the way {@link sine} does. Use it for micro-movement that keeps an
 * idle from looking mechanical.
 *
 * Give every channel that uses noise a **different seed**, or they will all
 * move in lockstep.
 */
export function noise({
  hz = 1,
  amp = 1,
  seed = 0,
  octaves = 1,
}: NoiseOptions = {}): Signal {
  const layers = Math.max(1, Math.floor(octaves));

  // Normalize so the summed octaves still peak at `amp` rather than ~2x it.
  let totalWeight = 0;
  for (let i = 0; i < layers; i += 1) totalWeight += 0.5 ** i;

  return (time) => {
    let sum = 0;

    for (let i = 0; i < layers; i += 1) {
      sum += valueNoise(time * hz * 2 ** i, seed + i * 7919) * 0.5 ** i;
    }

    return (sum / totalWeight) * amp;
  };
}

export interface SpringOptions {
  /** How hard it pulls toward the target. Higher = snappier. Default 120. */
  stiffness?: number;
  /** How quickly it settles. Higher = less overshoot. Default 20. */
  damping?: number;
  /** Starting value (also what `reset()` returns to). Default 0. */
  initial?: number;
}

/**
 * A damped spring chasing a target you set imperatively.
 *
 * Unlike the rest of this module a spring is *stateful*, so it integrates the
 * frame delta rather than reading absolute time. Sub-steps at a fixed rate so
 * a long frame can't make it explode, and clamps absurd deltas (a backgrounded
 * tab) rather than teleporting.
 */
export interface Spring {
  /** Current value. */
  readonly value: number;
  /** Current rate of change, units per second. */
  readonly velocity: number;
  /** Where the spring is heading. Assign freely between frames. */
  target: number;
  /** Integrate `delta` seconds and return the new {@link Spring.value}. */
  update(delta: number): number;
  /** Jump to `value` immediately, killing velocity. */
  snap(value: number): void;
  /** Back to `initial`, target included. */
  reset(): void;
}

export function createSpring({
  stiffness = 120,
  damping = 20,
  initial = 0,
}: SpringOptions = {}): Spring {
  // Closure state rather than `this`, so a destructured `update` still works.
  let value = initial;
  let velocity = 0;
  let target = initial;

  return {
    get value() {
      return value;
    },
    get velocity() {
      return velocity;
    },
    get target() {
      return target;
    },
    set target(next: number) {
      target = next;
    },

    update(delta: number) {
      if (!(delta > 0)) return value;

      const clamped = Math.min(delta, MAX_SPRING_DELTA);
      const steps = Math.max(1, Math.ceil(clamped / MAX_SUBSTEP));
      const dt = clamped / steps;

      for (let i = 0; i < steps; i += 1) {
        const acceleration = stiffness * (target - value) - damping * velocity;
        velocity += acceleration * dt;
        value += velocity * dt;
      }

      return value;
    },

    snap(next: number) {
      value = next;
      velocity = 0;
    },

    reset() {
      value = initial;
      velocity = 0;
      target = initial;
    },
  };
}

/**
 * Wrap a signal in a {@link Spring} so it lags and settles instead of
 * snapping — the difference between a head that jerks to a new target and one
 * that turns toward it.
 */
export function smooth(source: SignalLike, options: SpringOptions = {}): Signal {
  const input = toSignal(source);
  const spring = createSpring(options);

  const signal: Signal = (time, delta) => {
    spring.target = input(time, delta);
    return spring.update(delta);
  };

  signal.reset = () => {
    spring.reset();
    input.reset?.();
  };

  return signal;
}

export interface EnvelopeOptions {
  /** Seconds to ramp from 0 to `amp`. Default 0.2. */
  attack?: number;
  /** Seconds to stay at `amp`. Default 0. */
  hold?: number;
  /** Seconds to ramp back to 0. Default 0.4. */
  release?: number;
  /** Peak value. Default 1. */
  amp?: number;
  /** Restart the envelope every `attack + hold + release` seconds. Default false. */
  loop?: boolean;
}

/**
 * A one-shot attack/hold/release ramp starting at `time = 0`, useful as a
 * multiplier that fades a whole behavior in or out. Stays at 0 once released
 * unless `loop` is set.
 */
export function envelope({
  attack = 0.2,
  hold = 0,
  release = 0.4,
  amp = 1,
  loop = false,
}: EnvelopeOptions = {}): Signal {
  const total = attack + hold + release;

  return (time) => {
    if (time <= 0) return 0;

    const t = loop && total > 0 ? time % total : time;

    if (t < attack) return attack > 0 ? (t / attack) * amp : amp;
    if (t < attack + hold) return amp;
    if (t < total) return release > 0 ? (1 - (t - attack - hold) / release) * amp : 0;

    return 0;
  };
}

// The combinators below carry a `Signal` suffix rather than bare `add` /
// `scale` / `clamp` names, because everything here is re-exported from the
// package root — generic names would squat on the consumer's namespace.

/** Sum any number of signals (or constants). */
export function addSignals(...sources: SignalLike[]): Signal {
  const signals = sources.map(toSignal);

  return withReset((time, delta) => {
    let sum = 0;
    for (const signal of signals) sum += signal(time, delta);
    return sum;
  }, signals);
}

/** Multiply any number of signals (or constants) together. */
export function multiplySignals(...sources: SignalLike[]): Signal {
  const signals = sources.map(toSignal);

  return withReset((time, delta) => {
    let product = 1;
    for (const signal of signals) product *= signal(time, delta);
    return product;
  }, signals);
}

/** Scale a signal by a constant factor. */
export function scaleSignal(source: SignalLike, factor: number): Signal {
  const signal = toSignal(source);
  return withReset((time, delta) => signal(time, delta) * factor, [signal]);
}

/** Flip a signal's sign — handy for counter-rotating a child bone. */
export function invertSignal(source: SignalLike): Signal {
  return scaleSignal(source, -1);
}

/** Constrain a signal to `[min, max]`. */
export function clampSignal(
  source: SignalLike,
  min: number,
  max: number,
): Signal {
  const signal = toSignal(source);

  return withReset(
    (time, delta) => Math.max(min, Math.min(max, signal(time, delta))),
    [signal],
  );
}
