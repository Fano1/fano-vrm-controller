/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import type { VRM } from "@pixiv/three-vrm";
import { JIGGLE_UPDATE_ORDER, createVRMJiggle, listJiggleCandidates } from "./vrm-jiggle";

// --- A fake rig, real three.js math -------------------------------------
// Only the VRM object is fake. The scene graph, world matrices, quaternions and
// every rotation below are three.js's own, so what's checked is the physics and
// the write-through logic — not a mock of them.

const DT = 1 / 60;
const DEG = 180 / Math.PI;

function makeRig(version: "0" | "1" = "1") {
	const scene = new THREE.Group();
	const root = new THREE.Group();
	scene.add(root);

	const bones: Record<string, THREE.Bone> = {};

	const add = (name: string, parent: THREE.Object3D, x: number, y: number, z = 0) => {
		const bone = new THREE.Bone();
		bone.name = name;
		bone.position.set(x, y, z);
		parent.add(bone);
		bones[name] = bone;
		return bone;
	};

	const hips = add("hips", root, 0, 1, 0);
	const spine = add("spine", hips, 0, 0.1, 0);
	const chest = add("chest", spine, 0, 0.15, 0);
	const neck = add("neck", chest, 0, 0.2, 0);
	add("head", neck, 0, 0.1, 0);

	// Like the real humanoid, only humanoid names resolve through it — extra bones
	// (a bust bone) are reachable only as plain scene nodes.
	const humanoid = new Set(["hips", "spine", "chest", "neck", "head"]);

	const vrm = {
		scene,
		meta: { metaVersion: version },
		humanoid: {
			getNormalizedBoneNode: (name: string) => (humanoid.has(name) ? bones[name] ?? null : null),
			getRawBoneNode: () => null,
		},
		springBoneManager: null,
	} as unknown as VRM;

	return { vrm, scene, bones, add };
}

const IDENTITY = new THREE.Quaternion();

/** How far a bone is rotated from rest, in degrees. */
const angleOf = (bone: THREE.Object3D) => bone.quaternion.angleTo(IDENTITY) * DEG;

/** The chest's lever in world space — which way the soft mass would hang. */
function leverInWorld(bone: THREE.Object3D, lever: THREE.Vector3Like) {
	bone.updateWorldMatrix(true, false);
	const origin = bone.localToWorld(new THREE.Vector3());
	return bone.localToWorld(new THREE.Vector3(lever.x, lever.y, lever.z)).sub(origin);
}

/** Run `frames` frames, calling `before` ahead of each update. */
function run(
	jiggle: { update(delta: number): unknown },
	frames: number,
	before?: (frame: number) => void,
) {
	for (let frame = 0; frame < frames; frame += 1) {
		before?.(frame);
		jiggle.update(DT);
	}
}

/** Constant acceleration `a` (m/s²) along `axis` for `frames` frames, then stop. */
function accelerate(target: THREE.Object3D, axis: "x" | "y" | "z", a: number) {
	const start = target.position[axis];
	return (frame: number) => {
		const t = frame * DT;
		target.position[axis] = start + 0.5 * a * t * t;
	};
}

describe("createVRMJiggle — setup", () => {
	it("enables the chest and hips zones by default, parents first", () => {
		const { vrm } = makeRig();
		const jiggle = createVRMJiggle(vrm);

		// upperChest isn't in this rig, so only what exists is enabled.
		expect(jiggle.list()).toEqual(["hips", "chest"]);
	});

	it("skips bones the model lacks, and unknown names, without throwing", () => {
		const { vrm } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["thighs"] });

		expect(jiggle.list()).toEqual([]);
		expect(jiggle.enable("leftUpperLeg")).toBe(false);
		expect(jiggle.enable("noSuchNode")).toBe(false);
		expect(jiggle.has("noSuchNode")).toBe(false);
		expect(jiggle.has("chest")).toBe(true);
	});

	it("does not go hunting for a node that shares a missing humanoid bone's name", () => {
		const { vrm, scene } = makeRig();
		const decoy = new THREE.Bone();
		decoy.name = "leftUpperLeg";
		scene.add(decoy);

		expect(createVRMJiggle(vrm, { zones: [] }).enable("leftUpperLeg")).toBe(false);
	});

	it("applies per-bone overrides after zones: true enables, false removes", () => {
		const { vrm } = makeRig();

		const jiggle = createVRMJiggle(vrm, {
			zones: ["chest", "hips"],
			bones: { hips: false, head: true, neck: { hz: 5 } },
		});

		expect(jiggle.list().sort()).toEqual(["chest", "head", "neck"]);
		expect(jiggle.getOptions("neck")?.hz).toBe(5);
	});

	it("resolves tuned defaults for humanoid bones and a base for the rest", () => {
		const { vrm } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });

		const options = jiggle.getOptions("chest")!;
		expect(options.hz).toBe(3);
		expect(options.lever).toEqual({ x: 0, y: 0.7, z: 0.7 });
		expect(options.maxAngle).toBe(7);
	});
});

