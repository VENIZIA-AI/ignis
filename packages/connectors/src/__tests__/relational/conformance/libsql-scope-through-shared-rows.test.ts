import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { datasource, model, ScopeThrough } from '@venizia/ignis-kernel';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { RelationsFactory } from '@/relational/core/repositories/dialect/relations/create';
import { BaseSqliteDataSource } from '@/relational/sqlite/datasources';
import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';
import { many, ModelFactory, one, RelationDeclarations } from '@/relational/sqlite/models';
import { DefaultSqliteRepository } from '@/relational/sqlite/repositories';

/**
 * `access.through` on SQLite and the parent's `write.sharedRows`. The parent reads its own rows and the shared ones (merchant null);
 * `sharedRows` decides whether a write may reach the shared ones. A child of a shared parent follows the same answer,
 * at one hop (Variant) and at two (Option through Variant through Product).
 */
const PRODUCT_TABLE = 'lite_shared_through_product';
const VARIANT_TABLE = 'lite_shared_through_variant';
const OPTION_TABLE = 'lite_shared_through_option';

const productTable = sqliteTable(PRODUCT_TABLE, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  merchantId: text('merchant_id'),
  name: text('name').notNull(),
});

const variantTable = sqliteTable(VARIANT_TABLE, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id')
    .notNull()
    .references(() => productTable.id),
  name: text('name').notNull(),
});

const optionTable = sqliteTable(OPTION_TABLE, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  variantId: integer('variant_id')
    .notNull()
    .references(() => variantTable.id),
  name: text('name').notNull(),
});

const SHARED_SCOPE = { or: [{ merchantId: { inq: ['m1'] } }, { merchantId: null }] };
let productScope: AnyType = SHARED_SCOPE;

/** The parent's `access`, held by reference so a test can flip `write.sharedRows` and the scope shape. */
const productAccess = {
  resolve: () => productScope,
  write: { sharedRows: false },
};

const ProductBase = ModelFactory.defineEntity({
  table: productTable,
  relations: () => ({ variants: many(variantTable, { relationName: 'product' }) }),
});

@model({ type: 'entity', settings: { access: productAccess } })
class Product extends ProductBase {}

const VariantBase = ModelFactory.defineEntity({
  table: variantTable,
  relations: () => ({
    product: one(productTable),
    options: many(optionTable, { relationName: 'variant' }),
  }),
});

@model({
  type: 'entity',
  settings: {
    access: { through: ScopeThrough.of({ entity: VariantBase, relation: 'product' }) },
  },
})
class Variant extends VariantBase {}

const OptionBase = ModelFactory.defineEntity({
  table: optionTable,
  relations: () => ({ variant: one(variantTable) }),
});

@model({
  type: 'entity',
  settings: {
    access: { through: ScopeThrough.of({ entity: OptionBase, relation: 'variant' }) },
  },
})
class Option extends OptionBase {}

const relationsOf = (opts: {
  source: typeof productTable | typeof variantTable | typeof optionTable;
  entity: {
    relationDefinitions:
      | Parameters<typeof RelationDeclarations.toRelationConfigs>[0]['relations']
      | undefined;
  };
}) => {
  return RelationsFactory.create({
    source: opts.source,
    relations: RelationDeclarations.toRelationConfigs({
      relations: opts.entity.relationDefinitions ?? {},
    }),
  }).relations;
};

@datasource({ driver: LibSqlDriver })
class SharedThroughDataSource extends BaseSqliteDataSource<{ url: string }, AnyType, {}, Client> {
  constructor(opts: { client: Client }) {
    super({
      name: SharedThroughDataSource.name,
      config: { url: ':memory:' },
      schema: {
        [PRODUCT_TABLE]: productTable,
        [VARIANT_TABLE]: variantTable,
        [OPTION_TABLE]: optionTable,
        productRelations: relationsOf({ source: productTable, entity: ProductBase }),
        variantRelations: relationsOf({ source: variantTable, entity: VariantBase }),
        optionRelations: relationsOf({ source: optionTable, entity: OptionBase }),
      },
    });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}
}

let client: Client;
let products: DefaultSqliteRepository<typeof productTable>;
let variants: DefaultSqliteRepository<typeof variantTable>;
let options: DefaultSqliteRepository<typeof optionTable>;

