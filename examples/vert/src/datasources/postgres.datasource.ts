import { EnvironmentKeys } from '@/common/environments';
import { datasource, ValueOrPromise } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres';
import { applicationEnvironment, int } from '@venizia/ignis-helpers';
import { Pool } from 'pg';

interface IDSConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

/**
 * Schema is auto-discovered from the repositories that reference this datasource: `@repository`
 * binds a model to a datasource, and `getSchema()` collects them.
 *
 * `configure()` only builds the client. Naming NodePostgresDriver in `@datasource` is what wires
 * the driver and the connector - and what carries `pg` into the bundle.
 */
@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BasePostgresDataSource<IDSConfigs> {
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
      // NO schema property - auto-discovered from @repository bindings!
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
