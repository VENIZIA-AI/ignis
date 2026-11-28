import 'dotenv-flow/config';

import { AppEnvs, ParseUtility } from '@venizia/ignis-helpers';
import { defineConfig } from 'drizzle-kit';

// dotenv-flow loads the .env files, also where drizzle-kit runs under Node.
export default defineConfig({
  dialect: 'postgresql',
  out: './migration',
  schema: './src/migration-schema.ts',
  dbCredentials: {
    host:
      ParseUtility.blankToUndefined({
        input: AppEnvs.get('APP_ENV_POSTGRES_HOST'),
      }) ?? '127.0.0.1',
    port: ParseUtility.toInt({
      input:
        ParseUtility.blankToUndefined({
          input: AppEnvs.get('APP_ENV_POSTGRES_PORT'),
        }) ?? '5432',
    }),
    database:
      ParseUtility.blankToUndefined({
        input: AppEnvs.get('APP_ENV_POSTGRES_DATABASE'),
      }) ?? 'postgres',
    user:
      ParseUtility.blankToUndefined({
        input: AppEnvs.get('APP_ENV_POSTGRES_USERNAME'),
      }) ?? 'postgres',
    password:
      ParseUtility.blankToUndefined({
        input: AppEnvs.get('APP_ENV_POSTGRES_PASSWORD'),
      }) ?? 'password',
    ssl: false,
  },
});
