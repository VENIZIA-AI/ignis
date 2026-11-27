import { applicationEnvironment, ParseUtility } from '@venizia/ignis-helpers';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit bundles the model files with esbuild and reads the exported tables. `url` is PGlite's
// data directory, not a connection string.
export default defineConfig({
  dialect: 'postgresql',
  driver: 'pglite',
  out: './migration',
  schema: './src/models',
  dbCredentials: {
    url:
      ParseUtility.blankToUndefined({
        input: applicationEnvironment.get('APP_ENV_PGLITE_DATA_DIR'),
      }) ?? './app_data/database/pgdata',
  },
});
