import type { TAnyDataSourceSchema } from '@/base/datasources';
import type {
  IRelationalDataSource,
  IRelationalTransaction,
  TRelationalTransactionOptions,
} from '@/connectors/relational/datasources/common';
import type { IRelationalQueryDialect } from '@/connectors/relational/repositories/common';
import type { TSqliteConnector } from '@/connectors/sqlite/drivers';
import type { TConstValue } from '@venizia/ignis-helpers';

/**
 * SQLite's BEGIN axis is a locking mode, not an isolation level - every SQLite transaction is
 * serializable, so there is no level left to choose.
 */
export class SqliteBeginModes {
  static readonly DEFERRED = 'DEFERRED';
  static readonly IMMEDIATE = 'IMMEDIATE';
  static readonly EXCLUSIVE = 'EXCLUSIVE';

  static readonly SCHEME_SET = new Set([this.DEFERRED, this.IMMEDIATE, this.EXCLUSIVE]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

export type TSqliteBeginMode = TConstValue<typeof SqliteBeginModes>;

/** SQLite transaction options: a locking mode where Postgres takes an isolation level. */
export interface ISqliteTransactionOptions extends TRelationalTransactionOptions {
  beginMode?: TSqliteBeginMode;
}

/**
 * SQLite narrowing: pins the transaction's connector to an async
 * `BaseSQLiteDatabase` and requires a resolved locking mode. `connector`,
 * `commit()` and `rollback()` come from `IRelationalTransaction`.
 */
export interface ISqliteTransaction<
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
> extends IRelationalTransaction<TSqliteConnector<Schema>> {
  beginMode: TSqliteBeginMode;
}

/**
 * SQLite narrowing of `IRelationalDataSource`. `Client` stays `unknown` rather than defaulting to
 * libsql's `Client` the way Postgres defaults to `pg.Pool`: `@libsql/client` is an optional peer,
 * and naming its type here would make the `@venizia/ignis/sqlite` declarations unusable without it.
 */
export interface ISqliteDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
  Client = unknown,
> extends IRelationalDataSource<
  Settings,
  Schema,
  ConfigurableOptions,
  Client,
  TSqliteConnector<Schema>
> {
  getQueryDialect(): IRelationalQueryDialect;
  beginTransaction(opts?: ISqliteTransactionOptions): Promise<ISqliteTransaction<Schema>>;
}

/**
 * The settings `getConnectionString()` reads by default
 * - libsql's url IS SQLite's connection string.
 */
export interface ISqliteDataSourceSettings {
  /** `:memory:`, `file:./data.db`, `libsql://<host>` or an embedded-replica url. */
  url: string;

  authToken?: string;
}
