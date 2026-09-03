import { describe, expect, test } from 'bun:test';
import { PgDialect, pgTable, serial, text } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import type { AnyType, TNullable } from '@venizia/ignis-helpers/common';
import { model, ScopeFilterMissingBehaviors } from '@venizia/ignis-kernel';
import type { TFilter, TWhere } from '@venizia/ignis-kernel';
import { BaseRelationalEntity } from '@/relational/core/models';
import { DefaultRelationalRepository } from '@/relational/core/repositories/core/default';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';

/**
 * `applyScopeFilter`/`applyDefaultFilter` never touch the executor or connector, so a dataSource
 * stub providing only `getQueryDialect()` is enough to exercise the merge logic and compile it to
 * real SQL text - no PGlite, no fake Drizzle chain.
 */
const scopeFilterUnitTable = pgTable('scope_filter_unit', {
  id: serial('id').primaryKey(),
  tenantId: text('tenant_id'),
  name: text('name'),
});

const buildDataSource = () => ({ getQueryDialect: () => new PostgresQueryDialect() }) as AnyType;

const pgDialect = new PgDialect();

/** Compiles a `TWhere` straight from the dialect, bypassing any repository - used to read the raw SQL text a merged filter's `where` produces. */
const compileWhere = (where: TWhere<AnyType>): string => {
  const dialect = new PostgresQueryDialect();
  const condition = dialect.toWhere({
    tableName: 'scope_filter_unit',
    schema: scopeFilterUnitTable,
    where,
  });

  return condition ? pgDialect.sqlToQuery(condition as SQL).sql : 'NO CONDITION';
};

/** `undefined | null` must reach `resolve()`'s return UNWRAPPED - simulating "no scope known", not a literal `{ tenantId: null }` where clause. */
let denyTenant: TNullable<string> = 'tenant-a';

@model({
  type: 'entity',
  settings: {
    scopeFilter: {
      resolve: () => (denyTenant == null ? denyTenant : { tenantId: denyTenant }),
    },
  },
})
class DenyByDefaultEntity extends BaseRelationalEntity<typeof scopeFilterUnitTable> {
  static override schema = scopeFilterUnitTable;
  static override TABLE_NAME = 'scope_filter_unit';
}

let allowTenant: TNullable<string> = null;

@model({
  type: 'entity',
  settings: {
    scopeFilter: {
      resolve: () => (allowTenant === null ? allowTenant : { tenantId: allowTenant }),
      onMissing: ScopeFilterMissingBehaviors.ALLOW,
    },
  },
})
class AllowOnMissingEntity extends BaseRelationalEntity<typeof scopeFilterUnitTable> {
  static override schema = scopeFilterUnitTable;
  static override TABLE_NAME = 'scope_filter_unit';
}

class ScopeResolutionError extends Error {}

@model({
  type: 'entity',
  settings: {
    scopeFilter: {
      resolve: () => {
        throw new ScopeResolutionError('scope resolution blew up');
      },
    },
  },
})
class ThrowingScopeEntity extends BaseRelationalEntity<typeof scopeFilterUnitTable> {
  static override schema = scopeFilterUnitTable;
  static override TABLE_NAME = 'scope_filter_unit';
}

@model({
  type: 'entity',
  settings: {
    scopeFilter: { resolve: () => ({ tenantId: 'tenant-a' }) },
    defaultFilter: { where: { name: { neq: 'archived' } } },
  },
})
class ScopedWithDefaultFilterEntity extends BaseRelationalEntity<typeof scopeFilterUnitTable> {
  static override schema = scopeFilterUnitTable;
  static override TABLE_NAME = 'scope_filter_unit';
}

@model({ type: 'entity' })
class NoScopeEntity extends BaseRelationalEntity<typeof scopeFilterUnitTable> {
  static override schema = scopeFilterUnitTable;
  static override TABLE_NAME = 'scope_filter_unit';
}

const DEFAULT_FILTER_ONLY: TFilter<AnyType> = { where: { name: { neq: 'archived' } } };

/** No scopeFilter, only a defaultFilter - proves the new scope step is a true no-op, not merely absent from a single test's model. */
@model({ type: 'entity', settings: { defaultFilter: DEFAULT_FILTER_ONLY } })
class DefaultFilterOnlyEntity extends BaseRelationalEntity<typeof scopeFilterUnitTable> {
  static override schema = scopeFilterUnitTable;
  static override TABLE_NAME = 'scope_filter_unit';
}

const buildRepository = <Entity extends BaseRelationalEntity<typeof scopeFilterUnitTable>>(
  entityClass: new () => Entity,
): AnyType =>
  new DefaultRelationalRepository<typeof scopeFilterUnitTable>(buildDataSource(), {
    entityClass: entityClass as AnyType,
  }) as AnyType;

