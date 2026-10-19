/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

// Fakes shared by the React tests. Not part of the published entry — nothing
// in `index.ts` imports this.

import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import type { VRMAvatar, VRMUpdateFn } from "../core/feature/loader";

export type FakeAvatar = VRMAvatar & {
	url: string;
	disposed: boolean;
	/** How many updaters are currently registered. */
	updaterCount: () => number;
	/** Order in which `update` ran things: each updater, then `"vrm"`. */
	trace: string[];
};

/** A real scene graph with a fake VRM — only the lifecycle is under test. */
export function makeAvatar(url: string): FakeAvatar {
	const scene = new THREE.Group();
	scene.name = url;
	const updaters = new Set<VRMUpdateFn>();

	const avatar: FakeAvatar = {
		url,
		disposed: false,
		trace: [],
		vrm: { scene } as unknown as VRM,
		scene,
		updaterCount: () => updaters.size,

		registerUpdate(fn) {
			updaters.add(fn);
			return () => void updaters.delete(fn);
		},

		update(delta) {
			for (const fn of updaters) fn(delta);
			avatar.trace.push("vrm");
		},

		dispose() {
			avatar.disposed = true;
			updaters.clear();
			scene.removeFromParent();
		},
	};

	return avatar;
}

export function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

/** Let promise callbacks and queued microtasks run. */
export const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
