/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import type { VRMAvatar } from "../core/feature/loader";
import type {
	UseVRMOptions,
	VRMHandle,
	VRMSource,
	VRMStatus,
} from "./react-type";
import { useLatest } from "./react-utils";
import { useVRMEffect } from "./use-vrm-effect";
import { createVRMStore } from "./vrm-store";

/**
 * Load a VRM and dispose it automatically — **without re-rendering the calling
 * component**.
 *
 * Returns a stable {@link VRMHandle}. The component that calls `useVRM` renders
 * once, and keeps rendering exactly as often as its own props and state say it
 * should: not when the model starts loading, not on each progress event, not
 * when the avatar arrives, and never per frame. Reads are plain property reads
 * (`vrm.avatar`); to render *from* a value, opt in per value with
 * {@link useVRMStatus} / {@link useVRMAvatar} / {@link useVRMProgress} /
 * {@link useVRMError}, ideally in a small child so only that child re-renders.
 *
 * ```tsx
 * function Stage() {
 *   const vrm = useVRM("/avatar.vrm", { scene });   // Stage never re-renders for this
 *
 *   useFrameLoop((delta) => {
 *     vrm.update(delta);                             // updaters, then vrm.update
 *     renderer.render(scene, camera);
 *   });
 *
 *   return <LoadingBar vrm={vrm} />;                 // only this subscribes
 * }
 * ```
 *
 * Reloads when `source` changes and disposes the previous avatar. A falsy source
 * loads nothing and releases whatever was loaded. Disposes on unmount, and
 * survives React StrictMode's mount → unmount → mount without downloading the
 * model twice. Nothing loads during server rendering — loading starts in an
 * effect.
 *
 * The avatar is not rendered anywhere by itself: pass `options.scene` to have it
 * attached for you, or add `vrm.avatar.scene` to your own scene.
 */
export function useVRM(
	source: VRMSource,
	options: UseVRMOptions = {},
): VRMHandle {
	// `vrmLoadOptions` and `keepPrevious` are read when a load starts, through a
	// ref — making them effect dependencies would reload the model every time a
	// caller wrote `{ vrmLoadOptions: {} }` inline.
	const settings = useLatest(options);

	// `useState`, not `useRef`: a lazy initializer runs once and is the idiom
	// React won't flag for reading a ref during render.
	const [store] = useState(() => createVRMStore(() => settings.current));

	useEffect(() => {
		store.setSource(source);
		return store.release;
	}, [store, source]);

	const scene = options.scene;

	useVRMEffect(
		store,
		(avatar) => {
			if (!scene) return;

			scene.add(avatar.scene);
			return () => {
				scene.remove(avatar.scene);
			};
		},
		[scene],
	);

	return store;
}

// -- Opt-in subscriptions ---------------------------------------------------
//
// Each reads ONE field through `useSyncExternalStore`, which re-renders only
// when that field's value changes (`Object.is`). A component that asks for the
// status is not woken by a progress event; one that asks for progress is not
// woken when the avatar arrives. The server snapshots are module-level so their
// identity is stable.

const serverNull = () => null;
const serverIdle = (): VRMStatus => "idle";
const serverUndefined = () => undefined;

/** Render from the current avatar. Re-renders when it is swapped in or out. */
export function useVRMAvatar(handle: VRMHandle): VRMAvatar | null {
	return useSyncExternalStore(
		handle.subscribe,
		() => handle.avatar,
		serverNull,
	);
}

/** Render from the load state. Re-renders on `idle` → `loading` → `ready` / `error`. */
export function useVRMStatus(handle: VRMHandle): VRMStatus {
	return useSyncExternalStore(
		handle.subscribe,
		() => handle.status,
		serverIdle,
	);
}

/** Render from the failure, if any. Re-renders when an error appears or clears. */
export function useVRMError(handle: VRMHandle): unknown {
	return useSyncExternalStore(
		handle.subscribe,
		() => handle.error,
		serverUndefined,
	);
}

/**
 * Render from load progress, as a fraction from `0` to `1` — or `null` before
 * the first event.
 *
 * **Quantized to whole percents.** A download can report progress on every
 * network chunk; rendering each one would repaint a progress bar hundreds of
 * times for ~100 visible steps. The component re-renders at most once per
 * percent. Need every raw event? Use `handle.subscribeProgress` and
 * `handle.progress` yourself, and write to a ref or the DOM directly.
 *
 * Stays at its last value after the load finishes; resets on the next load.
 */
export function useVRMProgress(handle: VRMHandle): number | null {
	return useSyncExternalStore(
		handle.subscribeProgress,
		() => {
			const event = handle.progress;
			return event ? Math.round(event.progress * 100) / 100 : null;
		},
		serverNull,
	);
}
