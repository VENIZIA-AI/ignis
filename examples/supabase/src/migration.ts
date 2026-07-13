import 'dotenv-flow/config';

import { defineConfig } from 'drizzle-kit';

/**
 * `entities.roles.provider: 'supabase'` tells drizzle-kit that `anon`, `authenticated`,
 * `service_role` and friends are the platform's roles, not ours. Without it, drizzle-kit sees roles
 * it did not create and generates statements to drop them.
 */
export default defineConfig({
  dialect: 'postgresql',
  out: './migration',
  schema: './dist/migration-schema.js',
  schemaFilter: ['ignis_example'],
  entities: {
    roles: { provider: 'supabase' },
  },
  dbCredentials: {
    url: process.env.APP_ENV_SUPABASE_DATABASE_URL ?? '',
  },
});
