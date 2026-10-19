/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { useEffect, type DependencyList } from "react";
import type { VRMAvatar } from "../core/feature/loader";
import type { VRMHandle } from "./react-type";
import { useLatest } from "./react-utils";

/**
 * Run an effect against the loaded avatar — **without re-rendering anything**.
 *
 * `effect` runs once each time an avatar becomes available (and again whenever
 * `deps` change), and its cleanup runs when that avatar goes away — a url
 * swap, an unmount — *before* the avatar is disposed, so it can still touch the
 * model on the way out. This is the place to build controllers:
 *
 * ```ts
 * useVRMEffect(vrm, (avatar) => {
 *   const face = createVRMFace(avatar.vrm);
 *   const stop = avatar.registerUpdate((delta) => face.update(delta));
 *   face.eye.autoBlink();
 *   return stop;
 * });
 * ```
 *
 * It is the React stand-in for Solid's `createMemo(() => createVRMFace(...))`,
 * minus the render: the usual alternative, `useMemo` keyed on a piece of state
 * holding the avatar, renders the whole component once per load just to learn
 * that the avatar exists.
 *
 * Pass the values your effect reads as `deps`, exactly as you would to
 * `useEffect` — that is how a control gets re-applied to a freshly loaded model:
 *
 * ```ts
 * useVRMEffect(vrm, (avatar) => {
 *   createVRMFace(avatar.vrm).emotion.setExclusive(mood);
 * }, [mood]);
 * ```
 *
 * The effect closure itself is never a dependency, so an inline function is
 * fine. The array's length must stay constant between renders.
 */
export function useVRMEffect(
	handle: VRMHandle,
	effect: (avatar: VRMAvatar) => void | (() => void),
	deps: DependencyList = [],
): void {
	const latest = useLatest(effect);

	useEffect(() => {
		let bound: VRMAvatar | null = null;
		let cleanup: (() => void) | undefined;

		// Idempotent: the store notifies on every status change, but only a new
		// avatar identity is worth tearing the effect down for.
		const bind = () => {
			const next = handle.avatar;
			if (next === bound) return;

			const previous = cleanup;
			bound = next;
			cleanup = undefined;
			previous?.();

			if (next) {
				const result = latest.current(next);
				cleanup = typeof result === "function" ? result : undefined;
			}
		};

		bind();
		const unsubscribe = handle.subscribe(bind);

		return () => {
			unsubscribe();
			bound = null;
			cleanup?.();
			cleanup = undefined;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [handle, latest, ...deps]);
}

/**
 * Run `fn` every frame against the current avatar — registered through
 * `avatar.registerUpdate`, so it runs before `vrm.update(delta)` like every
 * other driver in this package. **Never causes a render.**
 *
 * The registration follows the avatar: a url swap unregisters it from the old
 * model and re-registers it on the new one, so a driver can't be left bound to a
 * disposed rig. `fn` is called through a ref, so an inline closure that captures
 * fresh props or state each render is always current and never re-registers.
 *
 * ```ts
 * useVRMUpdate(vrm, (delta, avatar) => {
 *   mixer.current?.update(delta);
 * });
 * ```
 */
export function useVRMUpdate(
	handle: VRMHandle,
	fn: (delta: number, avatar: VRMAvatar) => void,
): void {
	const latest = useLatest(fn);

	useVRMEffect(handle, (avatar) =>
		avatar.registerUpdate((delta) => latest.current(delta, avatar)),
	);
}
