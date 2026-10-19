# Fano VRM Controller — Solid Example

Solid bindings for loading, driving, and disposing VRM avatars. Four
primitives, imported from `@fanoalone/vrm-controller/solid`:

```tsx
import { createVRM, createFrameLoop } from "@fanoalone/vrm-controller/solid";

function Avatar(props: { scene: THREE.Scene; renderer: THREE.WebGLRenderer }) {
  const vrm = createVRM("/avatar.vrm", { scene: props.scene });

  createFrameLoop((delta) => {
    vrm.avatar()?.update(delta); // spring bones, look-at, every registered driver
    props.renderer.render(props.scene, camera);
  });

  return <p>{vrm.loading() ? "Loading…" : "Ready"}</p>;
}
```

That's the whole integration. Loading tracks the url, disposal follows the
owning scope, and the frame loop cancels itself on unmount.

Four primitives are all it takes because the rest of the package doesn't need
Solid-specific wrappers: face control, lip-sync, body posing, Mixamo
retargeting, procedural animation and baking are framework-agnostic, and
[Driving the rest of the package](#driving-the-rest-of-the-package) gives each
of them a Solid recipe.

The live demo is [`solid-example.html`](./solid-example.html).

## Running the demo

```bash
bun run build          # produce dist/ (the demo imports ../../dist/solid.js)
bunx serve .           # serve the repo root on http://localhost:3000
# open http://localhost:3000/docs/solid-example/solid-example.html
```

Put a model named `avatar.vrm` in the repo root, and your Mixamo `.fbx`
downloads in an `animation/` folder next to it — same layout as the other
examples. Edit `CLIP_PRESETS` in the HTML to match whatever you downloaded;
Mixamo's default names contain spaces, which the demo `encodeURI()`s rather
than making you rename files. Everything except the Mixamo section works
without any `.fbx`.

It's the whole package on one page:

| Section | Exercises |
| --- | --- |
| Model source | Reactive url, file picker, `keepPrevious`, disposal |
| Frame loop | `createFrameLoop`, pause/resume, fps |
| Body driver | The four mutually exclusive rig owners, and the handover between them |
| ⤷ Procedural | Each idle layer (breathing, weight shift, wander, hip bob) and look-at as its own toggle, gestures with a speed slider, bake-to-clip |
| ⤷ Mixamo clip | Retarget on demand, crossfade between clips, playback speed |
| ⤷ Manual pose | `createVRMBody` — per-joint degree sliders, snapshot/restore |
| Face | Emotions with an intensity slider, brows with a weight slider, auto-blink, gaze, manual eyelid and left/right wink, manual gaze angles |
| Visemes | Five vowel sliders, plus a simulated speech stream |
| Jiggle physics | Master switch, a bouncing/shaking avatar to drive it, zones, intensity / ambient / smoothing |
| Jiggle — one bone | Any humanoid bone or model node, every option as a slider, pokes, a live per-bone angle readout |
| Declarative mount | A second avatar through the `Vrm` component |

The thing worth watching: **swap the model while everything is running.** Every
control re-applies itself to the new avatar — the emotion you picked, the
gesture that was playing, the joints you posed, which bones jiggle and how
each is tuned — without a line of resynchronisation code. That falls out of the pattern in
[Driving the rest of the package](#driving-the-rest-of-the-package).

The demo has **no build step**, so it wires the panel to the DOM by hand
inside `createRoot` instead of rendering JSX. A real app writes
`<p>{vrm.loading() ? … : …}</p>` and gets its scope from `render()`; every
`createEffect` in that file is standing in for one JSX expression.

## Install

```bash
bun install @fanoalone/vrm-controller three @pixiv/three-vrm solid-js
```

`solid-js` is an **optional peer dependency** — only the `/solid` entry point
touches it, so plain three.js and React consumers never resolve it.

| Import path | Consumes | Use it for |
| --- | --- | --- |
| `@fanoalone/vrm-controller` | three + @pixiv/three-vrm | Loading, face, Mixamo, body, procedural animation |
| `@fanoalone/vrm-controller/solid` | + solid-js | The primitives on this page |
| `@fanoalone/vrm-controller/r3f` | + react + @react-three/fiber | `<Vrm>` / `useVRM()` for React Three Fiber |

Everything except the four primitives below comes from the **root** entry and
is framework-agnostic — `createVRMFace`, `createVRMBody`,
`loadMixamoAnimation`, the procedural animation system. The `/solid` entry
adds lifecycle, not features.

**No compiler plugin is needed for this package.** The `/solid` entry ships
plain function calls and no JSX, so `babel-preset-solid` never has to run over
`dist/`. Your own components still need `vite-plugin-solid`, exactly as usual.

## Why there is no `<Canvas>`

React's binding can lean on React Three Fiber: it is a real reconciler, so
`<Vrm>` can render a `<primitive>` into the scene graph and `useFrame` can
hang off a renderer-owned loop. Solid has no equivalent that's ready to lean
on — `solid-three` describes itself as early development and not production
ready — so this entry point takes the other route and depends on **nothing but
`solid-js`**.

The consequence is that you keep the three.js code you already have. Create
the renderer, scene, and camera however you like; the primitives here manage
what goes *into* that scene and when it goes away. If a Solid renderer for
three.js matures later, none of this changes — an avatar is still driven by
`avatar.update(delta)` from whatever owns the frame.

---

## 1. `createVRM(url, options?)`

Loads a VRM and ties its lifetime to the current Solid scope.

```ts
const vrm = createVRM("/avatar.vrm", { scene });

vrm.avatar();    // VRMAvatar | null
vrm.loading();   // boolean
vrm.progress();  // { loaded, total, progress } | null
vrm.error();     // unknown
vrm.resource;    // Resource<VRMAvatar | undefined> — for <Suspense>
vrm.refetch();   // retry
```

### The url is reactive

Pass a signal, a derived accessor, or a plain string — anything is accepted
wherever this page says "accessor or value":

```ts
const [url, setUrl] = createSignal("/a.vrm");

const vrm = createVRM(url);                       // signal
const vrm = createVRM(() => models()[index()]);   // derived
const vrm = createVRM("/fixed.vrm");              // constant
```

A change reloads. The previous avatar is disposed for you — geometries,
materials, and textures — and removed from the scene it was attached to.

### A falsy url loads nothing

`undefined`, `null`, `false`, and `""` all mean "no model", the same
convention `createResource` uses. Conditional loading therefore needs no
branch, and clearing the url releases whatever was loaded:

```ts
const vrm = createVRM(() => selected()?.url); // idles until something is selected
```

### Options

| Option | Type | Description |
| --- | --- | --- |
| `scene` | accessor or value of `THREE.Object3D` | Parent to add `avatar.scene` to. Re-attaches if either side changes, detaches on cleanup. May be `null` at first — a scene created later in `onMount` is fine. |
| `vrmLoadOptions` | `VRMLoaderPluginOptions` | Forwarded to `VRMLoaderPlugin`. Read untracked, so it never triggers a reload. |
| `keepPrevious` | accessor or value of `boolean` | Hold the current avatar until the next one finishes loading. Default `false`. |

`keepPrevious` is the swap-flicker trade-off. Off (the default), `avatar()`
goes null the moment the url changes, so what you render always matches the
url that produced it. On, the old model stays on screen through the load —
smoother, but `avatar()` briefly disagrees with the requested url and both
models sit in GPU memory until the new one lands.

### What it returns

| Field | Type | Notes |
| --- | --- | --- |
| `avatar` | `Accessor<VRMAvatar \| null>` | Never throws. `null` while loading, on failure, and for a falsy url. |
| `loading` | `Accessor<boolean>` | True while a load is in flight. |
| `progress` | `Accessor<VRMLoadProgress \| null>` | Reset to `null` at the start of each load. |
| `error` | `Accessor<unknown>` | The rejection reason, or `undefined`. Reading it does not re-throw. |
| `resource` | `Resource<VRMAvatar \| undefined>` | The underlying resource — opt in to Suspense semantics. |
| `refetch` | `() => void` | Re-run the current url, e.g. to retry after a failure. |

### Suspense and ErrorBoundary, if you want them

`avatar()` is deliberately inert: it returns `null` and sets `error()`, so a
failed load can't blow away a subtree that has no `<ErrorBoundary>` around it.
When you *do* want Solid's async control flow, read `resource()` instead —
that suspends while loading and throws on failure, as any resource does:

```tsx
<ErrorBoundary fallback={(err) => <p>Could not load: {String(err)}</p>}>
  <Suspense fallback={<Spinner />}>
    <Stage avatar={vrm.resource()} />
  </Suspense>
</ErrorBoundary>
```

Both views are the same load. Pick one per component; mixing them just means
the fallback and your own `loading()` check say the same thing twice.

### Disposal, and the races it covers

Everything below is handled without a call from you:

| Situation | What happens |
| --- | --- |
| url changes | Previous avatar disposed and detached; new one loaded. |
| url becomes falsy | Current avatar disposed; nothing loaded. |
| Scope disposed (unmount) | Current avatar disposed and detached. |
| Load finishes after the url already changed again | The late arrival is disposed on the spot and never becomes visible. |
| Load finishes after unmount | Disposed on arrival. |
| `scene` accessor changes | Avatar moved from the old parent to the new one. |

The last two are the ones that leak in hand-rolled code: an in-flight
`loadVRM` can't be cancelled, so the avatar *will* arrive, and whoever asked
for it may already be gone. Each load internally takes a ticket, and an avatar
holding a stale ticket is disposed instead of shown.

### Server-side rendering

`createVRM` loads nothing unless `window` and `document` exist, so a component
using it renders during SSR (in SolidStart, say) and starts loading on the
client. three's loaders decode textures through DOM image APIs; attempting a
load on the server would either crash or download a whole model server-side to
throw it away. `createFrameLoop` is inert there for the same reason.

---

## 2. `createFrameLoop(callback, options?)`

Solid has no renderer-owned frame hook, so this is the loop. Deltas are in
**seconds**, matching `avatar.update(delta)` and every other time input in the
package.

```ts
const loop = createFrameLoop((delta, elapsed) => {
  vrm.avatar()?.update(delta);
  renderer.render(scene, camera);
});

loop.running(); // reactive boolean
loop.stop();
loop.start();
```

It cancels the pending frame on cleanup, and is a no-op outside a browser.

| Option | Default | Description |
| --- | --- | --- |
| `paused` | `false` | Accessor or value. While it reads true the loop is suspended and resumes when it flips back. |
| `maxDelta` | `0.1` | Largest delta handed to the callback, in seconds. |
| `autoStart` | `true` | Start as soon as the owning scope mounts. |

**Why `maxDelta` exists.** `requestAnimationFrame` stops firing in a
backgrounded tab, so the first frame after you return carries the entire gap —
often several seconds. Feed that to spring bones (or any integrator) and the
avatar's hair and skirt visibly detonate on tab focus. Clamping trades a
moment of slow-motion catch-up for not doing that. Raise it if you integrate
something that genuinely needs real elapsed time, and track that separately.

**`paused` and `stop()` are different things.** `paused` is external
suspension; `start()`/`stop()` is your intent. The loop runs when you want it
to run *and* it isn't paused, so unpausing doesn't resurrect a loop you
explicitly stopped:

```ts
const [hidden, setHidden] = createSignal(false);
const loop = createFrameLoop(render, { paused: hidden });

setHidden(true);   // suspended
loop.stop();       // and now also not wanted
setHidden(false);  // still stopped — `paused` didn't override the stop()
loop.start();      // running again
```

Restarting resets the clock, so time spent stopped is never delivered as a
delta.

A throw inside your callback costs one frame, not the loop — the next frame is
scheduled before the callback runs.

---

## 3. `createVRMUpdate(avatar, fn, options?)`

The reactive form of `avatar.registerUpdate(fn)` — the one seam every feature
in this package hooks into. Callbacks registered this way run each frame
*before* `vrm.update(delta)`, so spring bones and look-at always react to the
final pose.

```ts
createVRMUpdate(vrm.avatar, (delta) => {
  face()?.update(delta);
  mixer()?.update(delta);
});
```

Why not just call `avatar.registerUpdate` in an `onMount`? Because the avatar
changes identity. On a url swap the old avatar is disposed and a new one takes
its place, and a hand-rolled registration is left bound to a dead model — the
new one silently never blinks. `createVRMUpdate` re-registers on every avatar
change and unregisters on cleanup.

It accepts an accessor or a plain avatar, so it works just as well inside an
`onLoad` handler as against `createVRM`.

### `options.order`

Callbacks run in registration order by default. When something has to run on
top of the rig's animation, give it an `order` — lower runs first, ties keep
registration order, default `0`:

```ts
createVRMUpdate(vrm.avatar, (delta) => jiggle()?.update(delta), {
  order: JIGGLE_UPDATE_ORDER, // 100 — after every default-order driver
});
```

It is read when the registration is made, so it isn't reactive: a signal passed
as `order` is not tracked. Register once with the order you mean.

In a demo with a single dispatching driver, registration order happens to work.
The moment a driver registers *later* — a component that mounts its own, a mode
that re-registers on switch — only an explicit order keeps a post-process on top.

---

## 4. `Vrm` — the declarative mount

```tsx
<Show when={visible()}>
  <Vrm url={url()} scene={scene} onLoad={(a) => setAvatar(a)} />
</Show>
```

Renders nothing to the DOM — the avatar lives in a three.js scene, not the
document — so it's a side-effect component in the mould of `<Title>` or
`<Route>`. What it buys over calling `createVRM` yourself is Solid's own
control flow as the lifecycle: `<Show>` unmounting disposes the model, and
`<For>` over a list of urls manages one avatar per entry, disposal included.

| Prop | Description |
| --- | --- |
| `url` | The `.vrm` to load. Falsy loads nothing. |
| `scene` | Parent `THREE.Object3D` to add the loaded scene to. |
| `vrmLoadOptions` | Forwarded to the VRM loader. |
| `keepPrevious` | See `createVRM`. |
| `onLoad` | Called with each newly loaded `VRMAvatar`. |
| `onProgress` | Called with each progress event. |
| `onError` | Called if a load fails. |

It does **not** drive frames — nothing in a Solid tree owns a render loop.
Pair it with `createFrameLoop` and advance the avatars you collected from
`onLoad`.

## 5. `access(value)` and the `MaybeAccessor` convention

Every reactive input above takes either a value or a function returning one.
`access` is the unwrapper, exported because it's part of the calling
convention rather than an internal detail — reach for it when you write your
own primitive on top of these:

```ts
import { access, type MaybeAccessor } from "@fanoalone/vrm-controller/solid";

function createBlinkRate(rate: MaybeAccessor<number>) {
  createEffect(() => console.log(access(rate)));
}
```

Reading happens at the call site, so calling `access()` inside an effect
subscribes exactly as reading the accessor directly would. Solid's props
getters unwrap through it too, which is what makes
`{ get scene() { return props.scene } }` stay reactive.

---

## Driving the rest of the package

Face, lip-sync, body posing, Mixamo, procedural animation and baking are all
framework-agnostic — they come from the root entry and are built from
`avatar.vrm`. Wiring any of them into Solid is the same three ideas:

1. **A `createMemo` keyed on the avatar builds the controller.** It rebuilds on
   a model swap; the old one is garbage. None of these controllers own GPU
   resources, so there is nothing to dispose by hand.
2. **`createVRMUpdate` registers whatever needs a frame.** One registration
   that dispatches beats several that fight over order.
3. **State lives in signals; the model is a projection of it.** This is the one
   that pays for itself — see below.

| Feature | Root-entry API | Solid shape |
| --- | --- | --- |
| Expressions, brows | `createVRMFace` | Memo + one effect per control |
| Lip-sync | `face.viseme` | Effect over a weights signal, or drive it from the frame loop |
| Auto-blink, gaze | `face.eye` | Memo + `createVRMUpdate` (the only face state that ticks) |
| Body posing | `createVRMBody` | Memo + one effect over a pose signal |
| Mixamo | `loadMixamoAnimation` | `createResource` keyed on avatar **and** url, + a mixer memo |
| Procedural | `createProceduralAnimator` | Memo + `createVRMUpdate` |
| Gestures | `createGestureAnimator` | Signal → effect calling `play` / `stop` |
| Baking | `bakeAnimator` | A plain function call. No reactivity involved. |

### The projection rule

The tempting way to apply a control is to do it where the click happens:

```ts
// Don't. The avatar can be replaced underneath you.
<button onClick={() => face()?.emotion.setExclusive("happy")}>Happy</button>
```

That works right up until the model changes — the new avatar gets a fresh
`VRMFace` that knows nothing about the click, and the expression silently
resets. Put the choice in a signal instead, and make the model an effect of it:

```ts
const [emotion, setEmotion] = createSignal<string | null>(null);

createEffect(() => {
  const current = face();
  if (!current) return;
  const name = emotion();
  if (name) current.emotion.setExclusive(name);
  else current.emotion.reset();
});

<button onClick={() => setEmotion("happy")}>Happy</button>
```

Now the effect depends on *both* the controller and the choice, so it re-runs
when either changes. Swapping models re-applies every control you have written
this way, for free — that's what the demo is showing off when a swap mid-scene
keeps the expression, the gesture, and the posed joints.

Only two kinds of thing don't fit the rule: per-frame work (that's
`createVRMUpdate`) and genuine one-shot events like "bake a clip now".

### Face, expressions and brows

```ts
const face = createMemo(() => {
  const avatar = vrm.avatar();
  return avatar ? createVRMFace(avatar.vrm) : null;
});

// The auto-blink FSM is the only part of the face that ticks.
createVRMUpdate(vrm.avatar, (delta) => face()?.update(delta));
```

Everything else is a projection of state:

```ts
createEffect(() => {
  const current = face();
  if (!current) return;
  if (autoBlinkOn()) current.eye.autoBlink();
  else current.eye.stopAutoBlink();
});

createEffect(() => {
  const current = face();
  if (!current) return;
  if (gazeOn()) current.eye.gaze(camera); // eyes, via VRMLookAt
  else current.eye.clearGaze();
});

createEffect(() => {
  const current = face();
  if (!current) return;
  const shape = brow();
  if (shape) current.brow.setExclusive(shape);
  else current.brow.reset();
});
```

Build emotion UI from `list()` rather than the preset catalog — it reports
what *this* rig can actually show, which is not the same as what the spec
allows. Inside a memo it's reactive, so the buttons follow the model:

```tsx
<For each={face()?.emotion.list() ?? []}>
  {(name) => (
    <button
      classList={{ active: emotion() === name }}
      onClick={() => setEmotion((prev) => (prev === name ? null : name))}
    >
      {name}
    </button>
  )}
</For>
```

**Brows are the trap.** `emotion.list()` and `viseme.list()` return *drivable
preset names*, so they round-trip straight back into `set()`. `brow.list()`
does not — it returns the raw **morph target names** it found
(`"Fcl_BRW_Angry"`, …), because the VRM standard has no eyebrow preset to name.
`brow.set()` wants a canonical shape from `brow.shapes` (`"angry"`, `"fun"`,
`"joy"`, `"sorrow"`, `"surprised"`, plus English aliases) and resolves it
through the fuzzy matcher. Feed a morph name back in and the patterns become
`/Fcl_BRW_Fcl_BRW_Angry/` — no match, no error, **nothing happens**.

So drive brows from `shapes`, and use `brow.list()` (or `brow.available`) only
to answer "does this model ship eyebrow morphs at all":

```tsx
<Show when={face()?.brow.available} fallback={<p>No eyebrow morphs.</p>}>
  <For each={face()!.brow.shapes}>
    {(shape) => <button onClick={() => setBrow(shape)}>{shape}</button>}
  </For>
</Show>
```

To match the emotion row exactly — only offering shapes that resolve on this
rig — filter with the same matcher the controller uses internally:

```ts
const browShapes = createMemo(() => {
  const current = face();
  if (!current) return [];
  return current.brow.shapes.filter((shape) =>
    current.morph.matchMorph(createBrowPatterns(shape)),
  );
});
```

`createBrowPatterns` and `face.morph` (the raw `VRMFaceController`) are both
public — this is the escape hatch working as intended.

### Lip-sync

Visemes are five weights. If they come from UI or a state machine, they're a
signal like anything else:

```ts
const [visemes, setVisemes] = createSignal<Record<string, number>>({});

createEffect(() => face()?.viseme.setAll(visemes()));
```

If they come from an audio analyser or a TTS viseme stream, they change every
frame, and pushing sixty signal updates a second through the reactive graph
buys you nothing. Drive them from the frame registration instead:

```ts
createVRMUpdate(vrm.avatar, (delta) => {
  face()?.update(delta);

  if (speaking()) {
    elapsed += delta;
    face()?.viseme.setAll(analyser.sample(elapsed)); // straight to the model
  }
});
```

Both paths write the same five weights, so pick one owner at a time — the demo
has the per-frame path suppress the slider effect while it runs. Nothing here
manages timing or interpolation for you; `setAll` zeroes every viseme you leave
out, so a full shape each frame is the intended usage.

### Body posing

```ts
const body = createMemo(() => {
  const avatar = vrm.avatar();
  return avatar ? createVRMBody(avatar.vrm) : null;
});
```

No `createVRMUpdate` here — body posing has no time-based state, so there's
nothing to advance per frame. A write is recorded immediately and reaches the
mesh on the next `vrm.update(delta)`, which the frame loop already calls.

Hold the pose as data and apply the whole thing in one effect, so it survives a
model swap the same way the face controls do:

```ts
const [pose, setPose] = createSignal<Record<string, { x?: number; y?: number; z?: number }>>({});

createEffect(() => {
  const target = body();
  if (!target) return;

  target.resetPose();
  for (const [bone, euler] of Object.entries(pose())) {
    target.setEulerDegrees(bone, euler);
  }
});

setPose((prev) => ({ ...prev, leftUpperArm: { z: -45 } }));
```

Resetting first is what makes it declarative: removing a bone from the map
relaxes that joint instead of leaving it where it was. Build the joint list
from `body().listBones()` — only 15 bones are mandated by the VRM spec, so
fingers, shoulders, toes, eyes and jaw may simply not be there.

`getPose()` / `setPose()` round-trip the raw `VRMPose` rather than degrees, so
treat a snapshot as opaque: restore it, don't try to merge it back into a
degree map.

### One rig, one owner

A Mixamo `AnimationMixer`, a procedural animator, and manual posing all write
`vrm.humanoid`'s normalized bone rig. The procedural animator writes every bone
it owns on *every* frame, so running two of them means whichever goes last
wins. This is a **mode**, not a set of checkboxes:

```ts
type BodyMode = "procedural" | "clip" | "manual" | "off";
const [bodyMode, setBodyMode] = createSignal<BodyMode>("procedural");

// One registration that dispatches, rather than several that fight.
createVRMUpdate(vrm.avatar, (delta) => {
  face()?.update(delta); // expressions never collide with bones — always safe

  const mode = bodyMode();
  if (mode === "procedural") anim()?.update(delta);
  else if (mode === "clip") mixer()?.update(delta);
});
```

Switching modes has to hand the rig back, or the last pose stays frozen on the
model. `on(..., { defer: true })` gives you the previous mode and skips the
initial run — there's no previous owner to release on mount:

```ts
createEffect(
  on(
    bodyMode,
    (mode, previous) => {
      if (previous === "procedural") anim()?.reset();   // bones back to rest
      if (previous === "clip") {
        mixer()?.stopAllAction();
        body()?.resetPose();                            // stopping doesn't unpose
      }
      if (previous === "manual") body()?.resetPose();
    },
    { defer: true },
  ),
);
```

`stopAllAction()` deserves the callout: it stops evaluating, it doesn't restore
the rest pose, so without the `resetPose()` the avatar freezes mid-dance.

Face control sits outside all of this. Expression weights and bone poses never
overlap, so auto-blink, gaze, emotions and visemes run in every mode.

Jiggle physics sits outside it too, for a different reason: it owns no bones. It
adds a small lean on top of whatever the active mode wrote, so it runs in every
mode and needs no handover — see [Jiggle physics](#jiggle-physics).

### Mixamo clips

Two pieces: a mixer that belongs to the current rig, and a clip retargeted onto
that same rig.

```ts
let currentAction: THREE.AnimationAction | null = null;

const mixer = createMemo(() => {
  const avatar = vrm.avatar();
  // Actions belong to the mixer that made them; a new rig invalidates them.
  currentAction = null;
  return avatar ? new THREE.AnimationMixer(avatar.vrm.scene) : null;
});

const [clip] = createResource(
  () => {
    const avatar = vrm.avatar();
    const url = clipUrl();
    return avatar && url ? { avatar, url } : false;
  },
  ({ avatar, url }) => loadMixamoAnimation(url, avatar.vrm),
);
```

**Key the resource on the avatar as well as the url.** A clip is retargeted
onto one specific rig — hips position scale is computed from that model's
proportions — so a clip built for the previous avatar is wrong for the next
one, not merely stale. The compound source refetches when either changes.

Playback is ordinary three.js; this package deliberately ships no playback
controller, so crossfading is yours:

```ts
createEffect(() => {
  // Reading an errored resource re-throws — check `.error` before `clip()`.
  const loaded = clip.error ? null : clip();
  const current = mixer();
  if (!loaded || !current || bodyMode() !== "clip") return;

  untrack(() => {
    const next = current.clipAction(loaded);
    next.reset().play();
    if (currentAction && currentAction !== next) {
      currentAction.crossFadeTo(next, 0.35, false);
    }
    currentAction = next;
  });
});
```

The `untrack` matters: without it, anything the playback code reads becomes a
dependency of the effect, and a stray read turns "play this clip" into a loop.

### Procedural animation and gestures

Keep the layers next to the stack so the toggles can add and remove them:

```ts
const anim = createMemo(() => {
  const avatar = vrm.avatar();
  if (!avatar) return null;

  const gesture = createGestureAnimator(GESTURES);
  const idle = createIdleAnimator();
  const look = createLookAtAnimator({ target: camera });

  return { animator: createProceduralAnimator(avatar.vrm, [gesture]), gesture, idle, look };
});

createVRMUpdate(vrm.avatar, (delta) => {
  if (bodyMode() === "procedural") anim()?.animator.update(delta);
});
```

Composition order matters — base motion first, small additions after — so a
toggle rebuilds the stack rather than patching it. Re-adding a layer would
otherwise put it on top of everything:

```ts
createEffect(() => {
  const stack = anim();
  if (!stack) return;

  const wantIdle = idleOn();
  const wantLook = lookAtOn();

  untrack(() => {
    for (const layer of [...stack.animator.getLayers()]) stack.animator.remove(layer);
    stack.animator.add(stack.gesture);
    if (wantIdle) stack.animator.add(stack.idle);
    if (wantLook) stack.animator.add(stack.look);
  });
});
```

A removed layer's bones relax to rest on the next frame, because the
accumulator re-emits untouched bones as identity — you don't have to reset
anything by hand.

Gestures are fired rather than held, but keeping the name in a signal still
pays: it's what replays the gesture on a model swap, and it makes "stop" the
same code path as "play nothing".

```ts
createEffect(() => {
  const stack = anim();
  const name = gestureName();
  if (!stack) return;

  if (name) stack.gesture.play(name, { crossFade: 0.3 });
  else stack.gesture.stop({ crossFade: 0.3 });
});
```

A non-looping gesture releases itself at the end and the idle underneath takes
back over, so `gestureName` going stale is harmless — but `stack.gesture.current`
is the truth if you want to display what's actually playing.

### Baking to a clip

`bakeAnimator` is a plain function: no avatar lifetime, no reactivity, no
per-frame anything. It samples an animator offline and hands back an ordinary
`THREE.AnimationClip`, which then plays through the mixer exactly like a Mixamo
one.

```ts
function bakeIdle() {
  const avatar = vrm.avatar();
  if (!avatar) return;

  // Position tracks read rest from the rig at bake time, so the live stack
  // hands the bones back first. (Baking itself never touches the model — it
  // runs against a recording sink.)
  setBodyMode("off");

  const clip = bakeAnimator(avatar.vrm, createIdleAnimator(), {
    duration: 8,
    fps: 30,
    loop: true, // last sample == first, so LoopRepeat has no seam
    name: "baked-idle",
  });

  mixer()!.clipAction(clip).reset().play();
  setBodyMode("clip");
}
```

Baking is reproducible — nothing in the signal library calls `Math.random()`,
the animator is reset before sampling, and the timestep is fixed — so this is
safe to do at build time and ship the clip instead, if you'd rather.

### Jiggle physics

Jiggle follows the same three ideas as everything else: a memo builds the
controller per model, `createVRMUpdate` runs it, and **the state is a signal**
that an effect projects onto the model.

```ts
import { createVRMJiggle, JIGGLE_UPDATE_ORDER, JIGGLE_ZONES } from "@fanoalone/vrm-controller";

const [jiggleOn, setJiggleOn] = createSignal(true);
const [jiggleBones, setJiggleBones] = createSignal<ReadonlySet<string>>(
  new Set([...JIGGLE_ZONES.chest, ...JIGGLE_ZONES.hips]),
);
const [tuning, setTuning] = createSignal<Record<string, JiggleBoneOptions>>({});

// 1. A controller per model, built empty — the effects below fill it in.
const jiggle = createMemo(() => {
  const avatar = vrm.avatar();
  return avatar ? createVRMJiggle(avatar.vrm, { zones: [] }) : null;
});

// 2. Run it LAST, whatever else registers and whenever.
createVRMUpdate(vrm.avatar, (delta) => jiggle()?.update(delta), {
  order: JIGGLE_UPDATE_ORDER,
});

// 3. The controller is a projection of the signals.
createEffect(() => {
  const current = jiggle();
  if (current) current.enabled = jiggleOn();
});

createEffect(() => {
  const current = jiggle();
  if (!current) return;

  const bones = jiggleBones();
  const options = tuning();

  for (const target of current.list()) if (!bones.has(target)) current.disable(target);
  for (const target of bones) current.enable(target, options[target]);
});
```

Two details make the second effect safe to re-run on every slider tick:

- **`enable()` on a bone that is already on retunes it** and keeps its spring
  moving, so a slider drags smoothly rather than restarting the wobble.
- Because the effect depends on `jiggle()` as well as the signals, a **model swap
  re-applies every bone and every tuning value** to the new controller.

Dropping a bone's overrides is the one thing re-running can't do — the
controller has merged them already. To reset a bone, `disable()` it first and let
the effect turn it back on with its defaults (the demo's *Reset this bone*
button).

Bone sliders should show what the controller **resolved** (a preset, or the
node's own axis), not what you stored, so read `jiggle().getOptions(target)`
after the effect has applied — the demo syncs them inside the same effect.

To give it something to react to, the demo moves the whole avatar:

```ts
createEffect(() => {
  const avatar = vrm.avatar();
  if (!avatar || jiggleMotion() === "none") return;

  const home = avatar.scene.position.clone();
  let time = 0;

  onCleanup(
    avatar.registerUpdate((delta) => {
      time += delta;
      // |sin| lands hard at the bottom of every hop — that's the spike in
      // acceleration the soft mass lags behind.
      avatar.scene.position.y = home.y + Math.abs(Math.sin(time * Math.PI * 1.4)) * 0.12;
    }),
  );
  onCleanup(() => avatar.scene.position.copy(home));
});
```

`jiggle.attach(avatar)` does the registration in step 2 for you, in a plain
effect, and its returned function also takes the nudges off the rig:

```ts
createEffect(() => {
  const avatar = vrm.avatar();
  const current = jiggle();
  if (avatar && current) onCleanup(current.attach(avatar));
});
```

See [`../jiggle-example/jiggle-example.md`](../jiggle-example/jiggle-example.md)
for the physics, every option, and the guards.

## A complete component

```tsx
import { createMemo, createSignal, onMount } from "solid-js";
import * as THREE from "three";
import { createVRMFace } from "@fanoalone/vrm-controller";
import {
  createVRM,
  createVRMUpdate,
  createFrameLoop,
} from "@fanoalone/vrm-controller/solid";

export function AvatarStage(props: { url: string; mood: string }) {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>();
  const [scene, setScene] = createSignal<THREE.Scene>();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 1.3, 2.6);

  let renderer: THREE.WebGLRenderer | undefined;

  onMount(() => {
    const next = new THREE.Scene();
    next.add(new THREE.AmbientLight(0xffffff, 1.4));

    renderer = new THREE.WebGLRenderer({ canvas: canvas()!, antialias: true });
    renderer.setSize(canvas()!.clientWidth, canvas()!.clientHeight);
    camera.aspect = canvas()!.clientWidth / canvas()!.clientHeight;
    camera.updateProjectionMatrix();

    setScene(next);
    onCleanup(() => renderer?.dispose());
  });

  // `scene` is undefined on the first pass and set in onMount — passing the
  // accessor lets the avatar attach itself as soon as there's a scene.
  const vrm = createVRM(() => props.url, { scene });

  const face = createMemo(() => {
    const avatar = vrm.avatar();
    if (!avatar) return null;
    const controller = createVRMFace(avatar.vrm);
    controller.eye.autoBlink();
    controller.eye.gaze(camera);
    return controller;
  });

  createVRMUpdate(vrm.avatar, (delta) => face()?.update(delta));
  createEffect(() => face()?.emotion.setExclusive(props.mood));

  createFrameLoop((delta) => {
    vrm.avatar()?.update(delta);
    const current = scene();
    if (current && renderer) renderer.render(current, camera);
  });

  return (
    <>
      <canvas ref={setCanvas} />
      <Show when={vrm.loading()}>
        <progress value={vrm.progress()?.progress ?? 0} />
      </Show>
      <Show when={vrm.error()}>
        <button onClick={vrm.refetch}>Retry</button>
      </Show>
    </>
  );
}
```

Nothing in there disposes an avatar, cancels a frame, or unregisters a
callback. Unmounting the component does all three.

## Gotchas

**Don't destructure the result.** `const { avatar } = createVRM(...)` is fine
— these are accessors, not values — but `const avatar = vrm.avatar()` at the
top of a component captures one moment and never updates. Call the accessor
where you use it.

**Don't call `avatar.update(delta)` twice.** It runs every registered updater
*and* `vrm.update`. Once per frame, in one place — the frame loop. If you
register a driver with `createVRMUpdate`, don't also call it yourself.

**Order is not reactive.** `createVRMUpdate(avatar, fn, { order })` reads `order`
once, when it registers. To change where a callback runs, register it again.

**`avatar()` is `null`, `resource()` is `undefined`.** Same load, different
absent-value conventions: the plain accessor is deliberately nullable, and the
resource follows Solid's own.

**`brow.list()` is not `emotion.list()`.** It returns morph target names, not
names you can pass back to `brow.set()`. Drive brows from `brow.shapes`. See
[Face, expressions and brows](#face-expressions-and-brows).

**Reading your *own* resources can throw.** `vrm.avatar()` is guarded, but a
`createResource` you write — the Mixamo clip, say — re-throws its rejection
when you read it. Outside an `<ErrorBoundary>` that escapes from inside an
effect. Check `resource.error` before calling `resource()`.

**Untrack the imperative tail of an effect.** Anything read while calling into
three.js — `clipAction`, `crossFadeTo`, an animator's `getLayers()` — becomes a
dependency of the surrounding effect. That's how "play this clip" quietly turns
into a loop. Track the inputs you meant to track, then `untrack` the work.

**Object URLs outlive the avatar.** If you load from a `File`,
`URL.revokeObjectURL` is yours to call — `createVRM` disposes the model, not
the url that named it. Revoke only after the load settles.

**Solid resolves its SSR build under the `node` condition.** In a test runner
(or anything else evaluating your components in Node), `solid-js` resolves to
`dist/server.js`, where `createSignal` and `createEffect` are inert stubs and
nothing reactive happens. This repo's `vitest.config.ts` pins
`resolve.conditions` to `["browser", "development"]`; the demo's import map
points at `dist/solid.js` for the same reason.

## API reference

| Export | Signature |
| --- | --- |
| `createVRM` | `(url: MaybeAccessor<VRMSource>, options?: CreateVRMOptions) => VRMResource` |
| `createFrameLoop` | `(callback: (delta: number, elapsed: number) => void, options?: CreateFrameLoopOptions) => FrameLoop` |
| `createVRMUpdate` | `(avatar: MaybeAccessor<VRMAvatar \| null \| undefined>, fn: (delta: number) => void, options?: { order?: number }) => void` |
| `Vrm` | `(props: VrmProps) => JSX.Element` |
| `access` | `<T>(value: MaybeAccessor<T>) => T` |

Types: `MaybeAccessor`, `VRMSource`, `CreateVRMOptions`, `VRMResource`,
`FrameLoopCallback`, `CreateFrameLoopOptions`, `FrameLoop`, `VrmProps`.

## References

- Solid reactivity — <https://docs.solidjs.com/concepts/intro-to-reactivity>
- `createResource` (what `vrm.resource` is) — <https://docs.solidjs.com/reference/basic-reactivity/create-resource>
- The loader and the `registerUpdate` seam — [`../loader-example/loader-example.md`](../loader-example/loader-example.md)
- Face control — [`../face-example/face-example.md`](../face-example/face-example.md)
- Procedural animation — [`../procedural-example/procedural-example.md`](../procedural-example/procedural-example.md)
- Jiggle physics — [`../jiggle-example/jiggle-example.md`](../jiggle-example/jiggle-example.md)
