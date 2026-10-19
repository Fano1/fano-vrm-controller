import { memo, useEffect, useRef, useState } from 'react'
import {
  EMOTION_PRESETS,
  createIdleAnimator,
  createLookAtAnimator,
  createProceduralAnimator,
} from '@fanoalone/vrm-controller'
import {
  useVRMEffect,
  useVRMError,
  useVRMProgress,
  useVRMStatus,
  type FrameLoop,
  type VRMHandle,
} from '@fanoalone/vrm-controller/react'
import { count, counters } from './counters'
import { useVRMFace } from './useVRMFace'
import { world } from './world'

/*
 * Every component here is a leaf that asks for ONE thing, wrapped in `memo`.
 * `memo` actually holds because the `vrm` handle's identity never changes — so
 * when the Stage re-renders for one of its own inputs, none of these follow it.
 */

const STATUS_LABEL = {
  idle: 'Nothing selected',
  loading: 'Loading…',
  ready: 'Ready',
  error: 'Failed',
} as const

export const Status = memo(function Status({ vrm }: { vrm: VRMHandle }) {
  count('Status')
  const status = useVRMStatus(vrm)
  return <p id="status">{STATUS_LABEL[status]}</p>
})

export const ProgressBar = memo(function ProgressBar({ vrm }: { vrm: VRMHandle }) {
  count('Progress')
  // Quantized to whole percents by the hook — never one render per chunk.
  const progress = useVRMProgress(vrm)

  return (
    <div id="progress-bar">
      <div id="progress-fill" style={{ width: `${(progress ?? 0) * 100}%` }} />
    </div>
  )
})

export const ErrorLine = memo(function ErrorLine({ vrm }: { vrm: VRMHandle }) {
  const error = useVRMError(vrm)
  if (!error) return null

  return <p id="error">{error instanceof Error ? error.message : String(error)}</p>
})

/**
 * The numbers are written straight into a `<pre>` from a timer. Showing a render
 * count through React state would make showing it a render.
 */
export const Counters = memo(function Counters() {
  const pre = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let lastFrames = 0
    let lastTime = performance.now()

    const paint = () => {
      const now = performance.now()
      const fps = ((counters.frames - lastFrames) * 1000) / (now - lastTime)
      lastFrames = counters.frames
      lastTime = now

      const pad = (n: number) => String(n).padStart(5)

      if (pre.current) {
        pre.current.textContent = [
          `Stage      renders  ${pad(counters.Stage)}`,
          `Status     renders  ${pad(counters.Status)}`,
          `Progress   renders  ${pad(counters.Progress)}`,
          `Controls   renders  ${pad(counters.Controls)}`,
          `frames run          ${pad(counters.frames)}  (${fps.toFixed(0)} fps)`,
        ].join('\n')
      }
    }

    paint()
    const id = setInterval(paint, 250)
    return () => clearInterval(id)
  }, [])

  return <pre id="counters" ref={pre} />
})

export const LoopControls = memo(function LoopControls({ loop }: { loop: FrameLoop }) {
  // The loop controller is stable and `running` is a plain read, so the button
  // keeps its own copy to know what to label itself. The Stage never hears about
  // it — pausing is not a render of anything but this button.
  const [running, setRunning] = useState(true)

  return (
    <div className="section">
      <h2>Frame loop</h2>
      <p className="hint">
        <code>useFrameLoop</code> returns a stable controller. Pausing it re-renders only this
        button — watch the counters.
      </p>
      <button
        onClick={() => {
          if (running) loop.stop()
          else loop.start()
          setRunning(!running)
        }}
      >
        {running ? 'Pause' : 'Resume'}
      </button>
    </div>
  )
})

export const FaceControls = memo(function FaceControls({ vrm }: { vrm: VRMHandle }) {
  count('Controls')

  // State lives here, in React; the model is a projection of it. Each effect
  // depends on the choice AND on the avatar, so swapping models re-applies every
  // control with no resynchronisation code.
  const [mood, setMood] = useState<string>('happy')
  const [blink, setBlink] = useState(true)
  const [gaze, setGaze] = useState(true)

  const face = useVRMFace(vrm)

  // Declared AFTER useVRMFace on purpose: effects on one handle run in
  // declaration order, so the face exists by the time these read it.
  useVRMEffect(vrm, () => void face.current?.emotion.setExclusive(mood), [mood])

  useVRMEffect(
    vrm,
    () => {
      const current = face.current
      if (!current || !blink) return
      current.eye.autoBlink()
      return () => void current.eye.stopAutoBlink()
    },
    [blink],
  )

  useVRMEffect(
    vrm,
    () => {
      const current = face.current
      if (!current || !gaze) return
      current.eye.gaze(world.camera)
      return () => void current.eye.clearGaze()
    },
    [gaze],
  )

  return (
    <div className="section">
      <h2>Face</h2>
      <p className="hint">
        <code>mood</code> is React state. The model is an effect of it, so it survives a model
        swap.
      </p>
      <div className="row">
        {EMOTION_PRESETS.map((name) => (
          <button key={name} className={name === mood ? 'active' : ''} onClick={() => setMood(name)}>
            {name}
          </button>
        ))}
      </div>
      <label className="toggle">
        <input type="checkbox" checked={blink} onChange={(e) => setBlink(e.target.checked)} />
        Auto-blink
      </label>
      <label className="toggle">
        <input type="checkbox" checked={gaze} onChange={(e) => setGaze(e.target.checked)} />
        Eyes follow the camera
      </label>
    </div>
  )
})

export const BodyControls = memo(function BodyControls({ vrm }: { vrm: VRMHandle }) {
  count('Controls')
  const [idle, setIdle] = useState(true)

  // The procedural stack owns the rig while it runs, and its cleanup hands the
  // rig back (`reset`) BEFORE the avatar is disposed.
  useVRMEffect(
    vrm,
    (avatar) => {
      if (!idle) return

      const animator = createProceduralAnimator(avatar.vrm, [
        createIdleAnimator(),
        createLookAtAnimator({ target: world.camera }),
      ])
      const stop = avatar.registerUpdate((delta) => animator.update(delta))

      return () => {
        stop()
        animator.reset()
      }
    },
    [idle],
  )

  return (
    <div className="section">
      <h2>Body</h2>
      <p className="hint">
        Procedural idle + look-at, registered through <code>avatar.registerUpdate</code>. No{' '}
        <code>.fbx</code> needed.
      </p>
      <label className="toggle">
        <input type="checkbox" checked={idle} onChange={(e) => setIdle(e.target.checked)} />
        Idle animation
      </label>
    </div>
  )
})