describe("createVRMJiggle — physics", () => {
	it("does nothing at rest: no motion, no jiggle", () => {
		const { vrm, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm);

		run(jiggle, 240);

		expect(angleOf(bones.chest!)).toBeLessThan(1e-9);
		expect(angleOf(bones.hips!)).toBeLessThan(1e-9);
	});

	it("leans the chest back when the body accelerates forward", () => {
		const { vrm, bones } = makeRig("1");
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"], bones: { chest: { maxAngle: 60 } } });

		const lever = jiggle.getOptions("chest")!.lever;
		const rest = leverInWorld(bones.chest!, lever);

		// A VRM 1.0 model faces +Z, so +Z is forward.
		run(jiggle, 12, accelerate(bones.hips!, "z", 6));

		const leaning = leverInWorld(bones.chest!, lever);

		// Inertia: the mass lags behind, so the lever tips toward -Z.
		expect(leaning.z).toBeLessThan(rest.z - 1e-3);
		expect(angleOf(bones.chest!)).toBeGreaterThan(0.05);
	});

	it("leans the same physical way on a VRM 0.x rig, which faces the other way", () => {
		const { vrm, scene, bones } = makeRig("0");
		// The convention the demos use: turn a 0.x model to face +Z in the world.
		scene.rotation.y = Math.PI;

		const jiggle = createVRMJiggle(vrm, { zones: ["chest"], bones: { chest: { maxAngle: 60 } } });
		const rig = jiggle.getOptions("chest")!.lever;
		const rest = leverInWorld(bones.chest!, rig);

		// World +Z is forward for it, which is local -Z in the rig.
		run(jiggle, 12, accelerate(bones.hips!, "z", -6));

		const leaning = leverInWorld(bones.chest!, rig);

		// Same inertia, same visible result: the mass tips toward world -Z.
		expect(leaning.z).toBeLessThan(rest.z - 1e-3);
	});

	it("reacts to the whole avatar being moved through the scene", () => {
		const { vrm, scene, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });

		run(jiggle, 12, accelerate(scene, "z", 6));

		expect(angleOf(bones.chest!)).toBeGreaterThan(0.05);
	});

	it("settles back to rest once the motion stops", () => {
		const { vrm, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });

		run(jiggle, 12, accelerate(bones.hips!, "z", 6));
		run(jiggle, 60 * 4);

		expect(angleOf(bones.chest!)).toBeLessThan(0.01);
	});

	it("rings before it settles — underdamped, so it overshoots", () => {
		const { vrm, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm, {
			zones: ["chest"],
			bones: { chest: { damping: 0.1, maxAngle: 60 } },
		});

		jiggle.impulse("chest", { z: 1 });

		// Track the displacement along the axis it was kicked on.
		const signs = new Set<number>();
		for (let frame = 0; frame < 90; frame += 1) {
			jiggle.update(DT);
			const sign = Math.sign(bones.chest!.quaternion.x);
			if (Math.abs(bones.chest!.quaternion.x) > 1e-5) signs.add(sign);
		}

		expect(signs.has(1)).toBe(true);
		expect(signs.has(-1)).toBe(true);
	});

	it("scales with gain", () => {
		const peak = (gain: number) => {
			const { vrm, bones } = makeRig();
			const jiggle = createVRMJiggle(vrm, {
				zones: ["chest"],
				bones: { chest: { gain, maxAngle: 80 } },
			});

			let max = 0;
			run(jiggle, 20, (frame) => {
				accelerate(bones.hips!, "z", 4)(frame);
				max = Math.max(max, angleOf(bones.chest!));
			});
			return max;
		};

		expect(peak(1)).toBeGreaterThan(peak(0.5) * 1.5);
	});

	it("scales with the global intensity", () => {
		const peak = (intensity: number) => {
			const { vrm, bones } = makeRig();
			const jiggle = createVRMJiggle(vrm, {
				zones: ["chest"],
				intensity,
				bones: { chest: { maxAngle: 80 } },
			});

			let max = 0;
			run(jiggle, 20, (frame) => {
				accelerate(bones.hips!, "z", 4)(frame);
				max = Math.max(max, angleOf(bones.chest!));
			});
			return max;
		};

		expect(peak(2)).toBeGreaterThan(peak(1) * 1.5);
		expect(peak(0)).toBeLessThan(1e-9);
	});

	it("never leans past maxAngle, however hard the hit", () => {
		const { vrm, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm, {
			zones: ["chest"],
			bones: { chest: { maxAngle: 5, gain: 5 } },
		});

		let worst = 0;
		run(jiggle, 120, (frame) => {
			accelerate(bones.hips!, "z", 50)(frame % 8);
			worst = Math.max(worst, angleOf(bones.chest!));
		});
		jiggle.impulse("chest", { x: 40, y: 40, z: 40 });
		run(jiggle, 30, () => (worst = Math.max(worst, angleOf(bones.chest!))));

		expect(worst).toBeLessThanOrEqual(5 + 1e-6);
		expect(worst).toBeGreaterThan(1);
	});

	it("is deterministic: the same motion gives the same rotations", () => {
		const trace = () => {
			const { vrm, bones } = makeRig();
			const jiggle = createVRMJiggle(vrm, { ambient: 2 });
			const out: number[] = [];

			run(jiggle, 90, (frame) => {
				accelerate(bones.hips!, "z", 3)(frame % 30);
				out.push(...bones.chest!.quaternion.toArray());
			});
			return out;
		};

		expect(trace()).toEqual(trace());
	});

	it("moves a standing model only when ambient is on", () => {
		const idle = (ambient: number) => {
			const { vrm, bones } = makeRig();
			const jiggle = createVRMJiggle(vrm, { zones: ["chest"], ambient });
			run(jiggle, 120);
			return angleOf(bones.chest!);
		};

		expect(idle(0)).toBeLessThan(1e-9);
		expect(idle(6)).toBeGreaterThan(0.01);
	});

	it("ignores a teleport instead of reading it as a violent acceleration", () => {
		const { vrm, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });

		run(jiggle, 10);
		bones.hips!.position.z += 100; // the avatar is moved, not driven
		run(jiggle, 3);

		expect(angleOf(bones.chest!)).toBeLessThan(0.01);
	});

	it("survives a stalled frame (a backgrounded tab) and one with no time at all", () => {
		const { vrm, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });

		jiggle.impulse("chest", { z: 1 });
		jiggle.update(5);
		jiggle.update(0);
		jiggle.update(-1);
		jiggle.update(Number.NaN);

		const { x, y, z, w } = bones.chest!.quaternion;
		expect([x, y, z, w].every(Number.isFinite)).toBe(true);
	});
});

