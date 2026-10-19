import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const repo = path.resolve(import.meta.dirname, '../..')

/**
 * Stream `file` with a Content-Length. Without a length the loader reports
 * `total = 0` and the progress bar can never move.
 */
function send(res: import('node:http').ServerResponse, file: string, type: string) {
  res.setHeader('Content-Type', type)
  res.setHeader('Content-Length', statSync(file).size)
  createReadStream(file).pipe(res)
}

/**
 * `avatar.vrm` and the Mixamo clips in `animation/` live at the repo root (the
 * avatar is gitignored), like every other example. Serve them at `/avatar.vrm`
 * and `/animation/<name>.fbx` so the app can load them with plain urls.
 */
function serveRepoAssets(): Plugin {
  const avatar = path.join(repo, 'avatar.vrm')
  const animations = path.join(repo, 'animation')

  return {
    name: 'serve-repo-assets',
    configureServer(server) {
      server.middlewares.use('/avatar.vrm', (_req, res, next) => {
        if (!existsSync(avatar)) return next()
        send(res, avatar, 'model/gltf-binary')
      })

      server.middlewares.use('/animation', (req, res, next) => {
        // `req.url` is relative to the mount point, and url-encoded ("Macarena%20Dance").
        const name = decodeURIComponent((req.url ?? '').split('?')[0]!).replace(/^\/+/, '')
        const file = path.resolve(animations, name)

        // Only files directly inside animation/ — never a path that climbs out.
        if (path.dirname(file) !== animations || !existsSync(file)) return next()
        send(res, file, 'application/octet-stream')
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serveRepoAssets()],

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