beforeAll(async () => {
  client = createClient({ url: ':memory:' });
  await client.executeMultiple(`
    CREATE TABLE ${PRODUCT_TABLE} (id integer primary key autoincrement, merchant_id text, name text not null);
    CREATE TABLE ${VARIANT_TABLE} (id integer primary key autoincrement, product_id integer not null references ${PRODUCT_TABLE}(id), name text not null);
    CREATE TABLE ${OPTION_TABLE} (id integer primary key autoincrement, variant_id integer not null references ${VARIANT_TABLE}(id), name text not null);
  `);

  const dataSource = new SharedThroughDataSource({ client });
  products = new DefaultSqliteRepository<typeof productTable>(dataSource as AnyType, {
    entityClass: Product as AnyType,
  });
  variants = new DefaultSqliteRepository<typeof variantTable>(dataSource as AnyType, {
    entityClass: Variant as AnyType,
  });
  options = new DefaultSqliteRepository<typeof optionTable>(dataSource as AnyType, {
    entityClass: Option as AnyType,
  });
});

afterAll(() => {
  client.close();
});

/** Product 1 is m1's, product 2 is shared (merchant null), product 3 is m2's. Variant n sits under product n, option n under variant n. */
beforeEach(async () => {
  productAccess.write.sharedRows = false;
  productScope = SHARED_SCOPE;
  await client.executeMultiple(`
    DELETE FROM ${OPTION_TABLE};
    DELETE FROM ${VARIANT_TABLE};
    DELETE FROM ${PRODUCT_TABLE};
    DELETE FROM sqlite_sequence;
    INSERT INTO ${PRODUCT_TABLE} (merchant_id, name) VALUES ('m1', 'p1'), (NULL, 'p2'), ('m2', 'p3');
    INSERT INTO ${VARIANT_TABLE} (product_id, name) VALUES (1, 'v1'), (2, 'v2'), (3, 'v3');
    INSERT INTO ${OPTION_TABLE} (variant_id, name) VALUES (1, 'o1'), (2, 'o2'), (3, 'o3');
  `);
});

const names = (rows: Array<{ name: string }>): string[] => rows.map((row) => row.name).sort();

const tableNames = async (table: string): Promise<string[]> => {
  const { rows } = await client.execute(`SELECT name FROM ${table} ORDER BY id`);

  return rows.map((row) => String(row.name));
};

const parentOf = async (opts: { table: string; column: string; id: number }) => {
  const { rows } = await client.execute(
    `SELECT ${opts.column} AS parent FROM ${opts.table} WHERE id = ${opts.id}`,
  );

  return Number(rows[0].parent);
};

