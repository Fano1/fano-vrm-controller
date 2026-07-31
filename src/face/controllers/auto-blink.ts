/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type { AutoBlinkOptions } from "../face-type";

/** Sink for a blink weight (0..1), called every frame by the FSM. */
export type SetBlinkFn = (weight: number) => void;

/** The phase of the {@link AutoBlinkController} finite-state machine. */
type BlinkPhase = "waiting" | "closing" | "opening";

/** Pick a random number in `[min, max)`. */
function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Linearly interpolate from `a` to `b` by `t`. */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * A framework-agnostic blink finite-state machine.
 *
 * It owns no VRM or face-controller reference — it drives a plain
 * {@link SetBlinkFn} callback, so the same machine works whether blinks are
 * routed through the standard `blink` expression or a fuzzy morph channel.
 *
 * Cycle: sit in `waiting` for a random `[minDelay, maxDelay)` interval, ease
 * the lid shut over `closeDuration`, ease it back open over `openDuration`,
 * then wait again. Drive it by calling {@link update} each frame with the
 * frame delta.
 *
 * ```ts
 * const blink = new AutoBlinkController((w) => face.blink(w));
 * // in the render loop:
 * blink.update(delta);
 * ```
 */
export class AutoBlinkController {
  private phase: BlinkPhase = "waiting";
  private timer = 0;
  private currentValue = 0;
  private nextBlinkTime: number;

  private readonly minDelay: number;
  private readonly maxDelay: number;
  private readonly closeDuration: number;
  private readonly openDuration: number;
  private readonly intensity: number;

  constructor(
    private readonly setBlink: SetBlinkFn,
    options: AutoBlinkOptions = {},
  ) {
    this.minDelay = options.minDelay ?? 2;
    this.maxDelay = options.maxDelay ?? 6;
    this.closeDuration = options.closeDuration ?? 0.08;
    this.openDuration = options.openDuration ?? 0.14;
    this.intensity = options.intensity ?? 1;
    this.nextBlinkTime = randomBetween(this.minDelay, this.maxDelay);
  }

  /**
   * Advance the FSM by `delta` seconds and push the resulting weight to the
   * blink callback. Pass `manualBlink > 0` to force-hold the eyes at that
   * weight (easing toward it), bypassing the automatic cycle for this frame.
   */
  update(delta: number, manualBlink = 0): void {
    if (manualBlink > 0) {
      this.currentValue = lerp(this.currentValue, manualBlink, 0.35);
      this.setBlink(this.currentValue);
      return;
    }

    this.timer += delta;

    if (this.phase === "waiting") {
      this.currentValue = lerp(this.currentValue, 0, 0.25);
      this.setBlink(this.currentValue);

      if (this.timer >= this.nextBlinkTime) {
        this.phase = "closing";
        this.timer = 0;
      }

      return;
    }

    if (this.phase === "closing") {
      // Guard 0/0 = NaN when a zero-duration phase gets a zero-delta frame.
      const p = this.closeDuration > 0
        ? Math.min(this.timer / this.closeDuration, 1)
        : 1;
      this.currentValue = lerp(0, this.intensity, p);
      this.setBlink(this.currentValue);

      if (p >= 1) {
        this.phase = "opening";
        this.timer = 0;
      }

      return;
    }

    // phase === "opening"
    const p = this.openDuration > 0
      ? Math.min(this.timer / this.openDuration, 1)
      : 1;
    this.currentValue = lerp(this.intensity, 0, p);
    this.setBlink(this.currentValue);

    if (p >= 1) {
      this.phase = "waiting";
      this.timer = 0;
      this.nextBlinkTime = randomBetween(this.minDelay, this.maxDelay);
    }
  }

  /** Return to the neutral waiting state and open the eyes. */
  reset(): void {
    this.phase = "waiting";
    this.timer = 0;
    this.currentValue = 0;
    this.nextBlinkTime = randomBetween(this.minDelay, this.maxDelay);
    this.setBlink(0);
  }
}
