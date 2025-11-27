import { EnvironmentKeys } from '@/common/environments';
import {
  applicationEnvironment,
  BaseDataSource,
  datasource,
  int,
  ValueOrPromise,
} from '@vez/ignis';
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

@datasource()
export class PostgresDataSource extends BaseDataSource<IDSConfigs> {
  private readonly connector = 'postgresql';

  constructor() {
    super({
      name: PostgresDataSource.name,
      driver: 'node-postgres',
      config: {
        host: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_POSTGRES_HOST),
        port: int(
          applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_POSTGRES_PORT),
        ),
        database: applicationEnvironment.get<string>(
          EnvironmentKeys.APP_ENV_POSTGRES_DATABASE,
        ),
        user: applicationEnvironment.get<string>(
          EnvironmentKeys.APP_ENV_POSTGRES_USERNAME,
        ),
        password: applicationEnvironment.get<string>(
          EnvironmentKeys.APP_ENV_POSTGRES_PASSWORD,
        ),
        ssl: false,
      },
    });
  }

  override configure(): ValueOrPromise<void> {
    this.dataSource = drizzle({
      client: new Pool(this.settings),
    });
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    const protocol = this.connector.toLowerCase();
    return `${protocol}://${user}:${password}@${host}:${port}/${database}`;
  }
}
