/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type * as THREE from "three";

/** A single mesh + morph-target index that a blendshape name binds to. */
export interface MorphTargetBinding {
  mesh: THREE.Mesh | THREE.SkinnedMesh;
  index: number;
}

/** VRoid `Fcl_*` region prefixes used by the raw morph controller. */
export type FclGroup = "ALL" | "EYE" | "MTH" | "BRW" | "UNKNOWN";

/**
 * Phonetic viseme letters used by the fuzzy mouth matcher. These map onto the
 * VRM vowel presets: A→aa, I→ih, U→ou, E→ee, O→oh.
 */
export type VRMViseme = "A" | "I" | "U" | "E" | "O";

/** Options for a mouth/viseme write. */
export interface SetMouthOptions {
  /** Zero every other viseme first so only this shape shows. */
  resetOthers?: boolean;
}

/** Options for an emotion write. */
export interface SetEmotionOptions {
  /** Zero every other emotion first (exclusive emotion). */
  resetOthers?: boolean;
}

/** Tunables for the auto-blink finite-state machine. */
export interface AutoBlinkOptions {
  /** Minimum seconds between blinks. Default 2. */
  minDelay?: number;
  /** Maximum seconds between blinks. Default 6. */
  maxDelay?: number;
  /** Seconds to close the eyelid. Default 0.08. */
  closeDuration?: number;
  /** Seconds to reopen the eyelid. Default 0.14. */
  openDuration?: number;
  /** Peak blink weight (0..1). Default 1. */
  intensity?: number;
}
