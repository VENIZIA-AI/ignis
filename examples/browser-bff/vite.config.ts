import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Never `new URL(...).pathname` for an alias target: on Windows that yields `/C:/Users/...`, which Vite cannot resolve. */
const fromHere = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // `@` is the Worker half, so its files import each other as the server examples do.
      '@': fromHere('./src/worker'),
      // `~` is the application root, which is what `components.json` points shadcn at.
      '~': fromHere('./src'),
    },
  },
  // `APP_ENV_PGLITE_DATA_DIR` reaches the Worker as `import.meta.env.APP_ENV_PGLITE_DATA_DIR`.
  envPrefix: ['VITE_', 'APP_ENV_'],
  optimizeDeps: {
    // Vite's dependency pre-bundling mangles PGlite's WASM asset resolution.
    exclude: ['@electric-sql/pglite'],
  },
  worker: { format: 'es' },
});
