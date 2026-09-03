import { describe, expect, test } from 'bun:test';
import { mysqlTable, text as mysqlText } from 'drizzle-orm/mysql-core';
import { RecursiveTreeDirections, RecursiveTreeSql } from '@/base/repositories/sqls/recursive-tree';

/**
 * The engine is read off `table` itself (`is(table, PgTable)` / `is(table, SQLiteTable)`), never
 * a caller-supplied option - `recursive-tree.test.ts` and `recursive-tree-sqlite.test.ts` prove the
 * two supported engines. This file covers the third outcome: a Drizzle table belonging to neither,
 * which must be rejected rather than silently compiled with the wrong dialect's syntax.
 */
const mysqlNodesTable = mysqlTable('tree_nodes', {
  id: mysqlText('id').primaryKey(),
  parentId: mysqlText('parent_id'),
});

describe('RecursiveTreeSql.walk - a table dialect that is neither Postgres nor SQLite is rejected', () => {
  test('a MySQL table throws naming the table, not a mismatched dialect emission', () => {
    expect(() =>
      RecursiveTreeSql.walk({
        name: 'walked',
        table: mysqlNodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 10,
      }),
    ).toThrow(/table/);
  });

  test('the error names the table', () => {
    expect(() =>
      RecursiveTreeSql.walk({
        name: 'walked',
        table: mysqlNodesTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 10,
      }),
    ).toThrow(/tree_nodes/);
  });
});
