import { EnvironmentKeys } from '@/common';
import { datasource, ValueOrPromise } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';
import { applicationEnvironment, int } from '@venizia/ignis-helpers';
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
        host: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_POSTGRES_HOST),
        port: int(applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_POSTGRES_PORT)),
        database: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_POSTGRES_DATABASE),
        user: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_POSTGRES_USERNAME),
        password: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_POSTGRES_PASSWORD),
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
