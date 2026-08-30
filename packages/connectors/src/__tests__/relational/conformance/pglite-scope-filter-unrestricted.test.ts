import { datasource, model, ScopeFilters } from '@venizia/ignis-kernel';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { DefaultCRUDRepository, SoftDeletableRepository } from '@/relational/postgres/repositories';
import { PGlite } from '@electric-sql/pglite';
import type { AnyType, TNullable, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * `ScopeFilters.UNRESTRICTED` is the third `resolve()` state, proven here against a real engine:
 * it applies NO scope for the one call that returned it, `undefined` still denies (the safety
 * property the whole feature exists to protect), and the choice is re-evaluated per call, never
 * cached across requests. `pglite-scope-filter.test.ts` already covers the `where`/deny/allow
 * two-state behavior this file does not repeat.
 */
const TABLE_NAME = 'scope_filter_unrestricted_e2e';
const CONTROL_TABLE_NAME = 'scope_filter_unrestricted_control';

const scopeTable = pgTable(TABLE_NAME, {
  id: serial('id').primaryKey(),
  tenant: text('tenant').notNull(),
  name: text('name').notNull(),
  deletedAt: timestamp('deleted_at'),
});

/** No `settings.scopeFilter` at all - the control proving `ScopeFilters.UNRESTRICTED` left this path untouched. */
const controlTable = pgTable(CONTROL_TABLE_NAME, {
  id: serial('id').primaryKey(),
  tenant: text('tenant').notNull(),
  name: text('name').notNull(),
});

type TTenantState = TNullable<string> | typeof ScopeFilters.UNRESTRICTED;
let currentTenant: TTenantState = 'tenant-a';

@model({
  type: 'entity',
  settings: {
    scopeFilter: {
      resolve: () => {
        if (currentTenant === ScopeFilters.UNRESTRICTED) {
          return ScopeFilters.UNRESTRICTED;
        }

        return currentTenant == null ? currentTenant : { tenant: currentTenant };
      },
    },
    defaultFilter: { where: { deletedAt: null } },
  },
})
class UnrestrictedScopedEntity extends BasePostgresEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = scopeTable;
}

@model({ type: 'entity' })
class NoScopeFilterEntity extends BasePostgresEntity {
  static override TABLE_NAME = CONTROL_TABLE_NAME;
  static override schema = controlTable;
}

@datasource({ driver: PGliteDriver })
class UnrestrictedScopeDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: UnrestrictedScopeDataSource.name,
      config: {},
      schema: { [TABLE_NAME]: scopeTable, [CONTROL_TABLE_NAME]: controlTable },
    });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }

  endDriver(): Promise<void> {
    return this.resolveDriver().end();
  }
}

let client: PGlite;
let dataSource: UnrestrictedScopeDataSource;
let repository: SoftDeletableRepository<typeof scopeTable>;
let controlRepository: DefaultCRUDRepository<typeof controlTable>;

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;

  await client.exec(`
    CREATE TABLE ${TABLE_NAME} (
      id serial primary key,
      tenant text not null,
      name text not null,
      deleted_at timestamp
    );
    CREATE TABLE ${CONTROL_TABLE_NAME} (
      id serial primary key,
      tenant text not null,
      name text not null
    );
  `);

  dataSource = new UnrestrictedScopeDataSource({ client });

  repository = new SoftDeletableRepository<typeof scopeTable>(dataSource as AnyType, {
    entityClass: UnrestrictedScopedEntity as AnyType,
  });

  controlRepository = new DefaultCRUDRepository<typeof controlTable>(dataSource as AnyType, {
    entityClass: NoScopeFilterEntity as AnyType,
  });
});

afterAll(async () => {
  await dataSource.endDriver();
});

const rawRow = async (
  id: number,
): Promise<{ name: string; deletedAt: Date | null } | undefined> => {
  // Aliased to camelCase in the query itself - the boundary mapping, not a snake_case TS field.
  const { rows } = await client.query<{ name: string; deletedAt: Date | null }>(
    `SELECT name, deleted_at AS "deletedAt" FROM ${TABLE_NAME} WHERE id = $1`,
    [id],
  );

  return rows[0];
};

/** id=1/2 belong to tenant-a (one active, one soft-deleted); id=3/4 the same shape for tenant-b. */
const seed = async (): Promise<void> => {
  await client.exec(`TRUNCATE TABLE ${TABLE_NAME} RESTART IDENTITY;`);
  await client.exec(`
    INSERT INTO ${TABLE_NAME} (tenant, name, deleted_at) VALUES
      ('tenant-a', 'a-active', NULL),
      ('tenant-a', 'a-deleted', now()),
      ('tenant-b', 'b-active', NULL),
      ('tenant-b', 'b-deleted', now());
  `);

  await client.exec(`TRUNCATE TABLE ${CONTROL_TABLE_NAME} RESTART IDENTITY;`);
  await client.exec(`
    INSERT INTO ${CONTROL_TABLE_NAME} (tenant, name) VALUES
      ('tenant-a', 'control-a'),
      ('tenant-b', 'control-b');
  `);
};

