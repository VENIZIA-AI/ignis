import { ValueOrPromise } from '@venizia/ignis-helpers';
import { Pool } from 'pg';
import { AbstractDataSource, TAnyDataSourceSchema } from '@/base/datasources';
import {
  IPostgresDataSource,
  IDatabaseTransaction,
  IDatabaseTransactionOptions,
  TNodePostgresConnector,
} from './common';

/** SQL branch root: connector, pool, transactions. */
export abstract class AbstractPostgresDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
>
  extends AbstractDataSource<Settings, Schema, ConfigurableOptions>
  implements IPostgresDataSource<Settings, Schema, ConfigurableOptions>
{
  connector: TNodePostgresConnector<Schema>;

  protected pool: Pool;

  abstract getConnectionString(): ValueOrPromise<string>;
  abstract override beginTransaction(
    opts?: IDatabaseTransactionOptions,
  ): Promise<IDatabaseTransaction<Schema>>;

  getConnector() {
    return this.connector;
  }
}
