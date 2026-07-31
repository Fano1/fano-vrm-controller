/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import type * as THREE from "three";

/** Rotation expressed as degrees around each axis, for UI-friendly joint control. */
export interface EulerDegrees {
  x: number;
  y: number;
  z: number;
}

/** A partial {@link EulerDegrees} — axes left out keep the joint's current value. */
export type PartialEulerDegrees = Partial<EulerDegrees>;

/** Rotation order for Euler conversions. Matches `THREE.Euler`'s own default ("XYZ"). */
export type EulerOrder = THREE.EulerOrder;
