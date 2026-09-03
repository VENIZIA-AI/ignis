import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Never `new URL(...).pathname` for an alias target: on Windows that yields `/C:/Users/...`, which Vite cannot resolve, and every `@/...` import fails. */
const fromHere = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // `@` points at `src/domain`, not `src`: the model, repository and controller are copied
    // verbatim from `examples/pglite-quickstart` and address each other as `@/models/...`.
    alias: {
      '@': fromHere('./src/domain'),
      // `~` is the application root, which is what `components.json` points shadcn at.
      '~': fromHere('./src'),
    },
  },
  optimizeDeps: {
    // Vite's dependency pre-bundling mangles PGlite's WASM asset resolution.
    //
    // Nothing else is listed. Every IGNIS package that claims browser purity now publishes an
    // `import` condition, so Vite resolves real ESM and there is no bare `require()` for the
    // browser to meet - the purity manifest enforces that claim, so this list cannot silently
    // become necessary again.
    exclude: ['@electric-sql/pglite'],
  },
  worker: { format: 'es' },
});
