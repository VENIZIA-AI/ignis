/**
 * Executes `RecursiveTreeSql` against a real Postgres (PGlite, the same engine in WASM). Every other
 * suite for this class asserts on generated SQL text, which proves the string is shaped as intended
 * and nothing about whether Postgres accepts it or returns the right rows. PGlite lives here rather
 * than in `kernel`, which carries no database devDependency.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { PgDialect, pgTable, text } from 'drizzle-orm/pg-core';
import { RecursiveTreeDirections, RecursiveTreeSql } from '@venizia/ignis-connectors/postgres';
import type { IRecursiveTreeOptions } from '@venizia/ignis-connectors/postgres';

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
  // A <- B <- C and R <- S (two trees), plus a self-referential pair the schema does not forbid.
  await database.exec(`
    INSERT INTO merchants VALUES
      ('A', NULL), ('B', 'A'), ('C', 'B'),
      ('R', NULL), ('S', 'R'),
      ('X', 'Y'), ('Y', 'X');
  `);
});

afterAll(async () => {
  await database?.close();
});

describe('RecursiveTreeSql against a real Postgres', () => {
  test('walks UP to the root', async () => {
    const rows = await walk({ rootId: 'C', direction: RecursiveTreeDirections.UP, maxDepth: 32 });

    expect(rows.map((row) => row.id)).toEqual(['C', 'B', 'A']);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 2]);
  });

  test('walks DOWN to the leaves', async () => {
    const rows = await walk({ rootId: 'A', direction: RecursiveTreeDirections.DOWN, maxDepth: 32 });

    expect(rows.map((row) => row.id)).toEqual(['A', 'B', 'C']);
  });

  /** The production shape that used to hang: an unbounded upward walk over a schema that permits A -> B -> A. */
  test('a cycle terminates and the repeated row is flagged', async () => {
    const rows = await walk({
      rootId: 'X',
      direction: RecursiveTreeDirections.UP,
      maxDepth: 32,
      trackPath: true,
    });

    expect(rows.map((row) => row.id)).toEqual(['X', 'Y', 'X']);
    expect(rows.map((row) => row.is_cycle)).toEqual([false, false, true]);
  });

  /** `maxDepth` counts EDGES, not rows: the root sits at depth 0, so `maxDepth: N` yields N+1 rows. */
  test('maxDepth bounds the walk by depth, root included', async () => {
    const shallow = await walk({ rootId: 'C', direction: RecursiveTreeDirections.UP, maxDepth: 1 });
    expect(shallow.map((row) => row.id)).toEqual(['C', 'B']);

    const full = await walk({ rootId: 'C', direction: RecursiveTreeDirections.UP, maxDepth: 2 });
    expect(full.map((row) => row.id)).toEqual(['C', 'B', 'A']);
  });

  /** `maxDepth` alone terminates a cycle; `trackPath` only adds the flag and the early cut. */
  test('a cycle still terminates with trackPath off', async () => {
    const rows = await walk({ rootId: 'X', direction: RecursiveTreeDirections.UP, maxDepth: 4 });

    expect(rows.length).toBe(5);
    expect(rows.map((row) => row.id)).toEqual(['X', 'Y', 'X', 'Y', 'X']);
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

describe('RecursiveTreeSql against a real Postgres - several roots, no root, one filter for both terms', () => {
  test('several roots: the walk starts from each of them', async () => {
    const rows = await walk({
      rootId: ['A', 'R'],
      direction: RecursiveTreeDirections.DOWN,
      maxDepth: 32,
    });

    expect(rows.map((row) => row.id).sort()).toEqual(['A', 'B', 'C', 'R', 'S']);
    expect(
      rows
        .filter((row) => row.depth === 0)
        .map((row) => row.id)
        .sort(),
    ).toEqual(['A', 'R']);
  });

  test('a list of one root walks like the single id', async () => {
    const single = await walk({
      rootId: 'A',
      direction: RecursiveTreeDirections.DOWN,
      maxDepth: 32,
    });
    const listed = await walk({
      rootId: ['A'],
      direction: RecursiveTreeDirections.DOWN,
      maxDepth: 32,
    });

    expect(listed).toEqual(single);
  });

  test('no root: a DOWN walk starts from every row that has no parent', async () => {
    const rows = await walk({ direction: RecursiveTreeDirections.DOWN, maxDepth: 32 });

    expect(rows.map((row) => row.id).sort()).toEqual(['A', 'B', 'C', 'R', 'S']);
    expect(
      rows
        .filter((row) => row.depth === 0)
        .map((row) => row.id)
        .sort(),
    ).toEqual(['A', 'R']);
  });

  test('no root on an UP walk, and an empty list of roots, are refused', () => {
    expect(() =>
      RecursiveTreeSql.walk({
        name: 'tree',
        table: merchants,
        direction: RecursiveTreeDirections.UP,
        maxDepth: 32,
      }),
    ).toThrow(/needs at least one root/);
    expect(() =>
      RecursiveTreeSql.walk({
        name: 'tree',
        table: merchants,
        rootId: [],
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 32,
      }),
    ).toThrow(/empty list of roots/);
  });

  test('filter is applied to both terms: a rejected row is out of the walk and its subtree is cut off', async () => {
    const rows = await walk({
      rootId: 'A',
      direction: RecursiveTreeDirections.DOWN,
      maxDepth: 32,
      filter: sql`t.id <> 'B'`,
    });

    expect(rows.map((row) => row.id)).toEqual(['A']);

    const rejectedRoot = await walk({
      rootId: 'A',
      direction: RecursiveTreeDirections.DOWN,
      maxDepth: 32,
      filter: sql`t.id <> 'A'`,
    });
    expect(rejectedRoot).toEqual([]);
  });

  test('filter equals the same condition passed as anchorFilter (unqualified) and as recursiveFilter (the alias t)', async () => {
    const once = await walk({
      rootId: ['A', 'R'],
      direction: RecursiveTreeDirections.DOWN,
      maxDepth: 32,
      filter: sql`t.id <> 'C'`,
    });
    const twice = await walk({
      rootId: ['A', 'R'],
      direction: RecursiveTreeDirections.DOWN,
      maxDepth: 32,
      anchorFilter: sql`id <> 'C'`,
      recursiveFilter: sql`t.id <> 'C'`,
    });

    expect(once).toEqual(twice);
    expect(once.map((row) => row.id).sort()).toEqual(['A', 'B', 'R', 'S']);
  });

  test('the walk is a CTE the caller can join: name is the alias', async () => {
    const cte = RecursiveTreeSql.walk({
      name: 'subtree',
      table: merchants,
      rootId: 'A',
      direction: RecursiveTreeDirections.DOWN,
      maxDepth: 32,
    });
    const query = new PgDialect().sqlToQuery(cte);

    const rs = await database.query(
      `${query.sql} SELECT s.id, m.parent_id FROM subtree s JOIN merchants m ON m.id = s.id ORDER BY s.depth`,
      query.params as unknown[],
    );

    expect(rs.rows).toEqual([
      { id: 'A', ['parent_id']: null },
      { id: 'B', ['parent_id']: 'A' },
      { id: 'C', ['parent_id']: 'B' },
    ]);
  });
});
