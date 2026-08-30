import { datasource, model, ScopeFilterMissingBehaviors } from '@venizia/ignis-kernel';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { DefaultCRUDRepository, SoftDeletableRepository } from '@/relational/postgres/repositories';
import { PGlite } from '@electric-sql/pglite';
import type { AnyType, TNullable, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * End-to-end proof, against a real Postgres engine (PGlite), that `@model` settings.scopeFilter
 * reaches every read AND write verb - including `restore()`, the exact site that would leak a
 * soft-deleted row across tenants if scoping were bolted onto `defaultFilter` instead of kept
 * separate from `shouldSkipDefaultFilter`.
 */
const TABLE_NAME = 'scope_filter_e2e';

const scopeTable = pgTable(TABLE_NAME, {
  id: serial('id').primaryKey(),
  tenant: text('tenant').notNull(),
  name: text('name').notNull(),
  deletedAt: timestamp('deleted_at'),
});

class ScopeResolutionError extends Error {}

/** `'__throw__'` simulates a resolver failure; `null` simulates "no request context" (onMissing: deny). */
let currentTenant: TNullable<string> | '__throw__' = 'tenant-a';

@model({
  type: 'entity',
  settings: {
    scopeFilter: {
      resolve: () => {
        if (currentTenant === '__throw__') {
          throw new ScopeResolutionError('scope resolution blew up');
        }

        return currentTenant == null ? currentTenant : { tenant: currentTenant };
      },
    },
    defaultFilter: { where: { deletedAt: null } },
  },
})
class TenantScopedEntity extends BasePostgresEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = scopeTable;
}

let allowTenant: TNullable<string> = null;

@model({
  type: 'entity',
  settings: {
    scopeFilter: {
      resolve: () => (allowTenant === null ? allowTenant : { tenant: allowTenant }),
      onMissing: ScopeFilterMissingBehaviors.ALLOW,
    },
  },
})
class AllowOnMissingEntity extends BasePostgresEntity {
  static override TABLE_NAME = TABLE_NAME;
  static override schema = scopeTable;
}

