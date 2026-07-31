# Fano VRM Controller — Face Example

`createVRMFace(vrm)` gives you the whole face behind **one object with one
controller per concern**, so you never mix unrelated blendshapes through a
single generic call:

```ts
import { loadVRM, createVRMFace } from "fano-vrm-controller";

const avatar = await loadVRM("/avatar.vrm", { scene });
const face = createVRMFace(avatar.vrm);

face.emotion.setExclusive("happy");   // mood / expression presets
face.viseme.set("aa", 0.8);           // vowels / lip-sync
face.eye.blink(1);                    // eyelids
face.eye.gaze(camera);                // gaze / look-at
face.brow.set("angry", 1);            // eyebrows
face.expression.set("myCustom", 1);   // raw preset / custom escape hatch
```

| Accessor          | Concern                               | Backed by |
| ----------------- | ------------------------------------- | --------- |
| `face.emotion`    | happy, angry, sad, relaxed, surprised, neutral | standard expression → VRoid `Fcl_ALL/BRW/EYE/MTH` fallback |
| `face.viseme`     | vowels `aa ih ou ee oh` (lip-sync)    | standard vowel expression → fuzzy mouth morph fallback |
| `face.eye`        | blink / wink + gaze (look-at)         | standard blink/look expressions + procedural `VRMLookAt` |
| `face.brow`       | eyebrows (no VRM preset exists)        | raw `Fcl_BRW_*` / generic `brow*` morphs |
| `face.expression` | any standard preset **or** custom name | `VRMExpressionController` (escape hatch) |
| `face.morph`      | any blendshape by name / regex         | `VRMFaceController` (escape hatch) |

Each concern controller **prefers the portable VRM standard expression** and
falls back to a **universal fuzzy morph matcher**, so the same code drives
VRoid, VRChat, and generic rigs. This mirrors the VRM 1.0 expression spec, which
separates expressions into exactly these groups (emotions, visemes `aa/ih/ou/ee/oh`,
blink, look-at) — plus eyebrows, which the standard leaves to raw morphs.

The live demo is [`face-example.html`](./face-example.html).

## Running the demo

```bash
bun run build          # produce dist/ (the demo imports ../../dist/index.js)
bunx serve .           # serve the repo root on http://localhost:3000
# open http://localhost:3000/docs/face-example/face-example.html
```

Put a model named `avatar.vrm` in the repo root, or edit `MODEL_URL` in the HTML.

## Weights flush on `update`, per-frame state needs a tick

Setting a weight only records it — it is applied on the next `vrm.update(delta)`,
which `avatar.update(delta)` already calls each frame. Anything that needs its
own per-frame tick (the auto-blink FSM) is advanced by `face.update(delta)`.
Wire it through the avatar's update seam so it runs **before** `vrm.update`:

```ts
const face = createVRMFace(avatar.vrm);
avatar.registerUpdate((delta) => face.update(delta)); // advances auto-blink

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  avatar.update(clock.getDelta()); // updaters first, then vrm.update flushes
  renderer.render(scene, camera);
}
animate();
```

## Animation engine seam (Mixamo-ready)

`loadVRM` returns a `VRMAvatar` with an ordered per-frame pipeline:

```ts
avatar.registerUpdate(fn) // fn(delta) runs every frame BEFORE vrm.update; returns an unregister fn
avatar.update(delta)      // runs every registered fn in order, THEN vrm.update(delta) LAST
```

`vrm.update()` always runs **last**, so spring-bones and look-at react to the
final animated pose. This is the seam a future Mixamo animation engine plugs
into without touching the loader or the face module:

```ts
// (future) drive a retargeted Mixamo clip — no clash with the face layer
const mixer = new THREE.AnimationMixer(avatar.vrm.scene);
mixer.clipAction(retargetedClip).play();
const stop = avatar.registerUpdate((delta) => mixer.update(delta));
```

Because Mixamo clips carry only skeletal tracks (never expression/morph tracks)
and the mixer runs before `vrm.update`, body animation, expression weights, and
look-at stay independent — the face controllers remain the sole owner of
expression weights, and the mixer the sole owner of bone poses.

---

## API reference

### `createVRMFace(vrm)` → `VRMFace`

| Member | Description |
| --- | --- |
| `emotion` | `EmotionController` (see below) |
| `viseme` | `VisemeController` |
| `eye` | `EyeController` |
| `brow` | `BrowController` |
| `expression` | `VRMExpressionController` — raw standard-preset + custom escape hatch |
| `morph` | `VRMFaceController` — raw morph-target escape hatch |
| `available` | `true` if the model exposes a standard `expressionManager` |
| `update(delta)` | Advance per-frame face state (auto-blink). Chainable |
| `reset()` | Reset every concern to neutral. Chainable |
| `debug()` | Snapshot of every channel |

