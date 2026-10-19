/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import * as THREE from "three";
import { VRMHumanBoneList } from "@pixiv/three-vrm";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { createRigFrame, type RigFrame } from "../procedural/rig-frame";
import { noise } from "../procedural/signals";
import type { Signal } from "../procedural/procedural-type";
import type { VRMAvatar } from "../core/feature/loader";
import {
  JIGGLE_BASE,
  JIGGLE_BONE_DEFAULTS,
  JIGGLE_ZONES,
} from "./jiggle-presets";
import type {
  JiggleBoneOptions,
  JiggleOptions,
  JiggleTarget,
  ResolvedJiggleBone,
  Vec3Like,
} from "./jiggle-type";

/** Longest sub-step the spring integrates, for stability at high `hz`. */
const MAX_SUBSTEP = 1 / 240;

/** A frame longer than this is a stall (a backgrounded tab), not motion. */
const MAX_DELTA = 0.1;

/** Frames shorter than this carry no usable timing — skipped, not divided by. */
const MIN_DELTA = 1e-4;

/** A lever point faster than this (m/s) was teleported, not moved. */
const MAX_SPEED = 25;

/** Ceiling on measured acceleration (m/s², roughly 6 g) — bounds a hard landing. */
const MAX_ACCELERATION = 60;

const DEG = Math.PI / 180;

interface JiggleNode {
  target: JiggleTarget;
  object: THREE.Object3D;
  /** Humanoid (normalized) bones follow the rig convention; other nodes don't. */
  humanoid: boolean;
  /** What the caller asked for, kept so a later partial `enable()` can merge. */
  overrides: JiggleBoneOptions;
  options: ResolvedJiggleBone;
  /** Lever direction in the node's own frame, unit length. */
  dir: THREE.Vector3;
  depth: number;

  /** The soft mass's displacement and velocity, in the node's own frame. */
  offset: THREE.Vector3;
  velocity: THREE.Vector3;

  /** The lever point's last world position and velocity, and how many we have. */
  point: THREE.Vector3;
  pointVelocity: THREE.Vector3;
  acceleration: THREE.Vector3;
  samples: 0 | 1 | 2;

  /** What we last added to the bone, and the rotation that resulted. */
  applied: THREE.Quaternion;
  written: THREE.Quaternion;
  hasWritten: boolean;

  ambient: [Signal, Signal, Signal];
}

// Scratch objects, shared: `update` is synchronous and never re-enters.
const _base = new THREE.Quaternion();
const _inverse = new THREE.Quaternion();
const _frame = new THREE.Quaternion();
const _parentPosition = new THREE.Vector3();
const _parentQuaternion = new THREE.Quaternion();
const _parentScale = new THREE.Vector3();
const _point = new THREE.Vector3();
const _velocity = new THREE.Vector3();
const _acceleration = new THREE.Vector3();
const _local = new THREE.Vector3();
const _perpendicular = new THREE.Vector3();
const _tip = new THREE.Vector3();
const _jiggle = new THREE.Quaternion();
const _vector = new THREE.Vector3();

/** Find the node a target names, or `null`. Never throws. */
function resolveObject(
  vrm: VRM,
  target: JiggleTarget,
): { object: THREE.Object3D; humanoid: boolean } | null {
  const normalized = vrm.humanoid.getNormalizedBoneNode(target as VRMHumanBoneName);
  if (normalized) return { object: normalized, humanoid: true };

  // A humanoid name this model simply doesn't have — don't go hunting for a
  // node that happens to share it.
  if ((VRMHumanBoneList as readonly string[]).includes(target)) return null;

  const object = vrm.scene.getObjectByName(target);
  return object ? { object, humanoid: false } : null;
}

function depthOf(object: THREE.Object3D): number {
  let depth = 0;
  for (let node = object.parent; node; node = node.parent) depth += 1;
  return depth;
}

/**
 * List the nodes in a model that are worth offering to {@link VRMJiggle.enable}
 * by name: bones that are **not** humanoid bones and **not** already simulated
 * by the model's own spring bones.
 *
 * The second exclusion matters. The VRM spring-bone system rewrites its bones'
 * rotations itself, after this runs, so jiggle on one would be silently
 * overwritten. What's left is the skeleton an artist added for exactly this kind
 * of thing — a bust bone, a tail, a ribbon — and it's where localised jiggle
 * lives, since rotating a humanoid bone moves everything parented to it.
 */
