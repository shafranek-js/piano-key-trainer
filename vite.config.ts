import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig(({ mode }) => {
  const isTestBuild = mode === 'test' || process.env.TEST_BUILD === 'true' || process.env.VITE_TEST_HOOKS === 'true';
  const outDir = process.env.OUT_DIR || (mode === 'test' ? 'dist-test' : 'dist');

  return {
    base: '/piano-key-trainer/',
    define: {
      __ENABLE_TEST_HOOKS__: JSON.stringify(Boolean(isTestBuild))
    },
  plugins: [
    {
      name: 'dev-no-stale-module-cache',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
          if (req.headers.accept?.includes('text/html')) {
            res.setHeader('Clear-Site-Data', '"cache"');
          }
          next();
        });
      }
    },
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Piano Key Trainer',
        short_name: 'PianoTrainer',
        description: 'Adaptive piano learning application with FSRS-6, Web MIDI, and acoustic sound',
        theme_color: '#08111f',
        background_color: '#08111f',
        display: 'standalone',
        orientation: 'landscape-primary',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tonejs\.github\.io\/audio\/salamander\/.*\.mp3$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'salamander-piano-samples',
              expiration: {
                maxEntries: 40,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    outDir,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('/node_modules/opensheetmusicdisplay/') ||
            id.includes('\\node_modules\\opensheetmusicdisplay\\') ||
            id.includes('/node_modules/vexflow/') ||
            id.includes('\\node_modules\\vexflow\\')
          ) {
            return 'osmd';
          }
        }
      }
    }
  },
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, './src/core'),
      '@audio': path.resolve(__dirname, './src/audio'),
      '@storage': path.resolve(__dirname, './src/storage'),
      '@ui': path.resolve(__dirname, './src/ui')
    }
  },
  server: {
    port: 5173,
    headers: {
      'Cache-Control': 'no-store'
    }
  }
};
});
