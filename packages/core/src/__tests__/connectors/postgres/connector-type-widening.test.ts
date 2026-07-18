import { describe, expect, test } from 'bun:test';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Pool } from 'pg';
import type { Sql } from 'postgres';
import type {
  BasePostgresDataSource,
  TRelationalConnector,
} from '@/connectors/postgres/datasources';

type TSchema = Record<string, never>;

/** `tsc --noEmit` is the real gate; `bun test` only proves the module loads. Both Drizzle drivers
 * descend from `PgDatabase` (differing only in the query-result HKT), so the neutral connector type
 * must accept either without a cast. */
type TNodePostgresWidened =
  NodePgDatabase<TSchema> extends TRelationalConnector<TSchema> ? true : false;
type TPostgresJsWidened =
  PostgresJsDatabase<TSchema> extends TRelationalConnector<TSchema> ? true : false;

// A `false` on either line fails to compile - which is exactly the gate.
const isNodePostgresWidened: TNodePostgresWidened = true;
const isPostgresJsWidened: TPostgresJsWidened = true;

/** The `Client` generic must survive `BaseRelationalDataSource` - dropping it at the base types
 * every postgres-js `getClient()` as `pg.Pool`. Compile-time-only, like the assertions above. */
type TClientOf<TDataSource> = TDataSource extends { getClient(): infer TClient } ? TClient : never;

type TDefaultClientIsPool =
  TClientOf<BasePostgresDataSource<{}, TSchema>> extends Pool ? true : false;
type TClientGenericThreaded =
  TClientOf<BasePostgresDataSource<{}, TSchema, {}, Sql>> extends Sql ? true : false;

const isDefaultClientPool: TDefaultClientIsPool = true;
const isClientGenericThreaded: TClientGenericThreaded = true;

describe('TRelationalConnector accepts every Drizzle pg driver', () => {
  test('node-postgres widens to it', () => {
    expect(isNodePostgresWidened).toBe(true);
  });

  test('postgres-js widens to it', () => {
    expect(isPostgresJsWidened).toBe(true);
  });

  test('the Client generic threads through BasePostgresDataSource', () => {
    expect(isDefaultClientPool).toBe(true);
    expect(isClientGenericThreaded).toBe(true);
  });
});
