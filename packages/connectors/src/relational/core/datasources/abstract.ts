import type { TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { AbstractDriverDataSource } from '@/common/driver-data-source';
import type { IRelationalDriver } from '@/relational/core/drivers';
import type {
  IRelationalDataSource,
  IRelationalTransaction,
  TRelationalTransactionOptions,
} from '@/relational/core/datasources/common';
import type {
  IRelationalQueryDialect,
  IRelationalQueryExecutor,
} from '@/relational/core/repositories/common';

/**
 * SQL branch root: connector, pool, transactions. Engine-neutral - dialect and executor are
 * declared abstract here and supplied by each engine branch. The driver lifecycle (wiring, close,
 * secret rotation, drain) is `AbstractDriverDataSource`, shared with the raw-SQL family; this class
 * adds what only a relational engine has: a connection string, transactions, a query dialect and a
 * query executor.
 */
export abstract class AbstractRelationalDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
  Client = unknown,
  TConnector = unknown,
>
  extends AbstractDriverDataSource<
    Settings,
    Schema,
    ConfigurableOptions,
    Client,
    TConnector,
    IRelationalDriver<TConnector>
  >
  implements IRelationalDataSource<Settings, Schema, ConfigurableOptions, Client, TConnector>
{
  abstract getConnectionString(): ValueOrPromise<string>;
  abstract override beginTransaction(
    opts?: TRelationalTransactionOptions,
  ): Promise<IRelationalTransaction<TConnector>>;

  abstract getQueryDialect(): IRelationalQueryDialect;
  abstract getQueryExecutor(): IRelationalQueryExecutor<TConnector>;
}
