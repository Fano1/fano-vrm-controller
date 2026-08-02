/**
 * Fano VRM Controller
 * Copyright (c) 2026 Ayush Pradhan
 * Licensed under Apache-2.0 with additional attribution terms.
 *
 * Attribution required:
 * "Fano VRM Controller by Ayush Pradhan"
 */

import * as THREE from "three";
import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { VRMBody } from "../body/vrm-body";
import { createRigFrame } from "./rig-frame";
import type { PoseSink } from "./procedural-type";

/**
 * A sink that writes straight to the live model through {@link VRMBody}.
 *
 * This is the **write boundary**: animators author in the VRM 1.0 convention,
 * and this converts to whatever the model actually uses — see
 * {@link createRigFrame} for why a VRM 0.x rig needs mirroring and a VRM 1.0
 * one doesn't.
 *
 * Rotations are otherwise passed through as-is: the normalized rig rests at
 * identity, so an absolute local rotation already *is* the offset from rest.
 *
 * Positions are offsets, so this adds them to the bone's rest position. Rest
 * is captured **lazily, on the first write to each bone**: because procedural
 * animation owns the rig exclusively (never share it with a Mixamo mixer), the
 * value present the first time we touch a bone is by definition its rest
 * value. That self-corrects regardless of when the sink was created. Rest is
 * read from the model, so it's already in rig space — only the offset needs
 * converting.
 */
export function createBodySink(body: VRMBody): PoseSink {
  const frame = createRigFrame(body.vrm);
  const restPositions = new Map<VRMHumanBoneName, THREE.Vector3>();
  const scratchRotation = new THREE.Quaternion();
  const scratchPosition = new THREE.Vector3();

  return {
    setBoneRotation(name, rotation) {
      body.setRotation(name, frame.rotation(scratchRotation.copy(rotation)));
    },

    setBonePosition(name, offset) {
      let rest = restPositions.get(name);

      if (!rest) {
        const current = body.getPosition(name);
        if (!current) return;
        rest = current.clone();
        restPositions.set(name, rest);
      }

      body.setPosition(name, frame.vector(scratchPosition.copy(offset)).add(rest));
    },
  };
}

/** One bone's sampled animation data, as flat arrays ready for a keyframe track. */
export interface RecordedBoneTrack {
  /** Flat `x, y, z, w` per frame. Empty if the bone was never rotated. */
  rotations: number[];
  /** Flat `x, y, z` offsets per frame. Empty if the bone was never positioned. */
  positions: number[];
}

/**
 * A sink that records frames instead of moving anything — the other half of
 * the {@link PoseSink} seam, and what makes {@link bakeAnimator} able to
 * sample an animator without disturbing the live model.
 */
export interface RecordingSink extends PoseSink {
  /** Open a new frame at `time` seconds. */
  beginFrame(time: number): void;
  /** Close the frame, padding any known bone that wasn't written. */
  endFrame(): void;
  /** Sample times, one per completed frame. */
  readonly times: number[];
  /** Recorded data per bone, in first-seen order. */
  readonly bones: Map<VRMHumanBoneName, RecordedBoneTrack>;
}

const IDENTITY_ROTATION = [0, 0, 0, 1] as const;
const ZERO_POSITION = [0, 0, 0] as const;

export function createRecordingSink(): RecordingSink {
  const times: number[] = [];
  const bones = new Map<VRMHumanBoneName, RecordedBoneTrack>();

  // Bones written in the frame currently open.
  const rotatedThisFrame = new Set<VRMHumanBoneName>();
  const positionedThisFrame = new Set<VRMHumanBoneName>();

  /** Frames completed so far — the length every bone's data must reach. */
  let frameCount = 0;

  function trackFor(name: VRMHumanBoneName): RecordedBoneTrack {
    let track = bones.get(name);

    if (!track) {
      track = { rotations: [], positions: [] };
      bones.set(name, track);
    }

    return track;
  }

  /**
   * Backfill a channel that started later than frame 0 so every bone's array
   * lines up with `times`. A bone first written at frame 5 is treated as
   * having been at rest for frames 0-4.
   */
  function padTo(values: number[], frames: number, rest: readonly number[]) {
    while (values.length < frames * rest.length) values.push(...rest);
  }

  return {
    times,
    bones,

    beginFrame(time: number) {
      times.push(time);
      rotatedThisFrame.clear();
      positionedThisFrame.clear();
    },

    setBoneRotation(name, rotation) {
      const track = trackFor(name);
      padTo(track.rotations, frameCount, IDENTITY_ROTATION);
      track.rotations.push(rotation.x, rotation.y, rotation.z, rotation.w);
      rotatedThisFrame.add(name);
    },

    setBonePosition(name, offset) {
      const track = trackFor(name);
      padTo(track.positions, frameCount, ZERO_POSITION);
      track.positions.push(offset.x, offset.y, offset.z);
      positionedThisFrame.add(name);
    },

    endFrame() {
      frameCount += 1;

      // A bone the animator stopped driving still needs a sample this frame,
      // otherwise its track would drift out of sync with `times`.
      for (const [name, track] of bones) {
        if (track.rotations.length > 0 && !rotatedThisFrame.has(name)) {
          padTo(track.rotations, frameCount, IDENTITY_ROTATION);
        }
        if (track.positions.length > 0 && !positionedThisFrame.has(name)) {
          padTo(track.positions, frameCount, ZERO_POSITION);
        }
      }
    },
  };
}
