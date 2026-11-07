import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, test } from 'bun:test';
import { pgTable, serial, integer, varchar } from 'drizzle-orm/pg-core';
import type { TRelationConfig } from '@/relational/postgres/repositories/common';
import type { TDrizzleQueryOptions } from '@venizia/ignis-kernel';
import { PostgresFilterBuilder } from '@/relational/postgres/repositories/dialect/filter';

/**
 * `mergeFilter` merges `where` at the TOP KEY LEVEL: operator-object collisions AND-compose, so a
 * default scope can never be WIDENED. Scalar keys keep the user-wins override.
 */
describe('FilterBuilder.mergeFilter - top-key-level where merge', () => {
  const builder = new PostgresFilterBuilder();

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

  test('scalar-over-scalar composes: a caller cannot replace the soft-delete default', () => {
    const merged = builder.mergeFilter<any>({
      defaultFilter: { where: { isDeleted: false, tenantId: 5 } },
      userFilter: { where: { isDeleted: true } },
    });

    expect(merged.where).toEqual({
      tenantId: 5,
      and: [{ isDeleted: false }, { isDeleted: true }],
    });
  });

  test('a caller restating the default scalar changes nothing', () => {
    const merged = builder.mergeFilter<any>({
      defaultFilter: { where: { isDeleted: false, tenantId: 5 } },
      userFilter: { where: { isDeleted: false } },
    });

    expect(merged.where).toEqual({ isDeleted: false, tenantId: 5 });
  });

  test('null is a scalar too: the caller restating deletedAt null changes nothing, another value composes', () => {
    const same = builder.mergeFilter<any>({
      defaultFilter: { where: { deletedAt: null } },
      userFilter: { where: { deletedAt: null } },
    });
    const other = builder.mergeFilter<any>({
      defaultFilter: { where: { deletedAt: null } },
      userFilter: { where: { deletedAt: { neq: null } } },
    });

    expect(same.where).toEqual({ deletedAt: null });
    expect(other.where).toEqual({ and: [{ deletedAt: null }, { deletedAt: { neq: null } }] });
  });

  test('equal dates are the same scalar', () => {
    const merged = builder.mergeFilter<any>({
      defaultFilter: { where: { since: new Date('2026-01-01T00:00:00Z') } },
      userFilter: { where: { since: new Date('2026-01-01T00:00:00Z') } },
    });

    expect(merged.where).toEqual({ since: new Date('2026-01-01T00:00:00Z') });
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
    // Replacing the default group is a scope escape - any caller `or` erases it. Concatenating is
    // equally wrong: that UNIONs the disjunctions and widens the query.
    const merged = builder.mergeFilter<any>({
      defaultFilter: { where: { or: [{ x: 1 }] } },
      userFilter: { where: { or: [{ y: 2 }] } },
    });

    expect(merged.where).toEqual({ and: [{ or: [{ x: 1 }] }, { or: [{ y: 2 }] }] });
  });

  test('a user key the default does not set passes through, and the other default keys are kept', () => {
    const merged = builder.mergeFilter<any>({
      defaultFilter: { where: { status: 'active', tenantId: 5 } },
      userFilter: { where: { name: 'x' } },
    });

    expect(merged.where).toEqual({ status: 'active', tenantId: 5, name: 'x' });
  });

  test('a user value on a default key composes instead of replacing it', () => {
    const merged = builder.mergeFilter<any>({
      defaultFilter: { where: { status: 'active', tenantId: 5 } },
      userFilter: { where: { status: 'inactive' } },
    });

    expect(merged.where).toEqual({
      tenantId: 5,
      and: [{ status: 'active' }, { status: 'inactive' }],
    });
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

  test.each(['hasOwnProperty', 'toString', 'valueOf', 'constructor'])(
    'the inherited name %s is an ordinary key, never a default it would collide with',
    (name) => {
      const where = JSON.parse(`{"${name}": "x"}`);
      const merged = builder.mergeFilter<any>({
        defaultFilter: { where: { isDeleted: false } },
        userFilter: { where },
      });

      expect(merged.where).toEqual({ isDeleted: false, ...where });
      expect((merged.where as Record<string, unknown>).and).toBeUndefined();
    },
  );

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

/**
 * The include-scope merge routes through `mergeFilter`, so a scoped `inq` must not be index-merged
 * with the relation model's defaultFilter `inq`.
 */
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
    const builder = new PostgresFilterBuilder();

    // Force a relation defaultFilter with an inq array, then a scope with a different inq array.
    const originalResolveDefaultFilter = builder.resolveDefaultFilter.bind(builder);
    builder.resolveDefaultFilter = () => ({ where: { kind: { inq: [1, 2, 3] } } });

    try {
      const result = builder.toInclude({
        include: [{ relation: 'items', scope: { where: { kind: { inq: [9] } } } }],
        relations,
      });
      const scoped = result.items as TDrizzleQueryOptions;

      // `toBeDefined()` on `scoped.where` holds even if the merge drops the caller's filter, so
      // read the COMPILED SQL: both IN lists must be present, joined by AND.
      const { sql: statement, params } = new PgDialect().sqlToQuery(scoped.where as SQL);

      expect(statement.toLowerCase()).toContain(' and ');
      expect(params).toEqual(expect.arrayContaining([1, 2, 3, 9]));
    } finally {
      builder.resolveDefaultFilter = originalResolveDefaultFilter;
    }
  });
});