@datasource({ driver: PGliteDriver })
class ScopeFilterDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: ScopeFilterDataSource.name,
      config: {},
      schema: { [TABLE_NAME]: scopeTable },
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
let dataSource: ScopeFilterDataSource;
let repository: SoftDeletableRepository<typeof scopeTable>;
let allowRepository: DefaultCRUDRepository<typeof scopeTable>;

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
  `);

  dataSource = new ScopeFilterDataSource({ client });

  repository = new SoftDeletableRepository<typeof scopeTable>(dataSource as AnyType, {
    entityClass: TenantScopedEntity as AnyType,
  });

  allowRepository = new DefaultCRUDRepository<typeof scopeTable>(dataSource as AnyType, {
    entityClass: AllowOnMissingEntity as AnyType,
  });
});

afterAll(async () => {
  await dataSource.endDriver();
});

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
};

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

beforeEach(async () => {
  currentTenant = 'tenant-a';
  allowTenant = null;
  await seed();
});

describe('scopeFilter - read verbs are scoped to the current tenant', () => {
  test('find hides every other tenant entirely', async () => {
    const rows = await repository.find({ filter: { order: ['id asc'] } });
    expect(rows.map(row => row.name)).toEqual(['a-active']);
  });

  test('findOne / findById scope the same way as find', async () => {
    const one = await repository.findOne({ filter: {} });
    expect(one?.name).toBe('a-active');

    const crossTenant = await repository.findById({ id: 3 });
    expect(crossTenant).toBeNull();

    const ownTenant = await repository.findById({ id: 1 });
    expect(ownTenant?.name).toBe('a-active');
  });

  test('count only counts the current tenant', async () => {
    const { count } = await repository.count({ where: {} });
    expect(count).toBe(1);
  });

  test('shouldSkipDefaultFilter removes soft-delete but NOT the tenant scope', async () => {
    const rows = await repository.find({
      filter: { order: ['id asc'] },
      options: { shouldSkipDefaultFilter: true },
    });

    // Both of tenant-a's rows (soft-deleted included), never tenant-b's.
    expect(rows.map(row => row.name).sort()).toEqual(['a-active', 'a-deleted']);
  });
});

describe('scopeFilter - write verbs are scoped to the current tenant', () => {
  test("updateAll only touches the current tenant's rows", async () => {
    await repository.updateAll({
      data: { name: 'a-active-updated' },
      where: {},
      options: { shouldReturn: false },
    });

    expect((await rawRow(1))?.name).toBe('a-active-updated');
    expect((await rawRow(3))?.name).toBe('b-active');
  });

  test("deleteAll (soft) only soft-deletes the current tenant's active row", async () => {
    await repository.deleteAll({ where: {}, options: { shouldReturn: false } });

    expect((await rawRow(1))?.deletedAt).not.toBeNull();
    expect((await rawRow(3))?.deletedAt).toBeNull();
  });

  test("updateById on another tenant's id is a scoped no-op, not a cross-tenant write", async () => {
    const result = await repository.updateById({ id: 3, data: { name: 'hacked' } });

    expect(result.count).toBe(0);
    expect((await rawRow(3))?.name).toBe('b-active');
  });

  test("deleteById on another tenant's id is a scoped no-op", async () => {
    const result = await repository.deleteById({ id: 3 });

    expect(result.count).toBe(0);
    expect((await rawRow(3))?.deletedAt).toBeNull();
  });
});

describe('scopeFilter - restore() is scoped (the site that would otherwise leak)', () => {
  test("positive control: restoring your OWN tenant's soft-deleted row succeeds", async () => {
    const result = await repository.restoreById({ id: 2 });

    expect(result.count).toBe(1);
    expect((await rawRow(2))?.deletedAt).toBeNull();
  });

  test("restoring ANOTHER tenant's soft-deleted row is denied, not just filtered from the result", async () => {
    const result = await repository.restoreById({ id: 4 });

    expect(result.count).toBe(0);
    expect((await rawRow(4))?.deletedAt).not.toBeNull();
  });

  test('restoreAll only reaches the current tenant', async () => {
    await repository.restoreAll({ where: {}, options: { shouldReturn: false } });

    expect((await rawRow(2))?.deletedAt).toBeNull();
    expect((await rawRow(4))?.deletedAt).not.toBeNull();
  });
});

describe("scopeFilter - onMissing: 'deny' (the default) matches zero rows for every verb", () => {
  test('find/count return nothing when the scope cannot be resolved', async () => {
    currentTenant = null;

    const rows = await repository.find({ filter: {} });
    expect(rows).toEqual([]);

    const { count } = await repository.count({ where: {} });
    expect(count).toBe(0);
  });

  test('restoreById denies even a row that DOES exist, when the scope cannot be resolved', async () => {
    currentTenant = null;

    const result = await repository.restoreById({ id: 2 });

    expect(result.count).toBe(0);
    expect((await rawRow(2))?.deletedAt).not.toBeNull();
  });
});

describe("scopeFilter - onMissing: 'allow' applies no scope", () => {
  test('every tenant is visible once the scope is unresolved and onMissing is allow', async () => {
    allowTenant = null;

    const rows = await allowRepository.find({ filter: { order: ['id asc'] } });
    expect(rows.map(row => row.name)).toEqual(['a-active', 'a-deleted', 'b-active', 'b-deleted']);
  });

  test('the same model still scopes normally once the resolver returns a value', async () => {
    allowTenant = 'tenant-a';

    const rows = await allowRepository.find({ filter: { order: ['id asc'] } });
    expect(rows.map(row => row.name)).toEqual(['a-active', 'a-deleted']);
  });
});

describe('scopeFilter - a throwing resolver propagates', () => {
  test("find() rejects with the resolver's own error instead of silently un-scoping", async () => {
    currentTenant = '__throw__';
    let caught: unknown;

    try {
      await repository.find({ filter: {} });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ScopeResolutionError);
  });
});
