import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves this project from https://<user>.github.io/croche-catalogue/,
  // so all built asset URLs need this repo-name base path.
  base: '/croche-catalogue/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        // Installs as a standalone home-screen app that opens straight into
        // the admin console, so managing the catalogue doesn't require
        // typing/finding the #admin link every time.
        name: 'Luvia Admin',
        short_name: 'Luvia Admin',
        description: 'Manage the Luvia crochet catalogue: products, variants, and pricing.',
        start_url: '/croche-catalogue/#admin',
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
