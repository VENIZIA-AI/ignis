import { blankToUndefined } from '@venizia/ignis-helpers';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit bundles the model file with esbuild and reads the exported tables. `url` is PGlite's
// data directory, not a connection string.
export default defineConfig({
  dialect: 'postgresql',
  driver: 'pglite',
  out: './migration',
  schema: './src/models/note.model.ts',
  dbCredentials: {
    url: blankToUndefined(process.env.APP_ENV_PGLITE_DATA_DIR) ?? './app_data/database/pgdata',
  },
});
