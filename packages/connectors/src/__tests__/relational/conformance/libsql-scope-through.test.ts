import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import type { AnyType, TNullable, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { datasource, model, ScopeFilters, ScopeThrough } from '@venizia/ignis-kernel';
import { afterAll, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { RelationsFactory } from '@/relational/core/repositories/dialect/relations/create';
import { BaseSqliteDataSource } from '@/relational/sqlite/datasources';
import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';
import { many, ModelFactory, one, RelationDeclarations } from '@/relational/sqlite/models';
import { DefaultSqliteRepository } from '@/relational/sqlite/repositories';

/**
 * `access.through` on SQLite: the same chain as the Postgres suite (Option through Variant through Product), run
 * against libsql. The model registry is keyed by table name for the whole process, so these tables have their own names.
 */
const PRODUCT_TABLE = 'lite_through_product';
const VARIANT_TABLE = 'lite_through_variant';
const OPTION_TABLE = 'lite_through_option';

const productTable = sqliteTable(PRODUCT_TABLE, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  merchantId: text('merchant_id').notNull(),
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

let merchant: TNullable<string> | typeof ScopeFilters.UNRESTRICTED = 'm1';

const ProductBase = ModelFactory.defineEntity({
  table: productTable,
  relations: () => ({ variants: many(variantTable, { relationName: 'product' }) }),
});

@model({
  type: 'entity',
  settings: {
    access: {
      resolve: () => {
        if (merchant === ScopeFilters.UNRESTRICTED || merchant === null) {
          return merchant;
        }

        return { merchantId: merchant };
      },
    },
  },
})
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

/** drizzle runs the relational query API on the relations it is given with the tables. */
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
class ThroughSqliteDataSource extends BaseSqliteDataSource<{ url: string }, AnyType, {}, Client> {
  constructor(opts: { client: Client }) {
    super({
      name: ThroughSqliteDataSource.name,
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
    CREATE TABLE ${PRODUCT_TABLE} (id integer primary key autoincrement, merchant_id text not null, name text not null);
    CREATE TABLE ${VARIANT_TABLE} (id integer primary key autoincrement, product_id integer not null references ${PRODUCT_TABLE}(id), name text not null);
    CREATE TABLE ${OPTION_TABLE} (id integer primary key autoincrement, variant_id integer not null references ${VARIANT_TABLE}(id), name text not null);
  `);

  const dataSource = new ThroughSqliteDataSource({ client });

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

/** Products 1 and 2 belong to m1, product 3 to m2. Each product has a variant, each variant an option. */
beforeEach(async () => {
  merchant = 'm1';
  await client.executeMultiple(`
    DELETE FROM ${OPTION_TABLE};
    DELETE FROM ${VARIANT_TABLE};
    DELETE FROM ${PRODUCT_TABLE};
    DELETE FROM sqlite_sequence;
    INSERT INTO ${PRODUCT_TABLE} (merchant_id, name) VALUES ('m1', 'p1'), ('m1', 'p2'), ('m2', 'p3');
    INSERT INTO ${VARIANT_TABLE} (product_id, name) VALUES (1, 'v1'), (2, 'v2'), (3, 'v3');
    INSERT INTO ${OPTION_TABLE} (variant_id, name) VALUES (1, 'o1'), (2, 'o2'), (3, 'o3');
  `);
});

const names = (rows: Array<{ name: string }>): string[] => rows.map((row) => row.name).sort();

describe('access.through on SQLite', () => {
  test('a child is scoped by its parent, at one hop and at two', async () => {
    const listedVariants = await variants.find({ filter: {} });
    const listedOptions = await options.find({ filter: {} });
    const foreign = await variants.findById({ id: 3 });

    expect(names(listedVariants)).toEqual(['v1', 'v2']);
    expect(names(listedOptions)).toEqual(['o1', 'o2']);
    expect(foreign ?? null).toBeNull();
  });

  test('the parent scopes itself', async () => {
    const listed = await products.find({ filter: {} });

    expect(names(listed)).toEqual(['p1', 'p2']);
  });

  test('UNRESTRICTED and an unresolved scope come from the parent', async () => {
    merchant = ScopeFilters.UNRESTRICTED;
    const unrestricted = await options.find({ filter: {} });

    merchant = null;
    const unresolved = await options.find({ filter: {} });

    expect(names(unrestricted)).toEqual(['o1', 'o2', 'o3']);
    expect(unresolved).toEqual([]);
  });

  test('an included relation applies its own through scope', async () => {
    const scoped = await variants.find({
      filter: { include: [{ relation: 'options' }], order: ['id asc'] },
    });

    expect(scoped.map((row) => (row as AnyType).options.map((item: AnyType) => item.name))).toEqual(
      [['o1'], ['o2']],
    );
  });
});

/** The text of the error a write raised, or '' when it went through. */
const refusal = async (write: () => Promise<unknown>): Promise<string> => {
  try {
    await write();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  return '';
};

const variantNames = async (): Promise<string[]> => {
  const { rows } = await client.execute(`SELECT name FROM ${VARIANT_TABLE} ORDER BY id`);

  return rows.map((row) => String(row.name));
};

describe('a write to a through model on SQLite', () => {
  test('a create names a parent the caller may reach; a foreign and a missing parent give the same refusal', async () => {
    await variants.create({ data: { productId: 1, name: 'v-new' } });
    const foreign = await refusal(() => variants.create({ data: { productId: 3, name: 'x' } }));
    const missing = await refusal(() => variants.create({ data: { productId: 999, name: 'x' } }));
    const nameless = await refusal(() => variants.create({ data: { name: 'x' } as AnyType }));

    const result = await variantNames();
    expect(result).toEqual(['v1', 'v2', 'v3', 'v-new']);
    expect(foreign).toContain('write refused by the access scope');
    expect(missing).toBe(foreign);
    expect(nameless).toBe(foreign);
  });

  test('a batch with one foreign parent writes nothing', async () => {
    const message = await refusal(() =>
      variants.createAll({
        data: [
          { productId: 1, name: 'a' },
          { productId: 3, name: 'b' },
        ],
      }),
    );

    expect(message).toContain('write refused by the access scope');
    const result2 = await variantNames();
    expect(result2).toEqual(['v1', 'v2', 'v3']);
  });

  test('an update and a delete reach only the rows the parent scope allows', async () => {
    await variants.updateAll({
      where: {},
      data: { name: 'renamed' },
      options: { shouldReturn: false },
    });
    const afterUpdate = await variantNames();

    await client.execute(`DELETE FROM ${OPTION_TABLE}`);
    await variants.deleteAll({ where: {}, options: { shouldReturn: false, force: true } });
    const afterDelete = await variantNames();

    expect(afterUpdate).toEqual(['renamed', 'renamed', 'v3']);
    expect(afterDelete).toEqual(['v3']);
  });

  test('moving a row to a foreign parent is refused', async () => {
    const message = await refusal(() => variants.updateById({ id: 1, data: { productId: 3 } }));

    expect(message).toContain('write refused by the access scope');
  });

  test('SQLite cannot lock a row, so the check asks for no lock', async () => {
    const select = spyOn(variants['queryExecutor'], 'select');

    await variants.create({ data: { productId: 1, name: 'unlocked' } });

    expect(select.mock.calls.length).toBeGreaterThan(0);
    expect(select.mock.calls.every(([opts]) => opts.lock === undefined)).toBe(true);
    select.mockRestore();
  });
});