describe("createVRMJiggle — layering on a rig someone else animates", () => {
	it("composes on top of a base the animator rewrites every frame", () => {
		const { vrm, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });

		const base = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.2, -0.1));

		jiggle.impulse("chest", { z: 1 });

		for (let frame = 0; frame < 6; frame += 1) {
			bones.chest!.quaternion.copy(base); // a mixer rewriting the bone
			jiggle.update(DT);
		}

		// Nudged off the animated pose, but never further than the bone's ceiling
		// (7 degrees for the chest) — it layers on the base, it doesn't replace it.
		const off = bones.chest!.quaternion.angleTo(base) * DEG;
		expect(off).toBeGreaterThan(0.05);
		expect(off).toBeLessThanOrEqual(7 + 1e-6);
	});

	it("returns exactly to the animated pose once the jiggle dies", () => {
		const { vrm, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });
		const base = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 0.2, -0.1));

		jiggle.impulse("chest", { z: 1 });

		for (let frame = 0; frame < 60 * 5; frame += 1) {
			bones.chest!.quaternion.copy(base);
			jiggle.update(DT);
		}

		expect(bones.chest!.quaternion.angleTo(base) * DEG).toBeLessThan(0.01);
	});

	it("does not accumulate on a bone nothing else rewrites", () => {
		const { vrm, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });

		// No animator touches the chest at all. If each frame's nudge were added
		// to the last, this would drift without bound.
		jiggle.impulse("chest", { z: 1 });
		run(jiggle, 60 * 6);

		expect(angleOf(bones.chest!)).toBeLessThan(0.01);
	});

	it("takes its nudge off exactly on reset()", () => {
		const { vrm, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });

		jiggle.impulse("chest", { z: 1 });
		run(jiggle, 4);
		expect(angleOf(bones.chest!)).toBeGreaterThan(0.01);

		jiggle.reset();

		expect(angleOf(bones.chest!)).toBeLessThan(1e-9);
		expect(jiggle.list()).toEqual(["chest"]); // still enabled
	});

	it("takes its nudge off a bone when that bone is disabled", () => {
		const { vrm, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });

		jiggle.impulse("chest", { z: 1 });
		run(jiggle, 4);

		expect(jiggle.disable("chest")).toBe(true);
		expect(angleOf(bones.chest!)).toBeLessThan(1e-9);
		expect(jiggle.isEnabled("chest")).toBe(false);
		expect(jiggle.disable("chest")).toBe(false);
	});

	it("cleans the rig when switched off, and stays inert until switched back on", () => {
		const { vrm, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });

		jiggle.impulse("chest", { z: 1 });
		run(jiggle, 4);

		jiggle.enabled = false;
		expect(angleOf(bones.chest!)).toBeLessThan(1e-9);

		jiggle.impulse("chest", { z: 1 });
		run(jiggle, 10);
		expect(angleOf(bones.chest!)).toBeLessThan(1e-9);

		jiggle.enabled = true;
		jiggle.impulse("chest", { z: 1 });
		run(jiggle, 4);
		expect(angleOf(bones.chest!)).toBeGreaterThan(0.01);
	});

	it("leaves a bone alone if something rewrote it between reset and the next frame", () => {
		const { vrm, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });

		jiggle.impulse("chest", { z: 1 });
		run(jiggle, 4);

		// Someone else takes the bone. Our stale record must not be "stripped" from it.
		const theirs = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0, 0));
		bones.chest!.quaternion.copy(theirs);
		jiggle.reset();

		// Untouched, bit for bit: `angleTo` bottoms out around 3e-8 on acos alone.
		expect(bones.chest!.quaternion.equals(theirs)).toBe(true);
	});
});

