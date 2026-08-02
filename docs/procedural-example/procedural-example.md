# Fano VRM Controller — Procedural Animation Example

Generate body motion at runtime instead of loading it from a `.fbx`. Compose
small signal functions into layers, run them live through the same
`registerUpdate` seam everything else uses — or bake the exact same animator
into a plain `THREE.AnimationClip`:

```ts
import {
  loadVRM,
  createIdleAnimator,
  createLookAtAnimator,
  createGestureAnimator,
  createProceduralAnimator,
} from "fano-vrm-controller";

const avatar = await loadVRM("/avatar.vrm", { scene });

const gestures = createGestureAnimator({ wave: WAVE_KEYFRAMES });
const idle = createIdleAnimator();
const look = createLookAtAnimator({ target: camera });

const anim = createProceduralAnimator(avatar.vrm, [gestures, idle, look]);
avatar.registerUpdate((delta) => anim.update(delta)); // before vrm.update

gestures.play("wave");
```

The live demo is [`procedural-example.html`](./procedural-example.html).

## Running the demo

```bash
bun run build          # produce dist/ (the demo imports ../../dist/index.js)
bunx serve .           # serve the repo root on http://localhost:3000
# open http://localhost:3000/docs/procedural-example/procedural-example.html
```

Put a model named `avatar.vrm` in the repo root, same as the other examples. No
`.fbx` files needed — that's the point. The demo lets you toggle each part of
the idle, orbit the camera to watch the head follow it, fire gestures, and
flip between the **live** animator and a **baked** clip of the same idle
played through an ordinary `AnimationMixer`.

## One rig, one owner

A Mixamo `AnimationMixer` and a procedural animator both write
`vrm.humanoid`'s normalized bone rig, and the procedural animator writes every
bone it owns on **every** frame. Run both and whichever is registered later
simply overwrites the other.

So: use pre-authored clips *or* procedural animation, never both at once.
Switching between them at runtime is fine — call `anim.reset()` first, which
returns every bone the stack owns to rest before the mixer takes over:

```ts
let mode = "procedural";

const anim = createProceduralAnimator(avatar.vrm, [idle, look]);
const mixer = new THREE.AnimationMixer(avatar.vrm.scene);

// One registered updater that dispatches, rather than two that fight.
avatar.registerUpdate((delta) => {
  if (mode === "procedural") anim.update(delta);
  else mixer.update(delta);
});

function playDanceClip(clip) {
  anim.reset();                 // release every bone the stack owns
  mixer.clipAction(clip).play();
  mode = "clip";
}

function backToIdle() {
  mixer.stopAllAction();
  mode = "procedural";          // the stack reclaims its bones next frame
}
```

Face control is unaffected either way. `createVRMFace` only touches expression
weights and morph targets, so it composes with either path — the demo runs
auto-blink and eye-gaze the whole time:

```ts
const face = createVRMFace(avatar.vrm);
face.eye.autoBlink();
face.eye.gaze(camera);                  // eyes, via VRMLookAt
avatar.registerUpdate((d) => face.update(d));

const look = createLookAtAnimator({ target: camera }); // head/neck, via bones
```

## The four layers

```
signals      pure fns of time      sine / noise / spring / envelope
   ↓
channels     signal → bone+axis    channel("spine", "x", sine({ hz: .25, amp: 3 }))
   ↓
animators    { update(ctx) }       createAnimator(fn) — the imperative escape hatch
   ↓
behaviors    ready-made            idle / look-at / gesture
```

Each layer is usable on its own. Reach for the level that matches what you're
doing: a ready-made behavior, a handful of channels, or a raw callback.

### Signals

Pure functions of time. **Nothing here calls `Math.random()`** — that's what
makes `bakeAnimator` reproducible, so `noise` is seeded instead.

