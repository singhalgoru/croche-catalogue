import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// vite-plugin-pwa always injects <link rel="manifest"> into every page once
// a `manifest` option is set (there's no built-in flag to keep generating
// manifest.webmanifest without also auto-linking it). AdminPage.tsx adds the
// link itself at runtime, so this strips the automatic one from the built
// HTML to keep customers on the public catalogue from ever seeing it.
const stripAutoManifestLink = (): Plugin => ({
  name: 'strip-auto-manifest-link',
  apply: 'build',
  enforce: 'post',
  transformIndexHtml: {
    order: 'post',
    handler: (html) => html.replace(/<link rel="manifest"[^>]*>/, ''),
  },
})

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
      // Only the admin console registers the service worker (see
      // AdminPage.tsx), so customers browsing the catalogue are never
      // offered an "Install app" prompt for it.
      injectRegister: false,
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
    stripAutoManifestLink(),
  ],
})
