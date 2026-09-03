import { describe, expect, test } from 'bun:test';
import { integer, PgDialect, pgTable, text } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { RecursiveTreeDirections, RecursiveTreeSql } from '@/base/repositories/sqls/recursive-tree';

const dialect = new PgDialect();

const nodesTable = pgTable('tree_nodes', {
  id: text('id').primaryKey(),
  parentId: text('parent_id'),
  label: text('label'),
  weight: integer('weight'),
});

const compile = (query: ReturnType<typeof RecursiveTreeSql.walk>) => dialect.sqlToQuery(query);

describe('RecursiveTreeSql.walk - shape', () => {
  test('DOWN walks parent -> children: t.parent_id joins r.id', () => {
    const { sql: sqlText } = compile(
      RecursiveTreeSql.walk({
        name: 'descendants',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 10,
      }),
    );

    expect(sqlText).toContain('WITH RECURSIVE "descendants"');
    expect(sqlText).toContain('ON t."parent_id" = r."id"');
  });

  test('UP walks child -> parent: t.id joins r.parent_id', () => {
    const { sql: sqlText } = compile(
      RecursiveTreeSql.walk({
        name: 'ancestors',
        table: nodesTable,
        rootId: 'leaf-1',
        direction: RecursiveTreeDirections.UP,
        maxDepth: 10,
      }),
    );

    expect(sqlText).toContain('ON t."id" = r."parent_id"');
  });

  test('defaults idColumn to "id" and parentColumn to "parent_id"', () => {
    const { sql: sqlText } = compile(
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 10,
      }),
    );

    expect(sqlText).toContain('"id"');
    expect(sqlText).toContain('"parent_id"');
  });

  test('custom idColumn/parentColumn are honored and quoted', () => {
    const { sql: sqlText } = compile(
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 10,
        idColumn: 'label',
        parentColumn: 'weight',
      }),
    );

    expect(sqlText).toContain('"label"');
    expect(sqlText).toContain('"weight"');
  });

  test('extra columns are carried through both the base and recursive projections', () => {
    const { sql: sqlText } = compile(
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 10,
        columns: ['label', 'weight'],
      }),
    );

    expect(sqlText).toContain('t."label"');
    expect(sqlText).toContain('t."weight"');
  });

  test('rootId, maxDepth, and startDepth are bound parameters, not spliced text', () => {
    const { sql: sqlText, params } = compile(
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 7,
        startDepth: 2,
      }),
    );

    expect(sqlText).not.toContain('root-1');
    expect(params).toContain('root-1');
    expect(params).toContain(7);
    expect(params).toContain(2);
  });

  test('recursiveFilter is ANDed into the recursive term', () => {
    const { sql: sqlText } = compile(
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 10,
        recursiveFilter: sql`t.label is not null`,
      }),
    );

    expect(sqlText).toContain('AND (t.label is not null)');
  });
});

describe('RecursiveTreeSql.walk - trackPath', () => {
  test('trackPath: false (default) emits no path or is_cycle columns', () => {
    const { sql: sqlText } = compile(
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 10,
      }),
    );

    expect(sqlText).not.toContain('is_cycle');
    expect(sqlText).not.toContain('path');
  });

  test('trackPath: true emits path[]/is_cycle and stops recursing past a flagged row', () => {
    const { sql: sqlText } = compile(
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.UP,
        maxDepth: 50,
        trackPath: true,
      }),
    );

    expect(sqlText).toContain('ARRAY["id"] AS path');
    expect(sqlText).toContain('false AS is_cycle');
    expect(sqlText).toContain('r.path || t."id" AS path');
    expect(sqlText).toContain('t."id" = ANY(r.path) AS is_cycle');
    // The guard that makes a real A -> B -> A cycle terminate instead of hang: once a row is
    // flagged is_cycle, it is never expanded again, so the recursion has nothing left to grow.
    expect(sqlText).toContain('AND NOT r.is_cycle');
  });

  test('the depth bound applies unconditionally, independent of trackPath - this alone guarantees termination', () => {
    const { sql: sqlText, params } = compile(
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 42,
      }),
    );

    expect(sqlText).toContain('r.depth + 1 <=');
    expect(params).toContain(42);
  });
});

