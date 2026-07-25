import { describe, test, expect, spyOn } from 'bun:test';
import { FilterBuilder } from '@/connectors/postgres/repositories/dialect';
import type { TDrizzleQueryOptions } from '@/base/repositories/common';
import { DEFAULT_LIMIT } from '@/base/repositories/common';
import type { TRelationConfig } from '@/connectors/postgres/repositories/common';
import { MetadataRegistry } from '@/helpers/inversion';
import { pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

const table = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  createdAt: timestamp('created_at'),
});

// Same target schema, exercised as both a to-many and a to-one relation.
const relations: Record<string, TRelationConfig> = {
  categories: { name: 'categories', type: 'many', schema: table, metadata: undefined },
  owner: { name: 'owner', type: 'one', schema: table, metadata: undefined },
};

const builder = new FilterBuilder();

function buildTop(filter: any): TDrizzleQueryOptions {
  return builder.build({ tableName: 'categories', schema: table, filter });
}

/** Builds the `with[relation]` Drizzle options for a relation scope. */
function buildScope(relation: string, scope: any): true | TDrizzleQueryOptions {
  const result = builder.toInclude({ include: [{ relation, scope }], relations });
  return result[relation];
}

describe('order/limit at top level (FilterBuilder.build)', () => {
  test('build never injects a default limit (find() applies it)', () => {
    expect('limit' in buildTop({ order: ['createdAt DESC'] })).toBe(false);
    expect('limit' in buildTop({})).toBe(false);
  });

  test('order only -> orderBy set', () => {
    expect(buildTop({ order: ['createdAt DESC'] }).orderBy).toHaveLength(1);
  });

  test('order + limit -> both set', () => {
    const q = buildTop({ order: ['createdAt DESC'], limit: 5 });
    expect(q.orderBy).toHaveLength(1);
    expect(q.limit).toBe(5);
  });
});

describe('to-many relation scope is capped at DEFAULT_LIMIT', () => {
  test('order only -> ordered AND capped at DEFAULT_LIMIT', () => {
    const q = buildScope('categories', { order: ['createdAt DESC'] }) as TDrizzleQueryOptions;
    expect(q.orderBy).toHaveLength(1);
    expect(q.limit).toBe(DEFAULT_LIMIT);
  });

  test('no scope -> capped at DEFAULT_LIMIT (not unbounded)', () => {
    const result = builder.toInclude({ include: [{ relation: 'categories' }], relations });
    const q = result.categories as TDrizzleQueryOptions;
    expect(q).not.toBe(true);
    expect(q.limit).toBe(DEFAULT_LIMIT);
  });

  test('explicit scope limit overrides the default', () => {
    const q = buildScope('categories', { limit: 50 }) as TDrizzleQueryOptions;
    expect(q.limit).toBe(50);
  });

  test('order + explicit limit -> both honored', () => {
    const q = buildScope('categories', {
      order: ['createdAt DESC'],
      limit: 3,
    }) as TDrizzleQueryOptions;
    expect(q.orderBy).toHaveLength(1);
    expect(q.limit).toBe(3);
  });
});

describe("to-many relation scope honors the relation model's defaultLimit", () => {
  test('no scope -> uses the relation model defaultLimit (not global DEFAULT_LIMIT)', () => {
    // MetadataRegistry has a private constructor and a large mixin-composed surface, and only getModelEntry is exercised, so this is a fixture-boundary cast.
    const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
      getModelEntry: () => ({ metadata: { type: 'entity', settings: { defaultLimit: 7 } } }),
    } as any);

    const result = builder.toInclude({ include: [{ relation: 'categories' }], relations });
    const q = result.categories as TDrizzleQueryOptions;
    expect(q.limit).toBe(7);

    mockGetInstance.mockRestore();
  });

  test('explicit scope limit still overrides the model defaultLimit', () => {
    // Fixture-boundary cast - see comment on the first mock in this describe block.
    const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
      getModelEntry: () => ({ metadata: { type: 'entity', settings: { defaultLimit: 7 } } }),
    } as any);

    const q = buildScope('categories', { limit: 50 }) as TDrizzleQueryOptions;
    expect(q.limit).toBe(50);

    mockGetInstance.mockRestore();
  });

  test('falls back to DEFAULT_LIMIT when relation model has no defaultLimit', () => {
    // Fixture-boundary cast - see comment on the first mock in this describe block.
    const mockGetInstance = spyOn(MetadataRegistry, 'getInstance').mockReturnValue({
      getModelEntry: () => ({ metadata: { type: 'entity', settings: {} } }),
    } as any);

    const result = builder.toInclude({ include: [{ relation: 'categories' }], relations });
    const q = result.categories as TDrizzleQueryOptions;
    expect(q.limit).toBe(DEFAULT_LIMIT);

    mockGetInstance.mockRestore();
  });
});

describe('to-one relation scope is never auto-limited', () => {
  test('no scope -> loaded fully (true), no limit', () => {
    const result = builder.toInclude({ include: [{ relation: 'owner' }], relations });
    expect(result.owner).toBe(true);
  });

  test('order only -> ordered, NO default limit', () => {
    const q = buildScope('owner', { order: ['createdAt DESC'] }) as TDrizzleQueryOptions;
    expect(q.orderBy).toHaveLength(1);
    expect('limit' in q).toBe(false);
  });

  test('explicit limit on a to-one scope is still honored', () => {
    const q = buildScope('owner', { limit: 2 }) as TDrizzleQueryOptions;
    expect(q.limit).toBe(2);
  });
});
