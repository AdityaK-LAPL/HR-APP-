import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { VitePWA } from 'vite-plugin-pwa'

// Vite's dev-server allow-list check mis-handles project paths that contain a ":" (it answers 403
// for index.html). The path of this repository does, so relax the check ONLY in that case. It is a
// local dev server bound to 127.0.0.1; moving the project to a path without ":" removes the need.
const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const pathHasColon = projectRoot.includes(':')

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "prompt": a new version waits until the user reloads, so a deploy never
      // reloads the page in the middle of a half-filled form.
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'pwa-icon.svg'],
      manifest: {
        id: '/',
        name: 'OpsFlow Management & Service PWA',
        short_name: 'OpsFlow',
        description: 'Company management and service operations',
        lang: 'en',
        theme_color: '#0f172a',
        background_color: '#0b0f19',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the app shell only. Authenticated API responses are never cached by the
        // service worker (they hold personal data and must always reflect the server).
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.startsWith('/api/'), handler: 'NetworkOnly' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    fs: { strict: !pathHasColon },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    environment: 'jsdom',
    env: { VITE_API_BASE: 'http://localhost/api/v1' },
    alias: { 'virtual:pwa-register/react': fileURLToPath(new URL('./src/test/pwa-stub.ts', import.meta.url)) },
    setupFiles: [fileURLToPath(new URL('./src/test/setup.ts', import.meta.url))],
    css: false,
    restoreMocks: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
