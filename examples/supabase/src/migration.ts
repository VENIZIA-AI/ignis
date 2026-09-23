import { blankToUndefined } from '@venizia/ignis-helpers';
import { defineConfig } from 'drizzle-kit';

/**
 * `entities.roles.provider: 'supabase'` tells drizzle-kit that `anon`, `authenticated`, `service_role`
 * and friends are the platform's roles, not ours - without it, drizzle-kit sees roles it did not
 * create and generates statements to drop them. `schema` points at the source file directly, same as
 * `pglite-quickstart`: drizzle-kit bundles it with esbuild, no build step needed first.
 */
export default defineConfig({
  dialect: 'postgresql',
  out: './migration',
  schema: './src/models/note.model.ts',
  schemaFilter: ['ignis_example'],
  entities: {
    roles: { provider: 'supabase' },
  },
  dbCredentials: {
    url: blankToUndefined(process.env.APP_ENV_SUPABASE_DATABASE_URL) ?? '',
  },
});
