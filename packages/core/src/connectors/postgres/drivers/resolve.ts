import type { TAnyDataSourceSchema } from '@/base/datasources';
import type { AnyType } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';
import type { IRelationalDriver } from './driver';

/** postgres-js `Sql` - a tagged-template function carrying `reserve()` and `unsafe()`. */
const isPostgresJsClient = (opts: { client: AnyType }): boolean => {
  const { client } = opts;
  return typeof client?.reserve === 'function' && typeof client?.unsafe === 'function';
};

/**
 * node-postgres `Pool` - keyed on `connect()`, the one verb `NodePostgresDriver` actually calls to
 * check out a `PoolClient`. A postgres-js `Sql` has no `connect`, so the two never collide. A bare
 * `pg.Client` also exposes `connect()` but is out of contract: the driver needs a pool to check
 * connections out of.
 */
const isNodePostgresPool = (opts: { client: AnyType }): boolean => {
  const { client } = opts;
  return typeof client?.connect === 'function';
};

/**
 * Picks the driver that matches the client the application built, and imports it dynamically so the
 * losing driver's package is never loaded. This is the only reason `pg` and `postgres` can both be
 * optional peers: a static `import` of either driver module would pull its package into every entry
 * point that transitively reaches `connectors/postgres`, which is every entry point.
 *
 * Detection is structural rather than `instanceof`, because naming a constructor here would defeat
 * the dynamic import it exists to enable.
 */
export const resolveDatabaseDriver = async <
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
>(opts: {
  client: unknown;
}): Promise<IRelationalDriver<Schema>> => {
  const client = opts.client as AnyType;

  if (isPostgresJsClient({ client })) {
    const { PostgresJsDriver } = await import('./postgres-js.js');
    return new PostgresJsDriver<Schema>({ client });
  }

  if (isNodePostgresPool({ client })) {
    const { NodePostgresDriver } = await import('./node-postgres.js');
    return new NodePostgresDriver<Schema>({ pool: client });
  }

  throw getError({
    message:
      '[resolveDatabaseDriver] Unrecognized database client | Expected a `pg` Pool or a `postgres` Sql | Install one (`bun add pg` or `bun add postgres`), or assign `this.driver` explicitly in configure()',
  });
};