| Signal | What it does |
| --- | --- |
| `sine({ hz, amp, phase, offset })` | Sine wave. `phase` is in **turns**, not radians. |
| `cosine(options)` | `sine` a quarter turn ahead. |
| `noise({ hz, amp, seed, octaves })` | Seeded smooth wander. Same seed ⇒ same waveform, always. |
| `envelope({ attack, hold, release, amp, loop })` | One-shot ramp from `time = 0`. |
| `constant(value)` | Fixed value. Bare numbers are coerced to this automatically. |
| `smooth(source, springOptions)` | Wraps a signal in a spring so it lags and settles. |
| `createSpring({ stiffness, damping, initial })` | A spring with an imperatively-set `target`. |

Combinators carry a `Signal` suffix — `addSignals`, `multiplySignals`,
`scaleSignal`, `invertSignal`, `clampSignal` — because everything is
re-exported from the package root, and bare `add` / `clamp` would squat on
your namespace. They forward `reset()` to any stateful signal in the chain.

### Poses are authored in the VRM 1.0 convention

A VRM 1.0 rig faces `+Z`; a VRM 0.x rig faces `-Z`. The two are related by a
180° rotation about Y, so a pose authored for one is **mirrored** on the other —
an arm raise becomes an arm drop, a forward lean becomes a backward lean. (VRoid
Studio exported VRM 0.x for years, so plenty of models in the wild are 0.x.)

Everything in this module is authored in the **VRM 1.0 convention**:

- `+Z` is forward, `-Z` is behind
- `+X` is the model's **left**, `-X` its right
- `+X` rotation pitches a joint down, `-X` pitches it up

The write boundary (`createBodySink`, `bakeAnimator`) converts to whatever the
model actually uses, by the same rule `retargetMixamoToVRM` applies to Mixamo
clips: negate the rotation's `x` and `z`, leave `y` and `w` alone. So **one
gesture library works on both spec versions** — you author once and don't think
about it again.

Two consequences worth knowing:

- **Yaw passes through untouched.** Rotations about Y commute with the frame
  flip, so a turn is a turn on either rig; only pitch and roll reverse.
- **Symmetric motion was never affected.** A sine sway goes both ways anyway —
  it's the *asymmetric* poses (a wave, a nod, a point) that mirror.

If you're writing a raw `createAnimator` callback that computes directions from
the scene, convert them yourself with `createRigFrame(vrm)`:

```ts
const frame = createRigFrame(vrm);
frame.mirrored;            // true on VRM 0.x
frame.vector(direction);   // rig space <-> authoring space, in place
frame.rotation(quaternion);
```

Both conversions are involutions — applying one twice returns the original, so
the same call works in either direction.

### Channels

A channel binds one signal to one axis of one bone's rotation, in **degrees**:

```ts
channel("spine", "x", sine({ hz: 0.25, amp: 3 })); // breathe ±3° at 0.25 Hz
channel("head", "y", 15); // a constant 15° turn
channels("head", { x: noise({ seed: 1 }), y: noise({ seed: 2 }) }); // several at once

createChannelAnimator([...channels]);
```

Give every noise channel a **different seed** — sharing one moves every joint
in lockstep, which reads as a glitch rather than as life.

### Animators

An `Animator` is just `{ update(context) }`, where `context` is
`{ delta, time, sink, vrm }`. Animators write to a **`PoseSink`**, never to a
`VRMBody` directly — that indirection is what lets the same animator drive the
live model or be sampled offline by the baker.

```ts
const wobble = createAnimator(({ time, sink }) => {
  sink.setBoneRotation("leftUpperArm", someQuaternion);
});
```

Rotations written to a sink are absolute local rotations (the normalized rig
rests at identity, so an absolute rotation *is* the offset from rest).
Positions are offsets from rest, in metres.

### Composition

`createProceduralAnimator(vrm, layers)` runs the stack each frame and composes
it. **Later layers compose on top of earlier ones**, so order matters — base
motion first, small additions after:

- *Within* one layer, channels on the same bone sum their degrees per axis and
  convert to a quaternion exactly once.
- *Across* layers, per-bone quaternions **multiply**. A large gesture rotation
  composes correctly with a few degrees of breathing on top; summing them in
  degree space would distort the result.

Every frame writes an absolute rotation derived from rest — nothing is read
back and re-merged, so there's no drift over long sessions and no
gimbal-lock round-trip. A bone that stops being driven (a layer removed, a
gesture ended) is re-emitted as identity, so joints relax instead of sticking.

