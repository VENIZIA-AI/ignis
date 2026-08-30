/**
 * Executes `RecursiveTreeSql` against a real Postgres (PGlite, the same engine in WASM). Every other
 * suite for this class asserts on generated SQL text, which proves the string is shaped as intended
 * and nothing about whether Postgres accepts it or returns the right rows. PGlite lives here rather
 * than in `kernel`, which carries no database devDependency.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect, pgTable, text } from 'drizzle-orm/pg-core';
import { RecursiveTreeDirections, RecursiveTreeSql } from '@venizia/ignis-kernel';
import type { IRecursiveTreeOptions } from '@venizia/ignis-kernel';

// String-literal keys, not identifiers: these are database column names crossing the wire boundary,
// and `RecursiveTreeSql` emits them verbatim - renaming either to camelCase would test a schema the
// generated SQL never queries.
const merchants = pgTable('merchants', {
  id: text('id').primaryKey(),
  ['parent_id']: text('parent_id'),
});

type TWalkRow = { id: string; depth: number; ['is_cycle']?: boolean };

let database: PGlite;

const walk = async (opts: Omit<IRecursiveTreeOptions, 'name' | 'table'>): Promise<TWalkRow[]> => {
  const cte = RecursiveTreeSql.walk({ name: 'tree', table: merchants, ...opts });
  const query = new PgDialect().sqlToQuery(cte);

  // `is_cycle` only exists when `trackPath` emitted it - selecting it otherwise is a Postgres error.
  const columns = opts.trackPath ? 'id, depth, is_cycle' : 'id, depth';

  const rs = await database.query(
    `${query.sql} SELECT ${columns} FROM tree ORDER BY depth`,
    query.params as unknown[],
  );

  return rs.rows as TWalkRow[];
};

beforeAll(async () => {
  database = new PGlite();

  await database.exec('CREATE TABLE merchants (id text primary key, parent_id text);');
  // A <- B <- C, plus a self-referential pair the schema does not forbid.
  await database.exec(`
    INSERT INTO merchants VALUES
      ('A', NULL), ('B', 'A'), ('C', 'B'),
      ('X', 'Y'), ('Y', 'X');
  `);
});

afterAll(async () => {
  await database?.close();
});

describe('RecursiveTreeSql against a real Postgres', () => {
  test('walks UP to the root', async () => {
    const rows = await walk({ rootId: 'C', direction: RecursiveTreeDirections.UP, maxDepth: 32 });

    expect(rows.map(row => row.id)).toEqual(['C', 'B', 'A']);
    expect(rows.map(row => row.depth)).toEqual([0, 1, 2]);
  });

  test('walks DOWN to the leaves', async () => {
    const rows = await walk({ rootId: 'A', direction: RecursiveTreeDirections.DOWN, maxDepth: 32 });

    expect(rows.map(row => row.id)).toEqual(['A', 'B', 'C']);
  });

  /** The production shape that used to hang: an unbounded upward walk over a schema that permits A -> B -> A. */
  test('a cycle terminates and the repeated row is flagged', async () => {
    const rows = await walk({
      rootId: 'X',
      direction: RecursiveTreeDirections.UP,
      maxDepth: 32,
      trackPath: true,
    });

    expect(rows.map(row => row.id)).toEqual(['X', 'Y', 'X']);
    expect(rows.map(row => row.is_cycle)).toEqual([false, false, true]);
  });

  /** `maxDepth` counts EDGES, not rows: the root sits at depth 0, so `maxDepth: N` yields N+1 rows. */
  test('maxDepth bounds the walk by depth, root included', async () => {
    const shallow = await walk({ rootId: 'C', direction: RecursiveTreeDirections.UP, maxDepth: 1 });
    expect(shallow.map(row => row.id)).toEqual(['C', 'B']);

    const full = await walk({ rootId: 'C', direction: RecursiveTreeDirections.UP, maxDepth: 2 });
    expect(full.map(row => row.id)).toEqual(['C', 'B', 'A']);
  });

  /** `maxDepth` alone terminates a cycle; `trackPath` only adds the flag and the early cut. */
  test('a cycle still terminates with trackPath off', async () => {
    const rows = await walk({ rootId: 'X', direction: RecursiveTreeDirections.UP, maxDepth: 4 });

    expect(rows.length).toBe(5);
    expect(rows.map(row => row.id)).toEqual(['X', 'Y', 'X', 'Y', 'X']);
  });

  test('an unknown root returns no rows rather than erroring', async () => {
    const rows = await walk({
      rootId: 'KHONG-TON-TAI',
      direction: RecursiveTreeDirections.UP,
      maxDepth: 32,
    });

    expect(rows).toEqual([]);
  });
});
