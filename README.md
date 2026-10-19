# @fano/vrm-controller

A thin, tree-shakeable wrapper around [`@pixiv/three-vrm`](https://github.com/pixiv/three-vrm)
that simplifies loading and controlling VRM avatars in Three.js: one call to load
a model, a facade for facial expression + lip-sync, a Mixamo animation
retargeter, a procedural animation system that generates body motion at
runtime, and jiggle physics that makes the body settle after it moves — all
built on top of the standard VRM humanoid rig, so it works across VRoid,
VRChat, and generic models.

`three` and `@pixiv/three-vrm` are **peer dependencies** — you bring your own
versions. React / `@react-three/fiber` and `solid-js` are optional peer deps,
only needed if you use the `/r3f` or `/solid` entry points.

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
animation, procedural animation — plugs into `avatar` without touching this
loop again.

## What's in the box

| | What it does | Section |
| --- | --- | --- |
| `loadVRM` | Load a model, and the one per-frame seam everything else hooks into | [1](#1-the-loader--loadvrm) |
| `createVRMFace` | Expressions, blinking, eye gaze, mouth | [2](#2-face-control--createvrmface) |
| `face.viseme` / `speak` | Vowel-based lip-sync | [3](#3-vowels--visemes-lip-sync) |
| `loadMixamoAnimation` | Retarget a Mixamo `.fbx` onto any VRM → `THREE.AnimationClip` | [4](#4-mixamo-animation-retargeting) |
| `createVRMBody` | Read/write individual joints by `VRMHumanBoneName` | [5](#5-body-posing--createvrmbody) |
| `createProceduralAnimator` | Generate motion at runtime — idle, look-at, gestures; bake it to a clip | [6](#6-procedural-animation--motion-without-a-fbx) |
| `createVRM` / `createFrameLoop` | Solid bindings — reactive loading, disposal, and the frame loop | [7](#7-solid) |
| `useVRM` / `useFrameLoop` | React bindings that never re-render for loading, progress, or frames | [8](#8-react) |
| `createVRMJiggle` | Secondary-motion physics — bones that wobble and settle, layered on whatever animates the rig | [9](#9-jiggle-physics) |

Every piece is optional and independently importable — pull in the loader alone
if that's all you need.

## Four entry points

| Import path | Consumes | Use it for |
| --- | --- | --- |
| `@fano/vrm-controller` | three + @pixiv/three-vrm | Loading, face control, Mixamo animation, procedural animation, jiggle physics |
| `@fano/vrm-controller/r3f` | + react + @react-three/fiber | `<Vrm url="..." />` and `useVRM()` in React Three Fiber |
| `@fanoalone/vrm-controller/react` | + react | Hooks and a frame loop for React with your own renderer — [section 8](#8-react) |
| `@fano/vrm-controller/solid` | + solid-js | `createVRM()` and a frame loop for Solid — [section 7](#7-solid) |

The framework entries add lifecycle, not features: everything in the table
above is framework-agnostic and comes from the root entry either way.

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
  registerUpdate(fn: (delta: number) => void, options?: { order?: number }): () => void;
  update(delta: number): void;
  dispose(): void;
};
```

**The animation-engine seam.** `registerUpdate(fn)` adds a per-frame callback
that runs every frame *before* `vrm.update(delta)`. `avatar.update(delta)` runs
every registered callback (in registration order, unless you say otherwise —
see below), then `vrm.update(delta)` last — always last, so spring bones and
look-at react to the final pose. This is the one seam everything else in this
package hooks into:

```ts
const stop = avatar.registerUpdate((delta) => {
  face.update(delta); // auto-blink FSM
  mixer.update(delta); // Mixamo AnimationMixer
});
```

**Ordering.** Registration order is the default, but it is fragile: anything
that tears a driver down and registers it again — a mode switch in a UI — puts
it *after* whatever was already there. When something has to run on top of the
rig's animation, say so with `order` (lower runs first, ties keep registration
order, default `0`):

```ts
avatar.registerUpdate((delta) => jiggle.update(delta), { order: 100 });
```

Each call is its own registration (the same function twice runs twice, and each
returned function removes only its own), and an updater unregistered mid-frame
is skipped if it hasn't run yet. `jiggle.attach(avatar)` is the one-liner for
the case above — see [section 9](#9-jiggle-physics).

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

---

## 6. Procedural animation — motion without a `.fbx`

Everything above either poses the avatar once or replays motion somebody else
authored. This generates motion at runtime, from composable signal functions:

```ts
import {
  loadVRM,
  createIdleAnimator,
  createLookAtAnimator,
  createGestureAnimator,
  createProceduralAnimator,
} from "@fano/vrm-controller";

const avatar = await loadVRM("/avatar.vrm", { scene });

const gestures = createGestureAnimator({ wave: WAVE_KEYFRAMES });
const idle = createIdleAnimator();               // breathing, sway, micro-wander
const look = createLookAtAnimator({ target: camera }); // head/neck/chest turn

const anim = createProceduralAnimator(avatar.vrm, [gestures, idle, look]);
avatar.registerUpdate((delta) => anim.update(delta)); // the same seam as always

gestures.play("wave");
```

**One rig, one owner.** A Mixamo `AnimationMixer` and a procedural animator
both write `vrm.humanoid`'s normalized rig, and the procedural animator writes
every bone it owns on *every* frame — so whichever runs later in
`registerUpdate` order overwrites the other. Use pre-authored clips **or**
procedural animation, not both at once. Switching at runtime is fine: call
`anim.reset()` first, which returns every bone the stack owns to rest before
the mixer takes over. (Face control is unaffected either way — expression
weights and bone poses never overlap.)

Four layers, each usable on its own:

```
signals      pure fns of time      sine / noise / spring / envelope
   ↓
channels     signal → bone+axis    channel("spine", "x", sine({ hz: .25, amp: 3 }))
   ↓
animators    { update(ctx) }       createAnimator(fn) — the imperative escape hatch
   ↓
behaviors    ready-made            idle / look-at / gesture
```

| Behavior | What it does |
| --- | --- |
| `createIdleAnimator` | Breathing, weight-shift sway, seeded micro-wander — at unrelated rates so the loop never becomes visible. Optional hip bob (off by default: it lifts the feet). |
| `createLookAtAnimator` | Bone-level head/neck/chest turn toward a target, clamped and spring-smoothed. Composes with the eye-only `face.eye.gaze()` — eyes lead, head follows. |
| `createGestureAnimator` | Named keyframe timelines (`play`/`stop`/`loop`/crossfade). A non-looping gesture releases itself so the idle takes back over. |

Animators write to a **`PoseSink`**, never to a `VRMBody` directly. That one
indirection is what lets the *same* animator drive the live model or be sampled
offline — which is what `bakeAnimator` does:

```ts
const clip = bakeAnimator(avatar.vrm, createIdleAnimator(), {
  duration: 8,
  fps: 30,
  loop: true, // last sample == first, so LoopRepeat has no seam
});

mixer.clipAction(clip).play(); // a plain THREE.AnimationClip, same as Mixamo's
```

Baking is **reproducible** — nothing in the signal library calls
`Math.random()` (`noise` is seeded instead), the animator is reset before
sampling, and the timestep is fixed. It also never touches the live model, so
an avatar on screen doesn't twitch while a clip is generated.

Composition rule: within a layer, channels on the same bone sum their degrees
and convert to a quaternion once; across layers, per-bone quaternions multiply
in stack order. Every frame writes an absolute rotation derived from rest, so
there's no drift and no gimbal-lock round-trip — and a bone nothing drives any
more relaxes to rest instead of sticking.

**One authoring convention, both spec versions.** A VRM 1.0 rig faces `+Z` and a
VRM 0.x rig faces `-Z`, so a pose authored for one is mirrored on the other —
an arm raise becomes an arm drop. Everything here is authored in the VRM 1.0
convention (`+Z` forward, `+X` model-left) and converted at the write boundary,
by the same rule `retargetMixamoToVRM` applies to Mixamo clips. So one gesture
library works on both. Reach for `createRigFrame(vrm)` if you're computing
directions yourself in a raw `createAnimator` callback.

See [`docs/procedural-example/`](./docs/procedural-example/procedural-example.md)
for the full API reference and a live demo that toggles each idle component,
tracks the camera, fires gestures, and flips between the live animator and a
baked clip of the same motion.

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

The one pairing that *doesn't* combine is Mixamo playback and procedural
animation — both own the normalized bone rig, so pick one per model (see
section 6). Everything else layers freely — including jiggle physics, which
owns no bones at all and sits on top of whichever of the two is running (see
[section 9](#9-jiggle-physics)).

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

Not rendering through R3F — or want load progress without a render per event?
See [section 8](#8-react).

---

## 7. Solid

```tsx
import { createVRM, createFrameLoop } from "@fano/vrm-controller/solid";

const vrm = createVRM("/avatar.vrm", { scene });

createFrameLoop((delta) => {
  vrm.avatar()?.update(delta); // the same one-call-per-frame rule as everywhere
  renderer.render(scene, camera);
});
```

Unlike the R3F entry, this one depends on **nothing but `solid-js`** — there's
no mature Solid renderer for three.js to lean on (`solid-three` still calls
itself early development), so you keep your own renderer, scene, and camera,
and these primitives manage what goes into that scene and when it goes away.
The `/solid` entry ships no JSX, so no `babel-preset-solid` pass runs over
`dist/`.

| Primitive | What it does |
| --- | --- |
| `createVRM(url, options?)` | Reactive load. Tracks a url signal, attaches to a `scene`, disposes on url change / unmount — including loads that land *after* the url changed again. Exposes `avatar` / `loading` / `progress` / `error`, plus `resource` for `<Suspense>`. |
| `createFrameLoop(cb, options?)` | The rAF loop Solid doesn't come with. Seconds, not ms; clamps the delta so a backgrounded tab can't detonate spring bones; pausable; cancels on cleanup. |
| `createVRMUpdate(avatar, fn, options?)` | The reactive form of `registerUpdate` — re-registers when the avatar changes identity, so a model swap can't leave a driver bound to a disposed rig. `options.order` places it among the other drivers. |
| `Vrm` | Declarative mount: `<Show>` / `<For>` become the lifecycle. Renders nothing to the DOM. |

Everything in sections 1–6 works from Solid without a Solid-specific wrapper,
because none of it is framework-specific. Three ideas cover all of it:

```ts
// 1. A memo keyed on the avatar builds the controller — it rebuilds on a swap.
const face = createMemo(() => {
  const avatar = vrm.avatar();
  return avatar ? createVRMFace(avatar.vrm) : null;
});

// 2. createVRMUpdate registers whatever needs a frame. `{ order }` places it
//    among the others — jiggle passes a high one so it runs last.
createVRMUpdate(vrm.avatar, (delta) => face()?.update(delta));

// 3. State lives in signals; the model is a projection of it.
createEffect(() => face()?.emotion.setExclusive(mood()));
```

The third is the one that pays for itself: because the effect depends on both
the controller *and* the choice, **swapping models re-applies every control**
— the expression, the gesture that was playing, the joints you posed — with no
resynchronisation code. Apply a control in a click handler instead and it
silently vanishes on the next load.

The exception is the rig itself. A Mixamo `AnimationMixer`, a procedural
animator, and manual `createVRMBody` posing all write the normalized bone rig
(section 6's **one rig, one owner** rule), so that's a mode signal with a
handover, not three independent toggles — face control is unaffected either
way and runs in every mode.

See [`docs/solid-example/`](./docs/solid-example/solid-example.md) for the full
API reference, SSR notes, a recipe per feature — expressions, brows, visemes,
gestures, retargeting, baking, jiggle — and a live demo that runs all of it at
once and lets you swap the model underneath it.

## 8. React

```tsx
import { useVRM, useVRMProgress, useFrameLoop } from "@fanoalone/vrm-controller/react";

function Stage({ scene, renderer, camera }) {
  const vrm = useVRM("/avatar.vrm", { scene }); // Stage does not re-render for this

  useFrameLoop((delta) => {
    vrm.update(delta); // the same one-call-per-frame rule as everywhere
    renderer.render(scene, camera);
  });

  return <LoadingBar vrm={vrm} />;
}

function LoadingBar({ vrm }) {
  const progress = useVRMProgress(vrm); // only this re-renders, once per percent
  return <progress value={progress ?? 0} max={1} />;
}
```

For React with **your own renderer, scene, and camera**; it depends on nothing
but `react`. If you render through React Three Fiber, use the `/r3f` entry above.
The `/react` entry ships no JSX, so nothing has to transform `dist/`.

The one design rule: **loading, progress, and per-frame work never re-render the
component that set them up.** `useVRM` returns a stable handle backed by an
external store, and rendering *from* a value is opt-in, per value — each opt-in
hook re-renders only for the one thing it reads.

| Primitive | What it does |
| --- | --- |
| `useVRM(url, options?)` | Load, attach to a `scene`, dispose on url change / unmount. Returns a stable handle; the caller never re-renders for it. Survives StrictMode without a second download. |
| `useVRMStatus` / `useVRMAvatar` / `useVRMError` / `useVRMProgress` | Opt-in subscriptions. Progress is quantized to whole percents. |
| `useVRMEffect(vrm, effect, deps?)` | Build controllers against the loaded avatar with no render in between; re-runs on a model swap, and cleans up *before* the avatar is disposed. |
| `useVRMUpdate(vrm, fn, options?)` | The per-frame form of `registerUpdate` — follows the avatar across swaps. `options.order` places it among the other drivers. |
| `useFrameLoop(cb, options?)` | The rAF loop React doesn't come with. Seconds, not ms; clamped delta; pausable; stable controller. |
| `Vrm` | Declarative mount. Renders nothing to the DOM; callbacks arrive by subscription, not state. |

Everything in sections 1–6 works from React the same way it does from Solid:
build the controller in `useVRMEffect`, hold it in a ref, and let state be the
source of truth so a model swap re-applies every control.

```tsx
useVRMEffect(vrm, () => void face.current?.emotion.setExclusive(mood), [mood]);
```

One rig, one owner falls out of the component tree: make each body mode a
component whose effects own the rig while it is mounted, and unmounting it hands
the rig back *before* the next mode starts. Jiggle physics is the exception —
it owns nothing, so it just sits on top (`jiggle.attach(avatar)` inside a
`useVRMEffect`).

See [`docs/react-example/`](./docs/react-example/react-example.md) for the full
API reference, SSR and StrictMode notes, a recipe per feature, and a live demo
— a Vite app with a render counter on screen, so you can watch what does and
doesn't render, and panels for every control: per-bone posing, Mixamo clips,
gestures, visemes, brows, and jiggle with a per-bone editor.

## 9. Jiggle physics

```ts
const jiggle = createVRMJiggle(avatar.vrm, { zones: ["chest", "hips"] });
const detach = jiggle.attach(avatar); // runs after whatever animates the rig

jiggle.enable("head", { hz: 2.5, gain: 0.6 }); // add or retune a bone
jiggle.impulse("chest", { y: 1 });             // a kick, in m/s
jiggle.intensity = 1.5;                        // exaggerate everything
```

Each jiggling bone carries a **soft mass on a lever**: the lever point's
acceleration is measured from the live rig in world space, the mass lags behind
it on a damped spring, and the bone leans toward wherever the mass has gone.
Everything is metres, hertz and degrees. It reacts to *whatever is moving the
model* — a Mixamo clip, a procedural animator, a pose you are dragging, or the
whole avatar moving through the scene — and with no motion there is no jiggle.

**It layers; it doesn't own the rig.** Each frame it works out what a bone's
rotation would be without its own previous nudge, then adds a fresh one on top,
so it composes with any driver and leaves no residue when switched off. Because
it adds *on top*, it has to run after whatever writes the base pose — which is
what `attach` (a `registerUpdate` with a late `order`) is for.

| | |
| --- | --- |
| `createVRMJiggle(vrm, options?)` | `zones` (`chest`, `torso`, `hips`, `head`, `shoulders`, `thighs`), per-`bones` overrides, `intensity`, `ambient`, `smoothing` |
| `jiggle.attach(avatar)` | Register after the rig's drivers; returns `detach()` |
| `jiggle.enable(target, options?)` | Start a bone, or retune it without restarting its spring — `hz`, `damping`, `gain`, `length`, `lever`, `maxAngle` |
| `jiggle.impulse(target, velocity)` | A kick in m/s — a poke, a hit, a footstep |
| `listJiggleCandidates(vrm)` | The model's own non-humanoid bones (a bust, a tail, a ribbon) worth jiggling **by name** |

Rotating a humanoid bone moves everything parented to it, so humanoid jiggle
reads as the upper body settling after a bounce. For a localised wobble, give
`enable()` a non-humanoid node's name. Directions are authored in the VRM 1.0
convention and mirrored for 0.x models, like everything else here.

See [`docs/jiggle-example/`](./docs/jiggle-example/jiggle-example.md) for the
full API, the physics, the guards against teleports and stalls, and recipes. The
React and Solid demos both have a jiggle panel — a per-bone editor, pokes, and a
bouncing avatar to drive it — that keeps working as you switch the body driver.

## Development

```bash
bun install
bun run build          # tsup -> dist/ as esm + cjs + .d.ts
bun run dev             # same, in watch mode
bun run test            # vitest run
bun run test:watch      # vitest watch
```

Tests run in Node with no headless-GL setup. They fake `vrm` / `vrm.humanoid`
(a plain object cast to `VRM`) but use **real** `three` instances for the
math — quaternions, Euler conversions, keyframe tracks — so the rotation and
retargeting logic is checked against three.js's own algebra rather than a
reimplementation of it. The Solid tests stub `loadVRM`, `requestAnimationFrame`
and `window`/`document`, but run **real** Solid reactivity — which is why
`vitest.config.ts` pins `resolve.conditions` to `["browser", "development"]`:
under Node's own resolution `solid-js` serves its SSR build, where every
reactive primitive is an inert stub and the tests would silently pass nothing.
The React tests mount real components with `react-dom` under `happy-dom`
(selected per file by a `// @vitest-environment` docblock) and **count renders**
— that is the contract the entry is built on — while the store and frame-loop
logic underneath is tested with no React at all. The jiggle tests build a rig
from **real** three.js objects (only the `VRM` wrapper is fake), so the
world-space acceleration, mirroring and write-through logic is checked against
three's own math rather than a mock of it. Nothing renders, so the live demos are
how you actually see any of this on screen: the `docs/*-example/*.html` ones
(`bunx serve .`, then open the demo you want) and the React example, which is a
Vite app (`cd docs/react-example && bun install && bun run dev`).

## License

This project is licensed under the Apache License 2.0 with additional
attribution terms.

You may use, modify, and distribute this package for free, including in
commercial projects, as long as proper credit is preserved:

**Fano VRM Controller by Ayush Pradhan**

See [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE) for details.
