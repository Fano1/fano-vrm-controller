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

Needs an `avatar.vrm` in the repo root. Add `?strict` to the url for
`<StrictMode>`.

Full write-up, API reference and recipes: [`react-example.md`](./react-example.md).
There is also a no-build version of the same demo, [`react-example.html`](./react-example.html).