describe('RecursiveTreeSql.walk - maxDepth is mandatory and validated', () => {
  test('maxDepth: 0 throws - a walk that never runs must not silently return empty', () => {
    expect(() =>
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 0,
      }),
    ).toThrow(/maxDepth/);
  });

  test('a negative maxDepth throws', () => {
    expect(() =>
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: -5,
      }),
    ).toThrow(/maxDepth/);
  });

  test('a non-integer maxDepth throws', () => {
    expect(() =>
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 1.5,
      }),
    ).toThrow(/maxDepth/);
  });
});

describe('RecursiveTreeSql.walk - identifier injection is rejected', () => {
  test('a malicious idColumn is rejected, not escaped-and-allowed', () => {
    expect(() =>
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 10,
        idColumn: 'id"; DROP TABLE users; --',
      }),
    ).toThrow(/idColumn/);
  });

  test('a malicious parentColumn is rejected', () => {
    expect(() =>
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 10,
        parentColumn: 'parent_id; SELECT pg_sleep(9999); --',
      }),
    ).toThrow(/parentColumn/);
  });

  test('a malicious CTE name is rejected', () => {
    expect(() =>
      RecursiveTreeSql.walk({
        name: 'walked" AS (SELECT 1) --',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 10,
      }),
    ).toThrow(/name/);
  });

  test('a malicious entry in columns is rejected', () => {
    expect(() =>
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 10,
        columns: ['label', 'weight); DROP TABLE tree_nodes; --'],
      }),
    ).toThrow(/columns/);
  });

  test('the error names the offending value, not just the field', () => {
    expect(() =>
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 10,
        idColumn: 'bad id',
      }),
    ).toThrow(/bad id/);
  });

  test('a legitimate snake_case identifier is accepted', () => {
    expect(() =>
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 10,
        idColumn: 'valid_column_1',
      }),
    ).not.toThrow();
  });
});

describe('RecursiveTreeSql.walk - other guard rails', () => {
  test('an invalid direction throws', () => {
    expect(() =>
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        // @ts-expect-error - deliberately invalid at the type level too
        direction: 'SIDEWAYS',
        maxDepth: 10,
      }),
    ).toThrow(/direction/);
  });

  test('a non-Drizzle-table value throws, naming what actually arrived', () => {
    expect(() =>
      RecursiveTreeSql.walk({
        name: 'walked',
        table: { not: 'a drizzle table' },
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 10,
      }),
    ).toThrow(/table/);
  });

  test('a plain string table value throws', () => {
    expect(() =>
      RecursiveTreeSql.walk({
        name: 'walked',
        table: 'tree_nodes',
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 10,
      }),
    ).toThrow(/table/);
  });
});

describe('RecursiveTreeSql.walk - Postgres SQL is unchanged after adding SQLite support', () => {
  test('a full-featured call (trackPath, extra columns, recursiveFilter, custom startDepth) compiles to the exact pre-existing Postgres text', () => {
    const compiled = compile(
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 10,
        columns: ['label', 'weight'],
        recursiveFilter: sql`t.label is not null`,
        trackPath: true,
        startDepth: 2,
      }),
    );

    expect(compiled.sql).toBe(
      'WITH RECURSIVE "walked" AS (SELECT "id", "parent_id", "label", "weight", $1::int AS depth, ' +
        'ARRAY["id"] AS path, false AS is_cycle FROM "tree_nodes" WHERE "id" = $2 UNION ALL SELECT ' +
        't."id", t."parent_id", t."label", t."weight", r.depth + 1, r.path || t."id" AS path, ' +
        't."id" = ANY(r.path) AS is_cycle FROM "tree_nodes" t JOIN "walked" r ON t."parent_id" = r."id" ' +
        'WHERE r.depth + 1 <= $3 AND NOT r.is_cycle AND (t.label is not null))',
    );
    expect(compiled.params).toEqual([2, 'root-1', 10]);
  });
});

describe('RecursiveTreeDirections', () => {
  test('isValid recognizes UP and DOWN only', () => {
    expect(RecursiveTreeDirections.isValid('UP')).toBe(true);
    expect(RecursiveTreeDirections.isValid('DOWN')).toBe(true);
    expect(RecursiveTreeDirections.isValid('SIDEWAYS')).toBe(false);
  });
});
