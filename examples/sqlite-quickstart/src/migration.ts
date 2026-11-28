import { defineConfig } from 'drizzle-kit';
import { AppEnvs, ParseUtility } from '@venizia/ignis-helpers';

/**
 * drizzle-kit reads the model files directly: no compiled re-export step is needed, unlike an
 * entity whose table lives on a `.schema` static. Loading a model file loads the framework, so
 * `migrate:generate` runs drizzle-kit under Bun.
 */
export default defineConfig({
  dialect: 'sqlite',
  out: './migration',
  schema: './src/models/*.model.ts',
  dbCredentials: {
    url:
      ParseUtility.blankToUndefined({ input: AppEnvs.get('APP_ENV_SQLITE_URL') }) ??
      'file:./app_data/database/local.db',
  },
});
