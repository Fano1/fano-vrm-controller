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

export type VRMUpdateOptions = {
	/**
	 * Where this callback runs among the others: lower first, ties in the order
	 * they were registered. Default `0`.
	 *
	 * Without this, order is whatever order things happened to register in — which
	 * in a framework that re-registers a driver when its mode changes means a
	 * driver can silently end up *after* something that must run on top of it.
	 * A post-process such as jiggle physics asks to run late (`order: 100`); a
	 * driver that must come first can ask for a negative number.
	 */
	order?: number;
};

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
	 *
	 * Callbacks run in registration order unless `options.order` says
	 * otherwise — lower runs first, ties keep registration order. Something
	 * that must layer on top of the rig's animation (jiggle physics) passes a
	 * high `order` so it stays last however the drivers are re-registered.
	 *
	 * Each call is its own registration: registering the same function twice
	 * runs it twice, and each returned function removes only its own.
	 */
	registerUpdate: (fn: VRMUpdateFn, options?: VRMUpdateOptions) => () => void;

	/**
	 * Advance registered updaters (by `order`, then registration order), then
	 * the VRM.
	 */
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

	// Per-frame updaters (mixer, auto-blink, …), sorted by `order` and then by
	// registration, and `vrm.update` always runs after them.
	//
	// The array is replaced, never mutated: a frame iterates whatever array was
	// current when it started, so an updater that registers or unregisters
	// another mid-frame can't disturb the loop — and the hot path allocates
	// nothing. Registration is rare; `update` is 60 times a second.
	//
	// An entry that is unregistered mid-frame is skipped if it hasn't run yet
	// (`active`), so a driver that was just torn down never gets one last tick.
	type Updater = { fn: VRMUpdateFn; order: number; active: boolean };
	let updaters: readonly Updater[] = [];
	let disposed = false;

	const avatar: VRMAvatar = {
		vrm,
		scene: vrm.scene,

		registerUpdate(fn: VRMUpdateFn, updateOptions?: VRMUpdateOptions) {
			const entry: Updater = {
				fn,
				order: updateOptions?.order ?? 0,
				active: true,
			};

			// Insert after the last entry that isn't later than this one, which is
			// what keeps equal orders in registration order.
			let index = updaters.length;
			while (index > 0 && updaters[index - 1]!.order > entry.order) index -= 1;

			updaters = [...updaters.slice(0, index), entry, ...updaters.slice(index)];

			return () => {
				entry.active = false;
				updaters = updaters.filter((other) => other !== entry);
			};
		},

		update(delta: number) {
			if (disposed) return;

			const current = updaters;
			for (let i = 0; i < current.length; i += 1) {
				const entry = current[i]!;
				if (entry.active) entry.fn(delta);
			}
			vrm.update(delta);
		},

		dispose() {
			if (disposed) return;
			disposed = true;
			for (const entry of updaters) entry.active = false;
			updaters = [];
			disposeVRM(vrm);
		},
	};

	return avatar;
}
