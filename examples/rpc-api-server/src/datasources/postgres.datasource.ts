import { EnvironmentKeys } from '@/common/environments';
import {
  Configuration,
  configurationRelations,
  configurationTable,
  User,
  usersTable,
} from '@/models/entities';
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

@datasource({ driver: NodePostgresDriver })
export class PostgresDataSource extends BasePostgresDataSource<IDSConfigs> {
  private readonly protocol = 'postgresql';

  constructor() {
    super({
      name: PostgresDataSource.name,
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

      // NOTE: this is the place to define which models belonged to this datasource
      schema: {
        // ... extra entity models
        // NOTE: schema key will be used for Query API in DrizzleORM
        [User.TABLE_NAME]: usersTable,
        [Configuration.TABLE_NAME]: configurationTable,

        // Declare all relations
        configurationRelations,
      },
    });
  }

  override configure(): ValueOrPromise<void> {
    this.client = new Pool(this.settings);
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    return `${this.protocol}://${user}:${password}@${host}:${port}/${database}`;
  }
}
