import type * as THREE from "three";

export interface MorphTargetBinding {
  mesh: THREE.Mesh | THREE.SkinnedMesh;
  index: number;
}

export type FclGroup = "ALL" | "EYE" | "MTH" | "BRW" | "UNKNOWN";