export function listJiggleCandidates(vrm: VRM): string[] {
  const excluded = new Set<THREE.Object3D>();

  for (const name of VRMHumanBoneList) {
    const raw = vrm.humanoid.getRawBoneNode(name);
    const normalized = vrm.humanoid.getNormalizedBoneNode(name);
    if (raw) excluded.add(raw);
    if (normalized) excluded.add(normalized);
  }

  for (const joint of vrm.springBoneManager?.joints ?? []) {
    excluded.add(joint.bone);
    if (joint.child) excluded.add(joint.child);
  }

  const names: string[] = [];

  vrm.scene.traverse((object) => {
    if ((object as THREE.Bone).isBone && object.name && !excluded.has(object)) {
      names.push(object.name);
    }
  });

  return names;
}

/**
 * The `registerUpdate` order {@link VRMJiggle.attach} uses. Drivers register at
 * the default `0`, so this runs after any of them however they were (re-)registered.
 */
export const JIGGLE_UPDATE_ORDER = 100;

/**
 * Secondary-motion physics: bones that wobble and settle in response to how the
 * body moves.
 *
 * Each jiggling bone carries a **soft mass on a lever**. The lever point's
 * acceleration is measured from the live rig, in world space, every frame; the
 * mass lags behind it on a damped spring, and the bone leans toward wherever the
 * mass has gone. So it reacts to *whatever is moving the model* — a Mixamo
 * clip, a procedural animator, manual posing, or you moving the whole avatar
 * through the scene — with no knowledge of any of them.
 *
 * ```ts
 * const jiggle = createVRMJiggle(avatar.vrm, { zones: ["chest", "hips"] });
 *
 * // After whatever animates the rig, so it layers on top of it — whenever
 * // that driver registers.
 * const detach = jiggle.attach(avatar);
 *
 * jiggle.enable("head", { hz: 2.5, gain: 0.6 }); // add or retune a bone
 * jiggle.impulse("chest", { y: 1 });             // a kick, m/s
 * jiggle.intensity = 1.5;                        // exaggerate everything
 * ```
 *
 * **It layers; it doesn't own the rig.** Unlike a Mixamo mixer or a
 * `ProceduralAnimator`, this never claims the bones it moves. Each frame it
 * works out what the bone's rotation would be *without* its own previous nudge,
 * then adds a fresh one on top. If something else rewrote the bone since — the
 * mixer does, every frame — that new value is taken as the base. If nothing did,
 * its own last nudge is subtracted first, so it never accumulates. Register it
 * **after** the thing that animates the rig.
 *
 * A humanoid bone's rotation moves everything parented to it, so humanoid
 * jiggle reads as the upper body settling after a bounce. For a localised wobble
 * give it a non-humanoid bone by name — see {@link listJiggleCandidates}.
 *
 * It does not bake: its input is the rig's actual motion, and `bakeAnimator`
 * never moves the rig. Bake the base motion and run jiggle live on top.
 */
