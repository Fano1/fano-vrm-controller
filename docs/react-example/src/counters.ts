/**
 * The render counter — the point of this example.
 *
 * `count(name)` is called *during render*, which is exactly the thing being
 * measured. A render with side effects is normally a bug; for an instrument it
 * is the whole trick. The numbers are plain module state, read by `Counters`
 * straight into the DOM, never through React state — so watching them can't
 * perturb what they measure.
 *
 * It counts renders, so StrictMode (which renders everything twice in
 * development) would double every number. `main.tsx` leaves it off unless you
 * ask for it with `?strict`.
 */
export const counters = {
  Stage: 0,
  Status: 0,
  Progress: 0,
  Controls: 0,
  frames: 0,
}

export type RenderCounter = Exclude<keyof typeof counters, 'frames'>

export function count(name: RenderCounter): void {
  counters[name]++
}
