import { EnvKeys } from '@/common/env-keys';
import { AppEnvs, ParseUtility } from '@venizia/ignis-helpers';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit reads the exported tables of the model files. `url` is PGlite's data directory.
export default defineConfig({
  dialect: 'postgresql',
  driver: 'pglite',
  out: './migration',
  schema: './src/models',
  dbCredentials: {
    url:
      ParseUtility.blankToUndefined({ input: AppEnvs.get(EnvKeys.APP_ENV_PGLITE_DATA_DIR) }) ??
      './app_data/database/pgdata',
  },
});
