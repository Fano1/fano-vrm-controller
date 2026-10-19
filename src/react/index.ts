/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

// React bindings. `react` is the only extra peer dependency — nothing here
// assumes a renderer, because the avatar is driven through `avatar.update(delta)`
// from a plain frame loop either way. Reach for `/r3f` instead if you already
// render through React Three Fiber. Everything else (loadVRM, createVRMFace,
// Mixamo, procedural animation) comes from the package root and is
// framework-agnostic.
//
// The one design rule: loading, progress and per-frame work never re-render the
// component that set them up. Rendering from a value is opt-in, per value.

// Types
export type * from "./react-type";

// Load / dispose — returns a stable handle, never re-renders its caller
export { useVRM } from "./use-vrm";

// Opt-in subscriptions: each one re-renders only for the one value it reads
export {
	useVRMAvatar,
	useVRMStatus,
	useVRMError,
	useVRMProgress,
} from "./use-vrm";

// Effects against the loaded avatar, with no render in between
export { useVRMEffect, useVRMUpdate } from "./use-vrm-effect";

// The render loop React doesn't come with
export { useFrameLoop } from "./frame-loop";

// Declarative mount
export { Vrm } from "./vrm-component";