describe("createVRMJiggle — retuning and kicking", () => {
	it("impulse sets a bone moving, and reports whether the bone is jiggling", () => {
		const { vrm, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });

		expect(jiggle.impulse("hips", { z: 1 })).toBe(false);
		expect(jiggle.impulse("chest", { z: 1 })).toBe(true);

		run(jiggle, 6);
		expect(angleOf(bones.chest!)).toBeGreaterThan(0.01);
	});

	it("merges options on a later enable() and keeps the spring's state", () => {
		const { vrm } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });

		jiggle.impulse("chest", { z: 1 });
		run(jiggle, 5);
		const before = jiggle.debug().bones[0]!.angle;

		jiggle.enable("chest", { gain: 2 });
		const after = jiggle.debug().bones[0]!.angle;

		// Retuned, not restarted — dragging a slider mid-wobble must not snap.
		expect(after).toBeCloseTo(before, 6);
		expect(jiggle.getOptions("chest")?.gain).toBe(2);
		expect(jiggle.getOptions("chest")?.hz).toBe(3); // untouched
	});

	it("exposes the resolved options as a copy", () => {
		const { vrm } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });

		const options = jiggle.getOptions("chest")!;
		options.hz = 99;
		options.lever.y = 99;

		expect(jiggle.getOptions("chest")?.hz).toBe(3);
		expect(jiggle.getOptions("chest")?.lever.y).toBe(0.7);
		expect(jiggle.getOptions("hips")).toBeNull();
	});

	it("dispose() cleans the rig and empties the controller", () => {
		const { vrm, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });

		jiggle.impulse("chest", { z: 1 });
		run(jiggle, 4);
		jiggle.dispose();

		expect(angleOf(bones.chest!)).toBeLessThan(1e-9);
		expect(jiggle.list()).toEqual([]);
	});
});

describe("non-humanoid nodes", () => {
	function rigWithBust() {
		const rig = makeRig();
		const bust = rig.add("Bust_L", rig.bones.chest!, 0.06, 0.05, 0.05);
		rig.add("Bust_L_end", bust, 0, 0.08, 0);
		return rig;
	}

	it("finds a node by name and takes its lever from the bone's own axis", () => {
		const { vrm } = rigWithBust();
		const jiggle = createVRMJiggle(vrm, { zones: [] });

		expect(jiggle.enable("Bust_L")).toBe(true);

		const options = jiggle.getOptions("Bust_L")!;
		expect(options.length).toBeCloseTo(0.08, 6);
		expect(options.lever).toEqual({ x: 0, y: 0.08, z: 0 });
	});

	it("jiggles when the body moves, and settles", () => {
		const { vrm, bones } = rigWithBust();
		const jiggle = createVRMJiggle(vrm, { zones: [] });
		jiggle.enable("Bust_L", { gain: 1, maxAngle: 40 });

		run(jiggle, 12, accelerate(bones.hips!, "z", 6));
		expect(angleOf(bones.Bust_L!)).toBeGreaterThan(0.05);

		run(jiggle, 60 * 4);
		expect(angleOf(bones.Bust_L!)).toBeLessThan(0.01);
	});

	it("lets an explicit lever and length win over the bone's axis", () => {
		const { vrm } = rigWithBust();
		const jiggle = createVRMJiggle(vrm, { zones: [] });
		jiggle.enable("Bust_L", { lever: { z: 1 }, length: 0.3 });

		expect(jiggle.getOptions("Bust_L")).toMatchObject({ length: 0.3, lever: { x: 0, y: 0, z: 1 } });
	});

	it("simulates parents before children so a wobble can cascade", () => {
		const { vrm } = rigWithBust();
		const jiggle = createVRMJiggle(vrm, { zones: [] });

		jiggle.enable("Bust_L");
		jiggle.enable("chest");
		jiggle.enable("hips");

		expect(jiggle.list()).toEqual(["hips", "chest", "Bust_L"]);
	});
});

