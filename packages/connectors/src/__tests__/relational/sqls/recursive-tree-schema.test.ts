import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { PgDialect, pgSchema, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { sqliteTable, SQLiteSyncDialect, text as sqliteText } from 'drizzle-orm/sqlite-core';
import {
  RecursiveTreeDirections,
  RecursiveTreeSql,
} from '@/relational/core/repositories/sqls/recursive-tree';

const commerce = pgSchema('commerce');

const merchantsTable = commerce.table('merchants', {
  id: text('id').primaryKey(),
  parentId: text('parent_id'),
  deletedAt: timestamp('deleted_at'),
});

const publicTable = pgTable('merchants', {
  id: text('id').primaryKey(),
  parentId: text('parent_id'),
});

const pgDialect = new PgDialect();

describe('RecursiveTreeSql.walk - the table schema is part of the identifier', () => {
  test('a table in a named schema is emitted as "schema"."table" in both terms', () => {
    const { sql: sqlText } = pgDialect.sqlToQuery(
      RecursiveTreeSql.walk({
        name: 'walked',
        table: merchantsTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 5,
      }),
    );

    expect(sqlText).toContain('FROM "commerce"."merchants" WHERE');
    expect(sqlText).toContain('FROM "commerce"."merchants" t JOIN');
    expect(sqlText).not.toContain('FROM "merchants"');
  });

  test('a table in the default schema stays unqualified', () => {
    const { sql: sqlText } = pgDialect.sqlToQuery(
      RecursiveTreeSql.walk({
        name: 'walked',
        table: publicTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 5,
      }),
    );

    expect(sqlText).toContain('FROM "merchants" WHERE');
    expect(sqlText).not.toContain('"public"');
  });
});

describe('RecursiveTreeSql.walk - anchorFilter', () => {
  test('is ANDed into the anchor term only, and recursiveFilter into the recursive term only', () => {
    const { sql: sqlText } = pgDialect.sqlToQuery(
      RecursiveTreeSql.walk({
        name: 'walked',
        table: merchantsTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 5,
        anchorFilter: sql`deleted_at IS NULL`,
        recursiveFilter: sql`t.deleted_at IS NULL`,
      }),
    );

    expect(sqlText).toContain('WHERE "id" = $2 AND (deleted_at IS NULL) UNION ALL');
    expect(sqlText).toContain('AND (t.deleted_at IS NULL)');
    expect(sqlText.match(/deleted_at IS NULL/g)).toHaveLength(2);
  });

  test('without it the anchor term is unchanged', () => {
    const { sql: sqlText } = pgDialect.sqlToQuery(
      RecursiveTreeSql.walk({
        name: 'walked',
        table: merchantsTable,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 5,
      }),
    );

    expect(sqlText).toContain('WHERE "id" = $2 UNION ALL');
  });

  test('works on SQLite', () => {
    const nodes = sqliteTable('tree_nodes', {
      id: sqliteText('id').primaryKey(),
      parentId: sqliteText('parent_id'),
    });
    const { sql: sqlText } = new SQLiteSyncDialect().sqlToQuery(
      RecursiveTreeSql.walk({
        name: 'walked',
        table: nodes,
        rootId: 'root-1',
        direction: RecursiveTreeDirections.DOWN,
        maxDepth: 5,
        anchorFilter: sql`deleted_at IS NULL`,
      }),
    );

    expect(sqlText).toContain('WHERE "id" = ? AND (deleted_at IS NULL) UNION ALL');
  });
});

describe('RecursiveTreeSql.walk - against a real Postgres (PGlite)', () => {
  const client = new PGlite();
  const database = drizzle(client);

  const walkIds = async (opts: {
    anchorFilter?: ReturnType<typeof sql>;
    recursiveFilter?: ReturnType<typeof sql>;
    rootId: string;
  }) => {
    const walk = RecursiveTreeSql.walk({
      name: 'walked',
      table: merchantsTable,
      rootId: opts.rootId,
      direction: RecursiveTreeDirections.DOWN,
      maxDepth: 10,
      anchorFilter: opts.anchorFilter,
      recursiveFilter: opts.recursiveFilter,
    });

    const result = await database.execute(sql`${walk} SELECT id FROM walked ORDER BY id`);
    return result.rows.map((row) => row.id as string);
  };

  beforeAll(async () => {
    await client.exec(`
      CREATE SCHEMA commerce;
      CREATE TABLE commerce.merchants (id text PRIMARY KEY, parent_id text, deleted_at timestamp);
      INSERT INTO commerce.merchants (id, parent_id, deleted_at) VALUES
        ('a', NULL, NULL),
        ('b', 'a', NULL),
        ('c', 'b', NULL),
        ('d', 'b', now()),
        ('e', 'd', NULL),
        ('gone', NULL, now()),
        ('gone-child', 'gone', NULL);
    `);
  });

  afterAll(async () => {
    await client.close();
  });

  test('reads the table in the commerce schema', async () => {
    expect(await walkIds({ rootId: 'a' })).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('a soft-deleted row in the chain is excluded, with its subtree, by recursiveFilter', async () => {
    const ids = await walkIds({ rootId: 'a', recursiveFilter: sql`t.deleted_at IS NULL` });

    expect(ids).toEqual(['a', 'b', 'c']);
  });

  test('a soft-deleted root is excluded by anchorFilter, so nothing is walked', async () => {
    const withoutFilter = await walkIds({
      rootId: 'gone',
      recursiveFilter: sql`t.deleted_at IS NULL`,
    });
    const withFilter = await walkIds({
      rootId: 'gone',
      anchorFilter: sql`deleted_at IS NULL`,
      recursiveFilter: sql`t.deleted_at IS NULL`,
    });

    expect(withoutFilter).toEqual(['gone', 'gone-child']);
    expect(withFilter).toEqual([]);
  });
});
