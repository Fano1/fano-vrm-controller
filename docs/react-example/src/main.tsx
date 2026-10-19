import { Fragment, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode renders every component twice in development, which would double
// the render counters this example exists to show. It is off by default; add
// `?strict` to the url to turn it on. The model still loads once either way —
// useVRM defers its teardown by a microtask, so StrictMode's simulated
// unmount/remount cancels it instead of throwing the download away.
const Mode = new URLSearchParams(location.search).has('strict') ? StrictMode : Fragment

createRoot(document.getElementById('root')!).render(
  <Mode>
    <App />
  </Mode>,
)
