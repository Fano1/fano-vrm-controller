/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

// Types
export * from "./body-type";

// Euler <-> quaternion helpers (public — handy for building your own UI)
export {
  quaternionToEulerDegrees,
  eulerDegreesToQuaternion,
  mergeEulerDegrees,
} from "./body-utils";

// The controller
export * from "./vrm-body";
