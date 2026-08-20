import { defineConfig } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        // Deliberately NOT using the `entry` shortcut: that routes through Vite's
        // library-mode build, where `format` is derived authoritatively from
        // `build.lib.formats` and a `rollupOptions.output.format` override is ignored.
        // Using `rollupOptions.input` instead (same approach the preload build below
        // already relies on) makes this a plain Rollup build, so the `output.format`
        // override actually takes effect.
        vite: {
          build: {
            rollupOptions: {
              input: path.join(__dirname, 'electron/main.ts'),
              // Force real CommonJS output (not the default ESM, auto-selected because
              // this package.json has "type": "module") so bundled CJS dependencies
              // (e.g. graceful-fs, pulled in transitively via electron-updater) can use
              // real `require()` at runtime. Under ESM output, Rolldown emits a
              // require-shim for such deps that throws "require is not defined" in
              // Electron's main process, since a `.js` entry under "type": "module" has
              // no `require` global — crashes the packaged app on startup.
              // Paired with the `.cjs` extension below, and `main` in package.json, so
              // Node's module loader actually parses the output as CommonJS.
              output: {
                format: 'cjs',
                entryFileNames: '[name].cjs',
                chunkFileNames: '[name].cjs',
              },
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
    }),
  ],
})
