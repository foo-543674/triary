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
    // NOTE: not observed against a running backend yet; check with
    //       `curl localhost:3000/health` while both servers run.
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
