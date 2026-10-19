import { memo, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm'
import {
  bakeAnimator,
  createGestureAnimator,
  createIdleAnimator,
  createLookAtAnimator,
  createProceduralAnimator,
  createVRMBody,
  loadMixamoAnimation,
  type Animator,
  type GestureAnimator,
} from '@fanoalone/vrm-controller'
import { useVRMAvatar, useVRMEffect, type VRMHandle } from '@fanoalone/vrm-controller/react'
import { count } from './counters'
import { CLIPS, GESTURES } from './gestures'
import { PerAvatar, Section, Slider, Toggle } from './ui'
import { useVRMBody } from './useVRMBody'
import { world } from './world'

/*
 * One rig, one owner.
 *
 * A Mixamo mixer, a procedural animator and a hand on a slider all write the same
 * bones, and whichever writes last wins. So exactly one of them runs at a time —
 * and in React that falls out of the component tree. Each mode below is a
 * component; while it is mounted, its effects own the rig, and unmounting it runs
 * their cleanups, which hand the rig back BEFORE the next mode's effects start
 * (React runs every cleanup in a commit before any setup). No flags, no
 * "is something else running?" bookkeeping.
 *
 * Jiggle physics is the exception, and not by accident: it owns nothing. It sits
 * on top of whichever mode is active — see JigglePanel.
 */

type Mode = 'procedural' | 'clip' | 'pose' | 'none'

const MODES: { id: Mode; label: string }[] = [
  { id: 'procedural', label: 'Procedural' },
  { id: 'clip', label: 'Mixamo clip' },
  { id: 'pose', label: 'Manual pose' },
  { id: 'none', label: 'None (T-pose)' },
]

export const BodyControls = memo(function BodyControls({ vrm }: { vrm: VRMHandle }) {
  count('Controls')
  const [mode, setMode] = useState<Mode>('procedural')

  return (
    <Section
      title="Body — who owns the rig?"
      open
      hint="Pick the one thing that drives the skeleton. Switching hands it over cleanly."
    >
      <div className="row">
        {MODES.map(({ id, label }) => (
          <button key={id} className={id === mode ? 'active' : ''} onClick={() => setMode(id)}>
            {label}
          </button>
        ))}
      </div>

      {mode === 'procedural' && <ProceduralMode vrm={vrm} />}
      {mode === 'clip' && <ClipMode vrm={vrm} />}
      {mode === 'pose' && <PoseMode vrm={vrm} />}
    </Section>
  )
})

// --- Procedural ----------------------------------------------------------

function ProceduralMode({ vrm }: { vrm: VRMHandle }) {
  const [breathing, setBreathing] = useState(true)
  const [sway, setSway] = useState(true)
  const [noise, setNoise] = useState(true)
  const [bob, setBob] = useState(false)
  const [look, setLook] = useState(true)

  const gestures = useRef<GestureAnimator | null>(null)
  const speed = useRef(1)

  // The layer stack. Changing a layer rebuilds it — the old animator is reset
  // first, so no bone is left where the last frame put it.
  useVRMEffect(
    vrm,
    (avatar) => {
      const gesture = createGestureAnimator(GESTURES)
      const layers: Animator[] = [gesture, createIdleAnimator({ breathing, sway, noise, bob })]
      if (look) layers.push(createLookAtAnimator({ target: world.camera }))

      const animator = createProceduralAnimator(avatar.vrm, layers)
      const stop = avatar.registerUpdate((delta) => animator.update(delta))
      gestures.current = gesture

      return () => {
        stop()
        animator.reset()
        gestures.current = null
      }
    },
    [breathing, sway, noise, bob, look],
  )

  return (
    <>
      <p className="hint" style={{ marginTop: 10 }}>
        Idle layers + look-at, composed by <code>createProceduralAnimator</code>. No{' '}
        <code>.fbx</code> needed.
      </p>
      <Toggle checked={breathing} onChange={setBreathing}>
        Breathing
      </Toggle>
      <Toggle checked={sway} onChange={setSway}>
        Weight shift
      </Toggle>
      <Toggle checked={noise} onChange={setNoise}>
        Head &amp; shoulder wander
      </Toggle>
      <Toggle checked={bob} onChange={setBob}>
        Hip bob (lifts the feet)
      </Toggle>
      <Toggle checked={look} onChange={setLook}>
        Head follows the camera
      </Toggle>

      <h3>Gestures</h3>
      <div className="row">
        {Object.keys(GESTURES).map((name) => (
          <button
            key={name}
            onClick={() => gestures.current?.play(name, { speed: speed.current })}
          >
            {name}
          </button>
        ))}
        <button onClick={() => gestures.current?.stop()}>stop</button>
      </div>
      <Slider
        label="speed"
        min={0.25}
        max={3}
        initial={1}
        onChange={(value) => {
          speed.current = value
        }}
      />
    </>
  )
}

// --- Mixamo clips ----------------------------------------------------------

/** Retargeted clips, cached per model — parsing the big FBX twice would be rude. */
const clipCache = new WeakMap<VRM, Map<string, Promise<THREE.AnimationClip>>>()

function loadClip(vrm: VRM, url: string): Promise<THREE.AnimationClip> {
  let perModel = clipCache.get(vrm)
  if (!perModel) clipCache.set(vrm, (perModel = new Map()))

  let clip = perModel.get(url)
  if (!clip) {
    const models = perModel
    clip = loadMixamoAnimation(url, vrm)
    clip.catch(() => models.delete(url)) // let a failed load be retried
    models.set(url, clip)
  }

  return clip
}

function ClipMode({ vrm }: { vrm: VRMHandle }) {
  const [clip, setClip] = useState<string | null>(null)
  const [status, setStatus] = useState('Pick a clip.')
  const mixer = useRef<THREE.AnimationMixer | null>(null)
  const speed = useRef(1)

  useVRMEffect(
    vrm,
    (avatar) => {
      const source = CLIPS.find((item) => item.label === clip)
      if (!source) return

      // The load is async, so the effect can be cleaned up before it finishes —
      // another clip, another mode, another model. `cancelled` is what keeps a
      // late clip from starting on a rig that has moved on.
      let cancelled = false
      let release: (() => void) | undefined

      const play = (animation: THREE.AnimationClip) => {
        if (cancelled) return

        const next = new THREE.AnimationMixer(avatar.scene)
        next.timeScale = speed.current
        next.clipAction(animation).play()
        const stop = avatar.registerUpdate((delta) => next.update(delta))
        mixer.current = next

        release = () => {
          stop()
          next.stopAllAction()
          next.uncacheRoot(avatar.scene)
          mixer.current = null
          createVRMBody(avatar.vrm).resetPose()
        }

        setStatus(`Playing ${source.label}.`)
      }

      if (source.url) {
        setStatus(`Loading ${source.label}…`)
        loadClip(avatar.vrm, source.url).then(play, (error: unknown) => {
          if (!cancelled) setStatus(`Failed: ${error instanceof Error ? error.message : error}`)
        })
      } else {
        // No file: record the procedural idle into a clip and play THAT. The
        // baker never moves the rig, so this is safe to do while it is posed.
        play(
          bakeAnimator(avatar.vrm, createIdleAnimator(), {
            duration: 4,
            fps: 30,
            loop: true,
            name: 'idle',
          }),
        )
      }

      return () => {
        cancelled = true
        release?.()
      }
    },
    [clip],
  )

  return (
    <>
      <p className="hint" style={{ marginTop: 10 }}>
        <code>loadMixamoAnimation</code> retargets an <code>.fbx</code> onto this model; the mixer
        is registered like any other driver.
      </p>
      <div className="row">
        {CLIPS.map((item) => (
          <button
            key={item.label}
            className={item.label === clip ? 'active' : ''}
            onClick={() => setClip(item.label)}
          >
            {item.label}
          </button>
        ))}
        <button
          onClick={() => {
            setClip(null)
            setStatus('Pick a clip.')
          }}
        >
          stop
        </button>
      </div>
      <p className="hint" style={{ marginTop: 8 }}>
        {status}
      </p>
      <Slider
        label="speed"
        min={0.25}
        max={2.5}
        initial={1}
        onChange={(value) => {
          speed.current = value
          if (mixer.current) mixer.current.timeScale = value
        }}
      />
    </>
  )
}

// --- Manual pose -------------------------------------------------------------

function PoseMode({ vrm }: { vrm: VRMHandle }) {
  const body = useVRMBody(vrm)
  const avatar = useVRMAvatar(vrm)

  const bones = useMemo(() => (avatar ? createVRMBody(avatar.vrm).listBones() : []), [avatar])
  const [chosen, setChosen] = useState<VRMHumanBoneName>('head')
  const [version, setVersion] = useState(0)

  // The model might not have the bone that was selected on the last one.
  const bone = bones.includes(chosen) ? chosen : (bones[0] ?? chosen)

  return (
    <>
      <p className="hint" style={{ marginTop: 10 }}>
        <code>createVRMBody</code> — read and write any joint, in degrees. Nothing is running, so
        the pose stays where you leave it.
      </p>

      <select
        value={bone}
        disabled={bones.length === 0}
        onChange={(e) => setChosen(e.target.value as VRMHumanBoneName)}
      >
        {bones.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>

      <PerAvatar vrm={vrm}>
        <div key={`${bone}:${version}`}>
          {(['x', 'y', 'z'] as const).map((axis) => (
            <Slider
              key={axis}
              label={axis}
              min={-180}
              max={180}
              step={1}
              digits={0}
              initial={() => body.current?.getEulerDegrees(bone)?.[axis] ?? 0}
              onChange={(value) => body.current?.setEulerDegrees(bone, { [axis]: value })}
            />
          ))}
        </div>
      </PerAvatar>

      <div className="row" style={{ marginTop: 8 }}>
        <button
          onClick={() => {
            body.current?.resetBoneRotation(bone)
            setVersion((v) => v + 1)
          }}
        >
          Reset {bone}
        </button>
        <button
          onClick={() => {
            body.current?.resetPose()
            setVersion((v) => v + 1)
          }}
        >
          Reset pose
        </button>
      </div>
    </>
  )
}
