/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

// Solid bindings. `solid-js` is the only extra peer dependency — nothing here
// assumes a three.js renderer for Solid, because the avatar is driven through
// `avatar.update(delta)` from a plain frame loop either way. Everything else
// (loadVRM, createVRMFace, Mixamo, procedural animation) comes from the
// package root and is framework-agnostic.

// Types
export * from "./solid-type";

// Reactive helper, exported because it is part of the calling convention:
// every input below accepts a value or an accessor.
export { access } from "./solid-utils";

// Load / dispose / per-frame registration
export { createVRM, createVRMUpdate } from "./create-vrm";

// The render loop Solid doesn't come with
export { createFrameLoop } from "./frame-loop";

// Declarative mount
export { Vrm } from "./vrm-component";