/** The text of the error a write raised, or '' when it went through. */
const refusal = async (write: () => Promise<unknown>): Promise<string> => {
  try {
    await write();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  return '';
};

describe('reads still reach the children of a shared parent', () => {
  test('the shared parent is readable, so its variants and options are', async () => {
    const result = await products.find({ filter: {} });
    expect(names(result)).toEqual(['p1', 'p2']);
    const result2 = await variants.find({ filter: {} });
    expect(names(result2)).toEqual(['v1', 'v2']);
    const result3 = await options.find({ filter: {} });
    expect(names(result3)).toEqual(['o1', 'o2']);
  });
});

describe('without write.sharedRows a child of a shared parent cannot be written', () => {
  test('update: only the children of the caller own parents change', async () => {
    await variants.updateAll({
      where: {},
      data: { name: 'renamed' },
      options: { shouldReturn: false },
    });

    const result = await tableNames(VARIANT_TABLE);
    expect(result).toEqual(['renamed', 'v2', 'v3']);
  });

  test('delete: only the children of the caller own parents go', async () => {
    await client.execute(`DELETE FROM ${OPTION_TABLE}`);
    await variants.deleteAll({ where: {}, options: { shouldReturn: false, force: true } });

    const result2 = await tableNames(VARIANT_TABLE);
    expect(result2).toEqual(['v2', 'v3']);
  });

  test('a shared child named by id is not updated or deleted', async () => {
    await refusal(() => variants.updateById({ id: 2, data: { name: 'renamed' } }));
    await client.execute(`DELETE FROM ${OPTION_TABLE}`);
    await refusal(() => variants.deleteById({ id: 2 }));

    const result3 = await tableNames(VARIANT_TABLE);
    expect(result3).toEqual(['v1', 'v2', 'v3']);
  });

  test('create under a shared parent is refused; under an own parent it is written', async () => {
    const shared = await refusal(() => variants.create({ data: { productId: 2, name: 'x' } }));
    await variants.create({ data: { productId: 1, name: 'own' } });

    expect(shared).toContain('write refused by the access scope');
    const result4 = await tableNames(VARIANT_TABLE);
    expect(result4).toEqual(['v1', 'v2', 'v3', 'own']);
  });

  test('moving a variant to a shared parent is refused; to an own parent it works', async () => {
    const shared = await refusal(() => variants.updateById({ id: 1, data: { productId: 2 } }));

    expect(shared).toContain('write refused by the access scope');
    const result5 = await parentOf({ table: VARIANT_TABLE, column: 'product_id', id: 1 });
    expect(result5).toBe(1);
  });

  test('two hops: an option under a shared product cannot be created, moved to, updated or deleted', async () => {
    const created = await refusal(() => options.create({ data: { variantId: 2, name: 'x' } }));
    const moved = await refusal(() => options.updateById({ id: 1, data: { variantId: 2 } }));

    expect(created).toContain('write refused by the access scope');
    expect(moved).toContain('write refused by the access scope');
    const result6 = await parentOf({ table: OPTION_TABLE, column: 'variant_id', id: 1 });
    expect(result6).toBe(1);

    await options.updateAll({
      where: {},
      data: { name: 'renamed' },
      options: { shouldReturn: false },
    });
    const result7 = await tableNames(OPTION_TABLE);
    expect(result7).toEqual(['renamed', 'o2', 'o3']);

    await options.deleteAll({ where: {}, options: { shouldReturn: false, force: true } });
    const result8 = await tableNames(OPTION_TABLE);
    expect(result8).toEqual(['o2', 'o3']);
  });
});

describe('with write.sharedRows on the parent the same writes are allowed', () => {
  beforeEach(() => {
    productAccess.write.sharedRows = true;
  });

  test('update, delete, create and move reach the children of the shared parent', async () => {
    await variants.updateAll({
      where: {},
      data: { name: 'renamed' },
      options: { shouldReturn: false },
    });
    const result = await tableNames(VARIANT_TABLE);
    expect(result).toEqual(['renamed', 'renamed', 'v3']);

    await variants.create({ data: { productId: 2, name: 'in-shared' } });
    await variants.updateById({ id: 1, data: { productId: 2 } });
    const result2 = await parentOf({ table: VARIANT_TABLE, column: 'product_id', id: 1 });
    expect(result2).toBe(2);

    await client.execute(`DELETE FROM ${OPTION_TABLE}`);
    await variants.deleteAll({ where: {}, options: { shouldReturn: false, force: true } });
    const result3 = await tableNames(VARIANT_TABLE);
    expect(result3).toEqual(['v3']);
  });

  test('two hops: the options of a shared product are written, another merchant stays refused', async () => {
    await options.create({ data: { variantId: 2, name: 'in-shared' } });
    await options.updateAll({
      where: {},
      data: { name: 'renamed' },
      options: { shouldReturn: false },
    });
    const foreign = await refusal(() => options.create({ data: { variantId: 3, name: 'x' } }));

    const result4 = await tableNames(OPTION_TABLE);
    expect(result4).toEqual(['renamed', 'renamed', 'o3', 'renamed']);
    expect(foreign).toContain('write refused by the access scope');
  });
});

describe('other shapes of the parent scope', () => {
  test('a parent scope the write guard cannot read refuses the child write, and still reads', async () => {
    productScope = { or: [{ merchantId: 'm1' }, { name: { like: 'p2' } }] };

    const created = await refusal(() => variants.create({ data: { productId: 1, name: 'x' } }));
    const updated = await refusal(() =>
      variants.updateAll({
        where: {},
        data: { name: 'renamed' },
        options: { shouldReturn: false },
      }),
    );
    const listed = await variants.find({ filter: {} });

    expect(created).toContain('cannot be verified');
    expect(updated).toContain('cannot be verified');
    expect(names(listed)).toEqual(['v1', 'v2']);
    const result = await tableNames(VARIANT_TABLE);
    expect(result).toEqual(['v1', 'v2', 'v3']);
  });

  test('a parent scope with no null branch is written as before', async () => {
    productScope = { merchantId: 'm1' };

    await variants.create({ data: { productId: 1, name: 'own' } });
    const shared = await refusal(() => variants.create({ data: { productId: 2, name: 'x' } }));
    await variants.updateAll({
      where: {},
      data: { name: 'renamed' },
      options: { shouldReturn: false },
    });

    expect(shared).toContain('write refused by the access scope');
    const result2 = await tableNames(VARIANT_TABLE);
    expect(result2).toEqual(['renamed', 'v2', 'v3', 'renamed']);
  });

  test('a parent scope that allows only the shared rows leaves nothing writable without sharedRows', async () => {
    productScope = { merchantId: null };

    const created = await refusal(() => variants.create({ data: { productId: 2, name: 'x' } }));
    await variants.updateAll({
      where: {},
      data: { name: 'renamed' },
      options: { shouldReturn: false },
    });

    expect(created).toContain('write refused by the access scope');
    const result3 = await tableNames(VARIANT_TABLE);
    expect(result3).toEqual(['v1', 'v2', 'v3']);

    productAccess.write.sharedRows = true;
    await variants.updateAll({
      where: {},
      data: { name: 'renamed' },
      options: { shouldReturn: false },
    });

    const result4 = await tableNames(VARIANT_TABLE);
    expect(result4).toEqual(['v1', 'renamed', 'v3']);
  });
});
