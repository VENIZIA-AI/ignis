import type { TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import type { TRelationalConnector } from '@/relational/postgres/datasources/common';
import type { PGlite } from '@electric-sql/pglite';
import type { ILogger, IPoolControlOptions } from '@venizia/ignis-helpers/core';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { BaseHelper, BasePoolHelper, getError } from '@venizia/ignis-helpers/core';
import { drizzle } from 'drizzle-orm/pglite';
import type { TRelationalConnection, TRelationalDriver } from './driver';

/** Pool knobs the driver forwards, minus `size`: one slot IS the mutual exclusion PGlite lacks. */
export type TPGliteDriverOptions = Omit<IPoolControlOptions, 'size'> & { client: PGlite };

/**
 * Postgres compiled to WASM, in-process. Reports PostgreSQL 18.x, so the dialect works unchanged.
 *
 * One session only, and a second `BEGIN` neither nests nor errors - it joins the open transaction,
 * so the outer COMMIT commits the inner writer's rows. Hence the 1-slot pool behind `acquire()`.
 *
 * Consequence: a `createConnector()` write - the path all repositories take - runs INSIDE any open
 * transaction and dies with its ROLLBACK. Under concurrency, write through `acquire()`.
 */
export class PGliteDriver<
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
> implements TRelationalDriver<Schema, PGlite> {
  private readonly client: PGlite;

  /**
   * The pooled resource IS the single client, so `create()` always hands back the same instance.
   * The pool contributes the mutual exclusion PGlite lacks, not connection multiplicity.
   */
  private readonly slot: BasePoolHelper<PGlite>;

  private readonly logger: ILogger;

  /**
   * A leaked transaction never releases the one slot, so without a timeout every later `acquire()`
   * in the process hangs forever and silently. 30s outlasts any honest transaction on an in-process
   * database with no network in it, and turns a leak into a named error instead of a dead process.
   */
  static readonly DEFAULT_ACQUIRE_TIMEOUT_MS = 30_000;

  /**
   * PGlite's Emscripten runtime plants this status on the HOST process during ordinary operation -
   * measured on `@electric-sql/pglite` 0.5.5, `process.exitCode` is `undefined` before the first
   * query and 99 after it, and every later query re-arms it. A server that shuts down cleanly then
   * exits 99, which Docker, systemd and CI all read as a crash.
   *
   * Named rather than inlined so a future PGlite using a different status stops matching and makes
   * the problem visible again, instead of {@link end} silently forcing a zero it did not verify.
   */
  private static readonly WASM_HOST_EXIT_STATUS = 99;

  constructor(opts: TPGliteDriverOptions) {
    const { client, acquireTimeoutMs, maxWaitingClients, scope } = opts;

    // PGlite is not a connection pool: it has no connect()/totalCount, which is what a `pg.Pool`
    // leads with. Probing its own verbs names the mistake here instead of at the first query.
    const isPGlite =
      typeof (client as AnyType)?.query === 'function' &&
      typeof (client as AnyType)?.exec === 'function' &&
      typeof (client as AnyType)?.close === 'function';

    if (!isPGlite) {
      throw getError({
        message: `[${PGliteDriver.name}] Expected an \`@electric-sql/pglite\` PGlite | Got a client without exec()/close() - a \`pg.Pool\`? | Construct \`new PGlite('./pgdata')\`, or name NodePostgresDriver instead`,
      });
    }

    this.client = client;
    // `LoggerFactory` cannot be imported here: this is the browser driver, and that
    // import reaches `node:module`. `BaseHelper` resolves the same logger through
    // the swappable resolver without pulling in the node-only provider loader.
    this.logger = new BaseHelper({ scope: PGliteDriver.name }).getLogger();

    this.slot = new BasePoolHelper<PGlite>({
      size: 1,
      acquireTimeoutMs: acquireTimeoutMs ?? PGliteDriver.DEFAULT_ACQUIRE_TIMEOUT_MS,
      maxWaitingClients,
      scope: scope ?? PGliteDriver.name,
      create: async () => {
        await this.client.waitReady;
        return this.client;
      },
      destroy: resource => this.scrubSession({ resource }),
    });
  }

  createConnector(opts: { schema: Schema }): TRelationalConnector<Schema> {
    return drizzle({ client: this.client, schema: opts.schema }) as TRelationalConnector<Schema>;
  }

  async acquire(opts: { schema: Schema }): Promise<TRelationalConnection<Schema>> {
    let client: PGlite;

    // The bare pool error names only a timeout; on one session the cause is almost always an
    // unreleased transaction, so say so where the caller reads it.
    try {
      client = await this.slot.acquire();
    } catch (error) {
      throw getError({
        message: `[${PGliteDriver.name}][acquire] Could not borrow the single PGlite session | ${(error as Error)?.message ?? String(error)} | An unreleased transaction still holds it - commit/rollback it, or raise \`acquireTimeoutMs\``,
      });
    }

    let connector: TRelationalConnector<Schema>;
    try {
      connector = drizzle({ client, schema: opts.schema }) as TRelationalConnector<Schema>;
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
        const result = await client.query(executeOpts.statement);
        return { count: result.affectedRows ?? 0 };
      },

      query: async <R>(queryOpts: { statement: string }) => {
        const result = await client.query<R>(queryOpts.statement);
        return result.rows ?? [];
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

        // Discard cannot throw the session away - there is one and no replacement.
        // The slot is re-created from the same instance after the destroy hook
        // scrubs it, so the next waiter never inherits an unknown transaction.
        this.slot.discard({ resource: client }).catch(error => {
          this.logger.for('release').error('Failed to discard the PGlite slot | Error: %s', error);
        });
      },
    };
  }

  getClient(): PGlite {
    return this.client;
  }

  async end(): Promise<void> {
    await this.slot.destroy();
    await this.client.close();
    this.clearWasmHostExitStatus();
  }

  /**
   * Clears the exit status PGlite planted on the host - see {@link WASM_HOST_EXIT_STATUS} - and
   * only while it still holds exactly that value, so an exit code the application set itself
   * survives untouched.
   *
   * `globalThis.process` is bound to a local and never member-accessed as `globalThis.process.x`:
   * this driver has to bundle clean for a browser target, where the property read yields
   * `undefined` and the optional chain short-circuits, while the member-access spelling is what the
   * purity gate treats as fatal.
   */
  private clearWasmHostExitStatus(): void {
    const host = globalThis.process;

    if (host?.exitCode !== PGliteDriver.WASM_HOST_EXIT_STATUS) {
      return;
    }

    host.exitCode = 0;
    this.logger
      .for(this.end.name)
      .debug(
        'Cleared the exit status PGlite planted on the host process | status: %s',
        PGliteDriver.WASM_HOST_EXIT_STATUS,
      );
  }

  /**
   * The pool's destroy hook. A failed COMMIT/ROLLBACK may leave the session inside a transaction,
   * and the next borrower would inherit it. `ROLLBACK` outside a transaction is a no-op, so this is
   * safe whichever state the session is actually in.
   */
  private async scrubSession(opts: { resource: PGlite }): Promise<void> {
    const { resource } = opts;

    if (resource.closed) {
      return;
    }

    try {
      await resource.query('ROLLBACK');
    } catch (error) {
      this.logger
        .for(this.scrubSession.name)
        .warn('Failed to scrub the PGlite session | Error: %s', error);
    }
  }
}
