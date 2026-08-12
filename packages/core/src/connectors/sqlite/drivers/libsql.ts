import type { TAnyDataSourceSchema } from '@/base/datasources';
import { throwNotSupported } from '@/utilities';
import type { Client } from '@libsql/client';
import type { ILogger, IPoolControlOptions } from '@venizia/ignis-helpers/core';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { BasePoolHelper, getError } from '@venizia/ignis-helpers/core';
import { LoggerFactory } from '@venizia/ignis-helpers';
import { drizzle } from 'drizzle-orm/libsql';
import type { TSqliteConnection, TSqliteConnector, TSqliteDriver } from './driver';

/**
 * libsql's own name for a local database file, the
 * only protocol whose statements share a connection.
 */
const FILE_PROTOCOL = 'file';

/**
 * SQLite rejects ROLLBACK outside a transaction rather
 * than treating it as a no-op the way Postgres does.
 */
const NO_ACTIVE_TRANSACTION = 'no transaction is active';

/**
 * Pool knobs the driver forwards, minus `size`: one slot
 * IS the mutual exclusion a single connection lacks.
 */
export type TLibSqlDriverOptions = Omit<IPoolControlOptions, 'size'> & { client: Client };

/**
 * Covers `:memory:`, a local file, remote Turso and embedded replicas. Chosen over `better-sqlite3`
 * and `bun:sqlite` for its async result kind - those block the event loop.
 *
 * `acquire()` takes a 1-slot pool, not a second connection: `drizzle()` binds to a `Client`, never
 * to libsql's `Transaction`, and `client.transaction()` swaps the connection out - against
 * `:memory:` that is a DIFFERENT empty database.
 *
 * Consequence: a query on the `createConnector()` connector while a transaction is open runs INSIDE
 * it. Route work that must stay outside one through `acquire()`.
 */
export class LibSqlDriver<
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
> implements TSqliteDriver<Schema, Client> {
  private readonly client: Client;

  /**
   * The pooled resource IS the single client, so `create()` always hands back the same instance.
   * The pool contributes mutual exclusion, not connection multiplicity.
   */
  private readonly slot: BasePoolHelper<Client>;

  private readonly logger: ILogger;

  /**
   * A leaked transaction never releases the one slot, so without a timeout every later `acquire()`
   * in the process hangs forever and silently. 30s outlasts any honest SQLite write transaction -
   * one writer at a time is the engine's own limit - and turns a leak into a named error.
   */
  static readonly DEFAULT_ACQUIRE_TIMEOUT_MS = 30_000;

  constructor(opts: TLibSqlDriverOptions) {
    const { client, acquireTimeoutMs, maxWaitingClients, scope } = opts;

    // A `bun:sqlite` / better-sqlite3 Database leads with prepare()/exec() and has none
    // of these, so the wrong driver class fails here rather than at the first query.
    const isLibSqlClient =
      typeof (client as AnyType)?.execute === 'function' &&
      typeof (client as AnyType)?.batch === 'function' &&
      typeof (client as AnyType)?.transaction === 'function' &&
      typeof (client as AnyType)?.protocol === 'string';

    if (!isLibSqlClient) {
      throw getError({
        message: `[${LibSqlDriver.name}] Expected an \`@libsql/client\` Client | Got a client without execute()/batch()/transaction() - a \`bun:sqlite\` Database? | Construct \`createClient({ url: 'file:./data.db' })\``,
      });
    }

    this.client = client;
    this.logger = LoggerFactory.getLogger([LibSqlDriver.name]);

    this.slot = new BasePoolHelper<Client>({
      size: 1,
      acquireTimeoutMs: acquireTimeoutMs ?? LibSqlDriver.DEFAULT_ACQUIRE_TIMEOUT_MS,
      maxWaitingClients,
      scope: scope ?? LibSqlDriver.name,
      create: () => this.client,
      destroy: resource => this.scrubSession({ resource }),
    });
  }

  createConnector(opts: { schema: Schema }): TSqliteConnector<Schema> {
    return drizzle({ client: this.client, schema: opts.schema });
  }

  async acquire(opts: { schema: Schema }): Promise<TSqliteConnection<Schema>> {
    // A remote client opens a stream per statement and closes it, so BEGIN would neither hold nor
    // error - the transaction would silently not exist.
    if (this.client.protocol !== FILE_PROTOCOL) {
      throwNotSupported({
        scope: LibSqlDriver.name,
        feature: `Explicit transactions over a '${this.client.protocol}' libsql client - every statement runs on its own connection, so BEGIN cannot hold; use a \`file:\` or \`:memory:\` url, or an embedded replica`,
        logger: this.logger,
      });
    }

    let client: Client;

    // The bare pool error names only a timeout; on one connection the cause is almost always an
    // unreleased transaction, so say so where the caller reads it.
    try {
      client = await this.slot.acquire();
    } catch (error) {
      throw getError({
        message: `[${LibSqlDriver.name}][acquire] Could not borrow the single libsql connection | ${(error as Error)?.message ?? String(error)} | An unreleased transaction still holds it - commit/rollback it, or raise \`acquireTimeoutMs\``,
      });
    }

    let connector: TSqliteConnector<Schema>;
    try {
      connector = drizzle({ client, schema: opts.schema });
    } catch (error) {
      this.slot.release({ resource: client });
      throw error;
    }

    // Every borrower gets the SAME object, so a stale handle releasing twice would hand the
    // slot away underneath whoever holds it now. The latch makes the second release a no-op.
    let isReleased = false;

    return {
      connector,

      execute: async (executeOpts: { statement: string }) => {
        const result = await client.execute(executeOpts.statement);
        return { count: result.rowsAffected ?? 0 };
      },

      release: (releaseOpts?: { destroy?: boolean }) => {
        if (isReleased) {
          return;
        }
        isReleased = true;

        if (releaseOpts?.destroy !== true) {
          this.slot.release({ resource: client });
          return;
        }

        // Discard cannot throw the connection away - there is one client and no
        // replacement. The slot is re-created from the same instance after the destroy
        // hook scrubs it, so the next waiter never inherits an unknown transaction.
        this.slot.discard({ resource: client }).catch(error => {
          this.logger.for('release').error('Failed to discard the libsql slot | Error: %s', error);
        });
      },
    };
  }

  getClient(): Client {
    return this.client;
  }

  async end(): Promise<void> {
    await this.slot.destroy();
    this.client.close();
  }

  /**
   * The pool's destroy hook. A failed COMMIT/ROLLBACK may leave the connection inside a transaction
   * and the next borrower would inherit it. The client offers no way to ask whether one is open, so
   * the ROLLBACK is issued blind and its rejection is the ordinary answer of a clean connection.
   */
  private async scrubSession(opts: { resource: Client }): Promise<void> {
    const { resource } = opts;

    if (resource.closed) {
      return;
    }

    try {
      await resource.execute('ROLLBACK');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes(NO_ACTIVE_TRANSACTION)) {
        this.logger.for(this.scrubSession.name).debug('Nothing to scrub | %s', message);
        return;
      }

      this.logger
        .for(this.scrubSession.name)
        .warn('Failed to scrub the libsql session | Error: %s', error);
    }
  }
}
