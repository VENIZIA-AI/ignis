import type { TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import type { IRelationalQueryDialect } from '@/relational/postgres/repositories/common';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';
import { PostgresQueryExecutor } from '@/relational/postgres/repositories/executor';
import { BaseRelationalDataSource } from '@/relational/core/datasources';
import type { IRelationalQueryExecutor } from '@/relational/core/repositories/common';
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
