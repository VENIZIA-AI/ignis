import { EnvironmentKeys } from '@/common/environments';
import { DataSourceDrivers, datasource, ValueOrPromise } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { PostgresJsDriver } from '@venizia/ignis/postgres/postgres-js';
import { buildPostgresJsOptions, PoolerModes, TPoolerMode } from '@venizia/ignis/postgres/supabase';
import { applicationEnvironment, int } from '@venizia/ignis-helpers';
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
 *
 * There is no `pg` anywhere in this package. That is the point: the driver seam is real.
 */
@datasource({ driver: DataSourceDrivers.POSTGRES_JS })
export class SupabaseDataSource extends BasePostgresDataSource<
  IDataSourceConfigs,
  Record<string, unknown>,
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
          { defaultValue: PoolerModes.SESSION },
        ),
        max: applicationEnvironment.get<number | undefined, string>(
          EnvironmentKeys.APP_ENV_SUPABASE_POOL_MAX,
          { defaultValue: undefined, transform: value => (value ? int(value) : undefined) },
        ),
      },
      // NO schema property - auto-discovered from @repository bindings.
    });
  }

  override configure(): ValueOrPromise<void> {
    const schema = this.getSchema();
    const { url, mode, max } = this.settings;

    this.logger
      .for(this.configure.name)
      .debug(
        'Auto-discovered schema | Models (%s): %o',
        Object.keys(schema).length,
        Object.keys(schema),
      );

    // `prepare: false` is emitted for TRANSACTION mode only, and there it is not a tuning knob:
    // Supavisor rebinds the backend per transaction, so a server-side prepared statement created on
    // one backend is simply not there on the next.
    const client = postgres(url, buildPostgresJsOptions({ mode, max }));

    // useDriver() assigns the driver AND builds the pooled connector from it, so the half-wired
    // state (driver set, connector forgotten - pooled queries silently bypassing the driver) cannot
    // exist.
    this.useDriver({ driver: new PostgresJsDriver({ client }), schema });
  }

  override getConnectionString(): ValueOrPromise<string> {
    return this.settings.url;
  }
}
