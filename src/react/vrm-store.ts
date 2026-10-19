/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import {
	loadVRM,
	type VRMAvatar,
	type VRMLoadProgress,
} from "../core/feature/loader";
import type { UseVRMOptions, VRMHandle, VRMSource, VRMStatus } from "./react-type";

type Snapshot = {
	status: VRMStatus;
	avatar: VRMAvatar | null;
	error: unknown;
};

/** The load-time subset of {@link UseVRMOptions}, read fresh when a load starts. */
export type VRMLoadSettings = Pick<UseVRMOptions, "vrmLoadOptions" | "keepPrevious">;

/** A {@link VRMHandle} plus the lifecycle half the hooks drive. Never public. */
export type VRMStore = VRMHandle & {
	/** Point the store at a source. Same source twice is a no-op. */
	setSource: (source: VRMSource) => void;

	/**
	 * Give up the source — but not yet. Teardown waits one microtask so that an
	 * immediate `setSource` (StrictMode's unmount → remount, or a url change)
	 * cancels it instead of throwing a half-finished download away.
	 */
	release: () => void;
};

const IDLE: Snapshot = { status: "idle", avatar: null, error: undefined };

/**
 * The state behind {@link useVRM}, with no React in it.
 *
 * All the work React would otherwise do per render is done once, here:
 *
 * - The snapshot is **immutable and replaced only on a real transition**, so a
 *   `useSyncExternalStore` selector comparing fields sees no change when
 *   nothing changed.
 * - Progress has its **own listener set**. A load can emit dozens of progress
 *   events a second; status subscribers are never woken for them.
 * - Loads race by **ticket**: a load finishing with a stale ticket lost to a
 *   newer source (or to teardown) and is disposed instead of shown, otherwise
 *   its GPU memory would leak with nothing holding a reference to it.
 *
 * Being framework-free is also what makes it unit-testable without a DOM.
 */
export function createVRMStore(readSettings: () => VRMLoadSettings): VRMStore {
	let snapshot = IDLE;
	let progress: VRMLoadProgress | null = null;

	const listeners = new Set<() => void>();
	const progressListeners = new Set<() => void>();

	let source: string | null = null;
	let generation = 0;
	let releasePending = false;

	/**
	 * Run every listener even if one throws, then surface the first failure — a
	 * user effect that throws must not leave its neighbours un-notified, nor the
	 * avatar it was replacing un-disposed.
	 */
	const notify = (set: Set<() => void>) => {
		let failed = false;
		let failure: unknown;

		for (const listener of set) {
			try {
				listener();
			} catch (error) {
				if (!failed) {
					failed = true;
					failure = error;
				}
			}
		}

		if (failed) throw failure;
	};

	/**
	 * Move to `next`, notify, and only *then* dispose the avatar it replaced.
	 * That order is the contract that lets a `useVRMEffect` cleanup (reset a
	 * face, detach from a scene) touch an avatar that is still intact.
	 */
	const commit = (next: Snapshot) => {
		const previous = snapshot.avatar;

		if (
			next.status === snapshot.status &&
			next.avatar === snapshot.avatar &&
			next.error === snapshot.error
		) {
			return;
		}

		snapshot = next;

		try {
			notify(listeners);
		} finally {
			if (previous && previous !== next.avatar) previous.dispose();
		}
	};

	const setProgress = (next: VRMLoadProgress | null) => {
		if (next === null && progress === null) return;
		progress = next;
		notify(progressListeners);
	};

	const clear = () => {
		generation++;
		setProgress(null);
		commit(IDLE);
	};

	const start = (src: string) => {
		const ticket = ++generation;
		const { keepPrevious = false, vrmLoadOptions } = readSettings();

		setProgress(null);

		// Default: the old avatar goes the moment the source changes, so
		// `avatar` never disagrees with the url that produced it.
		commit({
			status: "loading",
			avatar: keepPrevious ? snapshot.avatar : null,
			error: undefined,
		});

		loadVRM(src, {
			vrmLoadOptions,
			onProgress: (event) => {
				if (ticket === generation) setProgress(event);
			},
		}).then(
			(avatar) => {
				if (ticket !== generation) {
					avatar.dispose();
					return;
				}
				commit({ status: "ready", avatar, error: undefined });
			},
			(error: unknown) => {
				if (ticket !== generation) return;
				// With `keepPrevious` the old avatar survives a failed swap.
				commit({ status: "error", avatar: snapshot.avatar, error });
			},
		);
	};

	return {
		get avatar() {
			return snapshot.avatar;
		},
		get status() {
			return snapshot.status;
		},
		get error() {
			return snapshot.error;
		},
		get progress() {
			return progress;
		},

		update(delta) {
			snapshot.avatar?.update(delta);
		},

		refetch() {
			if (source) start(source);
		},

		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},

		subscribeProgress(listener) {
			progressListeners.add(listener);
			return () => {
				progressListeners.delete(listener);
			};
		},

		setSource(next) {
			releasePending = false;

			const normalized = next || null;
			if (normalized === source) return;

			source = normalized;
			if (normalized) start(normalized);
			else clear();
		},

		release() {
			if (releasePending) return;
			releasePending = true;

			queueMicrotask(() => {
				if (!releasePending) return;
				releasePending = false;
				source = null;
				clear();
			});
		},
	};
}
