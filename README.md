# @fano/vrm-controller

A thin, tree-shakeable wrapper around [`@pixiv/three-vrm`](https://github.com/pixiv/three-vrm)
that simplifies loading and controlling VRM avatars in Three.js: one call to load
a model, a facade for facial expression + lip-sync, and a Mixamo animation
retargeter — all built on top of the standard VRM humanoid rig, so it works
across VRoid, VRChat, and generic models.

`three` and `@pixiv/three-vrm` are **peer dependencies** — you bring your own
versions. React / `@react-three/fiber` are optional peer deps, only needed if
you use the `/r3f` entry point.

## Install

```bash
bun install @fano/vrm-controller three @pixiv/three-vrm
```

## Quick start

```ts
import { loadVRM } from "@fano/vrm-controller";

const avatar = await loadVRM("/avatar.vrm", { scene });

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  avatar.update(clock.getDelta()); // flushes expressions, spring bones, look-at…
  renderer.render(scene, camera);
}
animate();
```

That's the whole core loop. Everything below — face control, lip-sync, Mixamo
animation — plugs into `avatar` without touching this loop again.

## Two entry points

| Import path | Consumes | Use it for |
| --- | --- | --- |
| `@fano/vrm-controller` | three + @pixiv/three-vrm | Loading, face control, Mixamo animation |
| `@fano/vrm-controller/r3f` | + react + @react-three/fiber | `<Vrm url="..." />` and `useVRM()` in React Three Fiber |

---

## 1. The loader — `loadVRM`

```ts
const avatar = await loadVRM(url, {
  scene,                 // optional: adds vrm.scene to this Object3D for you
  onProgress(p) {},       // { loaded, total, progress }
  vrmLoadOptions: {},     // forwarded to VRMLoaderPlugin
});
```

`loadVRM` wraps `GLTFLoader` + `VRMLoaderPlugin` and resolves to a `VRMAvatar`:

```ts
type VRMAvatar = {
  vrm: VRM;                                   // the raw @pixiv/three-vrm instance
  scene: THREE.Group;                         // === vrm.scene
  registerUpdate(fn: (delta: number) => void): () => void;
  update(delta: number): void;
  dispose(): void;
};
```

**The animation-engine seam.** `registerUpdate(fn)` adds a per-frame callback
that runs every frame *before* `vrm.update(delta)`. `avatar.update(delta)` runs
every registered callback (in registration order), then `vrm.update(delta)`
last — always last, so spring bones and look-at react to the final pose. This
is the one seam everything else in this package hooks into:

```ts
const stop = avatar.registerUpdate((delta) => {
  face.update(delta); // auto-blink FSM
  mixer.update(delta); // Mixamo AnimationMixer
});
```

Because a Mixamo clip only ever carries skeletal tracks (never expression
tracks), and the face controllers only ever touch expression weights / raw
morphs, the two never fight over the same data — they just both run before
`vrm.update` flushes everything to the mesh.

`dispose()` removes `vrm.scene` from its parent and disposes every geometry,
material, and texture found by traversing it (see `disposeVRM` in
`loader-utils.ts` if you're adding a feature that allocates GPU resources —
extend disposal there).

---

## 2. Face control — `createVRMFace`

```ts
import { loadVRM, createVRMFace } from "@fano/vrm-controller";

const avatar = await loadVRM("/avatar.vrm", { scene });
const face = createVRMFace(avatar.vrm);
avatar.registerUpdate((delta) => face.update(delta)); // advances auto-blink

face.emotion.setExclusive("happy");
face.viseme.set("aa", 0.8);
face.eye.autoBlink();
face.eye.gaze(camera);
face.brow.set("angry", 1);
```

`VRMFace` is one facade with **one controller per concern**, so you never mix
unrelated blendshapes through a single generic call:

| Accessor | Concern | Backed by |
| --- | --- | --- |
| `face.emotion` | happy / angry / sad / relaxed / surprised / neutral | standard expression → VRoid `Fcl_ALL/BRW/EYE/MTH` fallback |
| `face.viseme` | vowels `aa ih ou ee oh` (lip-sync) | standard vowel expression → fuzzy mouth-morph fallback |
| `face.eye` | blink / wink + gaze (look-at) | standard blink/look expressions + procedural `VRMLookAt` |
| `face.brow` | eyebrows (no VRM preset exists) | raw `Fcl_BRW_*` / generic `brow*` morphs |
| `face.expression` | any standard preset **or** custom name | `VRMExpressionController` (escape hatch) |
| `face.morph` | any blendshape by name / regex | `VRMFaceController` (escape hatch) |

Every concern controller **prefers the portable VRM standard expression system**
(`vrm.expressionManager`) and **falls back to a universal fuzzy morph matcher**
when a model only ships raw blendshapes — so the exact same code drives VRoid,
VRChat, and generic rigs without you branching on rig type. Weights are only
*recorded* when you call `set()`; they're applied to the mesh on the next
`vrm.update(delta)`, same as everything else that flows through `avatar.update`.

Two lower-level engines sit underneath the facade, if you want to bypass it:

- **`createVRMExpressionController(vrm)`** — the standard expression system
  directly: `set/get/has/list`, clamped 0..1, chainable, portable across
  VRM 0.x/1.0. Degrades to no-ops when the model has no `expressionManager`.
- **`createVRMFaceController(vrm)`** — raw morph targets by exact name or
  regex pattern: `setMorph`, `setMorphByPatterns`, `matchMorph`,
  `findMorphTargets`, plus VRoid `Fcl_*` group getters. Use this for morphs
  the expression system doesn't manage (brows have no standard preset at all).

See [`docs/face-example/`](./docs/face-example/face-example.md) and
[`docs/expression-example/`](./docs/expression-example/expression-example.md)
for the full API reference and a live demo of each layer.

---

## 3. Vowels & visemes (lip-sync)

Lip-sync is `face.viseme` — the VRM standard defines exactly five vowel
presets, and this package's fuzzy fallback resolves the same five letters
across non-standard rigs too:

```ts
face.viseme.set("aa", 0.8);              // single vowel, 0..1
face.viseme.setAll({ aa: 0.6, ih: 0.1 }); // blend; zeroes every other viseme
face.viseme.get("aa");                    // current weight
face.viseme.reset();                      // silence
```

| Viseme | Sound | Standard VRM preset | Fuzzy fallbacks tried (in order) |
| --- | --- | --- | --- |
| `aa` | "ah" (open) | `aa` | `Fcl_MTH_A`, `MTH_A`, `mouth_A`, `viseme_A`, `vrc.v_*.A` |
| `ih` | "ee/ih" | `ih` | `Fcl_MTH_I`, `MTH_I`, … |
| `ou` | "oo" | `ou` | `Fcl_MTH_U`, `MTH_U`, … |
| `ee` | "eh" | `ee` | `Fcl_MTH_E`, `MTH_E`, … |
| `oh` | "oh" | `oh` | `Fcl_MTH_O`, `MTH_O`, … |

The fallback patterns are end-anchored on purpose — an unanchored `MTH_A`
would also match `Fcl_MTH_Angry`, so `viseme.set("aa", 1)` would silently also
drive the angry-mouth morph. If you're driving lip-sync from an audio
analyser or a TTS viseme stream, feed the five weights straight into
`setAll()` every frame; nothing here manages timing/interpolation for you.

For a model with **no** standard expressions at all, `face.viseme.list()`
tells you which of the five this specific model can actually show, so you can
build UI (or skip visemes it doesn't support) instead of guessing.

---

## 4. Mixamo animation retargeting

Mixamo animations are authored against Mixamo's own skeleton — bone names
like `mixamorigHips`, and Mixamo's own rest pose — so a downloaded `.fbx`
clip can't play on a VRM directly. This package resolves that with a
retargeter that targets `vrm.humanoid`'s **normalized** bone rig: every VRM
exposes this rig at an identical, identity rest pose, which is what lets one
retargeting formula work across any VRM model regardless of its actual raw
skeleton proportions or orientation.

```ts
import { loadVRM, loadMixamoAnimation } from "@fano/vrm-controller";

const avatar = await loadVRM("/avatar.vrm", { scene });
const mixer = new THREE.AnimationMixer(avatar.vrm.scene);

const clip = await loadMixamoAnimation("/walk.fbx", avatar.vrm);
mixer.clipAction(clip).play();

avatar.registerUpdate((delta) => mixer.update(delta)); // before vrm.update
```

`vrm.update(delta)` (called by `avatar.update`) already copies the animated
normalized-bone pose onto the model's real bones every frame
(`humanoid.autoUpdateHumanBones`), so nothing else is needed to see it move.

**Two layers, same as face control:**

- **`loadMixamoAnimation(url, vrm, options?)`** — convenience, end-to-end:
  fetches and parses the `.fbx` with three's `FBXLoader`, picks a clip
  (`options.animationName`, or the first one), and retargets it.
- **`retargetMixamoToVRM(vrm, mixamoRoot, clip, options?)`** — the engine
  itself, for callers who already have the FBX loaded some other way (your
  own `FBXLoader` instance, a cache, drei's `useFBX`). `mixamoRoot` must still
  be in its bind/rest pose when this is called — read it immediately after
  loading, before any mixer evaluates a clip against it.

**Bone matching** resolves Mixamo's standard `mixamorigHips`-style names, plus
common renamed variants (`mixamorig1Hips` / `mixamorig2Hips` from
multi-character scenes, `mixamorig:Hips` from some re-exports). Pass
`boneMap` to override or extend the mapping for a non-standard rig:

```ts
await loadMixamoAnimation("/walk.fbx", avatar.vrm, {
  boneMap: { Root: "hips" },
  hipsPositionScale: 0.9, // override the auto-computed hips scale, if it looks off
});
```

**No playback/crossfade controller is included on purpose** — `loadMixamoAnimation`
hands you back a plain `THREE.AnimationClip` and stops there, so the full
three.js animation API (crossfading, weights, time-scaling, additive
blending) is yours to use directly:

```ts
const idleAction = mixer.clipAction(idleClip);
const walkAction = mixer.clipAction(walkClip);

idleAction.play();
walkAction.reset().play();
idleAction.crossFadeTo(walkAction, 0.3, false); // blend idle -> walk over 0.3s
```

See [`docs/mixamo-example/`](./docs/mixamo-example/mixamo-example.md) for the
full API reference and a live demo.

---

## 5. Body posing — `createVRMBody`

Direct control over every joint of the humanoid skeleton — the "body"
counterpart to `createVRMFace`. Like the Mixamo retargeter, it targets
`vrm.humanoid`'s normalized bone rig, so posing code is portable across models:

```ts
import { loadVRM, createVRMBody } from "@fano/vrm-controller";

const avatar = await loadVRM("/avatar.vrm", { scene });
const body = createVRMBody(avatar.vrm);

body.listBones();                          // every joint this model actually has
body.setEulerDegrees("leftUpperArm", { z: -45 }); // raise the left arm
body.getRotation("head");                   // read a joint back (quaternion)

const pose = body.getPose(); // snapshot every joint, relative to rest
body.resetPose();            // back to rest (T-pose)
body.setPose(pose);          // restore the snapshot
```

Like expression weights, a write is only *recorded* immediately — it reaches
the mesh on the next `vrm.update(delta)` (already called for you by
`avatar.update`), since that's what copies the normalized bones `VRMBody`
writes to onto the model's actual raw bones. There's no separate `update()`
method on `VRMBody` itself to remember to call, though — unlike `face`, body
posing has no time-based state (no equivalent of the auto-blink FSM).

`setEulerDegrees` takes degrees (not raw quaternion components) and merges
partial input against the joint's current rotation, so three independent
X/Y/Z sliders can each drive one axis without clobbering the other two. Like
any Euler-angle scheme, driving the middle axis to exactly ±90° hits gimbal
lock — the outer two axes' *sum* survives, not each individually. Not every
VRM exposes every joint (only 15 are mandated by the VRM spec — fingers,
shoulders, toes, eyes, and jaw are all optional), so build UI from
`listBones()` rather than assuming a fixed set.

`resetBoneRotation(name)` is always `quaternion.identity()`, never a
per-model lookup — because the normalized rig rests at identity by
construction, the same fact that makes Mixamo retargeting work.

## Putting it all together

`docs/full-example/` combines all of the above — one VRM, driven by face
control, lip-sync, Mixamo animation, *and* body posing at the same time,
through the same `registerUpdate` seam:

```ts
const avatar = await loadVRM("/avatar.vrm", { scene });
const face = createVRMFace(avatar.vrm);
const body = createVRMBody(avatar.vrm);
const mixer = new THREE.AnimationMixer(avatar.vrm.scene);

avatar.registerUpdate((delta) => {
  face.update(delta); // auto-blink — owns expression weights
  mixer.update(delta); // Mixamo playback — owns bone poses
});

body.setEulerDegrees("head", { y: 15 }); // recorded now, same flush rule as everything else
```

`body` has no `update()` method of its own to call (unlike `face.update(delta)`,
which the auto-blink FSM needs) — but its writes still only reach the mesh on
the next `vrm.update(delta)`, exactly like `face.expression.set(...)`: that's
what copies the normalized bones `body` writes to onto the model's actual raw
bones (`humanoid.autoUpdateHumanBones`). Since `avatar.update(delta)` already
calls `vrm.update` every frame, this is invisible in practice — just don't
expect a `setEulerDegrees` call to show up before the next render. Since
expressions and bone poses never overlap, everything above runs independently
without any coordination beyond "run before `vrm.update`." See
[`docs/full-example/full-example.md`](./docs/full-example/full-example.md)
for the live demo.

## React Three Fiber

```tsx
import { Vrm } from "@fano/vrm-controller/r3f";

<Canvas>
  <Vrm url="/avatar.vrm" onLoad={(avatar) => console.log(avatar.vrm)} />
</Canvas>;
```

`<Vrm>` loads the model, drives `vrm.update(delta)` via `useFrame`, and
disposes on unmount/url change. `useVRM(url)` is the hook it's built on, if
you want the loading state without the component.

## Development

```bash
bun install
bun run build          # tsup -> dist/ as esm + cjs + .d.ts
bun run dev             # same, in watch mode
bun run test            # vitest run
bun run test:watch      # vitest watch
```

Tests mock `three` / `@pixiv/three-vrm` entirely and run in Node — there's no
headless-GL setup, so the live `docs/*-example/*.html` demos are how you
actually see any of this rendered (`bunx serve .`, then open the demo you want).

## License

This project is licensed under the Apache License 2.0 with additional
attribution terms.

You may use, modify, and distribute this package for free, including in
commercial projects, as long as proper credit is preserved:

**Fano VRM Controller by Ayush Pradhan**

See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE) for details.
