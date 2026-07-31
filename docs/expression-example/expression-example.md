# Fano VRM Controller — Expression Example

This example shows how to drive a VRM's face with the high-level
`VRMExpressionController`, which wraps the VRM standard expression system
(`vrm.expressionManager`). It works across VRM 0.x and 1.0 models regardless of
how their blendshapes are named.

The live demo is [`expression-example.html`](./expression-example.html). It loads
a model and generates one slider per expression the model exposes, plus quick
buttons for the emotion presets.

## Running the demo

The `.html` file uses browser import maps, so it needs the repo root available as
the web root (that is where `node_modules/`, `dist/`, and the `.vrm` live).

```bash
bun run build          # produce dist/ (the demo imports ../../dist/index.js)
bunx serve .           # serve the repo root on http://localhost:3000
# open http://localhost:3000/docs/expression-example/expression-example.html
```

Put a model named `savatar.vrm` in the repo root, or edit `MODEL_URL` in the HTML.

## The gist

```ts
import { loadVRM, createVRMExpressionController } from "fano-vrm-controller";

const avatar = await loadVRM("/models/avatar.vrm", { scene });
const face = createVRMExpressionController(avatar.vrm);

face.setExpression("happy", 0.8);       // clamped to 0..1, chainable
face.setExpressions({ aa: 0.5, blink: 1 });
face.reset();                           // all weights back to 0
```

### Weights flush on `update`, not on set

Setting a weight only records it. It is applied to the mesh on the next
`vrm.update(delta)` — which `avatar.update(delta)` calls for you. So keep your
render loop running:

```ts
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  avatar.update(clock.getDelta()); // flushes expressions, spring bones, look-at…
  renderer.render(scene, camera);
}
animate();
```

### Adapt to any model

Don't hard-code expression names — ask the model what it has:

```ts
if (!face.available) {
  // This VRM has no expressionManager; getters return empty/0, setters no-op.
}

for (const name of face.getExpressionNames()) {
  console.log(name, face.getExpression(name));
}
```

## Preset names

`VRMExpressionPreset` gives you the standard names (autocompleted), while
`VRMExpressionName` accepts any custom string a model author defined:

```ts
import { VRMExpressionPreset } from "fano-vrm-controller";

face.setExpression(VRMExpressionPreset.Blink, 1); // "blink"
face.setExpression("myCustomShape", 1);            // custom, also fine
```

Visemes: `aa` `ih` `ou` `ee` `oh` · Emotions: `happy` `angry` `sad` `relaxed`
`surprised` `neutral` · Blink: `blink` `blinkLeft` `blinkRight` · Look-at:
`lookUp` `lookDown` `lookLeft` `lookRight`.

## Need raw morph targets instead?

For models with VRoid-style `Fcl_*` morphs that you want to poke directly (below
the expression system), use the low-level `VRMFaceController` /
`createVRMFaceController(vrm)`.

## API reference

### `createVRMExpressionController(vrm)` → `VRMExpressionController`

| Member | Description |
| --- | --- |
| `available` | `true` if the model exposes an `expressionManager`. When `false`, getters return empty/`0` and setters are no-ops. |
| `getExpressionNames()` | Every expression the model defines (presets + custom). |
| `hasExpression(name)` | Whether the model defines `name`. |
| `getExpression(name)` | Current weight (`0` if absent). |
| `setExpression(name, weight)` | Set a weight, clamped to `0..1`. Chainable. |
| `setExpressions({ ... })` | Set several at once; `undefined` entries skipped. Chainable. |
| `resetExpression(name)` | Set one expression to `0`. Chainable. |
| `reset()` | Set every expression to `0`. Chainable. |
| `debug()` | `{ available, expressions, values }` snapshot. |
