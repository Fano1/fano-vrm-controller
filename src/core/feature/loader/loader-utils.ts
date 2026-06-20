import * as THREE from "three";
import { VRM } from "@pixiv/three-vrm";


/**
 * This function helps in disposition of the material 
 * @param material 
 */


function disposeMaterial(material: THREE.Material) {
  const materialWithTextures = material as THREE.Material & {
    [key: string]: unknown;
  };

  for (const value of Object.values(materialWithTextures)) {
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }

  material.dispose();
}

/**
 * Dispose VRM
 * @param vrm 
 */

export function disposeVRM(vrm: VRM) {
  const root = vrm.scene;

  root.removeFromParent();

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;

    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    const material = mesh.material;

    if (Array.isArray(material)) {
      material.forEach(disposeMaterial);
    } else if (material) {
      disposeMaterial(material);
    }
  });
}

