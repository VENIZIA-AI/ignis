import { describe, expect, test } from 'bun:test';
import { type SQL } from 'drizzle-orm';
import { ScopedCasbinAdapter } from '@/components/auth/authorize/adapters/scoped-casbin.adapter';
import type {
  ICasbinPolicySource,
  IScopedCasbinEntities,
} from '@/components/auth/authorize/adapters/types';

const entities = (): IScopedCasbinEntities => ({
  policyDefinition: { tableName: 'PolicyDefinition', schemaName: 'identity' },
  permission: { tableName: 'Permission', schemaName: 'identity' },
  principals: { user: 'User', role: 'Role' },
  domainTypes: ['Merchant', 'Organizer'],
  softDelete: { use: true, columnName: 'deleted_at' },
});

/** The two shapes Drizzle resolves `execute()` to, depending on the driver underneath. */
const asNodePostgresResult = (rows: unknown[]): unknown => ({ rows, rowCount: rows.length });

/** postgres-js resolves to a `RowList`: the array itself, carrying a `count`. It has no `.rows`. */
const asPostgresJsResult = (rows: unknown[]): unknown =>
  Object.assign([...rows], { count: rows.length, command: 'SELECT' });

const buildAdapter = (opts: { shape: (rows: unknown[]) => unknown; rows: unknown[] }) => {
  const connector = {
    execute: async (_query: SQL) => opts.shape(opts.rows),
  };

  const dataSource = { connector } as ICasbinPolicySource;
  return new ScopedCasbinAdapter({ dataSource, entities: entities() });
};

const ROLE_INHERIT_ROWS = [
  { childId: 'b', parentId: 'a' },
  { childId: 'c', parentId: 'b' },
];

/**
 * `BaseFilteredAdapter.query()` exists purely to normalise the driver's result shape. Every other
 * Casbin fixture returns the node-postgres `{ rows }` shape, so without this file the postgres-js
 * branch is never exercised THROUGH the adapter - only in the reader's own unit test. A regression
 * that reintroduced `result.rows` would leave the rest of the suite green while silently loading
 * zero policy lines on postgres-js, denying every authorization decision.
 */
describe('ScopedCasbinAdapter - driver result shapes are equivalent', () => {
  test('node-postgres { rows } and postgres-js RowList produce identical policy lines', async () => {
    const fromNodePostgres = await buildAdapter({
      shape: asNodePostgresResult,
      rows: ROLE_INHERIT_ROWS,
    })['queryRoleInherits']();

    const fromPostgresJs = await buildAdapter({
      shape: asPostgresJsResult,
      rows: ROLE_INHERIT_ROWS,
    })['queryRoleInherits']();

    expect(fromPostgresJs).toEqual(fromNodePostgres);
    expect(fromNodePostgres).toHaveLength(2);
  });

  test('a postgres-js RowList is not silently read as zero rows', async () => {
    const lines = await buildAdapter({
      shape: asPostgresJsResult,
      rows: ROLE_INHERIT_ROWS,
    })['queryRoleInherits']();

    // The whole point: `result.rows` on a RowList is `undefined`, which would yield [].
    expect(lines.length).toBeGreaterThan(0);
  });

  test('an unrecognized driver result throws instead of loading zero policies', async () => {
    const adapter = buildAdapter({ shape: () => ({ command: 'SELECT' }), rows: [] });

    let caught: unknown;
    try {
      await adapter['queryRoleInherits']();
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toMatch(/Unrecognized driver result/);
  });
});
