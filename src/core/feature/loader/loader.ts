/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import * as THREE from "three";
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

export type VRMAvatar = {
	vrm: VRM;
	scene: THREE.Group;
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

	const avatar: VRMAvatar = {
		vrm,
		scene: vrm.scene,

		update(delta: number) {
			vrm.update(delta);
		},

		dispose() {
			disposeVRM(vrm);
		},
	};

	return avatar;
}
