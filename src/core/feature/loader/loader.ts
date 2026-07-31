/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
    type VRM,
	type VRMLoaderPluginOptions,
    VRMLoaderPlugin,
} from "@pixiv/three-vrm";
import { disposeVRM } from "./loader-utils";

export type VRMLoadProgress = {
	loaded: number;
	total: number;
	progress: number;
};

export type LoadVRMOptions = {
	/** Add vrm Scene directly yo a Three.js scene/group */
	scene?: THREE.Object3D;

	/** Called while the model is loading*/
	onProgress?: (progess: VRMLoadProgress) => void;

	/** additional plugin options, most people should ignore it*/
	vrmLoadOptions?: VRMLoaderPluginOptions;
};

/** A per-frame callback registered on a {@link VRMAvatar}. */
export type VRMUpdateFn = (delta: number) => void;

export type VRMAvatar = {
	vrm: VRM;
	scene: THREE.Group;

	/**
	 * Register a callback that runs every frame, BEFORE `vrm.update(delta)`.
	 * Returns an unregister function.
	 *
	 * This is the seam for the animation engine and any per-frame face driver
	 * (a Mixamo `THREE.AnimationMixer`, the auto-blink FSM, IK, …). Because
	 * `vrm.update()` always runs LAST in {@link VRMAvatar.update}, spring bones
	 * and look-at always react to the final animated pose — so a future Mixamo
	 * mixer, expression weights, and look-at never clash or fight for order.
	 *
	 * ```ts
	 * // future: drive a retargeted Mixamo clip without touching the loader
	 * const mixer = new THREE.AnimationMixer(avatar.vrm.scene);
	 * const stop = avatar.registerUpdate((delta) => mixer.update(delta));
	 * ```
	 */
	registerUpdate: (fn: VRMUpdateFn) => () => void;

	/** Advance registered updaters (in registration order), then the VRM. */
	update: (delta: number) => void;

	dispose: () => void;
};

export async function loadVRM(
	url: string,
	options: LoadVRMOptions = {},
): Promise<VRMAvatar> {
	const loader = new GLTFLoader();

	loader.register((parser) => {
		return new VRMLoaderPlugin(parser, options.vrmLoadOptions);
	});

	const gltf = await new Promise<Awaited<ReturnType<typeof loader.loadAsync>>>(
		(resolve, reject) => {
			loader.load(
				url,
				resolve,

                //on progress
				(event) => {
					const total = event.total || 0;
					const loaded = event.loaded || 0;

					options.onProgress?.({
						loaded,
						total,
						progress: total > 0 ? loaded / total : 0,
					});
				},

                //reject
				reject,
			);
		},
	);

	const vrm = gltf.userData.vrm as VRM | undefined;

	if (!vrm) {
		throw new Error(
			`[fano-vrmkit] Failed to load VRM from "${url}". The file loaded, but no VRM data was found.`,
		);
	}

	if (options.scene) {
		options.scene.add(vrm.scene);
	}

	// Per-frame updaters (mixer, auto-blink, …). Insertion order is preserved
	// by Set iteration, and `vrm.update` always runs after them.
	const updaters = new Set<VRMUpdateFn>();
	let disposed = false;

	const avatar: VRMAvatar = {
		vrm,
		scene: vrm.scene,

		registerUpdate(fn: VRMUpdateFn) {
			updaters.add(fn);
			return () => {
				updaters.delete(fn);
			};
		},

		update(delta: number) {
			if (disposed) return;
			for (const fn of updaters) {
				fn(delta);
			}
			vrm.update(delta);
		},

		dispose() {
			if (disposed) return;
			disposed = true;
			updaters.clear();
			disposeVRM(vrm);
		},
	};

	return avatar;
}
