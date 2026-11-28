import type { TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import type { TRelationalConnector } from '@/relational/postgres/datasources/common';
import { getError } from '@venizia/ignis-helpers/core';
import { RelationalDialects } from '@/relational/core/drivers';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import type { TRelationalConnection, TRelationalDriver } from './driver';

/** Driver over a `postgres` (postgres-js) `Sql` client. Throws on construction if the client lacks `reserve()` or `unsafe()`, such as a `pg.Pool`. */
export class PostgresJsDriver<
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
> implements TRelationalDriver<Schema, Sql> {
  /** The engine this driver speaks; the migration ledger reads it (see {@link RelationalDialects}). */
  readonly dialect = RelationalDialects.POSTGRES;

  private readonly client: Sql;

  constructor(opts: { client: Sql }) {
    const { client } = opts;

    // A `pg.Pool` has neither verb, so naming the wrong driver class fails here rather than at the first transaction.
    const isSql = typeof client?.reserve === 'function' && typeof client?.unsafe === 'function';

    if (!isSql) {
      throw getError({
        message: `[${PostgresJsDriver.name}] Expected a \`postgres\` Sql | Got a client without reserve()/unsafe() - a \`pg.Pool\`? | Construct \`postgres({ ... })\`, or name NodePostgresDriver instead`,
      });
    }

    this.client = client;
  }

  createConnector(opts: { schema: Schema }): TRelationalConnector<Schema> {
    return drizzle({ client: this.client, schema: opts.schema });
  }

  async acquire(opts: { schema: Schema }): Promise<TRelationalConnection<Schema>> {
    const reserved = await this.client.reserve();

    reserved.options ??= this.client.options;

    let connector: TRelationalConnector<Schema>;

    try {
      connector = drizzle({
        client: reserved,
        schema: opts.schema,
      });
    } catch (error) {
      reserved.release();
      throw error;
    }

    return {
      connector,
      execute: async (executeOpts: { statement: string }) => {
        const result = await reserved.unsafe(executeOpts.statement);

        return { count: result.count ?? 0, command: result.command };
      },
      query: async <R>(queryOpts: { statement: string }) => {
        // postgres-js resolves an array-like result; spreading it gives the plain rows.
        const result = await reserved.unsafe(queryOpts.statement);

        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the caller names the row type of the query; the driver types rows loosely and nothing here checks them
        return [...result] as Array<R>;
      },
      release: () => {
        reserved.release();
      },
    };
  }

  getClient(): Sql {
    return this.client;
  }

  end(): Promise<void> {
    return this.client.end();
  }
}
