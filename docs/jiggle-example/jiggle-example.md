# Fano VRM Controller — Jiggle Physics

Secondary motion: bones that wobble and settle in response to how the body
moves. A bounce makes the chest lag behind and ring; a turn makes the head
overshoot; standing still, nothing happens — which is what a physics model
should do.

```ts
import { loadVRM, createVRMJiggle } from "fano-vrm-controller";

const avatar = await loadVRM("/avatar.vrm", { scene });

const jiggle = createVRMJiggle(avatar.vrm, { zones: ["chest", "hips"] });
const detach = jiggle.attach(avatar); // runs after whatever animates the rig

jiggle.enable("head", { hz: 2.5, gain: 0.6 }); // add or retune a bone
jiggle.impulse("chest", { y: 1 });             // a kick, in m/s
jiggle.intensity = 1.5;                        // exaggerate everything
```

It reads the rig's **actual motion**, so it reacts to whatever is moving the
model — a Mixamo clip, a procedural animator, a pose you are dragging, or you
moving the whole avatar through the scene — with no knowledge of any of them.

There is no standalone `.html` for this one. It is a layer on top of everything
else, so it is shown on top of everything else: the
[React demo](../react-example/README.md) and the
[Solid demo](../solid-example/solid-example.html) both have a *Jiggle physics*
panel next to the body driver, and both let you switch the driver while the
avatar bounces.

## Running the demos

```bash
bun run build                       # the demos import dist/
```

```bash
# React (Vite) — drop avatar.vrm in the repo root
cd docs/react-example && bun install && bun run dev

# Solid (no build step) — serve the repo root
bunx serve .
# open http://localhost:3000/docs/solid-example/solid-example.html
```

In either one: pick **Bounce** under *Make the body move*, watch the readout
list each jiggling bone's live angle, then change the body driver (Procedural →
Mixamo clip → Manual pose). The jiggle keeps working on top of each.

## How it works

Each jiggling bone carries a **soft mass on a lever** hanging off it.

1. Every frame the lever point's acceleration is measured from the live rig, in
   **world space** (a finite difference of its world position).
2. The mass lags behind that acceleration on a **damped spring** — `hz`,
   `damping`, scaled by `gain`.
3. The bone leans toward wherever the mass has gone, capped at `maxAngle`.

Everything is a physical quantity: metres, hertz, degrees. A longer `length`
turns the same displacement into a smaller angle; a higher `hz` is a tighter
shiver; a damping ratio around `0.2` rings for a few cycles — the jiggle look —
and `1` settles with no overshoot.

Parents are simulated first (sorted by depth in the skeleton), so a child
measures against a parent that has already moved this frame. That is what lets a
wobble cascade down a chain: spine → chest → head.

## It layers; it doesn't own the rig

A Mixamo mixer, a `ProceduralAnimator` and a hand on a slider each **claim** the
bones they write — one rig, one owner. Jiggle is the exception, by design: it
claims nothing.

Each frame it works out what a bone's rotation would be *without* its own
previous nudge, then adds a fresh one on top:

- If something else rewrote the bone since — the mixer does, every frame — that
  new value is taken as the base.
- If nothing did, its own last nudge is subtracted first, so it never
  accumulates.

This write-through check is why it composes with any driver, and why turning it
off leaves no residue (`jiggle.enabled = false` takes every nudge off the rig).

### Run it last: `attach` and `order`

Because it adds *on top* of the base pose, it has to run **after** whatever
writes that pose. If a driver ran after it, the driver would write its own value
over the nudge every frame and nothing would move.

`registerUpdate` runs callbacks in registration order, which is fragile: a
framework that tears a driver down and re-registers it when you switch modes
(React and Solid both do) puts it *after* anything that was already in place.
So `registerUpdate` takes an `order`:

```ts
avatar.registerUpdate(fn, { order: 100 }); // lower runs first, ties keep registration order; default 0
```

and `jiggle.attach(avatar)` is exactly that, with `order: JIGGLE_UPDATE_ORDER`
(`100`), returning a function that unregisters it **and** takes the nudges off
the rig:

```ts
const detach = jiggle.attach(avatar);
// … later, before handing the rig to something that will read its pose:
detach();
```

You can do it by hand — `avatar.registerUpdate((d) => jiggle.update(d), { order: 100 })`,
or call `jiggle.update(delta)` yourself at the end of your frame — but anything
that must stay last should say so with an order rather than rely on who
registered first.

| Where | How |
| --- | --- |
| Plain three.js | `jiggle.attach(avatar)` |
| React | `useVRMEffect(vrm, (avatar) => { … return jiggle.attach(avatar) })`, or `useVRMUpdate(vrm, fn, { order })` |
| Solid | `createVRMUpdate(vrm.avatar, (d) => jiggle()?.update(d), { order: JIGGLE_UPDATE_ORDER })` |
| React Three Fiber | `jiggle.attach(avatar)` with the `avatar` from `onLoad` — `<Vrm>` drives `avatar.update(delta)` |

