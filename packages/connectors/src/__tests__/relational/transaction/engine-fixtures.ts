import type { TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import { model } from '@venizia/ignis-kernel';
import type { IRelationalConnection, IRelationalDriver } from '@/relational/core/drivers';
import type { TTableInsert, TTableObject } from '@/relational/core/models';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import type { IDatabaseExtraOptions } from '@/relational/postgres/repositories';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import { BaseSqliteDataSource } from '@/relational/sqlite/datasources';
import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';
import { BaseSqliteEntity } from '@/relational/sqlite/models';
import type { ISqliteExtraOptions } from '@/relational/sqlite/repositories';
import { DefaultSqliteRepository } from '@/relational/sqlite/repositories';
import type { PGlite } from '@electric-sql/pglite';
import type { Client } from '@libsql/client';
import { integer as sqliteInteger, sqliteTable, text as sqliteText } from 'drizzle-orm/sqlite-core';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';
import type { ITransactionParityProbe } from './parity-suite';
import { TransactionEndStatements } from './parity-suite';

/**
 * Wraps an engine's real driver and records what the transaction handle does with its connection:
 * every control statement, every release. `failure` makes one statement reject with a given error
 * instead of reaching the engine, so the handle's failure path runs over a real connection.
 */
export class RecordingDriver<TConnector> implements IRelationalDriver<TConnector> {
  readonly statements: string[] = [];
  readonly releases: Array<{ isDestroyed: boolean }> = [];
  failure?: { statement: string; error: Error };

  private readonly driver: IRelationalDriver<TConnector>;

  constructor(opts: { driver: IRelationalDriver<TConnector> }) {
    this.driver = opts.driver;
  }

  reset(opts?: { failure?: { statement: string; error: Error } }): void {
    this.statements.length = 0;
    this.releases.length = 0;
    this.failure = opts?.failure;
  }

  countEndStatements(): number {
    return this.statements.filter(statement => TransactionEndStatements.isValid(statement)).length;
  }

  createConnector(opts: { schema: TAnyDataSourceSchema }): TConnector {
    return this.driver.createConnector(opts);
  }

  async acquire(opts: {
    schema: TAnyDataSourceSchema;
  }): Promise<IRelationalConnection<TConnector>> {
    const connection = await this.driver.acquire(opts);

    return {
      connector: connection.connector,

      execute: async (executeOpts: { statement: string }) => {
        this.statements.push(executeOpts.statement);

        if (this.failure?.statement === executeOpts.statement) {
          throw this.failure.error;
        }

        return connection.execute(executeOpts);
      },

      query: <R>(queryOpts: { statement: string }) => connection.query<R>(queryOpts),

      release: (releaseOpts?: { destroy?: boolean }) => {
        this.releases.push({ isDestroyed: releaseOpts?.destroy === true });
        connection.release(releaseOpts);
      },
    };
  }

  getClient(): unknown {
    return this.driver.getClient();
  }

  end(): Promise<void> {
    return this.driver.end();
  }
}

// ----- Postgres (PGlite) ---------------------------------------------------------------------

/** Unique per engine: the model registry is process-wide and keyed by table name. */
export const POSTGRES_TABLE_NAME = 'transaction_helpers_pglite';

export const postgresItemTable = pgTable(POSTGRES_TABLE_NAME, {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
});

export const POSTGRES_TABLE_DDL = `CREATE TABLE ${POSTGRES_TABLE_NAME} (id serial primary key, name text not null)`;

const postgresSchema = { [POSTGRES_TABLE_NAME]: postgresItemTable };

@model({ type: 'entity' })
export class PostgresTransactionEntity extends BasePostgresEntity<typeof postgresItemTable> {
  static override TABLE_NAME = POSTGRES_TABLE_NAME;
  static override schema = postgresItemTable;
}

export class TransactionPostgresDataSource extends BasePostgresDataSource<
  {},
  typeof postgresSchema,
  {},
  PGlite
> {
  readonly recorder: RecordingDriver<ReturnType<TransactionPostgresDataSource['getConnector']>>;

  constructor(opts: { client: PGlite }) {
    super({ name: TransactionPostgresDataSource.name, config: {}, schema: postgresSchema });

    this.client = opts.client;
    this.recorder = new RecordingDriver({
      driver: new PGliteDriver<typeof postgresSchema>({ client: opts.client }),
    });
  }

  override configure(): void {
    this.useDriver({ driver: this.recorder });
  }

  override getConnectionString(): string {
    return 'pglite://memory';
  }

  /** Through the driver, not `client.close()`: only `end()` clears the exit status PGlite plants. */
  endDriver(): Promise<void> {
    return this.recorder.end();
  }
}

export class PostgresTransactionRepository extends DefaultCRUDRepository<
  typeof postgresItemTable,
  TTableObject<typeof postgresItemTable>,
  TTableInsert<typeof postgresItemTable>,
  IDatabaseExtraOptions,
  TransactionPostgresDataSource
> {}

// ----- SQLite (libsql :memory:) ----------------------------------------------------------------

export const SQLITE_TABLE_NAME = 'transaction_helpers_libsql';

export const sqliteItemTable = sqliteTable(SQLITE_TABLE_NAME, {
  id: sqliteInteger('id').primaryKey({ autoIncrement: true }),
  name: sqliteText('name').notNull(),
});

export const SQLITE_TABLE_DDL = `CREATE TABLE ${SQLITE_TABLE_NAME} (id integer primary key autoincrement, name text not null)`;

const sqliteSchema = { [SQLITE_TABLE_NAME]: sqliteItemTable };

@model({ type: 'entity' })
export class SqliteTransactionEntity extends BaseSqliteEntity<typeof sqliteItemTable> {
  static override TABLE_NAME = SQLITE_TABLE_NAME;
  static override schema = sqliteItemTable;
}

export class TransactionSqliteDataSource extends BaseSqliteDataSource<
  { url: string },
  typeof sqliteSchema,
  {},
  Client
> {
  readonly recorder: RecordingDriver<ReturnType<TransactionSqliteDataSource['getConnector']>>;

  constructor(opts: { client: Client }) {
    super({
      name: TransactionSqliteDataSource.name,
      config: { url: ':memory:' },
      schema: sqliteSchema,
    });

    this.client = opts.client;
    this.recorder = new RecordingDriver({
      driver: new LibSqlDriver<typeof sqliteSchema>({ client: opts.client }),
    });
  }

  override configure(): void {
    this.useDriver({ driver: this.recorder });
  }
}

export class SqliteTransactionRepository extends DefaultSqliteRepository<
  typeof sqliteItemTable,
  TTableObject<typeof sqliteItemTable>,
  TTableInsert<typeof sqliteItemTable>,
  ISqliteExtraOptions,
  TransactionSqliteDataSource
> {}

// ----- Parity probes over the real handle ------------------------------------------------------

/** Every `begin()` resets the recorder, so each case counts only its own transaction. */
export const buildRealHandleProbe = (opts: {
  dataSource: TransactionPostgresDataSource | TransactionSqliteDataSource;
}): ITransactionParityProbe => {
  const { dataSource } = opts;

  return {
    begin: async beginOpts => {
      dataSource.recorder.reset({ failure: beginOpts?.failure });

      const transaction = await dataSource.beginTransaction();

      return {
        transaction,
        countEndStatements: () => dataSource.recorder.countEndStatements(),
      };
    },
  };
};
