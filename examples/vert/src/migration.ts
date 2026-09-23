import 'dotenv-flow/config';

import { blankToUndefined, int } from '@venizia/ignis-helpers';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs under Node, so dotenv-flow loads the .env files Bun would load by itself.
export default defineConfig({
  dialect: 'postgresql',
  out: './migration',
  schema: './src/migration-schema.ts',
  dbCredentials: {
    host: blankToUndefined(process.env.APP_ENV_POSTGRES_HOST) ?? '127.0.0.1',
    port: int(blankToUndefined(process.env.APP_ENV_POSTGRES_PORT) ?? '5432'),
    database: blankToUndefined(process.env.APP_ENV_POSTGRES_DATABASE) ?? 'postgres',
    user: blankToUndefined(process.env.APP_ENV_POSTGRES_USERNAME) ?? 'postgres',
    password: blankToUndefined(process.env.APP_ENV_POSTGRES_PASSWORD) ?? 'password',
    ssl: false,
  },
});
