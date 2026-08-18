import type { TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import { BaseRelationalDataSource } from '@/relational/core/datasources';
import type {
  IRelationalQueryDialect,
  IRelationalQueryExecutor,
} from '@/relational/core/repositories/common';
import type { TSqliteConnector } from '@/relational/sqlite/drivers';
import { SqliteQueryExecutor } from '@/relational/sqlite/repositories/executor';
import { SqliteQueryDialect } from '@/relational/sqlite/repositories/dialect/query-dialect';

/**
 * SQLite branch root: supplies the SQLite dialect and executor on
 * top of the engine-neutral `BaseRelationalDataSource`. The BEGIN
 * statement stays abstract - `BaseSqliteDataSource` supplies it.
 */
export abstract class AbstractSqliteDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
  Client = unknown,
> extends BaseRelationalDataSource<
  Settings,
  Schema,
  ConfigurableOptions,
  Client,
  TSqliteConnector<Schema>
> {
  private static queryDialect?: IRelationalQueryDialect;
  private static queryExecutor?: IRelationalQueryExecutor<TSqliteConnector>;

  override getQueryDialect(): IRelationalQueryDialect {
    AbstractSqliteDataSource.queryDialect ??= new SqliteQueryDialect();
    return AbstractSqliteDataSource.queryDialect;
  }

  override getQueryExecutor(): IRelationalQueryExecutor<TSqliteConnector<Schema>> {
    AbstractSqliteDataSource.queryExecutor ??= new SqliteQueryExecutor();
    return AbstractSqliteDataSource.queryExecutor as IRelationalQueryExecutor<
      TSqliteConnector<Schema>
    >;
  }
}
