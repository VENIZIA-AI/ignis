import { describe, test, expect } from 'bun:test';
import { FilterBuilder } from '@/base/repositories/operators';
import { TDrizzleQueryOptions, TRelationConfig } from '@/base/repositories/common';
import { pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at'),
});

const relations: Record<string, TRelationConfig> = {
  categories: { name: 'categories', type: 'many', schema: categories, metadata: {} } as any,
};

const builder = new FilterBuilder();

/** Builds top-level Drizzle options for the `categories` table. */
function buildTop(filter: any): TDrizzleQueryOptions {
  return builder.build({ tableName: 'categories', schema: categories, filter });
}

/** Builds the `with.categories` Drizzle options for a relation scope. */
function buildScope(scope: any): true | TDrizzleQueryOptions {
  const result = builder.toInclude({ include: [{ relation: 'categories', scope }], relations });
  return result.categories;
}

describe('order/limit at top level (FilterBuilder.build)', () => {
  test('order only -> orderBy set, NO limit (default added later by find())', () => {
    const q = buildTop({ order: ['createdAt DESC'] });
    expect(q.orderBy).toHaveLength(1);
    expect('limit' in q).toBe(false);
  });

  test('limit only -> limit set, no orderBy', () => {
    const q = buildTop({ limit: 5 });
    expect(q.limit).toBe(5);
    expect(q.orderBy).toBeUndefined();
  });

  test('order + limit -> both set', () => {
    const q = buildTop({ order: ['createdAt DESC'], limit: 5 });
    expect(q.orderBy).toHaveLength(1);
    expect(q.limit).toBe(5);
  });

  test('neither -> no limit injected (build never defaults)', () => {
    const q = buildTop({});
    expect('limit' in q).toBe(false);
    expect(q.orderBy).toBeUndefined();
  });
});

describe('order/limit inside a relation scope (FilterBuilder.toInclude)', () => {
  test('scope order only -> orderBy set, NO limit (the reported bug)', () => {
    const q = buildScope({ order: ['createdAt DESC'] });
    expect(q).not.toBe(true);
    const opts = q as TDrizzleQueryOptions;
    expect(opts.orderBy).toHaveLength(1);
    expect('limit' in opts).toBe(false);
  });

  test('scope limit only -> limit set, no orderBy', () => {
    const q = buildScope({ limit: 5 }) as TDrizzleQueryOptions;
    expect(q.limit).toBe(5);
    expect(q.orderBy).toBeUndefined();
  });

  test('scope order + limit -> both set', () => {
    const q = buildScope({ order: ['createdAt DESC'], limit: 5 }) as TDrizzleQueryOptions;
    expect(q.orderBy).toHaveLength(1);
    expect(q.limit).toBe(5);
  });

  test('no scope -> relation loaded fully (true), no limit', () => {
    const result = builder.toInclude({ include: [{ relation: 'categories' }], relations });
    expect(result.categories).toBe(true);
  });
});