## API

### `createVRMJiggle(vrm, options?)`

| Option | Default | What it does |
| --- | --- | --- |
| `zones` | `["chest", "hips"]` | Regions to enable with their tuned defaults. Bones the model lacks are skipped. |
| `bones` | — | Per-target overrides and additions, applied after `zones`. A value is that target's options; `true` enables it with defaults; `false` removes it (to drop one bone of a zone). |
| `intensity` | `1` | Global multiplier on every bone's `gain`. |
| `ambient` | `0` | Constant background wobble in **m/s²** — a seeded, deterministic drift that keeps a standing model faintly alive. `0` means no motion, no jiggle. |
| `smoothing` | `0.03` | Seconds of smoothing on the measured acceleration. Acceleration is a second derivative of position, so it amplifies frame-timing noise; a little smoothing keeps that out. |

### `VRMJiggle`

| Member | |
| --- | --- |
| `attach(avatar)` | Run every frame after the rig's drivers. Returns `detach()`. |
| `update(delta)` | Advance the simulation and write the result. Call once per frame, after the rig is animated. Chainable. |
| `enable(target, options?)` | Start a bone jiggling — or **retune** it if it already is. Options merge with what it had, and the spring keeps its state, so dragging a slider is smooth rather than a restart. Returns `false` if the model has no such node. |
| `disable(target)` | Stop a bone and take its nudge off. |
| `impulse(target, velocity)` | Kick the mass, in **m/s**, in the bone's own frame. A poke, a hit reaction, a footstep. |
| `has(target)` / `isEnabled(target)` | Whether the model has the node / whether it is jiggling. |
| `list()` | Every jiggling target, parents first. |
| `getOptions(target)` | The **resolved** options a bone is actually running with (preset or node-axis defaults filled in), or `null`. |
| `enabled` | Master switch. Setting it `false` resets the rig. |
| `intensity` / `ambient` / `smoothing` | Live-writable, as above. |
| `reset()` | Take every nudge off and settle every spring. Bones stay enabled. |
| `dispose()` | `reset()`, then forget every bone. |
| `debug()` | A snapshot — each bone's live angle, offset and options. |

A **target** is a humanoid bone name, or the **name of any other node** in the
model. A humanoid name the model lacks, or a node that doesn't exist, is simply
not found; nothing throws.

### Per-bone options

```ts
jiggle.enable("chest", {
  hz: 3,          // spring frequency
  damping: 0.2,   // damping ratio
  gain: 0.5,      // how strongly motion drives the mass
  length: 0.15,   // metres from the bone to the mass
  lever: { y: 0.7, z: 0.7 },
  maxAngle: 7,    // hard ceiling, degrees
});
```

| Option | Default | |
| --- | --- | --- |
| `hz` | `3` | Natural frequency. Low is a slow, heavy sway; high is a tight shiver. |
| `damping` | `0.2` | Damping ratio. `0` never settles; `0.15–0.3` rings; `1` has no overshoot. |
| `gain` | `0.5` | `1` is the full physical response, which is a lot for soft tissue. Scales the whole effect without changing its character. |
| `length` | `0.15` | Metres from the bone to the soft mass. A longer lever turns the same displacement into a smaller angle. |
| `lever` | up the bone | Which way the mass hangs, in the bone's own frame. **Tilting it matters** — see below. |
| `maxAngle` | `8` | The most the bone may ever lean, in degrees. A landing from a jump can't fold the model in half. |

**Why `lever` matters.** Motion *along* the lever can't bend the bone. A chest
with the lever straight up turns a vertical bounce into nothing; tilt it
up-and-forward, `{ y: 0.7, z: 0.7 }`, and the same bounce reads as a nod.

### Zones

A zone is a named group of humanoid bones with tuned defaults.

| Zone | Bones |
| --- | --- |
| `chest` | `upperChest`, `chest` |
| `torso` | `spine` |
| `hips` | `hips` |
| `head` | `neck`, `head` |
| `shoulders` | `leftShoulder`, `rightShoulder` |
| `thighs` | `leftUpperLeg`, `rightUpperLeg` |

`JIGGLE_ZONES`, `JIGGLE_BONE_DEFAULTS` and `JIGGLE_BASE` are exported, so a UI
can list the zones and start from the tuned numbers.

## Humanoid bones vs. the model's own bones

Rotating a humanoid bone moves **everything parented to it** — arms, neck, head.
So humanoid jiggle reads as the upper body settling after a bounce, not as a
localised wobble, and the tuned defaults are deliberately small and slow.

For a localised wobble — a bust bone, a tail, a ribbon — give `enable()` the
node's **name**:

```ts
import { listJiggleCandidates } from "fano-vrm-controller";

listJiggleCandidates(avatar.vrm); // ["J_Sec_Bust_L", "J_Sec_Bust_R", …]

jiggle.enable("J_Sec_Bust_L", { gain: 0.8, hz: 4 });
```

`listJiggleCandidates` returns bones that are neither humanoid bones nor already
driven by the model's own **spring bones**. The second exclusion matters: the VRM
spring-bone system rewrites its bones' rotations itself, after this runs, so a
jiggle on one would be silently overwritten.

For a non-humanoid node the lever defaults to the direction of its **first
child** — the bone's own axis — with `length` defaulting to that child's
distance, and the lever is in the node's own frame (there is no convention to
convert).

## One convention, both spec versions

A VRM 1.0 rig faces `+Z` and a VRM 0.x rig faces `-Z`. Like every other behavior
in the package, jiggle's directions — `lever`, `impulse` — are **authored in the
VRM 1.0 convention** for humanoid bones (`+Z` forward, `+Y` up) and mirrored at
the write boundary for 0.x models. One tuning works on both.

## Guards

Acceleration is a second derivative, so a bad frame can make a huge one. The
simulation defends itself:

| Situation | What happens |
| --- | --- |
| **Teleport** — the lever point moves faster than 25 m/s | Not treated as motion; its history is dropped and measuring restarts. |
| **Stall** — a frame longer than 0.1 s (a backgrounded tab) | The spring integrates a capped 0.1 s step, but the gap isn't read as an acceleration. |
| **Spike** — acceleration above 60 m/s² (about 6 g) | Clamped to 60. |
| **Non-finite state** | The bone is released — its nudge is taken off the rig — rather than writing NaN. |
| **Over the ceiling** | The lean is clamped to `maxAngle`, and any velocity still pushing outward is cancelled so it doesn't pin against the limit. |
| **Large steps** | Integrated in substeps of at most 1/240 s, so a stiff spring stays stable at 30 fps. |

## Recipes

### A hit reaction

```ts
function onHit(direction: THREE.Vector3) {
  jiggle.impulse("chest", { x: direction.x * 2, z: direction.z * 2 });
  jiggle.impulse("head", { x: direction.x * 3, z: direction.z * 3 });
}
```

### Footsteps

Fire a downward kick from your own animation event:

```ts
mixer.addEventListener("loop", () => jiggle.impulse("hips", { y: -1.5 }));
```

### On top of a Mixamo clip

Nothing special — register the mixer as usual and attach jiggle:

```ts
const mixer = new THREE.AnimationMixer(avatar.vrm.scene);
mixer.clipAction(await loadMixamoAnimation("/dance.fbx", avatar.vrm)).play();
avatar.registerUpdate((delta) => mixer.update(delta));

jiggle.attach(avatar); // after the mixer, whatever order they were created in
```

### On top of the procedural animator

The same, with the animator in the mixer's place. A procedural layer that
changes (`anim.remove(layer)`) or a driver you rebuild does not disturb it.

### A standing model that is faintly alive

```ts
jiggle.ambient = 0.3; // m/s², a seeded drift — the same every run
```

### Switch it off for a moment

```ts
jiggle.enabled = false; // removes every nudge at once
jiggle.enabled = true;  // springs restart from rest
```

### Tuning by feel

| You want | Change |
| --- | --- |
| Heavier, slower | lower `hz`, raise `length` |
| Tighter shiver | raise `hz`, lower `length` |
| Rings longer | lower `damping` |
| Settles at once | raise `damping` toward `1` |
| More of everything | raise `intensity`, or one bone's `gain` |
| A vertical bounce to read as a nod | tilt `lever` forward |
| It folds too far on a landing | lower `maxAngle` |

## What it doesn't do

- **It doesn't bake.** Its input is the rig's *actual* motion, and
  `bakeAnimator` never moves the rig. Bake the base motion and run jiggle live
  on top.
- **It isn't collision or cloth.** It is one damped spring per bone, driven by
  acceleration. Hair and skirts are the model's spring bones' job — and those run
  in `vrm.update`, after this.
- **It needs motion.** A model that doesn't move doesn't jiggle (unless `ambient`
  is set). That is the point; it isn't an idle animation.

## Tests

`src/jiggle/vrm-jiggle.test.ts` runs the physics against a fake rig built from
**real** three.js objects — so the world-space acceleration, quaternion and
mirroring math is three's own, not a mock of it. It covers the spring's response
and decay, the VRM 0.x mirroring, cascading through a chain, moving the whole
scene, the write-through layering against a base that something else rewrites
each frame, retuning mid-motion, non-humanoid nodes, and `attach`. The
`registerUpdate` ordering is covered in the loader's tests, and again in the
React and Solid bindings'.