beforeEach(async () => {
  currentTenant = 'tenant-a';
  await seed();
});

describe('scopeFilter - UNRESTRICTED applies no scope for this call', () => {
  test('find sees every tenant (defaultFilter still excludes soft-deleted rows, unrelated to scope)', async () => {
    currentTenant = ScopeFilters.UNRESTRICTED;

    const rows = await repository.find({ filter: { order: ['id asc'] } });
    expect(rows.map(row => row.name)).toEqual(['a-active', 'b-active']);
  });

  test('findById reaches a row belonging to a tenant other than the caller', async () => {
    currentTenant = ScopeFilters.UNRESTRICTED;

    const crossTenant = await repository.findById({ id: 3 });
    expect(crossTenant?.name).toBe('b-active');
  });

  test('count counts every tenant', async () => {
    currentTenant = ScopeFilters.UNRESTRICTED;

    const { count } = await repository.count({ where: {} });
    expect(count).toBe(2);
  });

  test('updateAll reaches every tenant', async () => {
    currentTenant = ScopeFilters.UNRESTRICTED;

    await repository.updateAll({
      data: { name: 'updated-everywhere' },
      where: {},
      options: { shouldReturn: false },
    });

    expect((await rawRow(1))?.name).toBe('updated-everywhere');
    expect((await rawRow(3))?.name).toBe('updated-everywhere');
  });

  test('deleteAll (soft) reaches every tenant', async () => {
    currentTenant = ScopeFilters.UNRESTRICTED;

    await repository.deleteAll({ where: {}, options: { shouldReturn: false } });

    expect((await rawRow(1))?.deletedAt).not.toBeNull();
    expect((await rawRow(3))?.deletedAt).not.toBeNull();
  });

  test('restoreById reaches a row belonging to another tenant', async () => {
    currentTenant = ScopeFilters.UNRESTRICTED;

    const result = await repository.restoreById({ id: 4 });

    expect(result.count).toBe(1);
    expect((await rawRow(4))?.deletedAt).toBeNull();
  });

  test('restoreAll reaches every tenant', async () => {
    currentTenant = ScopeFilters.UNRESTRICTED;

    // A non-empty `where` (`id > 0`, i.e. every row) - `restoreAll` skips `defaultFilter`, and an
    // UNRESTRICTED scope contributes nothing either, so a literal `where: {}` here would hit the
    // repository's unrelated "empty where needs `force`" guard rather than exercising scoping.
    await repository.restoreAll({
      where: { id: { gt: 0 } },
      options: { shouldReturn: false },
    });

    expect((await rawRow(2))?.deletedAt).toBeNull();
    expect((await rawRow(4))?.deletedAt).toBeNull();
  });
});

describe('scopeFilter - undefined still denies (the safety property, contrasted with UNRESTRICTED above)', () => {
  test('a resolver returning undefined matches zero rows, never every row', async () => {
    currentTenant = undefined;

    const rows = await repository.find({ filter: {} });
    expect(rows).toEqual([]);

    const { count } = await repository.count({ where: {} });
    expect(count).toBe(0);
  });

  test('null behaves exactly like undefined - both are "cannot determine", neither is UNRESTRICTED', async () => {
    currentTenant = null;

    const rows = await repository.find({ filter: {} });
    expect(rows).toEqual([]);
  });
});

describe('scopeFilter - UNRESTRICTED is per-call, not cached', () => {
  test('the resolver flips between UNRESTRICTED and a where clause across consecutive calls', async () => {
    currentTenant = ScopeFilters.UNRESTRICTED;
    const unrestricted = await repository.find({ filter: { order: ['id asc'] } });
    expect(unrestricted.map(row => row.name)).toEqual(['a-active', 'b-active']);

    currentTenant = 'tenant-a';
    const scoped = await repository.find({ filter: { order: ['id asc'] } });
    expect(scoped.map(row => row.name)).toEqual(['a-active']);

    currentTenant = ScopeFilters.UNRESTRICTED;
    const unrestrictedAgain = await repository.find({ filter: { order: ['id asc'] } });
    expect(unrestrictedAgain.map(row => row.name)).toEqual(['a-active', 'b-active']);
  });
});

describe('scopeFilter - a model without scopeFilter is byte-identical to today', () => {
  test("every row is visible regardless of the unrelated scoped model's current resolver state", async () => {
    currentTenant = null;

    const rows = await controlRepository.find({ filter: { order: ['id asc'] } });
    expect(rows.map(row => row.name)).toEqual(['control-a', 'control-b']);
  });
});
