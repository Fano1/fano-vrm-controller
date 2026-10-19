import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  JIGGLE_ZONES,
  createVRMBody,
  createVRMJiggle,
  listJiggleCandidates,
  type JiggleBoneOptions,
  type JiggleZone,
  type VRMJiggle,
} from '@fanoalone/vrm-controller'
import { useVRMAvatar, useVRMEffect, type VRMHandle } from '@fanoalone/vrm-controller/react'
import { count } from './counters'
import { PerAvatar, Section, Slider, Toggle } from './ui'

/*
 * Jiggle physics is a layer, not a driver: it owns no bones. Each frame it works
 * out what a bone's rotation would be without its own previous nudge, then adds a
 * fresh one on top — so it composes with whatever is animating the rig (a
 * procedural idle, a Mixamo clip, a pose you are dragging) and never needs to know
 * which.
 *
 * `jiggle.attach(avatar)` registers it with a late `order`, so it runs after
 * every driver however the Body panel re-registers them when you switch mode.
 * Try it: change modes while the avatar bounces.
 */

const ZONES = Object.keys(JIGGLE_ZONES) as JiggleZone[]

type Motion = 'none' | 'bounce' | 'shake'

const MOTIONS: { id: Motion; label: string }[] = [
  { id: 'bounce', label: 'Bounce' },
  { id: 'shake', label: 'Shake' },
  { id: 'none', label: 'Stand still' },
]

export const JiggleControls = memo(function JiggleControls({ vrm }: { vrm: VRMHandle }) {
  count('Controls')

  const [on, setOn] = useState(true)
  const [motion, setMotion] = useState<Motion>('bounce')

  // Which bones jiggle is a choice, so it is state — the controller is a
  // projection of it. A zone is just a shortcut for a group of bones.
  const [bones, setBones] = useState<ReadonlySet<string>>(
    () => new Set(['chest', 'hips'].flatMap((zone) => JIGGLE_ZONES[zone as JiggleZone])),
  )

  const jiggle = useRef<VRMJiggle | null>(null)

  // The controller: one per avatar, built empty and attached once. Cleanup
  // detaches and takes every nudge off the rig, BEFORE the avatar is disposed.
  useVRMEffect(vrm, (avatar) => {
    const next = createVRMJiggle(avatar.vrm, { zones: [] })
    const detach = next.attach(avatar)
    jiggle.current = next

    return () => {
      detach()
      next.dispose()
      jiggle.current = null
    }
  })

  // Re-applies the choice to each new model. (The handlers below apply a change
  // straight away too — a slider that mounts in the same render reads the
  // controller, and an effect would run after it.)
  useVRMEffect(vrm, () => void (jiggle.current && project(jiggle.current, bones)), [bones])

  const choose = (next: ReadonlySet<string>) => {
    setBones(next)
    if (jiggle.current) project(jiggle.current, next)
  }

  useVRMEffect(vrm, () => void (jiggle.current && (jiggle.current.enabled = on)), [on])

  // Something for the physics to react to. Moving the whole avatar is the
  // simplest way to make a body accelerate; a clip or the manual pose would work
  // just as well. This is an ordinary driver, at the default order.
  useVRMEffect(
    vrm,
    (avatar) => {
      if (motion === 'none') return

      const home = avatar.scene.position.clone()
      let time = 0

      const stop = avatar.registerUpdate((delta) => {
        time += delta

        if (motion === 'bounce') {
          // |sin| lands hard at the bottom of every hop — that's the spike in
          // acceleration the soft mass lags behind.
          avatar.scene.position.y = home.y + Math.abs(Math.sin(time * Math.PI * 1.4)) * 0.12
        } else {
          avatar.scene.position.x = home.x + Math.sin(time * Math.PI * 5) * 0.045
        }
      })

      return () => {
        stop()
        avatar.scene.position.copy(home)
      }
    },
    [motion],
  )

  return (
    <>
      <Section
        title="Jiggle physics"
        open
        hint={
          <>
            A damped spring per bone, driven by how the body actually accelerates. It layers on
            whatever animates the rig, via <code>jiggle.attach(avatar)</code>.
          </>
        }
      >
        <Toggle checked={on} onChange={setOn}>
          Jiggle on
        </Toggle>

        <h3>Make the body move</h3>
        <div className="row">
          {MOTIONS.map(({ id, label }) => (
            <button key={id} className={id === motion ? 'active' : ''} onClick={() => setMotion(id)}>
              {label}
            </button>
          ))}
        </div>

        <h3>Zones</h3>
        <div className="row">
          {ZONES.map((zone) => {
            const members = JIGGLE_ZONES[zone]
            const active = members.every((bone) => bones.has(bone))

            return (
              <button
                key={zone}
                className={active ? 'active' : ''}
                onClick={() => {
                  const next = new Set(bones)
                  for (const bone of members) {
                    if (active) next.delete(bone)
                    else next.add(bone)
                  }
                  choose(next)
                }}
              >
                {zone}
              </button>
            )
          })}
        </div>

        <PerAvatar vrm={vrm}>
          <Slider
            label="intensity"
            min={0}
            max={3}
            initial={1}
            onChange={(value) => {
              if (jiggle.current) jiggle.current.intensity = value
            }}
          />
          <Slider
            label="ambient"
            min={0}
            max={2}
            initial={0}
            onChange={(value) => {
              if (jiggle.current) jiggle.current.ambient = value
            }}
          />
          <Slider
            label="smoothing"
            min={0.005}
            max={0.15}
            step={0.005}
            digits={3}
            initial={0.03}
            onChange={(value) => {
              if (jiggle.current) jiggle.current.smoothing = value
            }}
          />
        </PerAvatar>
      </Section>

      <Section
        title="Jiggle — one bone"
        hint={
          <>
            Any humanoid bone, or any other node in the model (<code>listJiggleCandidates</code>).
            Tuning a bone keeps its spring moving, so dragging a slider is smooth.
          </>
        }
      >
        <BoneEditor
          vrm={vrm}
          jiggle={jiggle}
          bones={bones}
          onToggle={(target, next) => {
            const set = new Set(bones)
            if (next) set.add(target)
            else set.delete(target)
            choose(set)
          }}
        />
        <Readout jiggle={jiggle} />
      </Section>
    </>
  )
})

