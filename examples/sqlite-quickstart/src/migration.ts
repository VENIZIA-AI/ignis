import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit reads the model file directly - it bundles with esbuild, so the `@model` decorator
 * and the framework import are erased before the table export is evaluated. No compiled
 * re-export step is needed, unlike an entity whose table lives on a `.schema` static.
 */
export default defineConfig({
  dialect: 'sqlite',
  out: './migration',
  schema: './src/models/note.model.ts',
  dbCredentials: { url: process.env.APP_ENV_SQLITE_URL ?? 'file:./app_data/database/local.db' },
});