export class VRMJiggle {
  /** Master switch. Turning it off removes every jiggle from the rig at once. */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (value === this._enabled) return;
    this._enabled = value;
    if (!value) this.reset();
  }

  /** Global multiplier on every bone's `gain`. */
  intensity: number;

  /** Constant background wobble, m/s². See {@link JiggleOptions.ambient}. */
  ambient: number;

  /** Seconds of acceleration smoothing. See {@link JiggleOptions.smoothing}. */
  smoothing: number;

  private _enabled = true;
  private readonly frame: RigFrame;
  private nodes: JiggleNode[] = [];
  private elapsed = 0;
  private seed = 0;

  constructor(
    private readonly vrm: VRM,
    options: JiggleOptions = {},
  ) {
    this.frame = createRigFrame(vrm);
    this.intensity = options.intensity ?? 1;
    this.ambient = options.ambient ?? 0;
    this.smoothing = options.smoothing ?? 0.03;

    for (const zone of options.zones ?? ["chest", "hips"]) {
      for (const bone of JIGGLE_ZONES[zone]) this.enable(bone);
    }

    for (const [target, value] of Object.entries(options.bones ?? {})) {
      if (value === false) this.disable(target);
      else this.enable(target, value === true || !value ? {} : value);
    }
  }

  /** Whether the model has a node this target names (jiggling or not). */
  has(target: JiggleTarget): boolean {
    return resolveObject(this.vrm, target) !== null;
  }

  /** Whether this target is currently jiggling. */
  isEnabled(target: JiggleTarget): boolean {
    return this.find(target) !== undefined;
  }

  /** Every jiggling target, parents first (the order they're simulated in). */
  list(): JiggleTarget[] {
    return this.nodes.map((node) => node.target);
  }

  /** The fully-resolved options for a jiggling target, or `null`. */
  getOptions(target: JiggleTarget): ResolvedJiggleBone | null {
    const node = this.find(target);
    return node ? { ...node.options, lever: { ...node.options.lever } } : null;
  }

  /**
   * Start `target` jiggling, or retune it if it already is. Options merge with
   * what it was given before, and the spring keeps its state, so dragging a
   * slider while it's moving is smooth rather than a restart.
   *
   * Returns `false` if the model has no such node.
   */
  enable(target: JiggleTarget, options: JiggleBoneOptions = {}): boolean {
    const existing = this.find(target);

    if (existing) {
      existing.overrides = { ...existing.overrides, ...options };
      this.configure(existing);
      return true;
    }

    const found = resolveObject(this.vrm, target);
    if (!found) return false;

    const node: JiggleNode = {
      target,
      object: found.object,
      humanoid: found.humanoid,
      overrides: { ...options },
      options: { ...JIGGLE_BASE, lever: { x: 0, y: 1, z: 0 } },
      dir: new THREE.Vector3(0, 1, 0),
      depth: depthOf(found.object),
      offset: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      point: new THREE.Vector3(),
      pointVelocity: new THREE.Vector3(),
      acceleration: new THREE.Vector3(),
      samples: 0,
      applied: new THREE.Quaternion(),
      written: new THREE.Quaternion(),
      hasWritten: false,
      // Distinct seeds per axis and per node, or everything drifts in lockstep.
      ambient: [0, 1, 2].map((axis) =>
        noise({ hz: 0.7, amp: 1, seed: this.seed * 3 + axis + 11 }),
      ) as JiggleNode["ambient"],
    };

    this.seed += 1;
    this.configure(node);

    this.nodes.push(node);
    // Parents first, so a child measures against a parent that has already
    // moved this frame — that's what lets a wobble cascade down a chain.
    this.nodes.sort((a, b) => a.depth - b.depth);

    return true;
  }

  /** Stop `target` jiggling and take its nudge off the rig. Returns whether it was on. */
  disable(target: JiggleTarget): boolean {
    const node = this.find(target);
    if (!node) return false;

    this.release(node);
    this.nodes = this.nodes.filter((other) => other !== node);
    return true;
  }

  /**
   * Kick `target`'s mass, as a velocity in **m/s** in the bone's own frame
   * (authored in the VRM 1.0 convention for humanoid bones, +Z forward). Handy
   * for a poke, a hit reaction, or a footstep. Returns `false` if it isn't
   * jiggling.
   */
  impulse(target: JiggleTarget, velocity: Vec3Like): boolean {
    const node = this.find(target);
    if (!node) return false;

    _vector.set(velocity.x ?? 0, velocity.y ?? 0, velocity.z ?? 0);
    if (node.humanoid) this.frame.vector(_vector);

    node.velocity.add(_vector);
    return true;
  }

  /**
   * Advance the simulation by `delta` seconds and write the result onto the
   * bones. Call once per frame, **after** whatever animates the rig — ideally
   * via `avatar.registerUpdate`. Chainable.
   */
  update(delta: number): this {
    if (!this._enabled || !(delta > MIN_DELTA)) return this;

    // A stall is not motion: integrate the spring for a capped step, but don't
    // let the gap between two far-apart frames read as a huge acceleration.
    const measure = delta <= MAX_DELTA;
    const dt = Math.min(delta, MAX_DELTA);
    this.elapsed += dt;

    const smoothing = Math.max(this.smoothing, 1e-4);
    const blend = 1 - Math.exp(-dt / smoothing);

    for (const node of this.nodes) this.step(node, dt, measure, blend);

    return this;
  }

  /**
   * Run this every frame on `avatar`, after everything that animates its rig.
   * Returns a function that stops it and takes the nudges off the rig.
   *
   * It registers with `order` {@link JIGGLE_UPDATE_ORDER}, so a mixer or
   * procedural driver that is registered later — a mode switch in a UI does
   * exactly that — still runs first. Equivalent to
   * `avatar.registerUpdate(d => jiggle.update(d), { order: 100 })`.
   */
  attach(avatar: Pick<VRMAvatar, "registerUpdate">): () => void {
    const stop = avatar.registerUpdate((delta) => this.update(delta), {
      order: JIGGLE_UPDATE_ORDER,
    });

    return () => {
      stop();
      this.reset();
    };
  }

  /**
   * Take every nudge off the rig and settle every spring. The nodes stay
   * enabled. Call before handing the rig to something that will read its pose.
   */
  reset(): this {
    for (const node of this.nodes) this.release(node);
    this.elapsed = 0;
    return this;
  }

  /** Stop everything and clean the rig. The controller is empty afterwards. */
  dispose(): void {
    this.reset();
    this.nodes = [];
  }

  /** A snapshot of every jiggling bone, handy while debugging. */
  debug() {
    return {
      enabled: this._enabled,
      intensity: this.intensity,
      ambient: this.ambient,
      bones: this.nodes.map((node) => ({
        target: node.target,
        humanoid: node.humanoid,
        // Rotation angle of the current nudge, in degrees.
        angle: 2 * Math.acos(Math.min(1, Math.abs(node.applied.w))) / DEG,
        offset: node.offset.toArray(),
        options: this.getOptions(node.target),
      })),
    };
  }

  // -- Internals --------------------------------------------------------------

  private find(target: JiggleTarget): JiggleNode | undefined {
    return this.nodes.find((node) => node.target === target);
  }

  /** Resolve a node's options and lever from its overrides. Keeps spring state. */
  private configure(node: JiggleNode): void {
    const preset = node.humanoid
      ? JIGGLE_BONE_DEFAULTS[node.target as VRMHumanBoneName]
      : undefined;

    const chosen = { ...preset, ...node.overrides };
    let lever = chosen.lever;
    let length = chosen.length;

    // A node that isn't a humanoid bone has no tuned preset, but it does have an
    // axis: the way it points toward its first child. Same idea spring bones use.
    if (!node.humanoid && (!lever || length === undefined)) {
      const child = node.object.children.find(
        (candidate) => candidate.position.lengthSq() > 1e-8,
      );

      if (child) {
        if (!lever) lever = child.position;
        if (length === undefined) {
          length = THREE.MathUtils.clamp(child.position.length(), 0.04, 0.3);
        }
      }
    }

    const resolvedLever = {
      x: lever?.x ?? 0,
      y: lever?.y ?? (lever ? 0 : 1),
      z: lever?.z ?? 0,
    };

    node.dir.set(resolvedLever.x, resolvedLever.y, resolvedLever.z);
    if (node.dir.lengthSq() < 1e-12) node.dir.set(0, 1, 0);
    node.dir.normalize();

    // Authored in the VRM 1.0 convention; a 0.x rig faces the other way.
    if (node.humanoid) this.frame.vector(node.dir);

    node.options = {
      hz: Math.max(0.05, chosen.hz ?? JIGGLE_BASE.hz),
      damping: Math.max(0, chosen.damping ?? JIGGLE_BASE.damping),
      gain: chosen.gain ?? JIGGLE_BASE.gain,
      length: Math.max(0.005, length ?? JIGGLE_BASE.length),
      maxAngle: THREE.MathUtils.clamp(chosen.maxAngle ?? JIGGLE_BASE.maxAngle, 0, 89),
      lever: resolvedLever,
    };
  }

  /** Remove a node's last nudge (if nothing else has touched the bone) and zero it. */
  private release(node: JiggleNode): void {
    const quaternion = node.object.quaternion;

    if (node.hasWritten && quaternion.equals(node.written)) {
      quaternion.multiply(_inverse.copy(node.applied).invert());
    }

    node.hasWritten = false;
    node.applied.identity();
    node.written.identity();
    node.offset.set(0, 0, 0);
    node.velocity.set(0, 0, 0);
    node.acceleration.set(0, 0, 0);
    node.samples = 0;
  }

  private step(node: JiggleNode, dt: number, measure: boolean, blend: number): void {
    const { object, options, dir } = node;
    const parent = object.parent;
    if (!parent) return;

    // 1. The bone's rotation without our own previous nudge. If something else
    //    rewrote it since we wrote, that fresh value *is* the base; if nothing
    //    did, subtract what we added so it can't accumulate.
    const quaternion = object.quaternion;

    if (node.hasWritten && quaternion.equals(node.written)) {
      _base.copy(quaternion).multiply(_inverse.copy(node.applied).invert());
    } else {
      _base.copy(quaternion);
    }

    // 2. Where the lever point is in the world, computed from the un-nudged
    //    rotation so our own previous output can't feed back into the
    //    measurement. The parent chain is refreshed because the world matrices
    //    still hold last frame's render.
    parent.updateWorldMatrix(true, false);
    parent.matrixWorld.decompose(_parentPosition, _parentQuaternion, _parentScale);

    _point
      .copy(dir)
      .multiplyScalar(options.length)
      .applyQuaternion(_base)
      .add(object.position)
      .applyMatrix4(parent.matrixWorld);

    // 3. Velocity, then acceleration, by finite difference — dropping the history
    //    on a teleport, a stall, or anything faster than a person can move.
    let excited = false;

    if (!measure) node.samples = 0;

    if (node.samples > 0) {
      _velocity.subVectors(_point, node.point).divideScalar(dt);

      if (_velocity.lengthSq() > MAX_SPEED * MAX_SPEED) {
        node.samples = 0;
      } else {
        if (node.samples > 1) {
          _acceleration.subVectors(_velocity, node.pointVelocity).divideScalar(dt);
          excited = true;
        }

        node.pointVelocity.copy(_velocity);
        node.samples = 2;
      }
    }

    if (node.samples === 0) node.samples = 1;
    node.point.copy(_point);

    if (!excited) _acceleration.set(0, 0, 0);
    if (_acceleration.lengthSq() > MAX_ACCELERATION * MAX_ACCELERATION) {
      _acceleration.setLength(MAX_ACCELERATION);
    }

    node.acceleration.lerp(_acceleration, blend);

    // 4. Into the bone's own frame. The mass feels the frame accelerating, so the
    //    force on it is the *negative* of the lever point's acceleration.
    _frame.copy(_parentQuaternion).multiply(_base).invert();
    _local.copy(node.acceleration).applyQuaternion(_frame);

    if (this.ambient > 0) {
      _local.x += node.ambient[0](this.elapsed, dt) * this.ambient;
      _local.y += node.ambient[1](this.elapsed, dt) * this.ambient;
      _local.z += node.ambient[2](this.elapsed, dt) * this.ambient;
    }

    // 5. A damped spring, sub-stepped so a stiff one stays stable.
    const omega = 2 * Math.PI * options.hz;
    const stiffness = omega * omega;
    const damping = 2 * options.damping * omega;
    const drive = options.gain * this.intensity;

    const steps = Math.max(1, Math.ceil(dt / MAX_SUBSTEP));
    const h = dt / steps;
    const { offset, velocity } = node;

    for (let i = 0; i < steps; i += 1) {
      velocity.x += (-stiffness * offset.x - damping * velocity.x - drive * _local.x) * h;
      velocity.y += (-stiffness * offset.y - damping * velocity.y - drive * _local.y) * h;
      velocity.z += (-stiffness * offset.z - damping * velocity.z - drive * _local.z) * h;

      offset.addScaledVector(velocity, h);
    }

    if (!Number.isFinite(offset.x + offset.y + offset.z + velocity.x + velocity.y + velocity.z)) {
      this.release(node);
      return;
    }

    // 6. A hard ceiling on the lean: clamp the displacement, and kill whatever
    //    velocity was still pushing outward so it doesn't pin against the wall.
    const limit = options.length * Math.tan(options.maxAngle * DEG);
    const distance = offset.length();

    if (distance > limit) {
      if (limit > 0) {
        offset.multiplyScalar(limit / distance);
        const outward = velocity.dot(offset) / limit;
        if (outward > 0) velocity.addScaledVector(offset, -outward / limit);
      } else {
        offset.set(0, 0, 0);
        velocity.set(0, 0, 0);
      }
    }

    // 7. The bone leans toward the mass: rotate the lever to point at where its
    //    tip now is. Only the part of the displacement *across* the lever can
    //    turn it; motion along it changes nothing.
    _perpendicular.copy(offset).addScaledVector(dir, -offset.dot(dir));
    _tip.copy(dir).multiplyScalar(options.length).add(_perpendicular).normalize();
    _jiggle.setFromUnitVectors(dir, _tip);

    quaternion.copy(_base).multiply(_jiggle);

    node.applied.copy(_jiggle);
    node.written.copy(quaternion);
    node.hasWritten = true;
  }
}

/** Create a {@link VRMJiggle} controller for a loaded VRM. */
export function createVRMJiggle(vrm: VRM, options: JiggleOptions = {}): VRMJiggle {
  return new VRMJiggle(vrm, options);
}
