import { memo, useEffect, useRef, useState } from 'react'
import {
  useVRMError,
  useVRMProgress,
  useVRMStatus,
  type FrameLoop,
  type VRMHandle,
} from '@fanoalone/vrm-controller/react'
import { count, counters } from './counters'
import { Section } from './ui'

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
    <Section
      title="Frame loop"
      hint={
        <>
          <code>useFrameLoop</code> returns a stable controller. Pausing it re-renders only this
          button — watch the counters.
        </>
      }
    >
      <button
        onClick={() => {
          if (running) loop.stop()
          else loop.start()
          setRunning(!running)
        }}
      >
        {running ? 'Pause' : 'Resume'}
      </button>
    </Section>
  )
})
