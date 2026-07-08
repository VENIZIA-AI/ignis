import { AbstractDataSource, TAnyDataSourceSchema } from '@/base/datasources';
import type { IRelationalQueryDialect } from '@/connectors/postgres/repositories/common';
import { FilterBuilder } from '@/connectors/postgres/repositories/dialect/filter';
import { ValueOrPromise } from '@venizia/ignis-helpers';
import { Pool } from 'pg';
import {
  IDatabaseTransaction,
  IDatabaseTransactionOptions,
  IPostgresDataSource,
  TNodePostgresConnector,
} from './common';

/** SQL branch root: connector, pool, transactions. */
export abstract class AbstractRelationalDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
>
  extends AbstractDataSource<Settings, Schema, ConfigurableOptions>
  implements IPostgresDataSource<Settings, Schema, ConfigurableOptions>
{
  connector: TNodePostgresConnector<Schema>;

  protected pool: Pool;

  private static queryDialect?: IRelationalQueryDialect;

  abstract getConnectionString(): ValueOrPromise<string>;
  abstract override beginTransaction(
    opts?: IDatabaseTransactionOptions,
  ): Promise<IDatabaseTransaction<Schema>>;

  getConnector() {
    return this.connector;
  }

  getClient(): Pool {
    return this.pool;
  }

  getQueryDialect(): IRelationalQueryDialect {
    if (!AbstractRelationalDataSource.queryDialect) {
      AbstractRelationalDataSource.queryDialect = new FilterBuilder();
    }

    return AbstractRelationalDataSource.queryDialect;
  }
}
