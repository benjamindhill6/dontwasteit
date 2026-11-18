import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// One id per build. The app compares the id it was built with against /version.json
// on the server to spot a new deploy (see src/lib/appUpdate.ts).
const APP_VERSION = process.env.CF_PAGES_COMMIT_SHA?.slice(0, 12) || `local-${Date.now()}`

/** Writes dist/version.json. It is never precached, so it always comes from the network. */
const versionFile = (): Plugin => ({
  name: 'app-version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) })
  },
})

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    react(),
    versionFile(),
    VitePWA({
      registerType: 'autoUpdate',
      // The app registers the worker itself and decides when to reload (src/lib/appUpdate.ts).
      injectRegister: false,
      includeAssets: ['favicon.ico', 'splash.jpg', 'icons/apple-touch-icon.png'],
      workbox: {
        // Push alert handlers live in public/push-sw.js and are pulled into the generated worker.
        importScripts: ['/push-sw.js'],
        // A new worker takes over as soon as it is installed, and old cached files are removed.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globIgnores: ['version.json'],
      },
      manifest: {
        name: "Don't Waste It!",
        short_name: "Don't Waste It",
        description: 'Pantries sharing surplus food with each other.',
        theme_color: '#1f7a4d',
        background_color: '#fbf8f2',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
