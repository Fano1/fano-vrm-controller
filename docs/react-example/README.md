# React example

A Vite + React + TypeScript app demonstrating `@fanoalone/vrm-controller/react`
— hooks for loading, driving and disposing VRM avatars that never re-render the
component that set them up. A render counter on screen shows it.

```bash
bun run build          # in the repo root first: the app imports dist/
cd docs/react-example
bun install
bun run dev
```

Needs an `avatar.vrm` in the repo root. The Mixamo clips come from `animation/`
next to it (the dev server serves both); everything else works without them. Add
`?strict` to the url for `<StrictMode>`.

## What's in the panel

Every control the package has, as a collapsible section:

- **Body** — one rig owner at a time: **Procedural** (idle layers, look-at,
  gestures), **Mixamo clip** (four `.fbx` and a baked idle), **Manual pose** (any
  bone, X/Y/Z), or **None**. Switching hands the rig over cleanly.
- **Jiggle physics** — a bouncing or shaking avatar to drive it, zones, intensity /
  ambient / smoothing, and a per-bone editor (every humanoid bone and model node,
  every option, pokes, a live angle readout). Switch the Body mode while it
  bounces: it stays on top.
- **Face** — mood and intensity, auto-blink, gaze, manual eyelids, winks and gaze
  angles, five vowel sliders, a simulated speech stream, and brows.
- **Render counters** — drag any slider and no counter moves; flip a toggle and
  only that panel's does.

Full write-up, API reference and recipes: [`react-example.md`](./react-example.md).
The jiggle physics themselves are covered in
[`../jiggle-example/jiggle-example.md`](../jiggle-example/jiggle-example.md).
There is also a smaller no-build version of the demo,
[`react-example.html`](./react-example.html), and a Solid counterpart,
[`../solid-example/`](../solid-example/solid-example.md).
