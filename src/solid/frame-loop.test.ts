/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRoot, createSignal } from "solid-js";
import { createFrameLoop } from "./frame-loop";

// --- A hand-driven requestAnimationFrame -------------------------------
// Frames are stepped explicitly with a chosen timestamp, so deltas (and the
// clamp) are exact rather than dependent on real wall-clock timing.

let pending = new Map<number, FrameRequestCallback>();
let nextHandle = 1;
let clock = 0;

function step(advanceMs: number) {
	clock += advanceMs;
	const due = [...pending.values()];
	pending.clear();
	for (const cb of due) cb(clock);
}

beforeEach(() => {
	pending = new Map();
	nextHandle = 1;
	clock = 1000;

	vi.stubGlobal("window", {});
	vi.stubGlobal("document", {});
	vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
		const handle = nextHandle++;
		pending.set(handle, cb);
		return handle;
	});
	vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
		pending.delete(handle);
	});
	vi.spyOn(performance, "now").mockImplementation(() => clock);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("createFrameLoop", () => {
	it("starts automatically and reports seconds, not milliseconds", () => {
		const frames: Array<[number, number]> = [];

		const [loop, dispose] = createRoot(
			(d) =>
				[
					createFrameLoop((delta, elapsed) => frames.push([delta, elapsed])),
					d,
				] as const,
		);

		expect(loop.running()).toBe(true);
		expect(frames).toEqual([]);

		step(16);
		step(16);

		expect(frames).toEqual([
			[0.016, 0.016],
			[0.016, 0.032],
		]);

		dispose();
	});

	it("clamps a long gap so a backgrounded tab can't explode the avatar", () => {
		const deltas: number[] = [];

		const [, dispose] = createRoot(
			(d) => [createFrameLoop((delta) => deltas.push(delta)), d] as const,
		);

		step(5000); // tab was hidden for five seconds
		expect(deltas).toEqual([0.1]);

		step(16);
		expect(deltas).toEqual([0.1, 0.016]);

		dispose();
	});

	it("honours a custom maxDelta", () => {
		const deltas: number[] = [];

		const [, dispose] = createRoot(
			(d) =>
				[
					createFrameLoop((delta) => deltas.push(delta), { maxDelta: 0.5 }),
					d,
				] as const,
		);

		step(5000);
		expect(deltas).toEqual([0.5]);

		dispose();
	});

	it("stops and restarts on request, without replaying the idle gap", () => {
		const deltas: number[] = [];

		const [loop, dispose] = createRoot(
			(d) => [createFrameLoop((delta) => deltas.push(delta)), d] as const,
		);

		step(16);
		loop.stop();

		expect(loop.running()).toBe(false);
		step(16);
		expect(deltas).toEqual([0.016]);

		// Time passes while stopped; restarting must not hand that gap to the
		// callback as if it were animation time.
		clock += 4000;
		loop.start();
		expect(loop.running()).toBe(true);

		step(16);
		expect(deltas).toEqual([0.016, 0.016]);

		dispose();
	});

	it("suspends while paused reads true, and resumes without losing intent", () => {
		const [paused, setPaused] = createSignal(false);
		let ticks = 0;

		const [loop, dispose] = createRoot(
			(d) => [createFrameLoop(() => ticks++, { paused }), d] as const,
		);

		step(16);
		expect(ticks).toBe(1);

		setPaused(true);
		expect(loop.running()).toBe(false);
		step(16);
		expect(ticks).toBe(1);

		setPaused(false);
		expect(loop.running()).toBe(true);
		step(16);
		expect(ticks).toBe(2);

		dispose();
	});

	it("stays stopped when unpausing after an explicit stop()", () => {
		const [paused, setPaused] = createSignal(false);
		let ticks = 0;

		const [loop, dispose] = createRoot(
			(d) => [createFrameLoop(() => ticks++, { paused }), d] as const,
		);

		loop.stop();
		setPaused(true);
		setPaused(false);

		expect(loop.running()).toBe(false);
		step(16);
		expect(ticks).toBe(0);

		dispose();
	});

	it("does not start when autoStart is false", () => {
		let ticks = 0;

		const [loop, dispose] = createRoot(
			(d) =>
				[createFrameLoop(() => ticks++, { autoStart: false }), d] as const,
		);

		expect(loop.running()).toBe(false);
		step(16);
		expect(ticks).toBe(0);

		loop.start();
		step(16);
		expect(ticks).toBe(1);

		dispose();
	});

	it("cancels the pending frame on cleanup", () => {
		let ticks = 0;

		const [loop, dispose] = createRoot(
			(d) => [createFrameLoop(() => ticks++), d] as const,
		);

		step(16);
		expect(ticks).toBe(1);

		dispose();

		expect(loop.running()).toBe(false);
		expect(pending.size).toBe(0);
		step(16);
		expect(ticks).toBe(1);
	});

	it("keeps running when the callback throws", () => {
		let ticks = 0;

		const [, dispose] = createRoot(
			(d) =>
				[
					createFrameLoop(() => {
						ticks++;
						throw new Error("bad frame");
					}),
					d,
				] as const,
		);

		expect(() => step(16)).toThrow("bad frame");
		expect(() => step(16)).toThrow("bad frame");
		expect(ticks).toBe(2);

		dispose();
	});

	it("is inert outside a browser", () => {
		vi.unstubAllGlobals();
		let ticks = 0;

		const [loop, dispose] = createRoot(
			(d) => [createFrameLoop(() => ticks++), d] as const,
		);

		expect(loop.running()).toBe(false);
		expect(ticks).toBe(0);

		dispose();
	});
});
