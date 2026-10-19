# Fano VRM Controller — React Example

React bindings for loading, driving, and disposing VRM avatars, built around
one rule: **loading, progress and per-frame work never re-render the component
that set them up.** Imported from `@fanoalone/vrm-controller/react`:

```tsx
import {
  useVRM,
  useVRMProgress,
  useFrameLoop,
  type VRMHandle,
} from "@fanoalone/vrm-controller/react";

function Stage(props: {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.Camera;
}) {
  const { scene, renderer, camera } = props;
  const vrm = useVRM("/avatar.vrm", { scene }); // Stage does not re-render for this

  useFrameLoop((delta) => {
    vrm.update(delta); // spring bones, look-at, every registered driver
    renderer.render(scene, camera);
  });

  return <LoadingBar vrm={vrm} />;
}

function LoadingBar({ vrm }: { vrm: VRMHandle }) {
  const progress = useVRMProgress(vrm); // only this re-renders, once per percent
  return <progress value={progress ?? 0} max={1} />;
}
```

`Stage` renders once. The model loads, downloads, arrives, and animates at 60
frames a second, and `Stage` is not involved in any of it. `LoadingBar`
re-renders because it asked to.

There are two live demos — a Vite + React + TypeScript app in this folder that
exercises everything (per-bone posing, Mixamo clips, gestures, visemes, brows,
jiggle physics), and a smaller no-build page,
[`react-example.html`](./react-example.html). Both have a render counter on
screen, so you can watch the claim above instead of taking it on trust.

---

## Running the demo

Put a model named `avatar.vrm` in the repo root — same layout as the other
examples. The Mixamo clips in the Vite app come from the `animation/` folder next
to it; everything else works without any `.fbx`.

### The Vite app

How you would really write it: TSX, with the hooks imported from
`@fanoalone/vrm-controller/react` and type-checked against the built package's
`.d.ts` files.

```bash
bun run build          # in the repo root: produce dist/, which the app imports
cd docs/react-example
bun install
bun run dev            # http://localhost:5173 — serves ../../avatar.vrm at /avatar.vrm
bun run build          # tsc -b && vite build: type-checks the app against dist/
```

