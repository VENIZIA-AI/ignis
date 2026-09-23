import { defineConfig } from 'drizzle-kit';
import { blankToUndefined } from '@venizia/ignis-helpers';

/**
 * drizzle-kit reads the model file directly and picks up the exported table - it bundles with
 * esbuild, so the `@model` decorator and the framework import are erased first.
 *
 * `url` is a DIRECTORY here, not a connection string - PGlite owns the whole data directory.
 */
export default defineConfig({
  dialect: 'postgresql',
  driver: 'pglite',
  out: './migration',
  schema: './src/models/note.model.ts',
  dbCredentials: {
    url: blankToUndefined(process.env.APP_ENV_PGLITE_DATA_DIR) ?? './app_data/database/pgdata',
  },
});
