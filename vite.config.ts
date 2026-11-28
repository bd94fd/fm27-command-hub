import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import { analyzer } from 'vite-bundle-analyzer';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ command, mode }) => {
  // Prevent a shell-level NODE_ENV=development from leaking React dev-runtime
  // (jsx-dev-runtime + react-dom.development.js) into production builds while
  // leaving local dev server & HMR completely untouched.
  if (command === 'build' && mode === 'production') {
    process.env.NODE_ENV = 'production';
  }

  const removePycacheFromDist = () => {
    const distDir = path.resolve(import.meta.dirname, 'dist');
    if (!fs.existsSync(distDir)) return;
    const pycacheDir = path.join(distDir, '__pycache__');
    if (fs.existsSync(pycacheDir)) {
      fs.rmSync(pycacheDir, { recursive: true, force: true });
    }
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__pycache__') {
            fs.rmSync(full, { recursive: true, force: true });
          } else {
            walk(full);
          }
        } else if (entry.name.endsWith('.pyc') || entry.name.endsWith('.pyo')) {
          fs.rmSync(full, { force: true });
        }
      }
    };
    walk(distDir);
  };

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Strip Python bytecode (public/__pycache__/*.pyc created by `py_compile`)
      // before VitePWA hashes dist/ so .pyc files never land in dist/ or sw.js.
      {
        name: 'strip-pycache-from-dist',
        apply: 'build',
        writeBundle(): void {
          removePycacheFromDist();
        },
        closeBundle(error?: Error): void {
          if (!error) {
            removePycacheFromDist();
          }
        },
      },
      VitePWA({
        registerType: 'prompt',
        injectRegister: 'auto',
        manifest: false,
        workbox: {
          cleanupOutdatedCaches: true,
          // Claim the first page as soon as the worker activates. Without this the
          // page stays uncontrolled until the next visit, so the decoder warmup that
          // runs on the welcome screen downloads Pyodide outside Cache Storage.
          clientsClaim: true,
          globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
          // Keep the worker + Python runtime scripts and any bytecode out of the
          // precache: worker/Python files use a manual ?v= cache buster.
          globIgnores: [
            '**/fm-save-worker.js',
            '**/fm-save-mapper.py',
            '**/fm_layout_patcher.py',
            '**/__pycache__/**',
            '**/*.pyc',
          ],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern:
                /\/(fm-save-worker\.js|fm-save-mapper\.py|fm_layout_patcher\.py)(\?.*)?$/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'fm-runtime-assets',
                networkTimeoutSeconds: 5,
                expiration: {
                  maxEntries: 8,
                  maxAgeSeconds: 60 * 60 * 24 * 7,
                },
              },
            },
            {
              // Pyodide is fetched from jsDelivr by public/fm-save-worker.js. Without
              // this route an offline phone can only decode from the HTTP cache,
              // which the browser is free to evict. CacheFirst keeps the phone
              // decoder working with no signal after one successful decode.
              urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/pyodide\//i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'fm-pyodide',
                cacheableResponse: { statuses: [0, 200] },
                expiration: {
                  maxEntries: 80,
                  maxAgeSeconds: 60 * 60 * 24 * 30,
                },
              },
            },
            {
              urlPattern: /\/api\/.*/i,
              handler: 'NetworkOnly',
            },
          ],
        },
      }),
      ...(process.env.ANALYZE_BUNDLE === 'true'
        ? [analyzer({ analyzerMode: 'static', openAnalyzer: false })]
        : []),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(import.meta.dirname, 'dist');
          const srcAssets = path.resolve(import.meta.dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, { recursive: true, force: true });
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
