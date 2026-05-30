import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    fs: {
      allow: ['..']  
    }
  },
  plugins: [
    sveltekit(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        injectionPoint: 'self.__WB_MANIFEST',
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
      manifest: {
        name: 'Spells & Demons',
        short_name: 'S&D',
        theme_color: '#4B365F',
        background_color: '#18630f',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icons/skull_192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/skull_512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },

    }),
  ],
});