import type { TAnyDataSourceSchema } from '@/base/datasources';
import type { IRelationalQueryDialect } from '@/connectors/postgres/repositories/common';
import { PostgresQueryDialect } from '@/connectors/postgres/repositories/dialect/query-dialect';
import { PostgresQueryExecutor } from '@/connectors/postgres/repositories/executor';
import { BaseRelationalDataSource } from '@/connectors/relational/datasources';
import type { IRelationalQueryExecutor } from '@/connectors/relational/repositories/common';
import type { Pool } from 'pg';
import type { TRelationalConnector } from './common';

/**
 * Postgres branch root: supplies the Postgres dialect and executor on top of the engine-neutral
 * `BaseRelationalDataSource`. The BEGIN statement stays abstract - `BasePostgresDataSource`
 * supplies it.
 */
export abstract class AbstractPostgresDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
  Client = Pool,
> extends BaseRelationalDataSource<
  Settings,
  Schema,
  ConfigurableOptions,
  Client,
  TRelationalConnector<Schema>
> {
  private static queryDialect?: IRelationalQueryDialect;
  private static queryExecutor?: IRelationalQueryExecutor<TRelationalConnector>;

  override getQueryDialect(): IRelationalQueryDialect {
    AbstractPostgresDataSource.queryDialect ??= new PostgresQueryDialect();
    return AbstractPostgresDataSource.queryDialect;
  }

  override getQueryExecutor(): IRelationalQueryExecutor<TRelationalConnector<Schema>> {
    AbstractPostgresDataSource.queryExecutor ??= new PostgresQueryExecutor();
    return AbstractPostgresDataSource.queryExecutor as IRelationalQueryExecutor<
      TRelationalConnector<Schema>
    >;
  }
}
