import type { TAnyDataSourceSchema } from '@/base/datasources';
import type { TRelationalConnector } from '@/connectors/postgres/datasources/common';
import { getError } from '@venizia/ignis-helpers';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import type { IRelationalConnection, IRelationalDriver } from './driver';

/**
 * `pool` is supplied by the app's `configure()`, because Postgres connection config (credentials,
 * SSL, secrets manager, env) varies per deployment.
 */
export class NodePostgresDriver<
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
> implements IRelationalDriver<Schema, Pool> {
  private readonly pool: Pool;

  constructor(opts: { pool: Pool }) {
    this.pool = opts.pool;
  }

  createConnector(opts: { schema: Schema }): TRelationalConnector<Schema> {
    return drizzle({ client: this.pool, schema: opts.schema }) as TRelationalConnector<Schema>;
  }

  /** A dedicated `PoolClient`, so BEGIN and COMMIT land on the same backend. */
  async acquire(opts: { schema: Schema }): Promise<IRelationalConnection<Schema>> {
    const client = await this.pool.connect();

    // A bare `pg.Client` also has `connect()`, but it resolves to nothing - it IS the connection,
    // not a pool. Named here, at the misconfiguration, instead of as a null-deref inside drizzle.
    if (!client) {
      throw getError({
        message:
          '[NodePostgresDriver][acquire] pool.connect() returned no client | A pg Pool is required - a bare pg.Client is not a pool',
      });
    }

    // The connection is already checked OUT of the pool. Anything that throws between here and the
    // caller's `release()` - a malformed discovered schema, a drizzle mismatch - would strand it,
    // and every later beginTransaction() would strand another until the pool is exhausted.
    let connector: TRelationalConnector<Schema>;
    try {
      connector = drizzle({ client, schema: opts.schema }) as TRelationalConnector<Schema>;
    } catch (error) {
      client.release();
      throw error;
    }

    return {
      connector,

      // pg's native shape is `{ rows, rowCount }`; `rowCount` is null for statements that affect no
      // rows by definition (e.g. DDL). Mapped to the neutral result HERE, where the shape is known
      // statically - callers never see a pg type.
      execute: async (executeOpts: { statement: string }) => {
        const result = await client.query(executeOpts.statement);
        return { count: result.rowCount ?? 0 };
      },

      // pg destroys the connection when `release()` receives a truthy argument, rather than handing
      // it back to the pool. That is what a failed COMMIT or ROLLBACK needs: the session may still
      // hold an open transaction, and the next borrower would inherit it.
      release: (releaseOpts?: { destroy?: boolean }) => {
        client.release(releaseOpts?.destroy === true);
      },
    };
  }

  getClient(): Pool {
    return this.pool;
  }

  end(): Promise<void> {
    return this.pool.end();
  }
}