describe('applyScopeFilter - AND-composed into every call, never removable by shouldSkipDefaultFilter', () => {
  test('the resolved scope is AND-composed with the caller filter', () => {
    denyTenant = 'tenant-a';
    const repository = buildRepository(DenyByDefaultEntity);

    const merged: TFilter<AnyType> = repository.applyDefaultFilter({
      userFilter: { where: { name: 'alpha' } },
    });

    const sql = compileWhere(merged.where!);
    expect(sql).toContain('tenant_id');
    expect(sql.toLowerCase()).toContain(' and ');
  });

  test('shouldSkipDefaultFilter: true removes the default filter but keeps the scope', () => {
    denyTenant = 'tenant-a';
    const repository = buildRepository(ScopedWithDefaultFilterEntity);

    const merged: TFilter<AnyType> = repository.applyDefaultFilter({
      userFilter: { where: { id: 1 } },
      shouldSkipDefaultFilter: true,
    });

    const sql = compileWhere(merged.where!);
    expect(sql).toContain('tenant_id');
    expect(sql).not.toContain('archived');
  });

  test("onMissing: 'deny' (the default) compiles to a condition matching zero rows", () => {
    denyTenant = null;
    const repository = buildRepository(DenyByDefaultEntity);

    const merged: TFilter<AnyType> = repository.applyDefaultFilter({ userFilter: {} });

    expect(compileWhere(merged.where!).toLowerCase()).toContain('false');
  });

  test("onMissing: 'deny' still matches zero rows even alongside a caller where", () => {
    denyTenant = undefined;
    const repository = buildRepository(DenyByDefaultEntity);

    const merged: TFilter<AnyType> = repository.applyDefaultFilter({
      userFilter: { where: { name: 'alpha' } },
    });

    const sql = compileWhere(merged.where!);
    expect(sql.toLowerCase()).toContain('false');
    expect(sql.toLowerCase()).toContain('and');
  });

  test("onMissing: 'allow' applies no scope at all when resolve() returns null", () => {
    allowTenant = null;
    const repository = buildRepository(AllowOnMissingEntity);

    const userFilter: TFilter<AnyType> = { where: { name: 'alpha' } };
    const merged: TFilter<AnyType> = repository.applyDefaultFilter({ userFilter });

    expect(merged).toEqual(userFilter);
  });

  test('onMissing: allow still scopes normally once resolve() returns a value', () => {
    allowTenant = 'tenant-b';
    const repository = buildRepository(AllowOnMissingEntity);

    const merged: TFilter<AnyType> = repository.applyDefaultFilter({ userFilter: {} });

    expect(compileWhere(merged.where!)).toContain('tenant_id');
  });

  test('a throwing resolver propagates instead of silently un-scoping the query', () => {
    const repository = buildRepository(ThrowingScopeEntity);

    expect(() => repository.applyDefaultFilter({ userFilter: {} })).toThrow(ScopeResolutionError);
  });

  test('the framework-internal escape hatch is not reachable through shouldSkipDefaultFilter', () => {
    denyTenant = 'tenant-a';
    const repository = buildRepository(DenyByDefaultEntity);

    // The public surface has no way to set `dangerouslySkipScopeFilter` - only an internal recursive
    // call inside the repository tier can. Passing an arbitrary extra option must not do it.
    const merged: TFilter<AnyType> = repository.applyDefaultFilter({
      userFilter: {},
      shouldSkipDefaultFilter: true,
    });

    expect(compileWhere(merged.where!)).toContain('tenant_id');
  });
});

describe('applyDefaultFilter - a model with no scopeFilter is byte-identical to today', () => {
  test('no scopeFilter and no defaultFilter: the caller filter passes through unchanged, same reference', () => {
    const repository = buildRepository(NoScopeEntity);
    const userFilter: TFilter<AnyType> = { where: { name: 'alpha' }, limit: 5 };

    const merged = repository.applyDefaultFilter({ userFilter });

    expect(merged).toBe(userFilter);
  });

  test('no scopeFilter, with a defaultFilter: identical to calling mergeFilter directly', () => {
    const dialect = new PostgresQueryDialect();
    const userFilter: TFilter<AnyType> = { where: { id: 1 } };

    const expected = dialect.mergeFilter({ defaultFilter: DEFAULT_FILTER_ONLY, userFilter });

    const repository = buildRepository(DefaultFilterOnlyEntity);
    const actual = repository.applyDefaultFilter({ userFilter });

    expect(actual).toEqual(expected);
  });
});
