import { memo, useEffect, useRef, useState } from 'react'
import { useFrameLoop, useVRM, useVRMEffect, Vrm, type VRMHandle } from '@fanoalone/vrm-controller/react'
import { count, counters } from './counters'
import {
  BodyControls,
  Counters,
  ErrorLine,
  FaceControls,
  LoopControls,
  ProgressBar,
  Status,
} from './panels'
import { world } from './world'

const MODELS: { label: string; url: string | null }[] = [
  { label: 'avatar.vrm', url: '/avatar.vrm' },
  // A different url string for the same file: forces a real swap (and a disposal
  // of the previous avatar) without needing a second model.
  { label: 'avatar.vrm (copy)', url: '/avatar.vrm?copy=1' },
  // Not a model: the dev server answers with its fallback page, which fails to
  // parse — a quick way to see the error state.
  { label: 'broken.vrm (error)', url: '/broken.vrm' },
  { label: 'nothing', url: null },
]

/** The WebGL canvas. Renders once; React only hands over the element. */
const Viewport = memo(function Viewport() {
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => world.attach(canvas.current!), [])

  return <canvas id="canvas" ref={canvas} />
})

/**
 * The component that calls `useVRM`. It re-renders when ITS OWN inputs change
 * (the source and checkboxes below) — never for loading, progress or frames.
 */
export default function App() {
  count('Stage')

  const [source, setSource] = useState<string | null>(MODELS[0].url)
  const [keepPrevious, setKeepPrevious] = useState(false)
  const [secondOn, setSecondOn] = useState(false)

  const vrm = useVRM(source, { scene: world.scene, keepPrevious })
  const second = useRef<VRMHandle>(null)

  // avatar.vrm is VRM 0.x, which faces -Z; turn it to face the camera, as the
  // other examples do. An effect, not state: nothing needs to render.
  useVRMEffect(vrm, (avatar) => {
    avatar.scene.rotation.y = Math.PI
  })

  const loop = useFrameLoop((delta) => {
    counters.frames++
    vrm.update(delta) // updaters, then vrm.update — in one place
    second.current?.update(delta) // the <Vrm> below, via its handle
    world.render()
  })

  return (
    <>
      <Viewport />

      <div id="panel">
        <h1>React Integration</h1>
        <Status vrm={vrm} />
        <ProgressBar vrm={vrm} />
        <ErrorLine vrm={vrm} />

        <div className="section">
          <h2>Render counters</h2>
          <Counters />
          <p className="hint" style={{ marginTop: 8 }}>
            Load a model, drag the camera, pause the loop. Stage renders only when you press a
            source button below.
          </p>
        </div>

        <div className="section">
          <h2>Model source</h2>
          <p className="hint">
            <code>useVRM(url)</code> reloads when the url changes and disposes the previous avatar.
          </p>
          <div className="row">
            {MODELS.map((model) => (
              <button
                key={model.label}
                className={model.url === source ? 'active' : ''}
                onClick={() => setSource(model.url)}
              >
                {model.label}
              </button>
            ))}
            <button onClick={() => vrm.refetch()}>Retry</button>
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={keepPrevious}
              onChange={(e) => setKeepPrevious(e.target.checked)}
            />
            keepPrevious (hold the old model until the next is ready)
          </label>
        </div>

        <LoopControls loop={loop} />
        <FaceControls vrm={vrm} />
        <BodyControls vrm={vrm} />

        <div className="section">
          <h2>Declarative mount</h2>
          <p className="hint">
            A second avatar through <code>&lt;Vrm&gt;</code>. Unmounting it disposes the model; its
            ref is the stable handle.
          </p>
          <label className="toggle">
            <input
              type="checkbox"
              checked={secondOn}
              onChange={(e) => setSecondOn(e.target.checked)}
            />
            Mount a second <code>&lt;Vrm&gt;</code>
          </label>
        </div>

        {secondOn && (
          <Vrm
            ref={second}
            url={MODELS[0].url}
            scene={world.scene}
            onLoad={(avatar) => {
              avatar.scene.position.set(0.9, 0, 0)
              avatar.scene.rotation.y = Math.PI
            }}
          />
        )}
      </div>
    </>
  )
}
