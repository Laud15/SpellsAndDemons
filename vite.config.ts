import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    sveltekit(),
    VitePWA({
      registerType: 'autoUpdate',

      manifest: {
        name: 'Spells & Demons',
        short_name: 'S&D',
        theme_color: '#4B365F',
        background_color: '#18630f',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icons/skull_192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icons/skull_512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },

      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: '/offline.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firestore-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60,
              },
            },
          },
        ],
      },

    }),
  ],
});