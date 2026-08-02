/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

// Types
export * from "./procedural-type";

// Primitives: signals in, channels out
export * from "./signals";
export { channel, channels, EulerAccumulator, PoseAccumulator } from "./channels";

// Easing curves are exposed as a lookup rather than ~10 root-level exports —
// gesture keyframes take a name ("easeOutBack"), or reach for EASINGS directly.
export {
  EASINGS,
  resolveEasing,
  type EasingName,
  type EasingLike,
} from "./easing";

// Where a pose goes — live model, or a recorder for the baker
export * from "./pose-sink";

// VRM 0.x vs 1.0 humanoid convention, applied at the write boundary
export * from "./rig-frame";

// The animator interface and the layer stack
export * from "./animator";

// Ready-made behaviors
export * from "./behaviors/idle";
export * from "./behaviors/look-at";
export * from "./behaviors/gesture";

// Live animator -> THREE.AnimationClip
export * from "./bake";
