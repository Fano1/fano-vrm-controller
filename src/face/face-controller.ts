import type * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import type { FclGroup, MorphTargetBinding } from "./face-type";

type MorphTargetMesh = (THREE.Mesh | THREE.SkinnedMesh) & {
  morphTargetDictionary: Record<string, number>;
  morphTargetInfluences: number[];
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function isMorphTargetMesh(node: THREE.Object3D): node is MorphTargetMesh {
  const maybeMesh = node as Partial<MorphTargetMesh>;

  return Boolean(
    maybeMesh.morphTargetDictionary &&
      maybeMesh.morphTargetInfluences &&
      typeof maybeMesh.morphTargetDictionary === "object",
  );
}

export class VRMFaceController {
  private readonly morphTargets = new Map<string, MorphTargetBinding[]>();

  constructor(private readonly vrm: VRM) {
    this.rebuild();
  }

  rebuild() {
    this.morphTargets.clear();

    this.vrm.scene.traverse((node) => {
      if (!isMorphTargetMesh(node)) return;

      for (const [name, index] of Object.entries(node.morphTargetDictionary)) {
        const bindings = this.morphTargets.get(name) ?? [];

        bindings.push({
          mesh: node,
          index,
        });

        this.morphTargets.set(name, bindings);
      }
    });
  }

  getAvailableMorphTargets() {
    return Array.from(this.morphTargets.keys());
  }

  hasMorph(name: string) {
    return this.morphTargets.has(name);
  }

  setMorph(name: string, value: number) {
    const bindings = this.morphTargets.get(name);

    if (!bindings) {
      return false;
    }

    const clampedValue = clamp01(value);

    for (const { mesh, index } of bindings) {
      mesh.morphTargetInfluences![index] = clampedValue;
    }

    return true;
  }

  resetMorph(name: string) {
    return this.setMorph(name, 0);
  }

  findMorphTargets(query: string) {
    const pattern = new RegExp(query, "i");

    return this.getAvailableMorphTargets().filter((name) =>
      pattern.test(name),
    );
  }

  getFclMorphTargets() {
    return this.getAvailableMorphTargets().filter((name) =>
      /^Fcl_/i.test(name),
    );
  }

  getFclGroups() {
    return this.getFclMorphTargets().reduce<Record<string, string[]>>(
      (groups, name) => {
        const group = this.getFclGroupFromName(name);

        groups[group] ??= [];
        groups[group].push(name);

        return groups;
      },
      {},
    );
  }

  getFclGroupNames() {
    return Object.keys(this.getFclGroups()) as FclGroup[];
  }

  getFclTargetsByGroup(group: FclGroup | string) {
    const normalizedGroup = group.toUpperCase();

    return this.getFclMorphTargets().filter((name) => {
      return this.getFclGroupFromName(name) === normalizedGroup;
    });
  }

  getFclEmotionTargets() {
    return this.getFclTargetsByGroup("ALL");
  }

  getFclEyeTargets() {
    return this.getFclTargetsByGroup("EYE");
  }

  getFclMouthTargets() {
    return this.getFclTargetsByGroup("MTH");
  }

  getFclBrowTargets() {
    return this.getFclTargetsByGroup("BRW");
  }

  debug() {
    return {
      morphTargetCount: this.morphTargets.size,
      morphTargets: this.getAvailableMorphTargets(),
      fclGroups: this.getFclGroups(),
    };
  }

  private getFclGroupFromName(name: string) {
    return name.match(/^Fcl_([^_]+)/i)?.[1]?.toUpperCase() ?? "UNKNOWN";
  }
}

export function createVRMFaceController(vrm: VRM) {
  return new VRMFaceController(vrm);
}