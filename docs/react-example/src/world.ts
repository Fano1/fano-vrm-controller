import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/**
 * The three.js side of the app: scene, camera, lights, and (once a canvas
 * exists) the renderer and orbit controls.
 *
 * It lives at module scope on purpose. None of it is React state — nothing here
 * should ever cause a render — and `useVRM` wants a `scene` with a stable
 * identity, which a module constant is by construction. React's only job is to
 * hand over the canvas (`attach`) and to say what goes into the scene.
 */

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x111111)

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
camera.position.set(0, 1.3, 2.6)

scene.add(new THREE.AmbientLight(0xffffff, 1.4))
const key = new THREE.DirectionalLight(0xffffff, 1.6)
key.position.set(1, 2, 2)
scene.add(key)
scene.add(new THREE.GridHelper(10, 10, 0x333333, 0x222222))

let renderer: THREE.WebGLRenderer | null = null
let controls: OrbitControls | null = null

export const world = {
  scene,
  camera,

  /**
   * Create the renderer and controls for `canvas`, and keep them sized to it.
   * Returns the teardown, so it drops straight into a `useEffect`.
   */
  attach(canvas: HTMLCanvasElement): () => void {
    const gl = new THREE.WebGLRenderer({ canvas, antialias: true })
    gl.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    const orbit = new OrbitControls(camera, canvas)
    orbit.target.set(0, 1.1, 0)
    orbit.update()

    const resize = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (!width || !height) return

      gl.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()

    renderer = gl
    controls = orbit

    return () => {
      observer.disconnect()
      orbit.dispose()
      gl.dispose()
      renderer = null
      controls = null
    }
  },

  /** Draw one frame. A no-op until a canvas has been attached. */
  render() {
    controls?.update()
    renderer?.render(scene, camera)
  },
}
