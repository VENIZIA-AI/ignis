import type { TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import type { TRelationalConnector } from '@/relational/postgres/datasources/common';
import type { AnyType } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import type { TRelationalConnection, TRelationalDriver } from './driver';

export class NodePostgresDriver<
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
> implements TRelationalDriver<Schema, Pool> {
  private readonly client: Pool;

  constructor(opts: { client: Pool }) {
    const { client } = opts;

    // A bare `pg.Client` also exposes connect(), so only the pool accounting tells the two apart -
    // and a Client cannot hand out a dedicated connection per transaction.
    const isPool =
      typeof (client as AnyType)?.connect === 'function' &&
      typeof (client as AnyType)?.totalCount === 'number';

    if (!isPool) {
      throw getError({
        message: `[${NodePostgresDriver.name}] Expected a \`pg\` Pool | Got a client without pool accounting - a bare \`pg.Client\`? | Construct \`new Pool({ ... })\` instead`,
      });
    }

    this.client = client;
  }

  createConnector(opts: { schema: Schema }): TRelationalConnector<Schema> {
    return drizzle({ client: this.client, schema: opts.schema }) as TRelationalConnector<Schema>;
  }

  async acquire(opts: { schema: Schema }): Promise<TRelationalConnection<Schema>> {
    const client = await this.client.connect();

    // Named here, at the checkout, instead of as a null-deref deep inside drizzle.
    if (!client) {
      throw getError({
        message: `[${NodePostgresDriver.name}][acquire] pool.connect() resolved to no client | The pool cannot hand out a connection`,
      });
    }

    let connector: TRelationalConnector<Schema>;
    try {
      connector = drizzle({ client, schema: opts.schema }) as TRelationalConnector<Schema>;
    } catch (error) {
      client.release();
      throw error;
    }

    return {
      connector,
      execute: async (executeOpts: { statement: string }) => {
        const result = await client.query(executeOpts.statement);
        return { count: result.rowCount ?? 0 };
      },
      query: async <R>(queryOpts: { statement: string }) => {
        const result = await client.query(queryOpts.statement);
        return (result.rows ?? []) as Array<R>;
      },
      release: (releaseOpts?: { destroy?: boolean }) => {
        client.release(releaseOpts?.destroy === true);
      },
    };
  }

  getClient(): Pool {
    return this.client;
  }

  end(): Promise<void> {
    return this.client.end();
  }
}