## The behaviors

### `createIdleAnimator(options?)`

Breathing, weight-shift sway, and a seeded micro-wander, at deliberately
unrelated rates so the loop never becomes visible. Every amplitude defaults to
subtle — these are degrees, and 2° of chest rotation is already clearly
readable on a humanoid.

```ts
createIdleAnimator();                                   // sensible defaults
createIdleAnimator({ breathing: { hz: 0.2, amp: 1.5 }, noise: false });
createIdleAnimator({ bob: true });                      // + vertical hip travel
```

Each section takes `false` to switch it off, `true` for defaults, or an object
merged over the defaults. `bob` is **off by default**: translating the hips
lifts the feet off the floor, which reads as floating on models whose legs
aren't IK-corrected.

### `createLookAtAnimator(options?)`

Bone-level head/neck/upper-chest turn toward a target — the counterpart to the
eye-only `VRMLookAt` gaze that `face.eye.gaze()` drives. **Run both**: the eyes
lead, the head follows, which is what actually reads as "looking at you".

```ts
const look = createLookAtAnimator({ target: camera });
look.setTarget(otherObject);
look.clearTarget();          // springs back to center
look.yaw; look.pitch;        // current smoothed degrees
```

The turn is computed in the avatar's own local frame, so it stays correct
however the model is rotated in the scene, and is clamped (default ±70° yaw,
±45° pitch) so a target behind the avatar produces a look toward the edge of
its range rather than a broken neck. Weights default to head 0.6 / neck 0.3 /
upperChest 0.1 and are **renormalized over the bones the model actually has**,
so a rig without an `upperChest` still delivers the full turn.

Facing direction is handled for you — the target direction is measured in the
model's own frame, converted to authoring space, and the result converted back
on the way out, so VRM 0.x and 1.0 both track correctly. `faceFront` overrides
the authoring-space forward (`+Z` by default) for a rig that disagrees with
both.

### `createGestureAnimator(gestures, options?)`

Named pose timelines you fire on demand. Keyframes are plain degrees per bone:

```ts
const gestures = createGestureAnimator({
  wave: [
    { time: 0,   pose: {} },
    { time: 0.3, pose: { rightUpperArm: { z: -75 } }, ease: "easeOutBack" },
    { time: 0.6, pose: { rightUpperArm: { z: -75 }, rightLowerArm: { z: -50 } } },
    { time: 1.4, pose: {} },
  ],
  idleSway: { keyframes: [...], loop: true },
});

gestures.play("wave");
gestures.play("wave", { speed: 1.5, crossFade: 0.4, loop: false });
gestures.stop({ crossFade: 0.3 });
gestures.current; // "wave" | null
```

A non-looping gesture **releases itself** at the end, blending back to rest so
the idle layer underneath takes over — you don't schedule anything. Playing a
new gesture mid-flight blends out of the current pose rather than snapping.
Keyframes may be listed in any order; they're sorted on construction. Set
`duration` longer than the last keyframe to hold the final pose before
releasing.

Bones the model lacks are written and harmlessly ignored, and poses are
converted to the model's humanoid convention on the way out — so one gesture
library really does work across rigs, VRM 0.x and 1.0 alike.

Keyframe poses use the **VRM 1.0 convention** described above: for the right
arm, `z: -95` raises it; for the left, `z: +95`. If a gesture comes out
mirrored, you're almost certainly authoring against a raw `VRMBody` pose
captured from a VRM 0.x model — run it through `gesturePoseFromVRMPose` *and*
mirror it, or re-capture from a 1.0 model.

Already have a pose you like? Snapshot it and convert:

```ts
const pose = body.getPose();                    // VRMBody / vrm.humanoid
const keyframePose = gesturePoseFromVRMPose(pose);
```

## Baking to an `AnimationClip`

`bakeAnimator` samples an animator at a fixed timestep and returns a plain
`THREE.AnimationClip` — the same type `loadMixamoAnimation` returns, with the
same track naming, so it plays on an ordinary mixer and the full three.js
animation API applies:

