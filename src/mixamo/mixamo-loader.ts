/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import type { VRM } from "@pixiv/three-vrm";
import { retargetMixamoToVRM } from "./mixamo-retarget";
import type { LoadMixamoAnimationOptions } from "./mixamo-type";

/** A loaded FBX scene graph, with the `.animations` three attaches at parse time. */
type MixamoFBXAsset = THREE.Group & { animations: THREE.AnimationClip[] };

/**
 * Load a Mixamo `.fbx` animation and retarget it onto `vrm` in one call —
 * mirrors `loadVRM`'s ergonomics for the animation side.
 *
 * Fetches and parses `url` with three's `FBXLoader`, picks a clip (the first
 * one, or `options.animationName` if given — a standard Mixamo download only
 * ever contains a single clip), and hands it to {@link retargetMixamoToVRM}.
 * If you already have the FBX loaded some other way (your own `FBXLoader`
 * instance, a cache, drei's `useFBX`), call {@link retargetMixamoToVRM}
 * directly instead.
 *
 * ```ts
 * const retargeted = await loadMixamoAnimation("/walk.fbx", avatar.vrm);
 * const mixer = new THREE.AnimationMixer(avatar.vrm.scene);
 * mixer.clipAction(retargeted).play();
 * avatar.registerUpdate((delta) => mixer.update(delta));
 * ```
 */
export async function loadMixamoAnimation(
  url: string,
  vrm: VRM,
  options?: LoadMixamoAnimationOptions,
): Promise<THREE.AnimationClip> {
  const loader = new FBXLoader();
  const asset = (await loader.loadAsync(url)) as MixamoFBXAsset;

  const clip = options?.animationName
    ? THREE.AnimationClip.findByName(asset.animations, options.animationName)
    : (asset.animations[0] ?? null);

  if (!clip) {
    throw new Error(`[fano-vrmkit] No animation clip found in "${url}".`);
  }

  return retargetMixamoToVRM(vrm, asset, clip, options);
}
