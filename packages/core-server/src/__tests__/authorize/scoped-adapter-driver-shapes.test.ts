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

const STRUCTURAL_EDGE_ROWS = [
  { rel: 'g5', child: 'read', parent: 'manage' },
  { rel: 'g5', child: 'write', parent: 'manage' },
];

/** Exercises the postgres-js result shape THROUGH the adapter (every other fixture is pg `{ rows }`): a reintroduced `result.rows` read would stay green elsewhere while silently loading zero policy lines and denying every decision. Probes queryEdgePolicies - any single-table, no-join query hits the same shared readResultRows() path. */
describe('ScopedCasbinAdapter - driver result shapes are equivalent', () => {
  test('node-postgres { rows } and postgres-js RowList produce identical policy lines', async () => {
    const fromNodePostgres = await buildAdapter({
      shape: asNodePostgresResult,
      rows: STRUCTURAL_EDGE_ROWS,
    })['queryEdgePolicies']();

    const fromPostgresJs = await buildAdapter({
      shape: asPostgresJsResult,
      rows: STRUCTURAL_EDGE_ROWS,
    })['queryEdgePolicies']();

    expect(fromPostgresJs).toEqual(fromNodePostgres);
    expect(fromNodePostgres).toHaveLength(2);
  });

  test('a postgres-js RowList is not silently read as zero rows', async () => {
    const lines = await buildAdapter({
      shape: asPostgresJsResult,
      rows: STRUCTURAL_EDGE_ROWS,
    })['queryEdgePolicies']();

    // The whole point: `result.rows` on a RowList is `undefined`, which would yield [].
    expect(lines.length).toBeGreaterThan(0);
  });

  test('an unrecognized driver result throws instead of loading zero policies', async () => {
    const adapter = buildAdapter({ shape: () => ({ command: 'SELECT' }), rows: [] });

    let caught: unknown;
    try {
      await adapter['queryEdgePolicies']();
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toMatch(/Unrecognized driver result/);
  });
});
