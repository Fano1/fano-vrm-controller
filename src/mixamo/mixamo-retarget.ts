/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { resolveMixamoBoneName } from "../lib/RIG-maps";
import type { RetargetMixamoOptions } from "./mixamo-type";

/**
 * Retarget a Mixamo animation clip onto a VRM's humanoid rig.
 *
 * Mixamo clips are authored against Mixamo's own skeleton — different bone
 * names (`mixamorigHips`, …) and a different rest pose — so they can't be
 * played on a VRM directly. This produces a new {@link THREE.AnimationClip}
 * whose tracks target `vrm.humanoid`'s *normalized* bone nodes (reachable via
 * `getNormalizedBoneNode`), which every VRM exposes at an identical, identity
 * rest pose — that's what makes a single retargeting formula work across any
 * VRM model, regardless of its actual raw skeleton proportions/orientation.
 * `vrm.humanoid.autoUpdateHumanBones` (on by default) copies the result from
 * normalized to raw bones on `vrm.update(delta)`, so a plain
 * `new THREE.AnimationMixer(vrm.scene)` playing the returned clip just works.
 *
 * `mixamoRoot` must still be in its bind/rest pose (i.e. read immediately
 * after loading, before any `AnimationMixer` has evaluated a clip against
 * it) — the rest-pose world rotation of each source bone is the reference
 * this cancels out to isolate the animated delta.
 *
 * ```ts
 * const asset = await new FBXLoader().loadAsync("/walk.fbx");
 * const retargeted = retargetMixamoToVRM(vrm, asset, asset.animations[0]);
 * const mixer = new THREE.AnimationMixer(vrm.scene);
 * mixer.clipAction(retargeted).play();
 * avatar.registerUpdate((delta) => mixer.update(delta));
 * ```
 */
export function retargetMixamoToVRM(
  vrm: VRM,
  mixamoRoot: THREE.Object3D,
  clip: THREE.AnimationClip,
  options?: RetargetMixamoOptions,
): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];

  const isVRM0 = vrm.meta?.metaVersion === "0";
  let hipsPositionScale = options?.hipsPositionScale;

  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const worldPosition = new THREE.Vector3();
  const keyframeQuaternion = new THREE.Quaternion();

  for (const track of clip.tracks) {
    const dotIndex = track.name.indexOf(".");
    if (dotIndex === -1) continue;

    const mixamoBoneName = track.name.slice(0, dotIndex);
    const propertyName = track.name.slice(dotIndex + 1);

    const vrmBoneName = resolveMixamoBoneName(mixamoBoneName, options?.boneMap);
    if (!vrmBoneName) continue;

    const vrmNode = vrm.humanoid.getNormalizedBoneNode(vrmBoneName);
    if (!vrmNode) continue;

    const mixamoNode = mixamoRoot.getObjectByName(mixamoBoneName);
    if (!mixamoNode || !mixamoNode.parent) continue;

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      // Cancel the source bone's own rest-pose orientation and re-express the
      // pose delta as a local rotation — valid because the *normalized*
      // target bone's rest pose is identity, by construction.
      mixamoNode.getWorldQuaternion(restRotationInverse).invert();
      mixamoNode.parent.getWorldQuaternion(parentRestWorldRotation);

      const values = track.values.slice();

      for (let i = 0; i < values.length; i += 4) {
        keyframeQuaternion.fromArray(values, i);
        keyframeQuaternion
          .premultiply(parentRestWorldRotation)
          .multiply(restRotationInverse);

        if (isVRM0) {
          keyframeQuaternion.x *= -1;
          keyframeQuaternion.z *= -1;
        }

        keyframeQuaternion.toArray(values, i);
      }

      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${vrmNode.name}.${propertyName}`,
          track.times.slice(),
          values,
        ),
      );
    } else if (track instanceof THREE.VectorKeyframeTrack) {
      // Only the hips carry a meaningful translation in a humanoid rig.
      if (vrmBoneName !== "hips") continue;

      if (hipsPositionScale === undefined) {
        const vrmHipsY = vrmNode.getWorldPosition(worldPosition).y;
        const vrmRootY = vrm.scene.getWorldPosition(worldPosition).y;
        const vrmHipsHeight = Math.abs(vrmHipsY - vrmRootY);

        hipsPositionScale =
          mixamoNode.position.y !== 0
            ? vrmHipsHeight / mixamoNode.position.y
            : 1;
      }

      const scale = hipsPositionScale;
      const values = track.values.map((value, i) => {
        const isYComponent = i % 3 === 1;
        const scaled = value * scale;
        return isVRM0 && !isYComponent ? -scaled : scaled;
      });

      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${vrmNode.name}.${propertyName}`,
          track.times.slice(),
          values,
        ),
      );
    }
  }

  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
