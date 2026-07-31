/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

// Types & preset catalogs
export * from "./face-type";
export * from "./expression-preset";
export * from "../lib/FCL-presets";

// Public fuzzy-matcher builders (internal helpers like clamp01 /
// collectMorphTargets stay unexported — they are controller plumbing).
export {
  createMouthPatterns,
  createExpressionPatterns,
  createBrowPatterns,
  BLINK_PATTERNS,
  BLINK_LEFT_PATTERNS,
  BLINK_RIGHT_PATTERNS,
} from "./face-utils";

// Raw / standard controllers (escape hatches)
export * from "./expression-controller";
export * from "./face-controller";

// Separated concern controllers
export * from "./controllers/emotion-controller";
export * from "./controllers/viseme-controller";
export * from "./controllers/eye-controller";
export * from "./controllers/brow-controller";
export * from "./controllers/auto-blink";

// Unified facade
export * from "./vrm-face";
