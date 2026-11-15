import { EnvironmentKeys } from '@/common';
import { requireEnv } from '@/common/require-env';
import { datasource, type ValueOrPromise } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis-connectors/postgres';
import { NodePostgresDriver } from '@venizia/ignis-connectors/postgres/node-postgres';
import { ParseUtility } from '@venizia/ignis-helpers';
import { Pool } from 'pg';

interface IDataSourceConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

/**
 * The schema is discovered from the repositories bound here. Naming NodePostgresDriver in
 * `@datasource` wires the driver and carries `pg` into a compiled binary.
 */
@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BasePostgresDataSource<IDataSourceConfigs> {
  private readonly protocol = 'postgresql';

  constructor() {
    super({
      name: PostgresDataSource.name,
      config: {
        host: requireEnv(EnvironmentKeys.APP_ENV_POSTGRES_HOST),
        port: ParseUtility.toInt({
          input: requireEnv(EnvironmentKeys.APP_ENV_POSTGRES_PORT),
        }),
        database: requireEnv(EnvironmentKeys.APP_ENV_POSTGRES_DATABASE),
        user: requireEnv(EnvironmentKeys.APP_ENV_POSTGRES_USERNAME),
        password: requireEnv(EnvironmentKeys.APP_ENV_POSTGRES_PASSWORD),
        ssl: false,
      },
    });
  }

  override configure(): ValueOrPromise<void> {
    const schema = Object.keys(this.getSchema());
    this.logger.debug(
      '[configure] Auto-discovered schema | Schema + Relations (%s): %o',
      schema.length,
      schema,
    );

    this.client = new Pool(this.settings);
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;

    return `${this.protocol}://${user}:${password}@${host}:${port}/${database}`;
  }
}
