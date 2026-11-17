import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import { RelationalDialects } from '../drivers';
import type { IRelationalDriver } from '../drivers';

/** One migration to apply. `sql` may hold several statements separated by `--> statement-breakpoint`, as `drizzle-kit generate` writes them. */
export interface IMigration {
  /** Ledger key. Never rewrite an applied one - see the hashing note on {@link RelationalMigrationRunner}. */
  name: string;
  sql: string;
}

/** A name safe to embed as a SQL literal, checked rather than escaped - see {@link RelationalMigrationRunner.assertSafeName}. */
const SAFE_MIGRATION_NAME = /^[A-Za-z0-9._-]+$/;

const DEFAULT_LEDGER_TABLE = 'ignis_migrations';

/** The one schema SQLite has: its own name for the database file. */
const SQLITE_SCHEMA = 'main';

/** What `drizzle-kit generate` writes between statements in a single `.sql` file. */
const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

type TConnection = Awaited<ReturnType<IRelationalDriver<unknown>['acquire']>>;

/**
 * Applies every migration not already in the ledger, each with its ledger row, in ONE transaction.
 *
 * Exists because Drizzle's own migrator cannot run everywhere: `drizzle-orm/*\/migrator` reads the
 * migration folder through `node:fs`, so it resolves to nothing in a browser. This runs off a driver
 * connection instead, which every engine already implements.
 *
 * The property that matters is that the DDL and its ledger row commit together. Run as two
 * statements they would not: a bare `exec` commits when it returns, so a process killed between
 * them leaves the table present and the ledger empty, and the next boot re-runs a bare
 * `CREATE TABLE` and dies with `already exists` from then on. In a browser that window lands on the
 * FIRST visit, while the page is still fetching WASM - the likeliest moment for a user to close the
 * tab. A storage-quota failure on the INSERT does the same.
 *
 * TWO LIMITS THE TRANSACTION AND THE MINIMAL LEDGER IMPOSE, both deliberate:
 *
 * 1. Postgres refuses some DDL inside a transaction block, so a migration may not contain
 *    `CREATE INDEX CONCURRENTLY` - which Drizzle emits for any `.concurrently()` index. Measured: it
 *    fails with `CREATE INDEX CONCURRENTLY cannot run inside a transaction block`, while a bare
 *    `exec` accepts it. Atomicity is worth more than a concurrent index build.
 * 2. The ledger keys on the NAME and stores no content hash, so editing an already-applied migration
 *    is silently skipped rather than reported. Drizzle's own migrator hashes for this reason. Add a
 *    migration; never rewrite one.
 */
export class RelationalMigrationRunner extends BaseHelper {
  private readonly driver: IRelationalDriver<unknown>;
  private readonly ledgerTable: string;

  /** `undefined` is the engine's default schema: the table is then written unqualified, as it always was. */
  private readonly ledgerSchema: string | undefined;

  /** Set when a ROLLBACK itself fails, so the connection is destroyed rather than pooled. */
  private isSessionPoisoned = false;

