import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import type { IRelationalDriver } from '../drivers';

export interface IMigration {
  /** Ledger key. Never rewrite an applied one - see the hashing note on {@link RelationalMigrationRunner}. */
  name: string;
  sql: string;
}

/** A name safe to embed as a SQL literal, checked rather than escaped - see {@link RelationalMigrationRunner.assertSafeName}. */
const SAFE_MIGRATION_NAME = /^[A-Za-z0-9._-]+$/;

const DEFAULT_LEDGER_TABLE = 'ignis_migrations';

/** What `drizzle-kit generate` writes between statements in a single `.sql` file. */
const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

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

  /** Set when a ROLLBACK itself fails, so the connection is destroyed rather than pooled. */
  private isSessionPoisoned = false;

  constructor(opts: {
    driver: IRelationalDriver<unknown>;
    /** Defaults to `ignis_migrations`. Validated like a migration name. */
    ledgerTable?: string;
    scope?: string;
  }) {
    super({ scope: opts.scope ?? RelationalMigrationRunner.name });

    this.driver = opts.driver;
    this.ledgerTable = RelationalMigrationRunner.assertSafeName({
      value: opts.ledgerTable ?? DEFAULT_LEDGER_TABLE,
      field: 'ledgerTable',
    });
  }

  /**
   * Placeholder syntax is not portable (`$1` on Postgres, `?` on SQLite), so the ledger name is
   * embedded as a literal rather than bound. That is only safe because it is checked first: these
   * names are authored in code, never taken from a request, and anything outside the character set
   * is refused rather than escaped. Escaping is what gets this wrong; refusing cannot.
   */
  private static assertSafeName(opts: { value: string; field: string }): string {
    const { value, field } = opts;

    if (!SAFE_MIGRATION_NAME.test(value)) {
      throw getError({
        message: `[RelationalMigrationRunner] Unsafe ${field} | value: ${value} | allowed: letters, digits, '.', '_', '-'`,
      });
    }

    return value;
  }

  /** Splits on `drizzle-kit`'s own breakpoint marker; a hand-written single-statement migration has none and comes back whole. */
  static splitStatements(opts: { sql: string }): Array<string> {
    return opts.sql
      .split(STATEMENT_BREAKPOINT)
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
  }

  async run(opts: { migrations: ReadonlyArray<IMigration> }): Promise<void> {
    const { migrations } = opts;
    const logger = this.logger.for(this.run.name);

    for (const migration of migrations) {
      RelationalMigrationRunner.assertSafeName({ value: migration.name, field: 'migration name' });
    }

    const connection = await this.driver.acquire({ schema: {} });

    try {
      // Idempotent and outside any transaction on purpose: it carries no data, so re-running it
      // after an interrupted boot is a no-op rather than a conflict.
      await connection.execute({
        statement: `CREATE TABLE IF NOT EXISTS "${this.ledgerTable}" ("name" text PRIMARY KEY NOT NULL)`,
      });

      const applied = await connection.query<{ name: string }>({
        statement: `SELECT "name" FROM "${this.ledgerTable}"`,
      });
      const appliedNames = new Set(applied.map(row => row.name));

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

  /** BEGIN/COMMIT written here rather than through `beginTransaction()`: that acquires its OWN connection, and the ledger read above has to see the same session on a single-connection engine. */
  private async applyOne(opts: {
    connection: Awaited<ReturnType<IRelationalDriver<unknown>['acquire']>>;
    migration: IMigration;
  }): Promise<void> {
    const { connection, migration } = opts;

    await connection.execute({ statement: 'BEGIN' });

    try {
      // One statement per call: only some clients accept a multi-statement string (PGlite's `exec`
      // does, its `query` does not), and `drizzle-kit` already marks the boundaries for us.
      for (const statement of RelationalMigrationRunner.splitStatements({ sql: migration.sql })) {
        await connection.execute({ statement });
      }

      await connection.execute({
        statement: `INSERT INTO "${this.ledgerTable}" ("name") VALUES ('${migration.name}')`,
      });
      await connection.execute({ statement: 'COMMIT' });
    } catch (error) {
      this.logger
        .for(this.applyOne.name)
        .error('Migration failed, rolling back | name: %s | error: %s', migration.name, error);

      // A FAILED rollback leaves the session inside a transaction. Returning that connection to
      // the pool hands the next borrower an aborted session - the driver contract says such a
      // connection must be destroyed, and the datasource teardown already does exactly that.
      await connection.execute({ statement: 'ROLLBACK' }).catch((rollbackError: unknown) => {
        this.isSessionPoisoned = true;
        this.logger
          .for(this.applyOne.name)
          .error('Rollback failed | name: %s | error: %s', migration.name, rollbackError);
      });

      throw error;
    }
  }
}
