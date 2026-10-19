import { useRef, type RefObject } from 'react'
import { createVRMFace, type VRMFace } from '@fanoalone/vrm-controller'
import { useVRMEffect, type VRMHandle } from '@fanoalone/vrm-controller/react'

/**
 * The one hook worth writing yourself: a `VRMFace` for the current avatar,
 * held in a ref.
 *
 * The controller is built once per avatar and nothing displays it, so it
 * belongs in a ref, not in state — building it is not a render. `useVRMEffect`
 * is the whole lifecycle: a new model builds a new face, and the old one is
 * reset on the way out, *before* the avatar is disposed.
 *
 * Declare this above any effect that reads the ref. Effects on one handle run in
 * declaration order, so the face exists by the time they do.
 */
export function useVRMFace(vrm: VRMHandle): RefObject<VRMFace | null> {
  const face = useRef<VRMFace | null>(null)

  useVRMEffect(vrm, (avatar) => {
    const next = createVRMFace(avatar.vrm)
    face.current = next
    const stop = avatar.registerUpdate((delta) => next.update(delta))

    return () => {
      stop()
      next.reset()
      face.current = null
    }
  })

  return face
}
