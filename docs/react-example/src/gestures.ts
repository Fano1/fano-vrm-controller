import type { GestureLike } from '@fanoalone/vrm-controller'

/**
 * Poses are plain degrees per bone, measured from the VRM rest pose — a T-pose,
 * so the right arm starts pointing straight out and `z: -90` takes it to
 * vertical. Upper arm and forearm rotations add up the chain, so for a wave the
 * two total about -100; past that the arm folds over the head.
 *
 * (The same three gestures as the procedural example.)
 */
export const GESTURES: Record<string, GestureLike> = {
  wave: [
    { time: 0, pose: {} },
    {
      time: 0.35,
      pose: {
        rightShoulder: { z: -6 },
        rightUpperArm: { z: -50 },
        rightLowerArm: { z: -50 },
      },
      ease: 'easeOutBack',
    },
    {
      time: 0.7,
      pose: {
        rightShoulder: { z: -6 },
        rightUpperArm: { z: -50 },
        rightLowerArm: { z: -20 },
      },
    },
    {
      time: 1.05,
      pose: {
        rightShoulder: { z: -6 },
        rightUpperArm: { z: -50 },
        rightLowerArm: { z: -50 },
      },
    },
    {
      time: 1.4,
      pose: {
        rightShoulder: { z: -6 },
        rightUpperArm: { z: -50 },
        rightLowerArm: { z: -20 },
      },
    },
    { time: 2, pose: {} },
  ],

  nod: [
    { time: 0, pose: {} },
    { time: 0.25, pose: { head: { x: 18 }, neck: { x: 8 } } },
    { time: 0.5, pose: { head: { x: -6 }, neck: { x: -2 } } },
    { time: 0.8, pose: {} },
  ],

  shrug: [
    { time: 0, pose: {} },
    {
      time: 0.4,
      pose: {
        leftShoulder: { z: 18 },
        rightShoulder: { z: -18 },
        leftUpperArm: { z: 25 },
        rightUpperArm: { z: -25 },
      },
      ease: 'easeOutCubic',
    },
    {
      time: 1,
      pose: {
        leftShoulder: { z: 18 },
        rightShoulder: { z: -18 },
        leftUpperArm: { z: 25 },
        rightUpperArm: { z: -25 },
      },
    },
    { time: 1.5, pose: {} },
  ],

  // A looping one, to show `loop` and `stop()`.
  sway: {
    keyframes: [
      { time: 0, pose: { spine: { z: 6 }, head: { z: -3 } } },
      { time: 1.5, pose: { spine: { z: -6 }, head: { z: 3 } } },
      { time: 3, pose: { spine: { z: 6 }, head: { z: -3 } } },
    ],
    loop: true,
  },
}

/**
 * Mixamo clips from `animation/` at the repo root, served at `/animation/*` by
 * `vite.config.ts`. A clip with no `url` is baked from the procedural idle
 * instead — the `bakeAnimator` path, no `.fbx` involved.
 */
export const CLIPS: { label: string; url: string | null }[] = [
  { label: 'Macarena', url: '/animation/Macarena%20Dance.fbx' },
  { label: 'Booty Hip Hop', url: '/animation/Booty%20Hip%20Hop%20Dance.fbx' },
  { label: 'Snake Hip Hop', url: '/animation/Snake%20Hip%20Hop%20Dance.fbx' },
  { label: 'Rumba (28 MB)', url: '/animation/RumbaDancing.fbx' },
  { label: 'Baked idle', url: null },
]
