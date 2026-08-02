/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type * as THREE from "three";
import type { Accessor, Resource } from "solid-js";
import type {
	LoadVRMOptions,
	VRMAvatar,
	VRMLoadProgress,
} from "../core/feature/loader";

export type { Accessor, Resource };

/**
 * A value, or a function returning that value.
 *
 * Every reactive input in this entry point accepts both, so a constant url and
 * a signal-backed url are interchangeable at the call site.
 */
export type MaybeAccessor<T> = T | Accessor<T>;

/**
 * What {@link createVRM} loads. A falsy source means "load nothing" — the same
 * convention `createResource` uses — so `<Show>`-style gating needs no branch:
 * `createVRM(() => selected()?.url)` simply idles until something is selected.
 */
export type VRMSource = string | undefined | null | false;

export type CreateVRMOptions = {
	/**
	 * Parent to add `avatar.scene` to, re-attaching if either side changes and
	 * detaching on cleanup. Accepts an accessor, so a scene created later in
	 * `onMount` is fine.
	 */
	scene?: MaybeAccessor<THREE.Object3D | null | undefined>;

	/** Extra plugin options forwarded to the VRM loader. Read untracked. */
	vrmLoadOptions?: LoadVRMOptions["vrmLoadOptions"];

	/**
	 * Keep the current avatar on screen until the next one finishes loading,
	 * instead of clearing it the moment the url changes. Default `false`.
	 *
	 * Trade-off: no empty frame while a swap loads, but `avatar()` briefly
	 * disagrees with the url that's being requested, and both models are
	 * resident in GPU memory for the length of the load.
	 *
	 * Read once per load, untracked — flipping it does not itself reload.
	 */
	keepPrevious?: MaybeAccessor<boolean>;
};

export type VRMResource = {
	/**
	 * The loaded avatar, or `null` while loading / on error / when the source is
	 * falsy. Never throws — use {@link VRMResource.resource} if you want the
	 * `<Suspense>` / `<ErrorBoundary>` behaviour instead.
	 */
	avatar: Accessor<VRMAvatar | null>;

	/** True while a load is in flight. */
	loading: Accessor<boolean>;

	/** Latest progress event for the current load, or `null` before the first. */
	progress: Accessor<VRMLoadProgress | null>;

	/** The rejection reason if the load failed, otherwise `undefined`. */
	error: Accessor<unknown>;

	/**
	 * The underlying resource. Reading it suspends the nearest `<Suspense>`
	 * while loading and throws to the nearest `<ErrorBoundary>` on failure —
	 * standard Solid resource semantics, opted into rather than imposed.
	 */
	resource: Resource<VRMAvatar | undefined>;

	/** Re-run the load for the current url (e.g. to retry after a failure). */
	refetch: () => void;
};

/** Per-frame callback driven by {@link createFrameLoop}. Seconds, not ms. */
export type FrameLoopCallback = (delta: number, elapsed: number) => void;

export type CreateFrameLoopOptions = {
	/**
	 * While this reads true the loop is suspended; it resumes when it flips
	 * back, without losing the caller's own `start()` / `stop()` intent.
	 */
	paused?: MaybeAccessor<boolean>;

	/**
	 * Largest delta (in seconds) handed to the callback. Default `0.1`.
	 *
	 * A backgrounded tab resumes with a multi-second gap; feeding that straight
	 * into spring bones and other integrators makes an avatar visibly explode
	 * on tab focus. Clamping trades a little slow-motion catch-up for that.
	 */
	maxDelta?: number;

	/** Start as soon as the owning scope mounts. Default `true`. */
	autoStart?: boolean;
};

export type FrameLoop = {
	/** Whether frames are actually being requested right now. */
	running: Accessor<boolean>;

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

	/** See {@link CreateVRMOptions.keepPrevious}. */
	keepPrevious?: boolean;

	/** Called whenever a new avatar finishes loading. */
	onLoad?: (avatar: VRMAvatar) => void;

	/** Called with each progress event while loading. */
	onProgress?: (progress: VRMLoadProgress) => void;

	/** Called if a load fails. */
	onError?: (error: unknown) => void;
};
