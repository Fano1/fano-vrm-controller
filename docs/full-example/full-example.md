# Fano VRM Controller — Full Showcase

Everything in this package driving one avatar at once: loading, face control
(emotion/viseme/eye/brow), body posing, and Mixamo animation, all through the
same `registerUpdate` seam:

```ts
import {
  loadVRM,
  createVRMFace,
  createVRMBody,
  loadMixamoAnimation,
} from "fano-vrm-controller";

const avatar = await loadVRM("/avatar.vrm", { scene });
const face = createVRMFace(avatar.vrm);
const body = createVRMBody(avatar.vrm);
const mixer = new THREE.AnimationMixer(avatar.vrm.scene);

avatar.registerUpdate((delta) => {
  face.update(delta); // owns expression weights (auto-blink FSM)
  mixer.update(delta); // owns bone poses (Mixamo playback)
});

body.setEulerDegrees("head", { y: 15 }); // direct write, no update() of its own

const clip = await loadMixamoAnimation("/walk.fbx", avatar.vrm);
mixer.clipAction(clip).play();
```

The live demo is [`full-example.html`](./full-example.html).

## Why this works without any coordination

`face` only ever touches expression weights and raw morph targets. `body` and
`mixer` both touch humanoid bone rotations/positions — `body` by direct write,
`mixer` by playing back a retargeted clip — but this demo never drives both
at once, and neither reads the other's output regardless. So every callback
can run in any order — the only rule that matters is "everything before
`vrm.update(delta)`", which `avatar.update(delta)` already guarantees (see
`src/core/feature/loader/loader.ts`). That single ordering guarantee is what
lets every feature in this package compose without a shared animation-state
object tying them together. It's also why none of `body`'s writes, or
`face.expression.set(...)`, show up before the *next* `vrm.update(delta)` —
same flush rule as everything else, `body` just has no per-frame `update()`
method of its own to call (it has no time-based state, unlike auto-blink).

## Running the demo

```bash
bun run build          # produce dist/ (the demo imports ../../dist/index.js)
bunx serve .           # serve the repo root on http://localhost:3000
# open http://localhost:3000/docs/full-example/full-example.html
```

You'll need, in the repo root:

- `avatar.vrm` — any VRM 0.x or 1.0 model.
- An `animation/` folder with a few Mixamo `.fbx` downloads. Edit
  `ANIMATION_PRESETS` in `full-example.html` to match whatever you've
  downloaded — Mixamo's default filenames often contain spaces, which the
  demo `encodeURI()`s before fetching, so you don't need to rename them.

## What's in the panel

| Section | Drives | Detail |
| --- | --- | --- |
| Emotion | `face.emotion` | One button per preset the model can show |
| Viseme (lip-sync) | `face.viseme` | One slider per vowel (`aa ih ou ee oh`) |
| Eyes | `face.eye` | Auto-blink toggle, manual blink slider, gaze-follows-cursor |
| Eyebrows | `face.brow` | One button per shape (models with eyebrow morphs only) |
| Reset face | `face.reset()` | Zeroes every face channel above |
| Body Posing | `createVRMBody` | Joint dropdown (`listBones()`) + X/Y/Z degree sliders (`get/setEulerDegrees`), reset-joint and reset-whole-pose buttons |
| Mixamo Animation | `loadMixamoAnimation` + a plain `THREE.AnimationMixer` | Load-by-path + one-click presets, crossfading between whatever was already playing |

Each panel section is independent of the others — playing a Mixamo animation
doesn't reset your emotion/viseme/eye state, and changing expressions doesn't
interrupt the currently-playing animation. That's the same independence
described above, just visible as UI instead of code. The one exception: body
posing and Mixamo animation both drive bone transforms, so posing a joint by
hand and then playing an animation will visibly fight — pick one at a time,
same as you would with any other two-source-of-truth-for-one-bone setup.

## Deep dives

This page is the "everything at once" tour — for the full API reference of
each piece:

- [`docs/face-example/`](../face-example/face-example.md) — the `VRMFace`
  facade in depth.
- [`docs/expression-example/`](../expression-example/expression-example.md) —
  the lower-level `VRMExpressionController` engine.
- [`docs/mixamo-example/`](../mixamo-example/mixamo-example.md) — Mixamo
  retargeting in depth.
- the root [`README.md`](../../README.md) — a guided overview of all of it.