| File | What's in it |
| --- | --- |
| [`src/App.tsx`](./src/App.tsx) | `App`, the one component that calls `useVRM` and `useFrameLoop` |
| [`src/panels.tsx`](./src/panels.tsx) | The leaf components that subscribe to one thing — status, progress, error, the counters, the loop |
| [`src/RigPanel.tsx`](./src/RigPanel.tsx) | **Body** — [one rig, one owner](#one-rig-one-owner): procedural idle + gestures, Mixamo clips, manual per-bone pose |
| [`src/JigglePanel.tsx`](./src/JigglePanel.tsx) | **Jiggle physics** — zones, a per-bone editor, pokes, a live readout |
| [`src/FacePanel.tsx`](./src/FacePanel.tsx) | **Face** — mood, eyelids, gaze, visemes (with a simulated speech stream), brows |
| [`src/ui.tsx`](./src/ui.tsx) | `Section`, `Toggle`, `Slider`, and [`PerAvatar`](#sliders-that-dont-render) |
| [`src/useVRMFace.ts`](./src/useVRMFace.ts), [`src/useVRMBody.ts`](./src/useVRMBody.ts) | The [face hook](#a-face-hook) recipe, and its `VRMBody` twin |
| [`src/gestures.ts`](./src/gestures.ts) | The gesture keyframes and the clip list |
| [`src/world.ts`](./src/world.ts) | The three.js scene, camera and renderer — module scope, not React state |
| [`src/counters.ts`](./src/counters.ts) | The render counter |
| [`vite.config.ts`](./vite.config.ts) | How a local checkout of the package is wired in, and the middleware that serves `avatar.vrm` and `animation/*.fbx` |

What the Vite app exercises:

| Section | Exercises |
| --- | --- |
| Render counters | Per-panel render counts, written straight to the DOM so watching can't perturb them |
| Model source | `useVRM` url changes, `keepPrevious`, `refetch`, the error state, a falsy source |
| Frame loop | `useFrameLoop`'s stable controller — pausing re-renders only the button |
| Body | One owner at a time — **Procedural** (idle layers, look-at, gestures), **Mixamo clip** (four `.fbx` plus a baked idle, playback speed), **Manual pose** (any bone, X/Y/Z), or **None** |
| Jiggle physics | A bouncing or shaking avatar, zones, intensity / ambient / smoothing, and a per-bone editor over every humanoid bone and model node |
| Face — mood & eyes | `useVRMEffect` with deps: mood and intensity, auto-blink, gaze — all re-applied after a model swap — plus manual eyelids, winks and gaze angles |
| Face — mouth & brows | Five vowel sliders, a simulated speech stream, brow shapes and weight |
| Declarative mount | A second avatar through `<Vrm>`, its `ref`, and unmount-disposes |

Every panel is a `<details>`; the counters tell you which ones rendered. **Drag
any slider:** no counter moves. **Flip a toggle in one panel:** only that panel's
counter does.

Add **`?strict`** to the url to turn on `<StrictMode>`. The render counters
double (StrictMode renders everything twice in development — that is why it is
off by default), but the model is still fetched **once**: `useVRM` defers its
teardown by a microtask, so StrictMode's simulated unmount/remount cancels it.

In your own app, `bun add @fanoalone/vrm-controller` is all it takes. The
`alias`, `dedupe` and `paths` in `vite.config.ts` / `tsconfig.app.json` exist only
because here the package is the repo two folders up. `dedupe` is the one to
remember if you ever link a package locally: `dist/` sits outside the app, so its
own `import "react"` would resolve to a *different copy* of React than the app's
`react-dom` — and two Reacts break hooks (the same goes for `three`).

### The no-build page

```bash
bun run build          # produce dist/ (the page imports ../../dist/react.js)
bunx serve .           # in the repo root; serves it on http://localhost:3000
# open http://localhost:3000/docs/react-example/react-example.html
```

**The no-build page needs a network connection.** React is the one dependency it doesn't
serve from `node_modules`: the local copy is CommonJS, which a browser can't
load without a bundler, and the demo deliberately has none. The import map loads
`react`, `react-dom` and `htm` as ES modules from esm.sh instead. (`htm` stands
in for JSX — ``html`<${Foo} />` `` is `<Foo />`, and it compiles to nothing but
`React.createElement`.)

The no-build page is the original, smaller demo:

| Section | Exercises |
| --- | --- |
| Render counters | Per-component render counts, written straight to the DOM so watching can't perturb them |
| Model source | `useVRM` url changes, `keepPrevious`, `refetch`, the error state, a falsy source |
| Frame loop | `useFrameLoop`'s stable controller — pausing re-renders only the button |
| Face | `useVRMEffect` with deps: emotion, auto-blink, gaze — all re-applied after a model swap |
| Body | A procedural idle + look-at stack, registered and torn down by an effect |
| Declarative mount | A second avatar through `<Vrm>`, its `ref`, and unmount-disposes |

Things worth trying, with the counters visible:

1. **Load, then do nothing.** Frames climb. `Stage` stays at 1.
2. **Pause the loop.** Frames stop; no render count moves. The only thing that
   re-renders is the button's own label.
3. **Change the mood.** Only `FaceControls` re-renders.
4. **Press a source button.** `Stage` renders — you changed one of *its*
   inputs, which is the one legitimate reason for it to. `Status` re-renders
   twice (`loading`, `ready`); `Progress` re-renders tens of times, not
   hundreds, because progress is quantized.
5. **Swap models with a mood picked.** The mood is still applied to the new
   avatar. That is the [projection rule](#the-projection-rule) at work.

---

## Install

```bash
bun install @fanoalone/vrm-controller three @pixiv/three-vrm react
```

`react` is an **optional peer dependency** (`>=18`) — only the `/react` and
`/r3f` entry points touch it, so plain three.js and Solid consumers never
resolve it.

| Import path | Consumes | Use it for |
| --- | --- | --- |
| `@fanoalone/vrm-controller` | three + @pixiv/three-vrm | Loading, face, Mixamo, body, procedural animation |
| `@fanoalone/vrm-controller/react` | + react | The hooks on this page |
| `@fanoalone/vrm-controller/r3f` | + react + @react-three/fiber | `<Vrm>` / `useVRM()` inside a React Three Fiber `<Canvas>` |
| `@fanoalone/vrm-controller/solid` | + solid-js | `createVRM()` and a frame loop for Solid |

Everything except the hooks below comes from the **root** entry and is
framework-agnostic — `createVRMFace`, `createVRMBody`, `loadMixamoAnimation`,
the procedural animation system. The `/react` entry adds lifecycle, not
features.

**No compiler plugin is needed.** The entry ships plain function calls and no
JSX, so nothing has to transform `dist/`.

### `/react` or `/r3f`?

They solve different problems, and they can coexist in a project (they are
separate bundles).

- **`/r3f`** — you already render through React Three Fiber. `<Vrm>` renders a
  `<primitive>` into the R3F scene graph and `useFrame` drives it. Its `useVRM`
  keeps `avatar` / `loading` / `progress` in `useState`, so the calling
  component re-renders on every progress event.
- **`/react`** — you own the renderer, scene and camera (or you're embedding
  three.js in a React app without R3F). This entry depends on **nothing but
  `react`**, manages what goes *into* your scene and when it goes away, and is
  built so that none of that costs a render.

---

## The rendering contract

| What happens | What re-renders |
| --- | --- |
| The model starts loading, finishes, or fails | Only components that called `useVRMStatus` / `useVRMAvatar` / `useVRMError` |
| A progress event arrives | Only components that called `useVRMProgress` — at most once per whole percent |
| A frame ticks | **Nothing. Ever.** |
| The avatar is swapped | Only `useVRMAvatar` consumers; `useVRMEffect` cleanups and setups run with no render |
| You pass a fresh inline closure to a hook | Nothing — it is called through a ref |
| You pass a fresh `vrmLoadOptions` object | Nothing — it is read when a load starts |
| The `url` you pass to `useVRM` changes | The component that owns that url (it's its own input), and the model reloads |

Three mechanisms do all of it:

1. **A stable handle over an external store.** `useVRM` returns a
   [`VRMHandle`](#vrmhandle) whose identity never changes. The state lives in a
   small framework-free store, not in `useState`, so there is no setter for the
   calling component to re-render from. Because the handle is stable,
   `React.memo` on anything that receives it actually holds.
2. **Opt-in, per-value subscriptions.** `useVRMStatus`, `useVRMAvatar`,
   `useVRMError` and `useVRMProgress` each read one field through
   `useSyncExternalStore`, which re-renders only when *that field* changes. A
   component that asks for the status is not woken by a progress event.
3. **Latest-callback refs.** `useVRMUpdate`, `useVRMEffect`, `useFrameLoop` and
   `<Vrm>`'s callbacks are called through a ref that is refreshed on every
   commit. An inline arrow capturing fresh props is always current, and never
   re-registers anything.

The practical advice that follows: **put each subscription in a small leaf
component.** `useVRM` in the parent, `useVRMProgress` in a `<LoadingBar>` child.

---

## 1. `useVRM(source, options?)`

```tsx
const vrm = useVRM(url, { scene, keepPrevious: true });
```

Loads a VRM and disposes it automatically. Returns a stable
[`VRMHandle`](#vrmhandle). **The calling component does not re-render for load
state** — not when loading starts, not for progress, not when the avatar
arrives.

Reloads when `source` changes, disposing the previous avatar. A falsy source
(`undefined`, `null`, `false`, `""`) loads nothing and releases whatever was
loaded, so gating needs no branch:

```tsx
const vrm = useVRM(selected?.url); // idles until something is selected
```

### `VRMHandle`

Every member is a plain read or a stable function. Reading never re-renders
anything, so all of it is safe in a frame loop or an event handler.

| Member | |
| --- | --- |
| `avatar` | The loaded `VRMAvatar`, or `null` while loading / on error / when idle |
| `status` | `"idle" \| "loading" \| "ready" \| "error"` |
| `error` | The rejection reason if the load failed, otherwise `undefined` |
| `progress` | Latest raw `VRMLoadProgress` event, or `null` |
| `update(delta)` | `avatar.update(delta)`, or nothing if no avatar is loaded yet |
| `refetch()` | Re-run the load for the current source — a retry button's `onClick` |
| `subscribe(listener)` | Status / avatar / error changes. The `useSyncExternalStore` contract |
| `subscribeProgress(listener)` | Raw progress events, every one |

`status` and `avatar` are independent. With `keepPrevious`, a `"loading"` or
`"error"` handle can still be holding the previous model.

### Options

| Option | |
| --- | --- |
| `scene` | `THREE.Object3D` to add `avatar.scene` to. Re-attaches if it changes, detaches on cleanup |
| `vrmLoadOptions` | Extra plugin options forwarded to the VRM loader. Read when a load starts |
| `keepPrevious` | Hold the current avatar until the next one is ready, instead of clearing on url change. Default `false`. Read when a load starts |

`scene` should be the **same object across renders** — `useState(() => new
THREE.Scene())`, `useMemo`, or module scope. A new object every render
re-attaches the avatar every render.

`vrmLoadOptions` and `keepPrevious` are read through a ref when a load starts,
so an inline `{ vrmLoadOptions: {} }` never reloads the model. Flipping
`keepPrevious` does not itself reload either.

`keepPrevious` trades an empty frame for memory: no flash while a swap loads,
but both models are resident in GPU memory for the length of the load. If the
swap *fails*, the old avatar stays on screen and `status` becomes `"error"`.

### Disposal, and the races it covers

An avatar that finishes loading after the url changed again, or after the
component unmounted, lost a race. It is disposed instead of shown, because
otherwise its GPU memory would leak with nothing holding a reference to it. The
same applies to a load that fails late — it is ignored.

When an avatar goes away, **listeners run before it is disposed.** A
`useVRMEffect` cleanup can still touch the model on the way out — reset a face,
hand a rig back — and only then is the geometry freed.

### StrictMode

React's StrictMode mounts, unmounts and re-mounts every component in
development. `useVRM` survives that without downloading the model twice:
teardown on unmount waits one microtask, and the immediate re-mount cancels it.
A *real* unmount, or a url change, still disposes — the microtask finds nothing
re-attached and tears down.

### Server rendering

Nothing loads during a server render — loading starts in an effect, which never
runs on the server — so the same component renders on both sides. The opt-in
hooks return `idle` / `null` / `undefined` from their server snapshots. three's
loaders decode textures through DOM image APIs, so a load attempted during SSR
would crash or waste a full model download on the server; this avoids both by
construction.

---

## 2. Opt-in subscriptions

When a component should *render from* a value, ask for exactly that value:

| Hook | Returns | Re-renders when |
| --- | --- | --- |
| `useVRMStatus(vrm)` | `"idle" \| "loading" \| "ready" \| "error"` | the status changes |
| `useVRMAvatar(vrm)` | `VRMAvatar \| null` | an avatar is swapped in or out |
| `useVRMError(vrm)` | `unknown` | an error appears or clears |
| `useVRMProgress(vrm)` | `number \| null` — `0` to `1` | the whole-percent value changes |

```tsx
const Status = memo(function Status({ vrm }: { vrm: VRMHandle }) {
  const status = useVRMStatus(vrm);
  return <p>{status === "loading" ? "Loading…" : status}</p>;
});
```

Each is a one-line `useSyncExternalStore`, so a sibling that renders `status`
is not woken by a progress event, and one that renders `progress` is not woken
when the avatar arrives.

### Progress is quantized

A download can report progress on every network chunk. Rendering each one would
repaint a progress bar hundreds of times for ~100 visible steps, so
`useVRMProgress` returns the fraction rounded to a whole percent and the
component re-renders **at most once per percent**. It is `null` before the first
event, stays at its last value after the load finishes, and resets on the next
load.

If you want every raw event — to drive a canvas, say — skip the hook and write
to a ref or the DOM yourself:

```tsx
function RawProgress({ vrm }: { vrm: VRMHandle }) {
  const bar = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      vrm.subscribeProgress(() => {
        const event = vrm.progress;
        if (bar.current && event) bar.current.style.width = `${event.progress * 100}%`;
      }),
    [vrm],
  );

  return <div ref={bar} className="bar" />; // never re-renders
}
```

---

## 3. `useVRMEffect(handle, effect, deps?)`

Run an effect against the loaded avatar, **without re-rendering anything**.

```tsx
useVRMEffect(vrm, (avatar) => {
  const face = createVRMFace(avatar.vrm);
  const stop = avatar.registerUpdate((delta) => face.update(delta));
  face.eye.autoBlink();
  return stop;
});
```

`effect` runs once each time an avatar becomes available — and again whenever
`deps` change. Its cleanup runs when that avatar goes away (a url swap, an
unmount), *before* the avatar is disposed. It is `useEffect`, with the avatar as
the thing it follows.

It is also how you avoid a render *to learn the avatar exists*. The usual
alternative is state holding the avatar, `useMemo`'d into a controller — which
renders the whole component once per load.

- **The effect closure is never a dependency.** An inline function is fine; the
  latest one is always the one called.
- **`deps` are yours.** List the values the effect reads, as you would for
  `useEffect`. The array's length must stay constant between renders.
- **It runs immediately** if the avatar already exists when the component
  mounts — a child that mounts late still gets its setup.

### The projection rule

The tempting way to apply a control is where the click happens:

```tsx
// Don't. The avatar can be replaced underneath you.
<button onClick={() => face.current?.emotion.setExclusive("happy")}>Happy</button>
```

That works right up until the model changes — the new avatar gets a fresh
`VRMFace` that knows nothing about the click, and the expression silently
resets. Put the choice in state, and make the model an effect of it:

```tsx
const [mood, setMood] = useState("neutral");

useVRMEffect(
  vrm,
  () => void face.current?.emotion.setExclusive(mood),
  [mood],
);

<button onClick={() => setMood("happy")}>Happy</button>;
```

Now the effect depends on *both* the avatar and the choice, so it re-runs when
either changes. Swapping models re-applies every control written this way, for
free — the expression, the toggles, the posed joints. That is what the demo
shows when you swap models with a mood picked.

Only two kinds of thing don't fit the rule: per-frame work (that's
[`useVRMUpdate`](#4-usevrmupdatehandle-fn-options)) and genuine one-shot events like
"bake a clip now".

### Order

Every `useVRMEffect` on a handle is a listener on the same store, and **listeners
run in the order they subscribed** — declaration order within a component, and
children before parents (React runs child effects first). So build a controller
*above* the effects that use it:

```tsx
const face = useVRMFace(vrm); // declared first: the face exists...
useVRMEffect(vrm, () => void face.current?.emotion.setExclusive(mood), [mood]); // ...by here
```

Cleanups and setups both follow that order on a swap, so the face is always
rebuilt before the effects below it re-run.

---

## 4. `useVRMUpdate(handle, fn, options?)`

Run `fn` every frame against the current avatar. **Never causes a render.**

```tsx
useVRMUpdate(vrm, (delta, avatar) => {
  mixer.current?.update(delta);
});
```

It registers through `avatar.registerUpdate`, so it runs before `vrm.update(delta)`
like every other driver in this package, and it follows the avatar: a url swap
unregisters from the old model and registers on the new one, so a driver can't be
left bound to a disposed rig.

`fn` is called through a ref. An inline closure that captures fresh props or state
each render is always current and never re-registers.

### `options.order`

Drivers run in registration order by default, and **in React that is not an order
you control**: an effect that re-runs — a mode switch, a changed dependency —
unregisters and registers again, *after* anything that was already in place. Pass
an `order` (lower runs first, default `0`) to say where a callback belongs:

```tsx
useVRMUpdate(vrm, (delta, avatar) => jiggle.current?.update(delta), { order: 100 });
```

It is read when the registration is made, so changing it re-registers. Only the
number matters — an inline `{ order: 100 }` each render does not re-register.

If you only need one function per frame and you already own the frame loop, you
can call it from there; `useVRMUpdate` is for work that belongs to the *avatar's*
lifetime rather than the loop's.

---

## 5. `useFrameLoop(callback, options?)`

A `requestAnimationFrame` loop bound to the lifetime of a component — and never a
reason for it to render.

```tsx
const loop = useFrameLoop((delta, elapsed) => {
  vrm.update(delta);
  renderer.render(scene, camera);
});

loop.stop();     // e.g. when a panel is hidden
loop.start();
loop.running;    // a plain read, not reactive
```

React has no renderer-owned frame hook outside R3F's `useFrame`, so this is where
a VRM app's per-frame work lives. Deltas are in **seconds**, matching
`avatar.update(delta)` and every other time input in this package.

| Option | |
| --- | --- |
| `paused` | While `true` the loop is suspended; it resumes when it flips back, without losing the caller's own `start()` / `stop()` intent |
| `maxDelta` | Largest delta handed to the callback, in seconds. Default `0.1`. Read every frame — changing it never restarts the loop |
| `autoStart` | Start as soon as the component mounts. Default `true` |

**Clamping the delta** matters more than it looks. A backgrounded tab resumes with
a multi-second gap; feeding that straight into spring bones and other integrators
makes an avatar visibly explode on tab focus. Clamping trades a little slow-motion
catch-up for that.

A frame is requested only while the caller *wants* it (`start` / `stop`), nothing
has *paused* it, and the component is *mounted*. Keeping the three apart is what
lets `paused` suspend and resume a loop without erasing a prior `stop()`, and what
lets a StrictMode remount restart a loop you never stopped.

The returned controller is stable, so you can hand it to a child (the demo's
Pause button does) without re-rendering the parent. `running` is a plain read — a
control that must *show* whether the loop is running should hold that in its own
state, as the demo's button does.

**Don't `setState` inside the callback.** It would reintroduce exactly the
per-frame render this entry exists to avoid. Write to refs, to three.js objects, or
straight to the DOM.

---

## 6. `Vrm` — the declarative mount

```tsx
const handle = useRef<VRMHandle>(null);

{visible && (
  <Vrm
    ref={handle}
    url={url}
    scene={scene}
    onLoad={(avatar) => avatar.scene.position.set(0.9, 0, 0)}
  />
)}
```

Renders nothing to the DOM — the avatar lives in a three.js scene, not the
document — so it is a side-effect component in the mould of `<Helmet>`. What it
buys over calling `useVRM` yourself is React's own tree as the lifecycle:
unmounting it disposes the model, and mapping a list of urls to
`<Vrm key={url} />` manages one avatar per entry.

| Prop | |
| --- | --- |
| `url` | `string \| undefined \| null \| false` — falsy loads nothing |
| `scene` | Parent to add `avatar.scene` to |
| `vrmLoadOptions`, `keepPrevious` | As for `useVRM` |
| `onLoad(avatar)` | Called whenever a new avatar finishes loading |
| `onProgress(event)` | Called with each raw progress event |
| `onError(error)` | Called **once** per failed load |

**It never re-renders itself for load state.** The callbacks are delivered by
subscription, not through state, so `onLoad={(a) => setAvatar(a)}` in a parent is
the only thing that renders — and only because you chose to. They are read through
a ref: inline arrows are fine. `onError` fires once per failure; a `refetch` that
fails again fires it again.

The forwarded `ref` resolves to the stable [`VRMHandle`](#vrmhandle) **as soon as
the component mounts** — not `null` until loaded — so `handle.current.avatar` is
the null-until-ready read. This differs from `/r3f`, whose `<Vrm>` ref is the
avatar. It does not drive frames: pair it with `useFrameLoop` and call
`handle.current?.update(delta)` there, as the demo does.

---

## Driving the rest of the package

Face, lip-sync, body posing, Mixamo, procedural animation and baking are all
framework-agnostic — they come from the root entry and are built from
`avatar.vrm`. Wiring any of them into React is the same three ideas:

1. **`useVRMEffect` builds the controller.** It rebuilds on a model swap; the old
   one is reset on the way out. Hold it in a ref — building it is not a render and
   nothing displays it.
2. **`avatar.registerUpdate` (or `useVRMUpdate`) registers whatever needs a
   frame.** One registration that dispatches beats several that fight over order.
3. **State lives in React; the model is a projection of it.** See the
   [projection rule](#the-projection-rule).

| Feature | Root-entry API | React shape |
| --- | --- | --- |
| Expressions, brows | `createVRMFace` | A `useVRMFace` hook + one `useVRMEffect` per control |
| Lip-sync | `face.viseme` | An effect over weights state, or drive it from the frame loop |
| Auto-blink, gaze | `face.eye` | The face hook, plus an effect with an enable flag in `deps` |
| Body posing | `createVRMBody` | A ref + one effect over a pose state |
| Mixamo | `loadMixamoAnimation` | One effect keyed on the clip url that owns a mixer |
| Procedural | `createProceduralAnimator` | One effect that registers the animator and resets it on cleanup |
| Gestures | `createGestureAnimator` | State → effect calling `play` / `stop` |
| Baking | `bakeAnimator` | A plain function call. No React involved |
| Jiggle physics | `createVRMJiggle` | One effect that builds it and calls `attach(avatar)`; state → effect over the bone set |

### A face hook

The one hook worth writing yourself — the demo does:

```tsx
function useVRMFace(vrm: VRMHandle) {
  const face = useRef<VRMFace | null>(null);

  useVRMEffect(vrm, (avatar) => {
    const next = createVRMFace(avatar.vrm);
    face.current = next;
    const stop = avatar.registerUpdate((delta) => next.update(delta));

    return () => {
      stop();
      next.reset(); // before the avatar is disposed
      face.current = null;
    };
  });

  return face;
}

function FaceControls({ vrm }: { vrm: VRMHandle }) {
  const [mood, setMood] = useState("happy");
  const [blink, setBlink] = useState(true);
  const face = useVRMFace(vrm);

  useVRMEffect(vrm, () => void face.current?.emotion.setExclusive(mood), [mood]);

  useVRMEffect(
    vrm,
    () => {
      const current = face.current;
      if (!current || !blink) return;
      current.eye.autoBlink();
      return () => void current.eye.stopAutoBlink();
    },
    [blink],
  );

  // …buttons that call setMood / setBlink
}
```

`FaceControls` renders when `mood` or `blink` change — your own state — and for
nothing else. Swapping models re-applies both.

### One rig, one owner

A Mixamo `AnimationMixer`, a `ProceduralAnimator`, and manual `createVRMBody`
posing all write the normalized bone rig. Only one can run at a time, so model it
as **one mode**, not three independent toggles — and let the effect for each mode
hand the rig over in its cleanup (the demo's body effect calls `animator.reset()`).
Face control is unaffected either way and runs in every mode.

In React the mode falls straight out of the component tree. Make each mode a
component, and render exactly one:

```tsx
function BodyControls({ vrm }: { vrm: VRMHandle }) {
  const [mode, setMode] = useState<"procedural" | "clip" | "pose" | "none">("procedural");

  return (
    <>
      {/* …the mode buttons… */}
      {mode === "procedural" && <ProceduralMode vrm={vrm} />}
      {mode === "clip" && <ClipMode vrm={vrm} />}
      {mode === "pose" && <PoseMode vrm={vrm} />}
    </>
  );
}
```

While a mode is mounted, its `useVRMEffect`s own the rig. Unmounting it runs
their cleanups, which hand the rig back (`animator.reset()`, `stopAllAction()` +
`resetPose()`) — and React runs **every** cleanup in a commit before **any**
setup, so the old owner has let go before the new one starts. No "is something
else running?" bookkeeping. This is [`src/RigPanel.tsx`](./src/RigPanel.tsx).

Jiggle physics is the exception, and on purpose: it owns no bones. It adds a small
lean on top of whichever mode is active, so it lives outside this tree — see
[Jiggle physics](#jiggle-physics).

### Procedural animation

```tsx
useVRMEffect(
  vrm,
  (avatar) => {
    if (!idle) return;

    const animator = createProceduralAnimator(avatar.vrm, [
      createIdleAnimator(),
      createLookAtAnimator({ target: camera }),
    ]);
    const stop = avatar.registerUpdate((delta) => animator.update(delta));

    return () => {
      stop();
      animator.reset(); // return the bones to rest while the rig still exists
    };
  },
  [idle],
);
```

### Mixamo clips

```tsx
useVRMEffect(
  vrm,
  (avatar) => {
    const mixer = new THREE.AnimationMixer(avatar.vrm.scene);
    let cancelled = false;

    loadMixamoAnimation(clipUrl, avatar.vrm).then((clip) => {
      if (!cancelled) mixer.clipAction(clip).play();
    });

    const stop = avatar.registerUpdate((delta) => mixer.update(delta));

    return () => {
      cancelled = true; // the clip may land after the avatar is gone
      stop();
      mixer.stopAllAction();
      mixer.uncacheRoot(avatar.vrm.scene);
    };
  },
  [clipUrl],
);
```

Clips are keyed on the avatar *and* the url: a new rig invalidates whatever was
playing on the old one, and a new url replaces the mixer for the same rig.

### Jiggle physics

`createVRMJiggle` is a layer, not a driver: each frame it takes whatever the rig's
pose is, undoes its own previous nudge, and adds a fresh one. It composes with a
procedural idle, a Mixamo clip, or a pose you are dragging, without knowing which.
Because it adds *on top*, it has to run **after** them — and as the section above
says, effect order is not yours to control. `attach` registers it with a late
`order`, so it stays last however the drivers are re-registered:

```tsx
function JiggleControls({ vrm }: { vrm: VRMHandle }) {
  const jiggle = useRef<VRMJiggle | null>(null);
  const [on, setOn] = useState(true);

  // One controller per avatar. The cleanup detaches AND takes every nudge off the
  // rig, before the avatar is disposed.
  useVRMEffect(vrm, (avatar) => {
    const next = createVRMJiggle(avatar.vrm, { zones: ["chest", "hips"] });
    const detach = next.attach(avatar);
    jiggle.current = next;

    return () => {
      detach();
      next.dispose();
      jiggle.current = null;
    };
  });

  useVRMEffect(vrm, () => void (jiggle.current && (jiggle.current.enabled = on)), [on]);

  // …
}
```

Try it in the demo: switch the **Body** mode while the avatar bounces. The driver is
torn down and re-registered each time, *after* the jiggle — and the jiggle keeps
working, because it asked to run last.

Which bones jiggle is a choice, so it is state, and the controller is a projection
of it. Apply a change **in the handler** as well as in an effect: a slider that
mounts in the same render reads the controller, and an effect would run after it.
One idempotent function does both:

```tsx
function project(controller: VRMJiggle, bones: ReadonlySet<string>) {
  for (const target of controller.list()) if (!bones.has(target)) controller.disable(target);
  for (const target of bones) if (!controller.isEnabled(target)) controller.enable(target);
}

const choose = (next: ReadonlySet<string>) => {
  setBones(next);
  if (jiggle.current) project(jiggle.current, next); // now, for what renders next
};

useVRMEffect(vrm, () => void (jiggle.current && project(jiggle.current, bones)), [bones]); // and for a new model
```

For a bone that isn't a humanoid one — a bust bone, a tail — offer
`listJiggleCandidates(avatar.vrm)` and pass the node's name to `enable()`.
[`src/JigglePanel.tsx`](./src/JigglePanel.tsx) is the whole thing, with a per-bone
editor, pokes, and a live angle readout. See
[`../jiggle-example/jiggle-example.md`](../jiggle-example/jiggle-example.md).

### Sliders that don't render

A panel with thirty sliders should not render thirty times a second. Give each
slider its **own** state and send the value straight to the model — not through
the panel's state:

```tsx
function Slider({ label, min, max, initial, onChange }: SliderProps) {
  const [value, setValue] = useState(initial); // `initial` may be a function: read once, on mount

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={0.01}
      value={value}
      onChange={(e) => {
        const next = Number(e.target.value);
        setValue(next); // re-renders THIS slider
        onChange(next); // …and writes to the model. Not the panel.
      }}
    />
  );
}

<Slider label="aa" min={0} max={1} initial={0} onChange={(w) => face.current?.viseme.set("aa", w)} />
```

Two things follow. A slider that should show the model's *current* value starts
from a lazy `initial` (`() => body.current?.getEulerDegrees(bone)?.x ?? 0`), and a
`key` starts it over — change it when the thing it edits changes (`${bone}:${version}`).

A slider you were *scrubbing* is a reading of the old model, and the next one starts
neutral. Wrap those in a component that remounts for each new avatar:

```tsx
function PerAvatar({ vrm, children }: { vrm: VRMHandle; children: ReactNode }) {
  const avatar = useVRMAvatar(vrm); // re-renders only when the avatar does
  return <Fragment key={avatar?.scene.uuid ?? "none"}>{children}</Fragment>;
}
```

That is the line between the two kinds of control: a **choice** (a mood, a toggle,
which bones jiggle) is state, and an effect re-applies it to the next model; a
**scrub** (a viseme, a joint angle) belongs to the model it was dragged on.

---

## A complete component

```tsx
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  useVRM,
  useVRMEffect,
  useVRMStatus,
  useFrameLoop,
} from "@fanoalone/vrm-controller/react";
import { createVRMFace } from "@fanoalone/vrm-controller";
import type { VRMHandle } from "@fanoalone/vrm-controller/react";

// A leaf: the only thing here that re-renders for load state.
function Status({ vrm }: { vrm: VRMHandle }) {
  const status = useVRMStatus(vrm);
  return <p>{status}</p>;
}

export function Viewer({ url }: { url: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<THREE.WebGLRenderer | null>(null);

  // Lazy `useState`: built once, never a dependency of anything, and not a
  // render trigger. These are three.js objects, not React state.
  const [stage] = useState(() => ({
    scene: new THREE.Scene(),
    camera: new THREE.PerspectiveCamera(30, 1, 0.1, 100),
  }));

  useEffect(() => {
    const r = new THREE.WebGLRenderer({ canvas: canvas.current!, antialias: true });
    renderer.current = r;
    return () => {
      r.dispose();
      renderer.current = null;
    };
  }, []);

  const vrm = useVRM(url, { scene: stage.scene });

  useVRMEffect(vrm, (avatar) => {
    const face = createVRMFace(avatar.vrm);
    face.eye.autoBlink();
    return avatar.registerUpdate((delta) => face.update(delta));
  });

  useFrameLoop((delta) => {
    vrm.update(delta);
    renderer.current?.render(stage.scene, stage.camera);
  });

  return (
    <>
      <canvas ref={canvas} />
      <Status vrm={vrm} />
    </>
  );
}
```

`Viewer` renders once. Resizing is yours: a `ResizeObserver` that updates the
camera and renderer, written to refs, is the same pattern.

---

## Gotchas

**Don't read the handle during render to decide what to render.** `vrm.avatar` and
`vrm.status` are plain reads: they are correct *now* and tell React nothing about
the future. Render from `useVRMStatus` / `useVRMAvatar` instead. Reading the handle
in a frame loop, an event handler or an effect is exactly what it is for.

**Pass a stable `scene`.** A new `THREE.Scene()` each render re-attaches the avatar
each render. `useState(() => new THREE.Scene())`, `useMemo`, or module scope.

**Don't call `avatar.update(delta)` twice.** It runs every registered updater
*and* `vrm.update`. Once per frame, in one place — the frame loop. (The handle's
`vrm.update(delta)` *is* `avatar.update(delta)`, null-safe, so calling both is
calling it twice.) If you register a driver with `useVRMUpdate`, don't also call it
yourself.

**Don't `setState` from a frame callback or a per-frame update.** It brings back
the per-frame render. Mutate three.js objects, write to a ref, or write to the DOM.

**Build a controller above the effects that read it.** Effects on one handle run
in declaration order, children before parents. See [Order](#order).

**Keep a `useVRMEffect` `deps` array the same length.** It is spread into
`useEffect`'s dependency list, which React requires to be constant. The
`react-hooks/exhaustive-deps` lint rule cannot check a custom hook's array, so
list what the effect reads yourself.

**`running` is not reactive.** `loop.running` is a plain read. A control that
shows it should hold its own state.

**`useVRMProgress` is not every event.** It is quantized to whole percents. Use
`handle.subscribeProgress` for raw events.

**A swap is not instant with `keepPrevious: false`.** The old avatar goes the
moment the url changes, so there is an empty frame while the next loads. That keeps
`avatar` from ever disagreeing with the url that produced it; flip `keepPrevious`
if you'd rather hold the old one.

**Object URLs outlive the avatar.** If you load from a `File`,
`URL.revokeObjectURL` is yours to call — `useVRM` disposes the model, not the url
that named it. Revoke only after the load settles.

**One rig, one owner.** A mixer, a procedural animator and manual posing never run
together. See [One rig, one owner](#one-rig-one-owner).

**Anything that layers on top needs an `order`.** Jiggle, or any post-process that
adds to what a driver wrote, must run after it. An effect that re-runs re-registers
*later*, so registration order will eventually put the driver on top and the layer
silently does nothing. Use `jiggle.attach(avatar)`, or
`useVRMUpdate(vrm, fn, { order })`. See [`options.order`](#optionsorder).

**An async effect can be cleaned up before it finishes.** A Mixamo clip loads after
the effect ran; by the time it lands the mode, the clip, or the whole model may have
changed. Keep a `cancelled` flag and check it before starting playback (the demo's
`ClipMode` does).

**Two copies of React break hooks.** If you bundle this package alongside your
app, make sure `react` resolves to a single copy. The demo's import map does this
with `?external=react`.

## API reference

| Export | Signature |
| --- | --- |
| `useVRM` | `(source: VRMSource, options?: UseVRMOptions) => VRMHandle` |
| `useVRMStatus` | `(handle: VRMHandle) => VRMStatus` |
| `useVRMAvatar` | `(handle: VRMHandle) => VRMAvatar \| null` |
| `useVRMError` | `(handle: VRMHandle) => unknown` |
| `useVRMProgress` | `(handle: VRMHandle) => number \| null` |
| `useVRMEffect` | `(handle: VRMHandle, effect: (avatar: VRMAvatar) => void \| (() => void), deps?: DependencyList) => void` |
| `useVRMUpdate` | `(handle: VRMHandle, fn: (delta: number, avatar: VRMAvatar) => void, options?: { order?: number }) => void` |
| `useFrameLoop` | `(callback: (delta: number, elapsed: number) => void, options?: UseFrameLoopOptions) => FrameLoop` |
| `Vrm` | `ForwardRefExoticComponent<VrmProps & RefAttributes<VRMHandle>>` |

Types: `VRMSource`, `VRMStatus`, `UseVRMOptions`, `VRMHandle`, `FrameLoopCallback`,
`UseFrameLoopOptions`, `FrameLoop`, `VrmProps`.

## References

- `useSyncExternalStore` (what the opt-in hooks are built on) — <https://react.dev/reference/react/useSyncExternalStore>
- Effects and cleanup — <https://react.dev/reference/react/useEffect>
- StrictMode's double-invoked effects — <https://react.dev/reference/react/StrictMode>
- The loader and the `registerUpdate` seam — [`../loader-example/loader-example.md`](../loader-example/loader-example.md)
- Face control — [`../face-example/face-example.md`](../face-example/face-example.md)
- Procedural animation — [`../procedural-example/procedural-example.md`](../procedural-example/procedural-example.md)
- Jiggle physics — [`../jiggle-example/jiggle-example.md`](../jiggle-example/jiggle-example.md)
- The Solid counterpart of this entry — [`../solid-example/solid-example.md`](../solid-example/solid-example.md)
