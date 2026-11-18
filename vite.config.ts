import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'splash.jpg', 'icons/apple-touch-icon.png'],
      // Push alert handlers live in public/push-sw.js and are pulled into the generated worker.
      workbox: { importScripts: ['/push-sw.js'] },
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
