import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const repo = path.resolve(import.meta.dirname, '../..')

/**
 * `avatar.vrm` lives (gitignored) at the repo root, like every other example.
 * Serve it at `/avatar.vrm` so the app can load it with a plain url.
 */
function serveAvatar(): Plugin {
  const file = path.join(repo, 'avatar.vrm')

  return {
    name: 'serve-avatar',
    configureServer(server) {
      server.middlewares.use('/avatar.vrm', (_req, res, next) => {
        if (!existsSync(file)) return next()
        res.setHeader('Content-Type', 'model/gltf-binary')
        // Without a length the loader reports `total = 0` and the progress bar
        // can never move.
        res.setHeader('Content-Length', statSync(file).size)
        createReadStream(file).pipe(res)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serveAvatar()],

  resolve: {
    // In your own app this is just `bun add @fanoalone/vrm-controller`. Here the
    // package is the repo two folders up, so point the two entries we use at its
    // built output — run `bun run build` in the repo root first.
    alias: [
      {
        find: /^@fanoalone\/vrm-controller\/react$/,
        replacement: path.join(repo, 'dist/react.js'),
      },
      {
        find: /^@fanoalone\/vrm-controller$/,
        replacement: path.join(repo, 'dist/index.js'),
      },
    ],

    // dist/ sits outside this folder, so its own `import "react"` would resolve
    // to the REPO's copy while react-dom resolves to this app's — two Reacts,
    // and hooks break. Dedupe pins every importer, wherever it lives, to the
    // copy in this folder. three and three-vrm need it for the same reason:
    // two copies of three fail `instanceof` checks.
    dedupe: ['react', 'react-dom', 'three', '@pixiv/three-vrm'],
  },

  // This folder also holds `react-example.html`, the no-build demo, whose import
  // map pulls React and htm from a CDN. Scanning it for dependencies fails and
  // takes pre-bundling down with it, so scan the app's own entry only.
  optimizeDeps: { entries: ['index.html'] },

  server: {
    // Let the dev server read the built package outside this folder.
    fs: { allow: [repo] },
  },
})
