import { EnvironmentKeys } from '@/common/environments';
import {
  applicationEnvironment,
  BaseDataSource,
  datasource,
  int,
  ValueOrPromise,
} from '@venizia/ignis';
import { drizzle } from 'drizzle-orm/node-postgres';
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
 * PostgresDataSource with auto-discovery support.
 *
 * Features:
 * - Schema is auto-discovered from repositories that reference this datasource
 *
 * How it works:
 * 1. @repository decorator binds model to datasource
 * 2. When configure() is called, getSchema() auto-discovers all bound models
 * 3. Drizzle is initialized with the auto-discovered schema
 */
@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource<IDSConfigs> {
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
    // getSchema() auto-discovers models from @repository bindings
    const schema = this.getSchema();

    const dsSchema = Object.keys(schema);
    this.logger.debug(
      '[configure] Auto-discovered schema | Schema + Relations (%s): %o',
      dsSchema.length,
      dsSchema,
    );

    // Store pool reference for transaction support
    this.pool = new Pool(this.settings);
    this.connector = drizzle({ client: this.pool, schema });
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    return `${this.protocol}://${user}:${password}@${host}:${port}/${database}`;
  }
}
