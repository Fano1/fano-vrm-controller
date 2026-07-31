# Fano VRM Controller — Mixamo Example

`loadMixamoAnimation(url, vrm)` retargets a Mixamo `.fbx` animation onto a VRM
avatar's humanoid rig and hands you back a plain `THREE.AnimationClip` — you
own the `THREE.AnimationMixer`, exactly like any other three.js animation:

```ts
import { loadVRM, loadMixamoAnimation } from "fano-vrm-controller";

const avatar = await loadVRM("/avatar.vrm", { scene });
const mixer = new THREE.AnimationMixer(avatar.vrm.scene);

const clip = await loadMixamoAnimation("/walk.fbx", avatar.vrm);
mixer.clipAction(clip).play();

avatar.registerUpdate((delta) => mixer.update(delta)); // before vrm.update
```

The live demo is [`mixamo-example.html`](./mixamo-example.html).

## Running the demo

```bash
bun run build          # produce dist/ (the demo imports ../../dist/index.js)
bunx serve .           # serve the repo root on http://localhost:3000
# open http://localhost:3000/docs/mixamo-example/mixamo-example.html
```

Put a model named `avatar.vrm` in the repo root (same as the face example),
plus your Mixamo `.fbx` downloads in an `animation/` folder next to it —
export each from [mixamo.com](https://www.mixamo.com) "without skin" to keep
the download small (retargeting only needs the animation, not Mixamo's mesh).
The demo wires up one preset button per file in `ANIMATION_PRESETS`
(`mixamo-example.html`); edit that list to match whatever you've downloaded —
Mixamo's default download names often contain spaces, which the demo
`encodeURI()`s before fetching, so you don't need to rename the files.

## Why retargeting is needed

Mixamo animations are authored against Mixamo's own skeleton — bone names like
`mixamorigHips`, and Mixamo's own rest pose — which don't match a VRM avatar's
skeleton at all. `retargetMixamoToVRM` (which `loadMixamoAnimation` calls
internally) resolves each track's Mixamo bone name against a `VRMHumanBoneName`,
cancels out Mixamo's rest-pose rotation, and re-targets it onto `vrm.humanoid`'s
**normalized** bone rig — every VRM exposes this at an identical, identity rest
pose, which is what lets one retargeting formula work across any VRM model
regardless of its actual proportions or raw skeleton orientation. `vrm.update`
already copies the normalized pose onto the model's real bones every frame
(`autoUpdateHumanBones`), so nothing extra is needed to see it move.

## No playback controller — you keep the `AnimationMixer`

This package hands back a retargeted `THREE.AnimationClip` and stops there —
it doesn't wrap `THREE.AnimationMixer` / `AnimationAction`. The full three.js
animation API (crossfading, weights, time-scaling, additive blending) is
available to you directly, same as any other three.js project:

```ts
const idleAction = mixer.clipAction(idleClip);
const walkAction = mixer.clipAction(walkClip);

idleAction.play();
// later, blend from idle to walk over 0.3s:
walkAction.reset().play();
idleAction.crossFadeTo(walkAction, 0.3, false);
```

The live demo's "Load & play" button does exactly this — swapping animations
crossfades between whatever was already playing and the newly-loaded clip.

## Bone matching

`loadMixamoAnimation` / `retargetMixamoToVRM` resolve Mixamo's standard
`mixamorigHips`-style names, and also common renamed variants (multi-character
scenes producing `mixamorig1Hips` / `mixamorig2Hips`, some DCC re-exports
producing `mixamorig:Hips`). Pass `boneMap` to override or extend the mapping
for a non-standard rig:

```ts
await loadMixamoAnimation("/walk.fbx", avatar.vrm, {
  boneMap: { Root: "hips" },
});
```

---

## API reference

### `loadMixamoAnimation(url, vrm, options?)` → `Promise<THREE.AnimationClip>`

Fetches and parses `url` with three's `FBXLoader`, picks a clip (the first
one, or `options.animationName` if the FBX has several), and retargets it.

| Option | Description |
| --- | --- |
| `animationName` | Pick a clip by name if the FBX has more than one. Defaults to the first. |
| `boneMap` | Override/extend the default Mixamo → VRM bone map. |
| `hipsPositionScale` | Override the auto-computed hips position scale. |

### `retargetMixamoToVRM(vrm, mixamoRoot, clip, options?)` → `THREE.AnimationClip`

The underlying engine, for callers who already have the FBX loaded some other
way (your own `FBXLoader`, a cache, drei's `useFBX`). `mixamoRoot` is the
loaded FBX's root object — it must still be in its bind/rest pose (read
immediately after loading, before any mixer evaluates a clip against it).

### `MIXAMO_VRM_RIG_MAP` / `resolveMixamoBoneName(rawName, customMap?)`

The standard Mixamo bone-name catalog and its resolver, exported standalone in
case you want to drive custom retargeting logic.

## References

- Mixamo — <https://www.mixamo.com>
- VRM humanoid spec — <https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/humanoid.md>
- three-vrm (`VRMHumanoid`, normalized bones) — <https://github.com/pixiv/three-vrm>