### `face.emotion` — `EmotionController`

| Method | Description |
| --- | --- |
| `set(name, weight, { resetOthers? })` | Set an emotion (0..1). Standard expression, else VRoid `Fcl_*` fallback. Chainable |
| `setExclusive(name, weight = 1)` | Set one emotion and zero the others |
| `get(name)` | Current weight (reads standard or raw channel) |
| `list()` | Emotion presets this model can actually show |
| `reset()` | Zero every emotion |
| `presets` | `["happy","angry","sad","relaxed","surprised","neutral"]` |

### `face.viseme` — `VisemeController`

| Method | Description |
| --- | --- |
| `set(preset, weight, { resetOthers? })` | Set one vowel (`aa ih ou ee oh`). Chainable |
| `setAll({ aa, ih, ou, ee, oh })` | Set a blend at once; zeroes the rest |
| `get(preset)` | Current weight (standard or raw channel) |
| `list()` | Vowel presets this model can drive |
| `reset()` | Zero every viseme |
| `presets` | `["aa","ih","ou","ee","oh"]` |

### `face.eye` — `EyeController`

| Method | Description |
| --- | --- |
| `blink(w)` / `blinkLeft(w)` / `blinkRight(w)` | Close both / left / right eye (0..1). Chainable |
| `autoBlink(options?)` | Start procedural blinking; returns the `AutoBlinkController`. Advanced by `face.update(delta)` |
| `stopAutoBlink()` | Stop auto-blink and open the eyes |
| `gaze(target)` | Continuously track a `THREE.Object3D` with the eyes |
| `lookAt(position)` | Point the eyes at a fixed world `THREE.Vector3` |
| `setGazeAngles(yawDeg, pitchDeg)` | Set gaze angles directly |
| `clearGaze()` | Stop tracking / recenter |
| `look({ up, down, left, right })` | Expression-based look (for expression-driven eyes) |
| `update(delta)` | Advance auto-blink (called for you by `face.update`) |
| `reset()` | Reset eyelids, gaze, look |

`AutoBlinkController` options: `minDelay` (2s), `maxDelay` (6s), `closeDuration`
(0.08s), `openDuration` (0.14s), `intensity` (1). Call `update(delta, manualBlink?)`
to advance it (pass `manualBlink > 0` to force-hold a blink) and `reset()`.

### `face.brow` — `BrowController`

No VRM standard preset exists for eyebrows, so this drives raw morphs via the
universal matcher.

| Method | Description |
| --- | --- |
| `set(shape, weight, { resetOthers? })` | Set a brow shape (0..1). Chainable |
| `setExclusive(shape, weight = 1)` | Set one shape and zero the others |
| `available` | Whether the model exposes any eyebrow morphs |
| `list()` | Eyebrow morph-target names found on the model |
| `reset()` | Zero every eyebrow morph |
| `shapes` | `["angry","fun","joy","sorrow","surprised"]` (aliases `happy/sad/relaxed/surprise` also work) |

### Escape hatches

- `face.expression` — the standard `VRMExpressionController`: `set`/`get`/`has`/`list`
  (and the verbose `setExpression`/`getExpression`/…/`reset`). Use for custom
  expression names a model author defined.
- `face.morph` — the low-level `VRMFaceController`: `setMorph(name, v)`,
  `setMorphByPatterns(patterns, v)`, `getMorph(name)`, `matchMorph(patterns)`,
  `findMorphTargets(regex)`, `getFclEmotionTargets()` / `getFclEyeTargets()` /
  `getFclMouthTargets()` / `getFclBrowTargets()`.

### Catalogs & helpers (exported)

`VISEME_PRESETS`, `EMOTION_PRESETS`, `BLINK_PRESETS`, `GAZE_PRESETS`,
`VRMExpressionPreset`, `BROW_SHAPES`, and the VRoid catalog
(`VRM_FCL_MORPH_TARGETS`, `VRM_FCL_GROUPS`, `VRM_FCL_FACE_PARTS`,
`VRM_EMOTION_PRESETS`, `getVRMEmotionPresetTargets`, `isVRMFclMorphTarget`), plus
the fuzzy-matcher builders (`createMouthPatterns`, `createExpressionPatterns`,
`createBrowPatterns`, `BLINK_PATTERNS`).

## References

- VRM 1.0 expressions spec — <https://github.com/vrm-c/vrm-specification>
- VRoid `Fcl_*` blendshapes — <https://vroid.pixiv.help> / <https://vroid.com>
- three-vrm (`VRMExpressionManager`, `VRMLookAt`) — <https://github.com/pixiv/three-vrm>