```ts
const clip = bakeAnimator(avatar.vrm, createIdleAnimator(), {
  duration: 8,
  fps: 30,      // default 30
  loop: true,   // makes the last sample equal the first — no seam
  name: "idle",
});

const mixer = new THREE.AnimationMixer(avatar.vrm.scene);
mixer.clipAction(clip).play();
avatar.registerUpdate((delta) => mixer.update(delta));
```

Why bake at all, when the live path exists? Because a clip is cheap to replay,
crossfades against other clips, and can be time-scaled or weighted — useful
when you want procedural *authoring* but clip-based *playback*.

Three things to know:

- **It's reproducible.** No `Math.random()` in the signal library, the animator
  is reset before sampling, and the timestep is fixed — the same animator and
  options always produce the same clip.
- **The live model is never touched.** Baking runs against a recording sink, so
  an avatar on screen doesn't twitch while a clip is generated.
- **Baking resets the animators it's given**, before and after. Don't bake a
  stack that's mid-gesture and expect it to keep playing.
- **Scene-dependent behaviors bake a snapshot.** A look-at animator bakes a turn
  toward wherever its target is at bake time, not a live-tracking clip.

Pass an array to bake a whole stack, composed exactly as the live path composes
it:

```ts
bakeAnimator(vrm, [gestures, idle], { duration: 4 });
```

## Writing your own behavior

Everything above is built from the same primitives, so a custom behavior is
never a special case. Declarative:

```ts
import { createChannelAnimator, channel, sine, noise } from "fano-vrm-controller";

const nervous = createChannelAnimator([
  channel("head", "y", noise({ hz: 1.5, amp: 2, seed: 11 })),
  channel("leftHand", "x", sine({ hz: 3, amp: 4 })),
]);
```

Or imperative, when the primitives don't cover it:

```ts
import { createAnimator } from "fano-vrm-controller";

const reachForTarget = createAnimator(({ time, delta, sink, vrm }) => {
  // `vrm` is read-only here — query world positions, write through `sink`.
  sink.setBoneRotation("rightUpperArm", computeReach(vrm, target));
});
```

Both are just `Animator`s: drop either into a `createProceduralAnimator` stack,
or hand it to `bakeAnimator`.

## Recipes

**A VTuber avatar that's alive while idle and reacts when spoken to.**

```ts
const face = createVRMFace(avatar.vrm);
face.eye.autoBlink();

const gestures = createGestureAnimator({ nod: NOD, wave: WAVE });
const idle = createIdleAnimator();
const look = createLookAtAnimator({ target: camera });

const anim = createProceduralAnimator(avatar.vrm, [gestures, idle, look]);

avatar.registerUpdate((delta) => {
  anim.update(delta);
  face.update(delta);
});

// Later, on some app event:
face.speak("hello there");
gestures.play("nod");
```

**Tune the idle at runtime.** Animators are cheap; rebuild and swap rather than
mutating one. The removed layer's bones relax on the next frame.

```ts
let idle = createIdleAnimator({ breathing: { amp: 2 } });
anim.add(idle);

function setBreathAmplitude(amp) {
  anim.remove(idle);
  idle = createIdleAnimator({ breathing: { amp } });
  anim.add(idle);
}
```

**Ship a fixed idle without shipping the generator.** Bake once at build time,
save the clip as JSON, and load it like any other animation — the procedural
code then isn't needed at runtime at all.

```ts
const clip = bakeAnimator(vrm, createIdleAnimator(), { duration: 8, loop: true });
const json = THREE.AnimationClip.toJSON(clip);          // persist this

const restored = THREE.AnimationClip.parse(json);        // at runtime
mixer.clipAction(restored).play();
```

**Layer a gesture over a specific mood.** The stack composes, so a gesture and
an idle tuned for the same mood stack without either knowing about the other.

```ts
const tired = createIdleAnimator({
  breathing: { hz: 0.18, amp: 3 },   // slower, deeper
  sway: { amp: 2.4 },                // heavier weight shifts
  noise: { amp: 0.4 },               // less alert micro-movement
});

createProceduralAnimator(avatar.vrm, [gestures, tired, look]);
```