// --- One bone ----------------------------------------------------------------

type Tuning = Required<Omit<JiggleBoneOptions, 'lever'>>

const TUNING: { key: keyof Tuning; label: string; min: number; max: number; step: number; digits: number }[] = [
  { key: 'hz', label: 'hz', min: 0.5, max: 8, step: 0.1, digits: 1 },
  { key: 'damping', label: 'damping', min: 0, max: 1, step: 0.01, digits: 2 },
  { key: 'gain', label: 'gain', min: 0, max: 2, step: 0.01, digits: 2 },
  { key: 'length', label: 'length (m)', min: 0.02, max: 0.5, step: 0.01, digits: 2 },
  { key: 'maxAngle', label: 'max °', min: 0, max: 30, step: 1, digits: 0 },
]

const AXES = ['x', 'y', 'z'] as const

const POKES: { label: string; velocity: { x?: number; y?: number; z?: number } }[] = [
  { label: '↑', velocity: { y: 2 } },
  { label: '↓', velocity: { y: -2 } },
  { label: '←', velocity: { x: -2 } },
  { label: '→', velocity: { x: 2 } },
  { label: '⇢', velocity: { z: 2 } },
  { label: '⇠', velocity: { z: -2 } },
]

function BoneEditor({
  vrm,
  jiggle,
  bones,
  onToggle,
}: {
  vrm: VRMHandle
  jiggle: RefObject<VRMJiggle | null>
  bones: ReadonlySet<string>
  onToggle: (target: string, enabled: boolean) => void
}) {
  const avatar = useVRMAvatar(vrm)

  // Humanoid bones a zone could use, plus whatever else in the skeleton looks
  // worth jiggling (a bust bone, a tail, a ribbon…).
  const { humanoid, nodes } = useMemo(() => {
    if (!avatar) return { humanoid: [] as string[], nodes: [] as string[] }

    const body = createVRMBody(avatar.vrm)
    const all = new Set(ZONES.flatMap((zone) => JIGGLE_ZONES[zone]))

    return {
      humanoid: [...all].filter((name) => body.hasBone(name)),
      nodes: listJiggleCandidates(avatar.vrm),
    }
  }, [avatar])

  const [chosen, setChosen] = useState<string>('chest')
  const target = [...humanoid, ...nodes].includes(chosen) ? chosen : (humanoid[0] ?? chosen)
  const enabled = bones.has(target)

  return (
    <>
      <select value={target} onChange={(e) => setChosen(e.target.value)}>
        {humanoid.length > 0 && (
          <optgroup label="Humanoid bones">
            {humanoid.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </optgroup>
        )}
        {nodes.length > 0 && (
          <optgroup label="Model nodes">
            {nodes.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <Toggle checked={enabled} onChange={(next) => onToggle(target, next)}>
        Jiggle this bone
      </Toggle>

      {/* Keyed by bone and by on/off: the sliders read the controller's numbers once, when they mount. */}
      <PerAvatar vrm={vrm}>
        <Tuner key={`${target}:${enabled}`} target={target} jiggle={jiggle} enabled={enabled} />
      </PerAvatar>

      <h3>Poke</h3>
      <div className="row">
        {POKES.map(({ label, velocity }) => (
          <button
            key={label}
            disabled={!enabled}
            onClick={() => jiggle.current?.impulse(target, velocity)}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => {
            const current = jiggle.current
            current?.list().forEach((name) => current.impulse(name, { y: 2 }))
          }}
        >
          all ↑
        </button>
      </div>
    </>
  )
}

/**
 * Make the controller jiggle exactly `bones`. Idempotent, so it is safe to run
 * from a handler and again from an effect.
 */
function project(controller: VRMJiggle, bones: ReadonlySet<string>) {
  for (const target of controller.list()) {
    if (!bones.has(target)) controller.disable(target)
  }

  for (const target of bones) {
    if (!controller.isEnabled(target)) controller.enable(target)
  }
}

/**
 * The sliders for one bone. Remounted (keyed) whenever the bone, or whether it's
 * on, changes — they read the controller's resolved numbers once, when they mount.
 */
function Tuner({
  target,
  jiggle,
  enabled,
}: {
  target: string
  jiggle: RefObject<VRMJiggle | null>
  enabled: boolean
}) {
  // `lever` is a vector, but each slider is one component of it; retuning takes
  // the whole thing, so the three share this.
  const lever = useRef({ x: 0, y: 1, z: 0, ...jiggle.current?.getOptions(target)?.lever })

  const read = (key: keyof Tuning) => () => jiggle.current?.getOptions(target)?.[key] ?? 0

  return (
    <>
      {TUNING.map(({ key, label, min, max, step, digits }) => (
        <Slider
          key={key}
          label={label}
          min={min}
          max={max}
          step={step}
          digits={digits}
          disabled={!enabled}
          initial={read(key)}
          onChange={(value) => jiggle.current?.enable(target, { [key]: value })}
        />
      ))}

      {AXES.map((axis) => (
        <Slider
          key={axis}
          label={`lever ${axis}`}
          min={-1}
          max={1}
          disabled={!enabled}
          initial={lever.current[axis]}
          onChange={(value) => {
            lever.current = { ...lever.current, [axis]: value }
            jiggle.current?.enable(target, { lever: lever.current })
          }}
        />
      ))}
    </>
  )
}

/**
 * Live angles of every jiggling bone, written straight into a `<pre>` from a
 * timer — the same trick as the render counters. Showing a changing number
 * through React state would make showing it a render.
 */
const Readout = memo(function Readout({ jiggle }: { jiggle: RefObject<VRMJiggle | null> }) {
  const pre = useRef<HTMLPreElement>(null)

  useEffect(() => {
    const paint = () => {
      const bones = jiggle.current?.debug().bones ?? []

      if (pre.current) {
        pre.current.textContent = bones.length
          ? bones.map((b) => `${b.target.padEnd(16)} ${b.angle.toFixed(2).padStart(6)}°`).join('\n')
          : 'nothing jiggling'
      }
    }

    paint()
    const id = setInterval(paint, 120)
    return () => clearInterval(id)
  }, [jiggle])

  return <pre id="jiggle-readout" ref={pre} />
})
