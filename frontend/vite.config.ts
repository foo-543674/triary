import tailwindcss from '@tailwindcss/vite';
import devtools from 'solid-devtools/vite';
import { VitePWA } from 'vite-plugin-pwa';
import solidPlugin from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    devtools(),
    solidPlugin(),
    tailwindcss(),
    VitePWA({
      // NOTE: Auto-generate and auto-inject the service worker. We also
      //       enable `devOptions` so that PWA behaviour can be exercised
      //       during local dev.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: { enabled: true, type: 'module' },
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'triary',
        short_name: 'triary',
        description: 'Log your workouts and track progressive overload.',
        theme_color: '#15803d',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
      },
    }),
  ],
  server: {
    port: 3000,
    // Same-origin delivery in development (architecture.md "配信トポロジの前提"):
    // the browser only talks to Vite, which forwards API calls. The target
    // is the backend's default port; override it with the BACKEND_ORIGIN
    // environment variable (read from the process environment, not from
    // .env files).
    // Observed 2026-10-31 in the ai-box: /health through localhost:3000
    // reached the backend. The dev server listens on `localhost` only
    // (127.0.0.1 was refused there, where localhost resolves to ::1), so open
    // http://localhost:3000. NOTE: not yet observed from a browser or in the
    // devcontainer.
    proxy: Object.fromEntries(
      ['/api', '/web', '/health'].map((prefix) => [
        prefix,
        { target: process.env.BACKEND_ORIGIN ?? 'http://localhost:8080', changeOrigin: false },
      ]),
    ),
  },
  build: {
    target: 'esnext',
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
