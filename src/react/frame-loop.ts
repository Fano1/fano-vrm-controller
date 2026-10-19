/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { useEffect, useState } from "react";
import type {
	FrameLoop,
	FrameLoopCallback,
	UseFrameLoopOptions,
} from "./react-type";
import { useLatest } from "./react-utils";

const DEFAULT_MAX_DELTA = 0.1;

type FrameLoopController = FrameLoop & {
	/** Mark the owner mounted, starting the loop if it's wanted. Returns the detach. */
	attach: () => () => void;
	setPaused: (paused: boolean) => void;
};

/**
 * The loop itself, with no React in it.
 *
 * Three independent facts decide whether a frame is requested: the caller
 * *wants* it (`start` / `stop`), nothing has *paused* it, and the owner is
 * *mounted*. Keeping them apart is what lets `paused` suspend and resume a loop
 * without erasing a prior `stop()`, and lets a StrictMode remount restart a loop
 * the user never stopped.
 */
export function createFrameLoopController(
	frame: FrameLoopCallback,
	readMaxDelta: () => number,
	initial: { paused: boolean; autoStart: boolean },
): FrameLoopController {
	let wanted = initial.autoStart;
	let paused = initial.paused;
	let mounted = false;

	let handle: number | null = null;
	let previous = 0;
	let elapsed = 0;

	const tick = (now: number) => {
		// Scheduled before the callback runs, so a throw inside user code costs
		// one frame instead of killing the loop.
		handle = requestAnimationFrame(tick);

		const delta = Math.min((now - previous) / 1000, readMaxDelta());
		previous = now;
		elapsed += delta;

		frame(delta, elapsed);
	};

	const sync = () => {
		const shouldRun = wanted && !paused && mounted;

		if (shouldRun && handle === null) {
			// Reset the clock on resume; the gap since the last frame isn't elapsed
			// animation time, it's time the loop wasn't running.
			previous = performance.now();
			handle = requestAnimationFrame(tick);
		} else if (!shouldRun && handle !== null) {
			cancelAnimationFrame(handle);
			handle = null;
		}
	};

	return {
		get running() {
			return handle !== null;
		},

		start() {
			wanted = true;
			sync();
		},

		stop() {
			wanted = false;
			sync();
		},

		setPaused(next) {
			paused = next;
			sync();
		},

		attach() {
			mounted = true;
			sync();

			return () => {
				mounted = false;
				sync();
			};
		},
	};
}

/**
 * A `requestAnimationFrame` loop bound to the lifetime of a component — and
 * **never a reason for it to render**.
 *
 * React has no renderer-owned frame hook outside R3F's `useFrame`, so this is
 * where a VRM app's per-frame work lives: advance the avatar, then render.
 * Deltas are in **seconds**, matching `avatar.update(delta)` and every other
 * time input in this package.
 *
 * ```tsx
 * const loop = useFrameLoop((delta) => {
 *   vrm.update(delta);
 *   renderer.render(scene, camera);
 * });
 *
 * loop.stop();      // e.g. when a panel is hidden
 * loop.running;     // plain read, not reactive
 * ```
 *
 * The callback is called through a ref, so an inline closure always sees the
 * latest props and state and never restarts the loop. The returned object is
 * stable, and `running` is a plain read — a control that must *show* whether
 * the loop is running should hold that in its own state.
 *
 * Cancels itself on unmount, and does nothing during server rendering.
 */
export function useFrameLoop(
	callback: FrameLoopCallback,
	options: UseFrameLoopOptions = {},
): FrameLoop {
	const { paused = false, autoStart = true, maxDelta } = options;

	const latestCallback = useLatest(callback);
	const latestMaxDelta = useLatest(maxDelta ?? DEFAULT_MAX_DELTA);

	const [loop] = useState(() =>
		createFrameLoopController(
			(delta, elapsed) => latestCallback.current(delta, elapsed),
			() => latestMaxDelta.current,
			{ paused, autoStart },
		),
	);

	useEffect(() => loop.attach(), [loop]);

	useEffect(() => {
		loop.setPaused(paused);
	}, [loop, paused]);

	return loop;
}
