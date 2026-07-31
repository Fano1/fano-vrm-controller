/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

// Types
export * from "./mixamo-type";

// Engine: pure retargeting (BYO FBXLoader / already-loaded clip)
export * from "./mixamo-retarget";

// Convenience: fetch + parse + retarget in one call
export * from "./mixamo-loader";

// Rig map + resolver (also usable standalone for custom retargeting code)
export { MIXAMO_VRM_RIG_MAP, resolveMixamoBoneName } from "../lib/RIG-maps";