describe("listJiggleCandidates", () => {
	it("offers non-humanoid bones, and withholds humanoid and spring-bone ones", () => {
		const { vrm, bones, add } = makeRig();

		const bust = add("Bust_L", bones.chest!, 0.06, 0.05, 0);
		add("Bust_L_end", bust, 0, 0.08, 0);

		const hair = add("Hair_1", bones.head!, 0, 0.1, 0);
		const hairTip = add("Hair_1_end", hair, 0, 0.1, 0);

		(vrm as unknown as { springBoneManager: unknown }).springBoneManager = {
			joints: new Set([{ bone: hair, child: hairTip }]),
		};

		const candidates = listJiggleCandidates(vrm);

		expect(candidates).toContain("Bust_L");
		expect(candidates).toContain("Bust_L_end");
		expect(candidates).not.toContain("chest");
		expect(candidates).not.toContain("Hair_1");
		expect(candidates).not.toContain("Hair_1_end");
	});

	it("tolerates a model with no spring bones at all", () => {
		const { vrm } = makeRig();
		expect(() => listJiggleCandidates(vrm)).not.toThrow();
		expect(listJiggleCandidates(vrm)).toEqual([]);
	});
});

describe("debug()", () => {
	it("snapshots the controller", () => {
		const { vrm } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"], intensity: 1.5 });

		jiggle.impulse("chest", { z: 1 });
		run(jiggle, 4);

		const snapshot = jiggle.debug();

		expect(snapshot.enabled).toBe(true);
		expect(snapshot.intensity).toBe(1.5);
		expect(snapshot.bones).toHaveLength(1);
		expect(snapshot.bones[0]!.target).toBe("chest");
		expect(snapshot.bones[0]!.angle).toBeGreaterThan(0);
	});
});

describe("attach()", () => {
	/** The slice of an avatar `attach` needs, recording what it was asked for. */
	function fakeAvatar() {
		const registered: { fn: (delta: number) => void; order?: number }[] = [];
		let stopped = 0;

		return {
			registered,
			get stopped() {
				return stopped;
			},
			registerUpdate(fn: (delta: number) => void, options?: { order?: number }) {
				registered.push({ fn, order: options?.order });
				return () => {
					stopped += 1;
				};
			},
		};
	}

	it("registers a late-ordered updater that drives the simulation", () => {
		const { vrm, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });
		const avatar = fakeAvatar();

		jiggle.attach(avatar);

		expect(avatar.registered).toHaveLength(1);
		expect(avatar.registered[0]!.order).toBe(JIGGLE_UPDATE_ORDER);
		expect(JIGGLE_UPDATE_ORDER).toBeGreaterThan(0); // after the default-order drivers

		jiggle.impulse("chest", { z: 1 });
		for (let frame = 0; frame < 6; frame += 1) avatar.registered[0]!.fn(DT);

		expect(angleOf(bones.chest!)).toBeGreaterThan(0.05);
	});

	it("detaches: stops updating and takes the nudge off the rig", () => {
		const { vrm, bones } = makeRig();
		const jiggle = createVRMJiggle(vrm, { zones: ["chest"] });
		const avatar = fakeAvatar();

		const detach = jiggle.attach(avatar);
		jiggle.impulse("chest", { z: 1 });
		for (let frame = 0; frame < 6; frame += 1) avatar.registered[0]!.fn(DT);
		expect(angleOf(bones.chest!)).toBeGreaterThan(0.05);

		detach();

		expect(avatar.stopped).toBe(1);
		expect(angleOf(bones.chest!)).toBeLessThan(1e-6);
	});
});
