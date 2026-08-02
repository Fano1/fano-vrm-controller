/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { createEffect, createSignal, onCleanup } from "solid-js";
import type {
	CreateFrameLoopOptions,
	FrameLoop,
	FrameLoopCallback,
} from "./solid-type";
import { access, isBrowser } from "./solid-utils";

/**
 * A `requestAnimationFrame` loop bound to the lifetime of a Solid scope.
 *
 * Solid has no renderer-owned frame hook (there is no `useFrame` outside R3F),
 * so this is where a VRM app's per-frame work lives: advance the avatar, then
 * render. Deltas are in **seconds**, matching `avatar.update(delta)` and every
 * other time input in this package.
 *
 * ```ts
 * const loop = createFrameLoop((delta) => {
 *   vrm.avatar()?.update(delta);   // updaters, then vrm.update, in one place
 *   renderer.render(scene, camera);
 * });
 *
 * loop.stop();      // e.g. when a tab/panel is hidden
 * loop.running();   // reactive
 * ```
 *
 * Cancels itself on cleanup, and is a no-op outside the browser so the same
 * component can render during SSR.
 */
export function createFrameLoop(
	callback: FrameLoopCallback,
	options: CreateFrameLoopOptions = {},
): FrameLoop {
	const maxDelta = options.maxDelta ?? 0.1;

	// `wanted` is the caller's intent, `running` is what's actually scheduled.
	// Keeping them apart is what lets `paused` suspend and resume a loop
	// without erasing a prior `stop()`.
	const [wanted, setWanted] = createSignal(options.autoStart ?? true);
	const [running, setRunning] = createSignal(false);

	let handle: number | null = null;
	let previous = 0;
	let elapsed = 0;

	const tick = (now: number) => {
		// Scheduled before the callback runs, so a throw inside user code costs
		// one frame instead of killing the loop.
		handle = requestAnimationFrame(tick);

		const delta = Math.min((now - previous) / 1000, maxDelta);
		previous = now;
		elapsed += delta;

		callback(delta, elapsed);
	};

	const startLoop = () => {
		if (handle !== null || !isBrowser()) return;
		// Reset the clock on resume; the gap since the last frame isn't elapsed
		// animation time, it's time the loop wasn't running.
		previous = performance.now();
		handle = requestAnimationFrame(tick);
		setRunning(true);
	};

	const stopLoop = () => {
		if (handle === null) return;
		cancelAnimationFrame(handle);
		handle = null;
		setRunning(false);
	};

	createEffect(() => {
		if (wanted() && !access(options.paused ?? false)) startLoop();
		else stopLoop();
	});

	onCleanup(stopLoop);

	return {
		running,
		start: () => setWanted(true),
		stop: () => setWanted(false),
	};
}
