# Fano VRMKit Loader Example

This file shows how to use the basic VRM loader from `fano-vrmkit`.

The loader hides the annoying Pixiv VRM setup behind one simple function:

```ts
const avatar = await loadVRM("/models/avatar.vrm");
```

Instead of manually creating a `GLTFLoader`, registering `VRMLoaderPlugin`, loading the file, and digging through `gltf.userData.vrm`, you get a clean avatar object.

---

## Basic Usage

```ts
import * as THREE from "three";
import { loadVRM } from "fano-vrmkit";

const scene = new THREE.Scene();

const avatar = await loadVRM("/models/avatar.vrm");

scene.add(avatar.scene);
```

The returned `avatar` contains:

```ts
avatar.vrm;      // Raw Pixiv VRM object
avatar.scene;    // THREE.Group that contains the model
avatar.update;   // Function to update VRM every frame
avatar.dispose;  // Function to clean up the VRM
```

---

## Recommended Usage

The easiest way is to pass your Three.js scene directly into the loader.

```ts
import * as THREE from "three";
import { loadVRM } from "fano-vrmkit";

const scene = new THREE.Scene();

const avatar = await loadVRM("/models/avatar.vrm", {
  scene,
});
```

This automatically adds the VRM model to your scene.

So instead of doing this:

```ts
const avatar = await loadVRM("/models/avatar.vrm");
scene.add(avatar.scene);
```

You can do this:

```ts
const avatar = await loadVRM("/models/avatar.vrm", {
  scene,
});
```

Same result. Less goblin work.

---

## Full Three.js Example

```ts
import * as THREE from "three";
import { loadVRM } from "fano-vrmkit";

const canvas = document.querySelector<HTMLCanvasElement>("#app");

if (!canvas) {
  throw new Error("Canvas element not found");
}

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  35,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);

camera.position.set(0, 1.4, 3);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(1, 2, 3);
scene.add(light);

const ambientLight = new THREE.AmbientLight(0xffffff, 1);
scene.add(ambientLight);

const clock = new THREE.Clock();

const avatar = await loadVRM("/models/avatar.vrm", {
  scene,
});

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  avatar.update(delta);

  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
});
```

---

## Loading Progress

You can track loading progress with `onProgress`.

```ts
import { loadVRM } from "fano-vrmkit";

const avatar = await loadVRM("/models/avatar.vrm", {
  onProgress(progress) {
    console.log("Loaded bytes:", progress.loaded);
    console.log("Total bytes:", progress.total);
    console.log("Progress:", progress.progress);
  },
});
```

`progress.progress` is a value between `0` and `1`.

Example:

```ts
onProgress(progress) {
  const percent = Math.round(progress.progress * 100);

  console.log(`Loading VRM: ${percent}%`);
}
```

If the server does not provide the total file size, `progress.total` may be `0`. In that case, `progress.progress` will also be `0`.

That is not your fault. That is just the web being the web, gently decomposing in public.

---

## Updating the Avatar

You must call `avatar.update(delta)` every frame.

```ts
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  avatar.update(delta);

  renderer.render(scene, camera);
}

animate();
```

This keeps VRM systems updated, such as spring bones, expressions, look-at behavior, and other internal VRM runtime features.

---

## Disposing the Avatar

When you no longer need the avatar, call:

```ts
avatar.dispose();
```

Example:

```ts
window.addEventListener("beforeunload", () => {
  avatar.dispose();
});
```

This removes the VRM scene from its parent and disposes geometries, materials, and textures.

Use this when:

* switching avatars
* leaving a page
* cleaning up a viewer
* removing the model from memory

Example:

```ts
let currentAvatar = await loadVRM("/models/avatar-a.vrm", {
  scene,
});

async function switchAvatar(url: string) {
  currentAvatar.dispose();

  currentAvatar = await loadVRM(url, {
    scene,
  });
}
```

Without cleanup, your app can slowly turn into a memory leak graveyard. Very aesthetic. Very cursed.

---

## Advanced Usage With `vrmLoadOptions`

The loader accepts advanced Pixiv VRM loader options through `vrmLoadOptions`.

Most users should ignore this.

Use it only when you know you need to customize how `@pixiv/three-vrm` loads the model.

