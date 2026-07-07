import { ValueOrPromise } from '@venizia/ignis-helpers';
import { Pool } from 'pg';
import { AbstractDataSource, TAnyDataSourceSchema } from '@/base/datasources';
// Deep import (not the repositories barrel): FilterBuilder -> repositories/common -> datasources
// barrel closes a module cycle. Instantiated lazily below, never in a static initializer, so the
// class body references no half-initialized binding at load time.
import { FilterBuilder } from '@/connectors/postgres/repositories/dialect/filter';
import type { IRelationalQueryDialect } from '@/connectors/postgres/repositories/common';
import {
  IPostgresDataSource,
  IDatabaseTransaction,
  IDatabaseTransactionOptions,
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

  /** Shared across every relational datasource - FilterBuilder is stateless (its only field is a
   * logger scope). Unlike the search branch's eager `static readonly`, this is assigned lazily on
   * first use: an eager static initializer would run at module load, when the FilterBuilder ->
   * repositories/common -> datasources cycle leaves the binding half-initialized (TDZ). */
  private static queryDialect?: IRelationalQueryDialect;

  abstract getConnectionString(): ValueOrPromise<string>;
  abstract override beginTransaction(
    opts?: IDatabaseTransactionOptions,
  ): Promise<IDatabaseTransaction<Schema>>;

  getConnector() {
    return this.connector;
  }

  /** The relational query dialect (FilterBuilder), obtained by repositories via the datasource -
   * mirrors the search branch's `getQueryDialect()`. Returns the shared singleton. */
  getQueryDialect(): IRelationalQueryDialect {
    if (!AbstractRelationalDataSource.queryDialect) {
      AbstractRelationalDataSource.queryDialect = new FilterBuilder();
    }

    return AbstractRelationalDataSource.queryDialect;
  }
}
