import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, test } from 'bun:test';
import { pgTable, serial, integer, varchar } from 'drizzle-orm/pg-core';
import type { TRelationConfig } from '@/connectors/postgres/repositories/common';
import type { TDrizzleQueryOptions } from '@/base/repositories/common';
import { FilterBuilder } from '@/connectors/postgres/repositories/dialect/filter';

/** `FilterBuilder.mergeFilter` merges `where` at the TOP KEY LEVEL: operator-object collisions AND-compose (a default scope can never be WIDENED), scalar keys keep user-wins override. */
describe('FilterBuilder.mergeFilter - top-key-level where merge', () => {
  const builder = new FilterBuilder();

  test('operator objects on the same key are AND-composed - never index-merged, never dropped', () => {
    const merged = builder.mergeFilter<any>({
      defaultFilter: { where: { id: { inq: [1, 2, 3] } } },
      userFilter: { where: { id: { inq: [4] } } },
    });

    expect(merged.where).toEqual({
      and: [{ id: { inq: [1, 2, 3] } }, { id: { inq: [4] } }],
    });
  });

  test('a default range floor survives a user range ceiling on the same key', () => {
    const merged = builder.mergeFilter<any>({
      defaultFilter: { where: { createdAt: { gte: 'FLOOR' } } },
      userFilter: { where: { createdAt: { lte: 'CEIL' } } },
    });

    expect(merged.where).toEqual({
      and: [{ createdAt: { gte: 'FLOOR' } }, { createdAt: { lte: 'CEIL' } }],
    });
  });

  test('a user operator object cannot swallow a SCALAR default - both survive', () => {
    const merged = builder.mergeFilter<any>({
      defaultFilter: { where: { status: 'active' } },
      userFilter: { where: { status: { neq: 'archived' } } },
    });

    expect(merged.where).toEqual({
      and: [{ status: 'active' }, { status: { neq: 'archived' } }],
    });
  });

  test('scalar-over-scalar stays a plain override - the soft-delete opt-out keeps working', () => {
    const merged = builder.mergeFilter<any>({
      defaultFilter: { where: { isDeleted: false, tenantId: 5 } },
      userFilter: { where: { isDeleted: true } },
    });

    expect(merged.where).toEqual({ isDeleted: true, tenantId: 5 });
  });

  test('a user scalar cannot swallow an OPERATOR default either', () => {
    const merged = builder.mergeFilter<any>({
      defaultFilter: { where: { createdAt: { gte: 'FLOOR' } } },
      userFilter: { where: { createdAt: 'EXACT' } },
    });

    expect(merged.where).toEqual({
      and: [{ createdAt: { gte: 'FLOOR' } }, { createdAt: 'EXACT' }],
    });
  });

  test('an existing top-level and[] is extended, not clobbered, by a composed collision', () => {
    const merged = builder.mergeFilter<any>({
      defaultFilter: { where: { and: [{ archived: false }], id: { inq: [1, 2] } } },
      userFilter: { where: { id: { inq: [2, 3] } } },
    });

    expect(merged.where).toEqual({
      and: [{ archived: false }, { id: { inq: [1, 2] } }, { id: { inq: [2, 3] } }],
    });
  });

  test('two or-groups are AND-composed - the default group is never replaced', () => {
    // Replacing it was a scope-escape: a `defaultFilter` written as `or: [{ownerId}, {isPublic}]` was erased by any caller sending its own `or`. Concatenating them is equally wrong - that UNIONs the disjunctions and widens the query.
    const merged = builder.mergeFilter<any>({
      defaultFilter: { where: { or: [{ x: 1 }] } },
      userFilter: { where: { or: [{ y: 2 }] } },
    });

    expect(merged.where).toEqual({ and: [{ or: [{ x: 1 }] }, { or: [{ y: 2 }] }] });
  });

  test('scalar override semantics are unchanged (user key wins, other default keys kept)', () => {
    const merged = builder.mergeFilter<any>({
      defaultFilter: { where: { status: 'active', tenantId: 5 } },
      userFilter: { where: { status: 'inactive' } },
    });

    expect(merged.where).toEqual({ status: 'inactive', tenantId: 5 });
  });

  test('a default tenant scope cannot be widened - the user inq is intersected, not substituted', () => {
    const merged = builder.mergeFilter<any>({
      defaultFilter: { where: { tenantId: 5, id: { inq: [1, 2, 3] } } },
      userFilter: { where: { id: { inq: [999] } } },
    });

    expect(merged.where).toEqual({
      tenantId: 5,
      and: [{ id: { inq: [1, 2, 3] } }, { id: { inq: [999] } }],
    });
  });

  test('a user value of undefined does not override a defined default (tenant/soft-delete scope)', () => {
    const merged = builder.mergeFilter<any>({
      defaultFilter: { where: { tenantId: 'safe-tenant', isDeleted: false } },
      userFilter: { where: { tenantId: undefined, isDeleted: undefined } },
    });

    expect(merged.where).toEqual({ tenantId: 'safe-tenant', isDeleted: false });
  });

  test('order arrays stay replace-wholesale (regression guard)', () => {
    const merged = builder.mergeFilter<any>({
      defaultFilter: { order: ['a ASC', 'b ASC'] },
      userFilter: { order: ['c DESC'] },
    });

    expect(merged.order).toEqual(['c DESC']);
  });
});

/** The include-scope merge routes through `mergeFilter`, so it inherits the top-key-level fix: a scoped `inq` must not be index-merged with the relation model's defaultFilter `inq`. */
describe('FilterBuilder.toInclude - include-scope merge inherits the fix', () => {
  const relationTable = pgTable('relation_items', {
    id: serial('id').primaryKey(),
    kind: integer('kind'),
    label: varchar('label', { length: 50 }),
  });

  const relations: Record<string, TRelationConfig> = {
    items: { name: 'items', type: 'one', schema: relationTable, metadata: undefined },
  };

  test("a relation scope's inq is AND-composed with the relation default filter's inq", () => {
    const builder = new FilterBuilder();

    // Force a relation defaultFilter with an inq array, then a scope with a different inq array.
    const originalResolveDefaultFilter = builder.resolveDefaultFilter.bind(builder);
    builder.resolveDefaultFilter = () => ({ where: { kind: { inq: [1, 2, 3] } } });

    try {
      const result = builder.toInclude({
        include: [{ relation: 'items', scope: { where: { kind: { inq: [9] } } } }],
        relations,
      });
      const scoped = result.items as TDrizzleQueryOptions;

      // `expect(scoped.where).toBeDefined()` holds no matter what the merge does, even dropping the caller's filter entirely, so read the COMPILED SQL: both IN lists must be present, joined by AND.
      const { sql: statement, params } = new PgDialect().sqlToQuery(scoped.where as SQL);

      expect(statement.toLowerCase()).toContain(' and ');
      expect(params).toEqual(expect.arrayContaining([1, 2, 3, 9]));
    } finally {
      builder.resolveDefaultFilter = originalResolveDefaultFilter;
    }
  });
});
