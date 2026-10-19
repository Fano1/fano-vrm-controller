import { memo, useRef, useState, type RefObject } from 'react'
import {
  BROW_SHAPES,
  EMOTION_PRESETS,
  VISEME_PRESETS,
  type VRMFace,
} from '@fanoalone/vrm-controller'
import { useVRMEffect, type VRMHandle } from '@fanoalone/vrm-controller/react'
import { count } from './counters'
import { PerAvatar, Section, Slider, Toggle } from './ui'
import { useVRMFace } from './useVRMFace'
import { world } from './world'

const VOWELS = VISEME_PRESETS

export const FaceControls = memo(function FaceControls({ vrm }: { vrm: VRMHandle }) {
  count('Controls')

  // State lives here, in React; the model is a projection of it. Each effect
  // depends on the choice AND on the avatar, so swapping models re-applies every
  // control with no resynchronisation code.
  const [mood, setMood] = useState<string>('happy')
  const [blink, setBlink] = useState(true)
  const [gaze, setGaze] = useState(true)
  const [brow, setBrow] = useState<string | null>(null)
  const [speaking, setSpeaking] = useState(false)

  // Weights are read by the effects and written by the sliders. They're refs: a
  // slider moving is not a reason to render this panel, and the effect needs the
  // latest number when a new model arrives.
  const moodWeight = useRef(1)
  const browWeight = useRef(1)

  const face = useVRMFace(vrm)

  // Declared AFTER useVRMFace on purpose: effects on one handle run in
  // declaration order, so the face exists by the time these read it.
  useVRMEffect(vrm, () => void face.current?.emotion.setExclusive(mood, moodWeight.current), [mood])

  useVRMEffect(
    vrm,
    () => {
      const current = face.current
      if (!current) return
      if (brow) current.brow.setExclusive(brow, browWeight.current)
      else current.brow.reset()
    },
    [brow],
  )

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

  // Simulated speech: a driver of its own, so it registers like any other and
  // lets go (`viseme.reset()`) when switched off.
  useVRMEffect(
    vrm,
    (avatar) => {
      const current = face.current
      if (!current || !speaking) return

      let time = 0
      const stop = avatar.registerUpdate((delta) => {
        time += delta

        // ~7 syllables a second; each opens and closes the mouth on one vowel,
        // picked by a hash so the sequence is irregular but deterministic.
        const syllable = Math.floor(time * 7)
        const vowel = VOWELS[(Math.imul(syllable, 2654435761) >>> 0) % VOWELS.length]!
        const open = 0.5 - 0.5 * Math.cos(time * 7 * Math.PI * 2)

        current.viseme.setAll({ aa: 0, ih: 0, ou: 0, ee: 0, oh: 0, [vowel]: open * 0.85 })
      })

      return () => {
        stop()
        current.viseme.reset()
      }
    },
    [speaking],
  )

  return (
    <>
      <Section
        title="Face — mood & eyes"
        hint={
          <>
            <code>mood</code> is React state; the model is an effect of it, so it survives a model
            swap. Sliders below start over with each new model.
          </>
        }
      >
        <div className="row">
          {EMOTION_PRESETS.map((name) => (
            <button
              key={name}
              className={name === mood ? 'active' : ''}
              onClick={() => setMood(name)}
            >
              {name}
            </button>
          ))}
        </div>

        <Slider
          label="intensity"
          min={0}
          max={1}
          initial={1}
          onChange={(value) => {
            moodWeight.current = value
            face.current?.emotion.setExclusive(mood, value)
          }}
        />

        <Toggle checked={blink} onChange={setBlink}>
          Auto-blink
        </Toggle>
        <Toggle checked={gaze} onChange={setGaze}>
          Eyes follow the camera
        </Toggle>

        <PerAvatar vrm={vrm}>
          <Slider
            label="blink"
            min={0}
            max={1}
            initial={0}
            disabled={blink}
            onChange={(value) => face.current?.eye.blink(value)}
          />
          <Slider
            label="wink L"
            min={0}
            max={1}
            initial={0}
            disabled={blink}
            onChange={(value) => face.current?.eye.blinkLeft(value)}
          />
          <Slider
            label="wink R"
            min={0}
            max={1}
            initial={0}
            disabled={blink}
            onChange={(value) => face.current?.eye.blinkRight(value)}
          />
          <GazeSliders face={face} disabled={gaze} />
        </PerAvatar>
      </Section>

      <Section
        title="Face — mouth & brows"
        hint={
          <>
            <code>face.viseme</code> drives the five vowels; <code>face.brow</code> drives raw brow
            morphs (the VRM standard has no brow preset).
          </>
        }
      >
        <Toggle checked={speaking} onChange={setSpeaking}>
          Simulate speech
        </Toggle>

        <PerAvatar vrm={vrm}>
          {VISEME_PRESETS.map((name) => (
            <Slider
              key={name}
              label={name}
              min={0}
              max={1}
              initial={0}
              disabled={speaking}
              onChange={(value) => face.current?.viseme.set(name, value)}
            />
          ))}
        </PerAvatar>

        <div className="row" style={{ marginTop: 10 }}>
          <button className={brow === null ? 'active' : ''} onClick={() => setBrow(null)}>
            no brow
          </button>
          {BROW_SHAPES.map((name) => (
            <button
              key={name}
              className={name === brow ? 'active' : ''}
              onClick={() => setBrow(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <Slider
          label="brow weight"
          min={0}
          max={1}
          initial={1}
          disabled={brow === null}
          onChange={(value) => {
            browWeight.current = value
            if (brow) face.current?.brow.setExclusive(brow, value)
          }}
        />
      </Section>
    </>
  )
})

/**
 * Manual gaze, in degrees. `setGazeAngles` takes yaw and pitch together, so the
 * two sliders share one pair of numbers — in a ref, owned here, which starts over
 * with the model because `PerAvatar` remounts this.
 */
function GazeSliders({
  face,
  disabled,
}: {
  face: RefObject<VRMFace | null>
  disabled: boolean
}) {
  const angles = useRef({ yaw: 0, pitch: 0 })

  const apply = (patch: Partial<typeof angles.current>) => {
    Object.assign(angles.current, patch)
    face.current?.eye.setGazeAngles(angles.current.yaw, angles.current.pitch)
  }

  return (
    <>
      <Slider
        label="gaze yaw"
        min={-40}
        max={40}
        step={1}
        digits={0}
        initial={0}
        disabled={disabled}
        onChange={(yaw) => apply({ yaw })}
      />
      <Slider
        label="gaze pitch"
        min={-30}
        max={30}
        step={1}
        digits={0}
        initial={0}
        disabled={disabled}
        onChange={(pitch) => apply({ pitch })}
      />
    </>
  )
}
