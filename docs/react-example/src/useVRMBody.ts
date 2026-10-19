import { useRef, type RefObject } from 'react'
import { createVRMBody, type VRMBody } from '@fanoalone/vrm-controller'
import { useVRMEffect, type VRMHandle } from '@fanoalone/vrm-controller/react'

/**
 * A `VRMBody` for the current avatar, held in a ref — the same shape as
 * `useVRMFace`. `VRMBody` is stateless (it reads and writes the rig directly),
 * so there is nothing to tear down: the ref just follows the avatar.
 */
export function useVRMBody(vrm: VRMHandle): RefObject<VRMBody | null> {
  const body = useRef<VRMBody | null>(null)

  useVRMEffect(vrm, (avatar) => {
    body.current = createVRMBody(avatar.vrm)
    return () => {
      body.current = null
    }
  })

  return body
}
