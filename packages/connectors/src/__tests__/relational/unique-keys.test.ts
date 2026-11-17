import { describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import {
  index as pgIndex,
  pgTable,
  serial,
  text as pgText,
  timestamp,
  unique as pgUnique,
  uniqueIndex as pgUniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  index as liteIndex,
  integer,
  sqliteTable,
  text as liteText,
  unique as liteUnique,
  uniqueIndex as liteUniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { UniqueKeys } from '@/relational/core/models';
import type { IUniqueKey } from '@/relational/core/models';
import type { DefaultCRUDRepository } from '@/relational/postgres/repositories';

/**
 * `UniqueKeys.of` reads a key off the Drizzle declaration of a table, and refuses at declaration (module load, so boot)
 * a name that is missing, an index that is not unique, and an index over an expression. The compile-time half of the
 * contract (a key of another table, an unknown `update` column, a missing insert column) is checked by `bun check`
 * through the `@ts-expect-error` lines at the bottom.
 */
const pgItems = pgTable(
  'uk_pg_item',
  {
    id: serial('id').primaryKey(),
    merchantId: pgText('merchant_id').notNull(),
    code: pgText('code').notNull().unique('uk_pg_item_code_col'),
    slug: pgText('slug'),
    email: pgText('email'),
    value: pgText('value'),
    createdAt: timestamp('created_at').defaultNow(),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [
    pgUniqueIndex('uk_pg_item_merchant_slug')
      .on(t.merchantId, t.slug)
      .where(sql`${t.deletedAt} is null`),
    pgUnique('uk_pg_item_merchant_value').on(t.merchantId, t.value).nullsNotDistinct(),
    pgIndex('uk_pg_item_value').on(t.value),
    pgUniqueIndex('uk_pg_item_email_lower').on(sql`lower(${t.email})`),
  ],
);

/** The same column names as `pgItems`, another table. */
const pgTwins = pgTable(
  'uk_pg_twin',
  {
    id: serial('id').primaryKey(),
    merchantId: pgText('merchant_id').notNull(),
    code: pgText('code').notNull(),
    slug: pgText('slug'),
    email: pgText('email'),
    value: pgText('value'),
    deletedAt: timestamp('deleted_at'),
  },
  (t) => [pgUniqueIndex('uk_pg_twin_code').on(t.code)],
);

const liteItems = sqliteTable(
  'uk_lite_item',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    merchantId: liteText('merchant_id').notNull(),
    code: liteText('code').notNull(),
    email: liteText('email'),
    value: liteText('value'),
  },
  (t) => [
    liteUniqueIndex('uk_lite_item_code').on(t.code),
    liteUnique('uk_lite_item_merchant_value').on(t.merchantId, t.value),
    liteIndex('uk_lite_item_value').on(t.value),
    liteUniqueIndex('uk_lite_item_email_lower').on(sql`lower(${t.email})`),
  ],
);

describe('UniqueKeys.of reads a declared key', () => {
  test('a partial unique index: its columns as properties, and its predicate', () => {
    const key = UniqueKeys.of({ table: pgItems, index: 'uk_pg_item_merchant_slug' });

    expect(key.table).toBe(pgItems);
    expect(key.name).toBe('uk_pg_item_merchant_slug');
    expect(key.columns).toEqual(['merchantId', 'slug']);
    expect(key.where).toBeDefined();
    expect(key.nullsNotDistinct).toBe(false);
  });

  test('a unique constraint keeps NULLS NOT DISTINCT', () => {
    const key = UniqueKeys.of({ table: pgItems, index: 'uk_pg_item_merchant_value' });

    expect(key.columns).toEqual(['merchantId', 'value']);
    expect(key.where).toBeUndefined();
    expect(key.nullsNotDistinct).toBe(true);
  });

  test('a unique column is a key under its unique name', () => {
    const key = UniqueKeys.of({ table: pgItems, index: 'uk_pg_item_code_col' });

    expect(key.columns).toEqual(['code']);
  });

  test('SQLite: a unique index and a unique constraint', () => {
    const byIndex = UniqueKeys.of({ table: liteItems, index: 'uk_lite_item_code' });
    const byConstraint = UniqueKeys.of({ table: liteItems, index: 'uk_lite_item_merchant_value' });

    expect(byIndex.columns).toEqual(['code']);
    expect(byConstraint.columns).toEqual(['merchantId', 'value']);
    expect(byConstraint.nullsNotDistinct).toBe(false);
  });
});

describe('UniqueKeys.of refuses at declaration', () => {
  const refusals = [
    {
      label: 'Postgres: a name no key has',
      run: () => UniqueKeys.of({ table: pgItems, index: 'uk_pg_item_nope' }),
      message: /no index or constraint of the table has this name \| index: 'uk_pg_item_nope'/,
    },
    {
      label: 'Postgres: an index that is not unique',
      run: () => UniqueKeys.of({ table: pgItems, index: 'uk_pg_item_value' }),
      message: /the index is not unique/,
    },
    {
      label: 'Postgres: an expression index',
      run: () => UniqueKeys.of({ table: pgItems, index: 'uk_pg_item_email_lower' }),
      message: /an expression index cannot be an upsert key/,
    },
    {
      label: 'SQLite: a name no key has',
      run: () => UniqueKeys.of({ table: liteItems, index: 'uk_lite_item_nope' }),
      message: /no index or constraint of the table has this name/,
    },
    {
      label: 'SQLite: an index that is not unique',
      run: () => UniqueKeys.of({ table: liteItems, index: 'uk_lite_item_value' }),
      message: /the index is not unique/,
    },
    {
      label: 'SQLite: an expression index',
      run: () => UniqueKeys.of({ table: liteItems, index: 'uk_lite_item_email_lower' }),
      message: /an expression index cannot be an upsert key/,
    },
    {
      label: 'a name that is echoed safely',
      run: () => UniqueKeys.of({ table: pgItems, index: "x'; DROP TABLE y;--\n" }),
      message: /index: 'x'; DROP TABLE y;--\\u000a'/,
    },
  ];

  for (const refusal of refusals) {
    test(refusal.label, () => {
      expect(refusal.run).toThrow(refusal.message);
    });
  }
});

declare const repo: DefaultCRUDRepository<typeof pgItems>;

const compileOnly = async () => {
  const slugKey = UniqueKeys.of({ table: pgItems, index: 'uk_pg_item_merchant_slug' });
  const twinKey = UniqueKeys.of({ table: pgTwins, index: 'uk_pg_twin_code' });
  const typedColumns: ReadonlyArray<
    'id' | 'merchantId' | 'code' | 'slug' | 'email' | 'value' | 'createdAt' | 'deletedAt'
  > = slugKey.columns;
  const handle: IUniqueKey<typeof pgItems> = slugKey;

  // The valid call every line below departs from in one property only.
  const valid = await repo.upsert({
    data: { merchantId: 'm1', code: 'A', slug: 'a', value: 'v' },
    on: slugKey,
    update: ['value'],
  });

  const foreign = await repo.upsert({
    data: { merchantId: 'm1', code: 'A', slug: 'a', value: 'v' },
    // @ts-expect-error a key of another table, even one whose column names are the same, is refused
    on: twinKey,
    update: ['value'],
  });

  const unknownColumn = await repo.upsert({
    data: { merchantId: 'm1', code: 'A', slug: 'a', value: 'v' },
    on: slugKey,
    // @ts-expect-error `update` names a column the table does not have
    update: ['valeu'],
  });

  const creationAudit = await repo.upsert({
    data: { merchantId: 'm1', code: 'A', slug: 'a', value: 'v' },
    on: slugKey,
    // @ts-expect-error `update` never names a creation audit column, though `createdAt` is a column of the table
    update: ['createdAt'],
  });

  const missingInsertColumn = await repo.upsert({
    // @ts-expect-error `data` lacks `code`, which the table requires on insert
    data: { merchantId: 'm1', slug: 'a', value: 'v' },
    on: slugKey,
  });

  return [typedColumns, handle, valid, foreign, unknownColumn, creationAudit, missingInsertColumn];
};

test('the compile-time checks live in this file and run under `bun check`', () => {
  expect(typeof compileOnly).toBe('function');
});
