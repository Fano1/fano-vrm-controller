/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

// Types
export * from "./jiggle-type";

// Tuned defaults, exposed so a UI can show them and a caller can start from them
export { JIGGLE_BASE, JIGGLE_BONE_DEFAULTS, JIGGLE_ZONES } from "./jiggle-presets";

// The controller, and the helper that finds non-humanoid bones worth jiggling
export * from "./vrm-jiggle";
