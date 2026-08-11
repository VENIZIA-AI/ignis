import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit reads the model file directly - it bundles with esbuild, so the `@model` decorator
 * and the framework import are erased before the table export is evaluated. No compiled
 * re-export step is needed, unlike an entity whose table lives on a `.schema` static.
 *
 * `url` is a DIRECTORY here, not a connection string - PGlite owns the whole data directory.
 */
export default defineConfig({
  dialect: 'postgresql',
  driver: 'pglite',
  out: './migration',
  schema: './src/models/note.model.ts',
  dbCredentials: { url: process.env.APP_ENV_PGLITE_DATA_DIR ?? './app_data/database/pgdata' },
});