```ts
import { loadVRM } from "fano-vrmkit";

const avatar = await loadVRM("/models/avatar.vrm", {
  scene,
  vrmLoadOptions: {
    // Advanced Pixiv VRM loader options go here.
  },
});
```

The option name is:

```ts
vrmLoadOptions
```

Not:

```ts
vrmLoaderOptions
```

Do not anger the TypeScript spelling goblin.

---

## Example: Passing Advanced Loader Options

```ts
import { loadVRM } from "fano-vrmkit";

const avatar = await loadVRM("/models/avatar.vrm", {
  scene,

  onProgress(progress) {
    console.log(`Loading: ${Math.round(progress.progress * 100)}%`);
  },

  vrmLoadOptions: {
    // Put @pixiv/three-vrm VRMLoaderPluginOptions here.
    //
    // Example:
    // lookAtPlugin: ...
    // springBonePlugin: ...
    // expressionPlugin: ...
    //
    // Exact options depend on the version of @pixiv/three-vrm you are using.
  },
});
```

This gives advanced users access to the original Pixiv loader configuration while keeping the default API simple for normal humans with jobs, deadlines, and a will to live.

---

## Error Handling

If loading fails, `loadVRM` throws an error.

```ts
try {
  const avatar = await loadVRM("/models/avatar.vrm", {
    scene,
  });

  console.log("VRM loaded:", avatar);
} catch (error) {
  console.error("Failed to load VRM:", error);
}
```

Common causes:

* the file path is wrong
* the file is not a valid `.vrm`
* the file loads but contains no VRM data
* the server blocks the file
* the file is missing from the `public` folder

Example error:

```txt
[fano-vrmkit] Failed to load VRM from "/models/avatar.vrm". The file loaded, but no VRM data was found.
```

---

## Using With a Public Folder

In most frontend apps, place your model inside the `public` folder.

Example:

```txt
public/
  models/
    avatar.vrm
```

Then load it like this:

```ts
const avatar = await loadVRM("/models/avatar.vrm", {
  scene,
});
```

Do not load it like this:

```ts
const avatar = await loadVRM("./public/models/avatar.vrm");
```

Frontend paths are not filesystem paths. The browser does not care about your folder feelings.

---

## Minimal API Reference

### `loadVRM(url, options?)`

Loads a VRM model.

```ts
const avatar = await loadVRM("/models/avatar.vrm", options);
```

---

### `LoadVRMOptions`

```ts
type LoadVRMOptions = {
  scene?: THREE.Object3D;
  onProgress?: (progress: VRMLoadProgress) => void;
  vrmLoadOptions?: VRMLoaderPluginOptions;
};
```

---

### `VRMLoadProgress`

```ts
type VRMLoadProgress = {
  loaded: number;
  total: number;
  progress: number;
};
```

---

### `VRMAvatar`

```ts
type VRMAvatar = {
  vrm: VRM;
  scene: THREE.Group;
  update: (delta: number) => void;
  dispose: () => void;
};
```

---

## Complete Example

```ts
import * as THREE from "three";
import { loadVRM } from "fano-vrmkit";

const canvas = document.querySelector<HTMLCanvasElement>("#app");

if (!canvas) {
  throw new Error("Canvas not found");
}

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  35,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);

camera.position.set(0, 1.4, 3);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);

scene.add(new THREE.AmbientLight(0xffffff, 1));

const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
directionalLight.position.set(1, 2, 3);
scene.add(directionalLight);

const avatar = await loadVRM("/models/avatar.vrm", {
  scene,

  onProgress(progress) {
    const percent = Math.round(progress.progress * 100);
    console.log(`Loading VRM: ${percent}%`);
  },

  vrmLoadOptions: {
    // Optional advanced @pixiv/three-vrm loader options.
  },
});

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  avatar.update(delta);

  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("beforeunload", () => {
  avatar.dispose();
});
```

---

## What This Loader Does

This loader handles:

* creating a `GLTFLoader`
* registering `VRMLoaderPlugin`
* loading the `.vrm` file
* extracting `gltf.userData.vrm`
* adding the VRM scene to your scene if provided
* exposing a simple `update(delta)` function
* exposing a simple `dispose()` function
* supporting loading progress
* supporting advanced Pixiv loader options

So users can write this:

```ts
const avatar = await loadVRM("/models/avatar.vrm", {
  scene,
});
```

Instead of performing the entire Pixiv loader ritual like a wizard filing tax returns.
