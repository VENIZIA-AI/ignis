import type { TAnyDataSourceSchema } from '@/base/datasources';
import type { TRelationalConnector } from '@/connectors/postgres/datasources/common';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { Sql } from 'postgres';
import type { TRelationalConnection, TRelationalDriver } from './driver';

export class PostgresJsDriver<
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
> implements TRelationalDriver<Schema, Sql> {
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
    return drizzle({ client: this.client, schema: opts.schema }) as TRelationalConnector<Schema>;
  }

  async acquire(opts: { schema: Schema }): Promise<TRelationalConnection<Schema>> {
    const reserved = await this.client.reserve();

    const reservedClient = reserved as AnyType;
    reservedClient.options ??= (this.client as AnyType).options;

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
      execute: async (executeOpts: { statement: string }) => {
        const result = await reserved.unsafe(executeOpts.statement);
        return { count: result.count ?? 0 };
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