  constructor(opts: {
    driver: IRelationalDriver<unknown>;
    /**
     * Where the applied migrations are recorded. Both names are validated like a migration name and
     * written quoted.
     *
     * - `table` defaults to `'ignis_migrations'`.
     * - `schema` defaults to the engine's default schema. On Postgres a `schema` is created when it
     *   is missing (checked first, so an existing one needs no `CREATE` privilege), in the same
     *   transaction as the ledger table. SQLite has only `main`: any other
     *   schema is refused here, and so is any schema on a driver that declares no `dialect`.
     */
    ledger?: { schema?: string; table?: string };
    scope?: string;
  }) {
    super({ scope: opts.scope ?? RelationalMigrationRunner.name });

    // A JS caller (or a cast) can still pass the removed option: refuse it, never read it.
    if (Object.hasOwn(opts, 'ledgerTable')) {
      throw getError({
        message:
          '[RelationalMigrationRunner] `ledgerTable` is removed | use `ledger: { table }`, and `ledger: { schema }` to place the table in a schema',
      });
    }

    this.driver = opts.driver;

    const { ledger } = opts;

    if (
      ledger !== undefined &&
      (typeof ledger !== 'object' || ledger === null || Array.isArray(ledger))
    ) {
      throw getError({
        message: `[RelationalMigrationRunner] ledger must be an object like { schema?, table? } | got: ${ledger === null ? 'null' : typeof ledger}`,
      });
    }

    this.ledgerTable = RelationalMigrationRunner.assertSafeName({
      value: ledger?.table ?? DEFAULT_LEDGER_TABLE,
      field: 'ledger.table',
    });
    this.ledgerSchema =
      ledger?.schema === undefined
        ? undefined
        : RelationalMigrationRunner.assertSafeName({
            value: ledger.schema,
            field: 'ledger.schema',
          });

    this.assertSchemaSupported();
  }

  /**
   * Placeholder syntax is not portable (`$1` on Postgres, `?` on SQLite), so the ledger name is
   * embedded as a literal rather than bound. That is only safe because it is checked first: these
   * names are authored in code, never taken from a request, and anything outside the character set
   * is refused rather than escaped. Escaping is what gets this wrong; refusing cannot.
   */
  private static assertSafeName(opts: { value: string; field: string }): string {
    const { value, field } = opts;

    if (typeof value !== 'string' || !SAFE_MIGRATION_NAME.test(value)) {
      throw getError({
        message: `[RelationalMigrationRunner] Unsafe ${field} | value: ${String(value)} | allowed: letters, digits, '.', '_', '-'`,
      });
    }

    return value;
  }

  /** A schema is accepted only on an engine known to have it: Postgres, or SQLite's `main`. A driver that names no dialect cannot be asked, so it gets none. Never ignored, never guessed. */
  private assertSchemaSupported(): void {
    const { ledgerSchema } = this;

    if (ledgerSchema === undefined) {
      return;
    }

    const { dialect } = this.driver;

    if (dialect === RelationalDialects.POSTGRES) {
      return;
    }

    if (dialect === RelationalDialects.SQLITE) {
      if (ledgerSchema === SQLITE_SCHEMA) {
        return;
      }

      throw getError({
        message: `[RelationalMigrationRunner] SQLite has only the schema "${SQLITE_SCHEMA}" | ledger.schema: ${ledgerSchema}`,
      });
    }

    throw getError({
      message: `[RelationalMigrationRunner] The driver declares no dialect, so ledger.schema is not accepted | ledger.schema: ${ledgerSchema}`,
    });
  }

  /** The ledger table as SQL: `"schema"."table"`, or `"table"` when the engine's default schema is used. */
  private get ledgerName(): string {
    return this.ledgerSchema === undefined
      ? `"${this.ledgerTable}"`
      : `"${this.ledgerSchema}"."${this.ledgerTable}"`;
  }

  /** Splits on `drizzle-kit`'s own breakpoint marker; a hand-written single-statement migration has none and comes back whole. */
  static splitStatements(opts: { sql: string }): Array<string> {
    return opts.sql
      .split(STATEMENT_BREAKPOINT)
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
  }

  async run(opts: { migrations: ReadonlyArray<IMigration> }): Promise<void> {
    const { migrations } = opts;
    const logger = this.logger.for(this.run.name);

    for (const migration of migrations) {
      RelationalMigrationRunner.assertSafeName({ value: migration.name, field: 'migration name' });
    }

    const connection = await this.driver.acquire({ schema: {} });

    try {
      // Idempotent and carrying no data, so re-running it after an interrupted boot is a no-op
      // rather than a conflict. The schema (Postgres) and the table commit together.
      await this.transact({
        connection,
        label: 'ledger',
        work: () => this.createLedger({ connection }),
      });

      const applied = await connection.query<{ name: string }>({
        statement: `SELECT "name" FROM ${this.ledgerName}`,
      });
      const appliedNames = new Set(applied.map((row) => row.name));

      for (const migration of migrations) {
        if (appliedNames.has(migration.name)) {
          logger.info('Migration already applied, skipping | name: %s', migration.name);
          continue;
        }

        await this.applyOne({ connection, migration });
        logger.info('Applied migration | name: %s', migration.name);
      }
    } finally {
      connection.release({ destroy: this.isSessionPoisoned });
    }
  }

