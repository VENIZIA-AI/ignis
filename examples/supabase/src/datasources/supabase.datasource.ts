import { EnvironmentKeys } from '@/common/environments';
import { datasource, type TAnyDataSourceSchema, type ValueOrPromise } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { PostgresJsDriver } from '@venizia/ignis/postgres/postgres-js';
import {
  buildPostgresJsOptions,
  PoolerModes,
  type TPoolerMode,
} from '@venizia/ignis/postgres/supabase';
import { applicationEnvironment, int } from '@venizia/ignis-helpers';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import type { Sql } from 'postgres';

interface IDataSourceConfigs {
  url: string;
  mode: TPoolerMode;
  max?: number;
}

/**
 * The one datasource in this example. Supabase is unmodified PostgreSQL, so it is not a separate
 * connector - it varies the DRIVER, not the SQL dialect. Everything Supabase-specific lives here:
 * postgres-js instead of pg, and the pooler-mode preset that decides `prepare`.
 */
@datasource({ driver: PostgresJsDriver })
export class SupabaseDataSource extends BasePostgresDataSource<
  IDataSourceConfigs,
  TAnyDataSourceSchema,
  {},
  Sql // getClient() is honestly typed as postgres-js's Sql, not pg.Pool
> {
  constructor() {
    super({
      name: SupabaseDataSource.name,
      config: {
        url: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_SUPABASE_DATABASE_URL),
        mode: applicationEnvironment.get<TPoolerMode>(
          EnvironmentKeys.APP_ENV_SUPABASE_POOLER_MODE,
          { defaultValue: PoolerModes.DIRECT },
        ),
        max: applicationEnvironment.get<number | undefined, string>(
          EnvironmentKeys.APP_ENV_SUPABASE_POOL_MAX,
          { defaultValue: undefined, transform: value => (value ? int(value) : undefined) },
        ),
      },
      // NO schema property - auto-discovered from @repository bindings.
    });
  }

  override async configure(): Promise<void> {
    const { url, mode, max } = this.settings;

    this.client = postgres(url, buildPostgresJsOptions({ mode, max }));

    // Plain Postgres persists between runs, unlike PGlite - but drizzle tracks applied migrations in
    // its own table, so running this against a database that already has them is a no-op. Mirrors the
    // other quickstarts: the app applies its own schema at boot, one command to run it.
    await migrate(drizzle({ client: this.client }), { migrationsFolder: './migration' });
  }

  override getConnectionString(): ValueOrPromise<string> {
    return this.settings.url;
  }
}
