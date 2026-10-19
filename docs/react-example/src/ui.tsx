import { Fragment, useState, type ReactNode } from 'react'
import { useVRMAvatar, type VRMHandle } from '@fanoalone/vrm-controller/react'

/** A collapsible panel section. Native `<details>` — no state, no render. */
export function Section({
  title,
  hint,
  open = false,
  children,
}: {
  title: string
  hint?: ReactNode
  open?: boolean
  children: ReactNode
}) {
  return (
    <details className="section" open={open}>
      <summary>{title}</summary>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </details>
  )
}

export function Toggle({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {children}
    </label>
  )
}

/**
 * A range input that keeps its own value.
 *
 * Dragging it re-renders THIS component and nothing above it: the new value goes
 * straight to the model through `onChange`, not through the panel's state. So a
 * panel with thirty sliders still renders once when you touch none of its
 * toggles — watch the "Controls" counter while you drag.
 *
 * `initial` may be a function, read once when the slider mounts (React's lazy
 * `useState`) — a way to start from the model's current value. Give the slider a
 * `key` to start it over, e.g. when the thing it edits changes.
 */
export function Slider({
  label,
  min,
  max,
  step = 0.01,
  initial,
  digits = 2,
  disabled,
  onChange,
}: {
  label: string
  min: number
  max: number
  step?: number
  initial: number | (() => number)
  digits?: number
  disabled?: boolean
  onChange: (value: number) => void
}) {
  const [value, setValue] = useState(initial)

  return (
    <label className="slider">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const next = Number(e.target.value)
          setValue(next)
          onChange(next)
        }}
      />
      <output>{value.toFixed(digits)}</output>
    </label>
  )
}

/**
 * Remounts its children for every new avatar.
 *
 * Choices you made (a mood, a toggle) are React state, and an effect re-applies
 * them to the next model. A slider you were *scrubbing* is different — it's a
 * reading of the old model's pose or face, and the new model starts neutral. So
 * those sliders live under this, and start over with the model they edit.
 *
 * It re-renders only when the avatar changes, which is the one input it depends on.
 */
export function PerAvatar({ vrm, children }: { vrm: VRMHandle; children: ReactNode }) {
  const avatar = useVRMAvatar(vrm)
  return <Fragment key={avatar?.scene.uuid ?? 'none'}>{children}</Fragment>
}