  /** The ledger's schema (Postgres only, and only when one is named, and only when it is missing) and its table. */
  private async createLedger(opts: { connection: TConnection }): Promise<void> {
    const { connection } = opts;

    if (this.ledgerSchema !== undefined && this.driver.dialect === RelationalDialects.POSTGRES) {
      await this.ensureSchema({ connection, schema: this.ledgerSchema });
    }

    await connection.execute({
      statement: `CREATE TABLE IF NOT EXISTS ${this.ledgerName} ("name" text PRIMARY KEY NOT NULL)`,
    });
  }

  /**
   * Creates the schema only when it is missing. `CREATE SCHEMA IF NOT EXISTS` is not enough: Postgres checks the
   * `CREATE` privilege on the database before it looks at `IF NOT EXISTS`, so a role without it would fail even for
   * `public`. Asking `pg_namespace` first lets such a role use an existing schema; it fails only when it must create one.
   * The name passed the safe-name check, so it is embedded as a literal like the others.
   */
  private async ensureSchema(opts: { connection: TConnection; schema: string }): Promise<void> {
    const { connection, schema } = opts;

    const found = await connection.query<{ name: string }>({
      statement: `SELECT nspname AS name FROM pg_namespace WHERE nspname = '${schema}'`,
    });

    if (found.length > 0) {
      return;
    }

    await connection.execute({ statement: `CREATE SCHEMA "${schema}"` });
  }

  /** One migration and its ledger row, in one transaction. */
  private async applyOne(opts: { connection: TConnection; migration: IMigration }): Promise<void> {
    const { connection, migration } = opts;

    await this.transact({
      connection,
      label: migration.name,
      work: async () => {
        // One statement per call: only some clients accept a multi-statement string (PGlite's `exec`
        // does, its `query` does not), and `drizzle-kit` already marks the boundaries for us.
        const statements = RelationalMigrationRunner.splitStatements({ sql: migration.sql });

        for (const statement of statements) {
          await connection.execute({ statement });
        }

        await connection.execute({
          statement: `INSERT INTO ${this.ledgerName} ("name") VALUES ('${migration.name}')`,
        });
      },
    });
  }

  /** BEGIN/COMMIT written here rather than through `beginTransaction()`: that acquires its OWN connection, and the ledger read has to see the same session on a single-connection engine. */
  private async transact(opts: {
    connection: TConnection;
    label: string;
    work: () => Promise<void>;
  }): Promise<void> {
    const { connection, label, work } = opts;

    await connection.execute({ statement: 'BEGIN' });

    try {
      await work();
      await connection.execute({ statement: 'COMMIT' });
    } catch (error) {
      this.logger
        .for(this.transact.name)
        .error('Migration failed, rolling back | name: %s | error: %s', label, error);

      // A FAILED rollback leaves the session inside a transaction. Returning that connection to
      // the pool hands the next borrower an aborted session - the driver contract says such a
      // connection must be destroyed, and the datasource teardown already does exactly that.
      try {
        await connection.execute({ statement: 'ROLLBACK' });
      } catch (rollbackError) {
        this.isSessionPoisoned = true;
        this.logger
          .for(this.transact.name)
          .error('Rollback failed | name: %s | error: %s', label, rollbackError);
      }

      throw error;
    }
  }
}
