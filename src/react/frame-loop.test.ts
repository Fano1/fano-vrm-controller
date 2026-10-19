/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFrameLoopController } from "./frame-loop";

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

const make = (
	frame: (delta: number, elapsed: number) => void,
	{ maxDelta = 0.1, paused = false, autoStart = true } = {},
) => createFrameLoopController(frame, () => maxDelta, { paused, autoStart });

describe("createFrameLoopController", () => {
	it("does not run until attached", () => {
		const loop = make(() => {});

		expect(loop.running).toBe(false);
		expect(pending.size).toBe(0);
	});

	it("runs once attached and reports seconds, not milliseconds", () => {
		const frames: Array<[number, number]> = [];
		const loop = make((delta, elapsed) => frames.push([delta, elapsed]));

		loop.attach();
		expect(loop.running).toBe(true);

		step(16);
		step(16);

		expect(frames).toEqual([
			[0.016, 0.016],
			[0.016, 0.032],
		]);
	});

	it("clamps a long gap so a backgrounded tab can't explode the avatar", () => {
		const deltas: number[] = [];
		const loop = make((delta) => deltas.push(delta));

		loop.attach();
		step(16);
		step(5000);

		expect(deltas).toEqual([0.016, 0.1]);
	});

	it("reads maxDelta every frame, so changing it needs no restart", () => {
		let max = 0.1;
		const deltas: number[] = [];
		const loop = createFrameLoopController((d) => deltas.push(d), () => max, {
			paused: false,
			autoStart: true,
		});

		loop.attach();
		step(500);
		max = 0.25;
		step(500);

		expect(deltas).toEqual([0.1, 0.25]);
	});

	it("keeps one request in flight, not one per frame", () => {
		const loop = make(() => {});
		loop.attach();

		step(16);
		step(16);
		step(16);

		expect(pending.size).toBe(1);
	});

	it("survives a throwing callback — it costs one frame, not the loop", () => {
		let calls = 0;
		const loop = make(() => {
			calls++;
			if (calls === 1) throw new Error("user code");
		});

		loop.attach();
		expect(() => step(16)).toThrow("user code");
		step(16);

		expect(calls).toBe(2);
		expect(loop.running).toBe(true);
	});

	it("stops on detach and resumes on re-attach (StrictMode)", () => {
		const frames: number[] = [];
		const loop = make((delta) => frames.push(delta));

		const detach = loop.attach();
		step(16);
		detach();

		expect(loop.running).toBe(false);
		expect(pending.size).toBe(0);

		clock += 60_000; // a long unmounted gap
		loop.attach();
		step(16);

		// The gap while detached is not animation time.
		expect(frames).toEqual([0.016, 0.016]);
	});

	it("honours autoStart: false until start()", () => {
		const frames: number[] = [];
		const loop = make((d) => frames.push(d), { autoStart: false });

		loop.attach();
		step(16);
		expect(frames).toEqual([]);
		expect(loop.running).toBe(false);

		loop.start();
		step(16);

		expect(frames).toEqual([0.016]);
		expect(loop.running).toBe(true);
	});

	it("stop() halts it and start() resumes it", () => {
		const frames: number[] = [];
		const loop = make((d) => frames.push(d));
		loop.attach();

		loop.stop();
		step(16);
		expect(frames).toEqual([]);

		loop.start();
		step(16);
		expect(frames).toEqual([0.016]);
	});

	it("paused suspends and resumes WITHOUT erasing an earlier stop()", () => {
		const frames: number[] = [];
		const loop = make((d) => frames.push(d));
		loop.attach();

		loop.stop();
		loop.setPaused(true);
		loop.setPaused(false);

		step(16);
		expect(frames).toEqual([]); // still stopped: the pause never erased it

		loop.start();
		step(16);
		expect(frames).toEqual([0.016]);
	});

	it("starts paused when told to, and runs when unpaused", () => {
		const frames: number[] = [];
		const loop = make((d) => frames.push(d), { paused: true });

		loop.attach();
		step(16);
		expect(frames).toEqual([]);

		loop.setPaused(false);
		step(16);
		expect(frames).toEqual([0.016]);
	});

	it("never calls back after detach", () => {
		const frame = vi.fn();
		const loop = make(frame);

		const detach = loop.attach();
		detach();
		step(16);

		expect(frame).not.toHaveBeenCalled();
	});
});
