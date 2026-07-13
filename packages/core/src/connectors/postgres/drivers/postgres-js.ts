import type { TAnyDataSourceSchema } from '@/base/datasources';
import type { TRelationalConnector } from '@/connectors/postgres/datasources/common';
import type { AnyType } from '@venizia/ignis-helpers';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import type { IRelationalConnection, IRelationalDriver } from './driver';

/**
 * The postgres-js driver. `client` is supplied by the app's `configure()`, exactly as `pool` is for
 * node-postgres. Requires `postgres >= 3.4.0`: that is the release that added `sql.reserve()`, and
 * without a reserved connection a transaction's BEGIN and COMMIT could land on different backends.
 */
export class PostgresJsDriver<
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
> implements IRelationalDriver<Schema, Sql> {
  private readonly client: Sql;

  constructor(opts: { client: Sql }) {
    this.client = opts.client;
  }

  createConnector(opts: { schema: Schema }): TRelationalConnector<Schema> {
    return drizzle({ client: this.client, schema: opts.schema }) as TRelationalConnector<Schema>;
  }

  /** A dedicated `ReservedSql`, so BEGIN and COMMIT land on the same backend. */
  async acquire(opts: { schema: Schema }): Promise<IRelationalConnection<Schema>> {
    const reserved = await this.client.reserve();

    // drizzle's constructor reads `client.options.parsers`/`.serializers`, which a real
    // `ReservedSql` does not carry. Point it at the parent Sql's options - the very object drizzle
    // mutates when bound to the pool, so the (idempotent) parser registration lands in the same
    // place either way.
    const reservedClient = reserved as AnyType;
    reservedClient.options ??= (this.client as AnyType).options;

    // The connection is already RESERVED. Anything that throws between here and the caller's
    // `release()` would strand it, and every later beginTransaction() would strand another.
    let connector: TRelationalConnector<Schema>;
    try {
      connector = drizzle({
        client: reservedClient,
        schema: opts.schema,
      }) as TRelationalConnector<Schema>;
    } catch (error) {
      reserved.release();
      throw error;
    }

    return {
      connector,

      // `unsafe()` is postgres-js's raw-string escape. The tagged-template form would bind
      // `BEGIN TRANSACTION ISOLATION LEVEL ${level}` as a query parameter, which is not valid SQL.
      // Its native shape is a RowList - an array carrying `count`. Mapped to the neutral result
      // HERE, where the shape is known statically - callers never see a postgres-js type.
      execute: async (executeOpts: { statement: string }) => {
        const result = await reserved.unsafe(executeOpts.statement);
        return { count: result.count ?? 0 };
      },

      // ASYMMETRY, deliberate: `ReservedSql.release()` takes no argument, so postgres-js cannot
      // discard a connection. After a failed COMMIT this returns a possibly-poisoned connection to
      // the pool, where node-postgres would destroy it. The option is accepted and ignored rather
      // than rejected, so `IRelationalConnection` stays substitutable.
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
