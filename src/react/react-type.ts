/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type * as THREE from "three";
import type {
	LoadVRMOptions,
	VRMAvatar,
	VRMLoadProgress,
} from "../core/feature/loader";

/**
 * What {@link useVRM} loads. A falsy source means "load nothing", so gating
 * needs no branch: `useVRM(selected?.url)` simply idles until something is
 * selected. Same convention as the Solid entry.
 */
export type VRMSource = string | undefined | null | false;

/**
 * Where a load is up to.
 *
 * `"ready"` is the only state that guarantees an avatar, but the avatar is
 * independent of the status: with `keepPrevious`, a `"loading"` or `"error"`
 * handle can still be holding the previous model.
 */
export type VRMStatus = "idle" | "loading" | "ready" | "error";

export type UseVRMOptions = {
	/**
	 * Parent to add `avatar.scene` to, re-attaching if it changes and detaching
	 * on cleanup. Pass the same object across renders (`useState` / `useMemo` /
	 * module scope) — a fresh object every render re-attaches every render.
	 */
	scene?: THREE.Object3D | null;

	/**
	 * Extra plugin options forwarded to the VRM loader. Read when a load starts,
	 * so an inline `{}` never reloads the model.
	 */
	vrmLoadOptions?: LoadVRMOptions["vrmLoadOptions"];

	/**
	 * Keep the current avatar on screen until the next one finishes loading,
	 * instead of clearing it the moment the url changes. Default `false`.
	 *
	 * Trade-off: no empty frame while a swap loads, but both models are resident
	 * in GPU memory for the length of the load. Read when a load starts.
	 */
	keepPrevious?: boolean;
};

/**
 * A stable handle on one VRM load.
 *
 * Its identity never changes for the life of the component that created it, and
 * **reading it never re-renders anything** — every property here is a plain
 * read of the current value, safe in a frame loop or an event handler. To have a
 * component render *from* a value, opt in with {@link useVRMAvatar},
 * {@link useVRMStatus}, {@link useVRMError} or {@link useVRMProgress}.
 */
export type VRMHandle = {
	/** The loaded avatar, or `null` while loading / on error / when idle. */
	readonly avatar: VRMAvatar | null;

	readonly status: VRMStatus;

	/** The rejection reason if the load failed, otherwise `undefined`. */
	readonly error: unknown;

	/** Latest raw progress event for the current load, or `null` before the first. */
	readonly progress: VRMLoadProgress | null;

	/** `avatar.update(delta)`, or nothing if no avatar is loaded yet. */
	update: (delta: number) => void;

	/** Re-run the load for the current source (e.g. to retry after a failure). */
	refetch: () => void;

	/**
	 * Subscribe to status / avatar / error changes. Returns an unsubscribe
	 * function. Not called for progress — see {@link VRMHandle.subscribeProgress}.
	 * This is the `useSyncExternalStore` contract, so it can back your own hooks.
	 */
	subscribe: (listener: () => void) => () => void;

	/** Subscribe to progress events. Fires for every event; returns an unsubscribe. */
	subscribeProgress: (listener: () => void) => () => void;
};

/** Per-frame callback driven by {@link useFrameLoop}. Seconds, not ms. */
export type FrameLoopCallback = (delta: number, elapsed: number) => void;

export type UseFrameLoopOptions = {
	/**
	 * While true the loop is suspended; it resumes when it flips back, without
	 * losing the caller's own `start()` / `stop()` intent.
	 */
	paused?: boolean;

	/**
	 * Largest delta (in seconds) handed to the callback. Default `0.1`.
	 *
	 * A backgrounded tab resumes with a multi-second gap; feeding that straight
	 * into spring bones and other integrators makes an avatar visibly explode on
	 * tab focus. Clamping trades a little slow-motion catch-up for that. Read
	 * every frame, so changing it never restarts the loop.
	 */
	maxDelta?: number;

	/** Start as soon as the component mounts. Default `true`. */
	autoStart?: boolean;
};

export type FrameLoop = {
	/** Whether frames are actually being requested right now. Not reactive. */
	readonly running: boolean;

	/** Request that the loop run (still gated by `paused`). */
	start: () => void;

	/** Stop the loop until `start()` is called again. */
	stop: () => void;
};

export type VrmProps = {
	/** URL (or object URL / data URL) of the `.vrm` to load. */
	url: VRMSource;

	/** Parent to add the loaded `avatar.scene` to. */
	scene?: THREE.Object3D | null;

	/** Extra plugin options forwarded to the VRM loader. */
	vrmLoadOptions?: LoadVRMOptions["vrmLoadOptions"];

	/** See {@link UseVRMOptions.keepPrevious}. */
	keepPrevious?: boolean;

	/** Called whenever a new avatar finishes loading. */
	onLoad?: (avatar: VRMAvatar) => void;

	/** Called with each progress event while loading. */
	onProgress?: (progress: VRMLoadProgress) => void;

	/** Called once each time a load fails. */
	onError?: (error: unknown) => void;
};
