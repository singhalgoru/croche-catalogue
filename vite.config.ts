import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves this project from https://<user>.github.io/croche-catalogue/,
  // so all built asset URLs need this repo-name base path.
  base: '/croche-catalogue/',
  build: {
    // No source maps in the deployed build: the shipped JS should be
    // minified/mangled, not a readable 1:1 copy of the source.
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      mangle: true,
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
      format: {
        comments: false,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // The service worker is registered manually (see App.tsx / useRegisterSW)
      // so it can drive an in-app "update available" experience later.
      injectRegister: false,
      manifest: {
        // This is the customer-facing shop app. AdminPage.tsx swaps the
        // manifest link to public/admin-manifest.webmanifest while the
        // admin console is open, so admins installing from #admin get a
        // separate "Luvia Admin" app instead of this one.
        name: 'Luvia — Handmade Crochet',
        short_name: 'Luvia',
        description: 'Browse and order Luvia handmade crochet accessories, gifts, and decor.',
        // Tags installed-app launches with utm_source=pwa so Analytics can
        // report on this channel separately from web/social/direct traffic.
        start_url: '/croche-catalogue/?utm_source=pwa&utm_medium=app',
        scope: '/croche-catalogue/',
        display: 'standalone',
        background_color: '#fdf6ec',
        theme_color: '#5f3825',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
