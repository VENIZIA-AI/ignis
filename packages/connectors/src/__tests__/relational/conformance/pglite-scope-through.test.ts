import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { AnyType, TNullable, ValueOrPromise } from '@venizia/ignis-helpers/common';
import {
  datasource,
  model,
  ScopeFilters,
  ScopeThrough,
  type TScopeOperation,
} from '@venizia/ignis-kernel';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { RelationsFactory } from '@/relational/core/repositories/dialect/relations/create';
import { many, ModelFactory, one, RelationDeclarations } from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';

/**
 * `access.through`: a child with only a foreign key is scoped by the parent's own `access`. Option goes
 * through Variant, Variant through Product (two hops); only Product knows the merchant. Run against a
 * real Postgres engine (PGlite).
 */
const PRODUCT_TABLE = 'through_product';
const VARIANT_TABLE = 'through_variant';
const OPTION_TABLE = 'through_option';

const productTable = pgTable(PRODUCT_TABLE, {
  id: serial('id').primaryKey(),
  merchantId: text('merchant_id').notNull(),
  name: text('name').notNull(),
});

const variantTable = pgTable(VARIANT_TABLE, {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .notNull()
    .references((): AnyPgColumn => productTable.id),
  /** A stale copy of the tenant, deliberately wrong: the scope must never read it. */
  merchantId: text('merchant_id'),
  name: text('name').notNull(),
});

const optionTable = pgTable(OPTION_TABLE, {
  id: serial('id').primaryKey(),
  variantId: integer('variant_id')
    .notNull()
    .references((): AnyPgColumn => variantTable.id),
  name: text('name').notNull(),
});

/** What Product's resolver answers now; the children never see it directly. */
let merchant: TNullable<string> | typeof ScopeFilters.UNRESTRICTED = 'm1';
let operations: TScopeOperation[] = [];

const ProductBase = ModelFactory.defineEntity({
  table: productTable,
  relations: () => ({ variants: many(variantTable, { relationName: 'product' }) }),
});

@model({
  type: 'entity',
  settings: {
    access: {
      resolve: ({ operation }) => {
        operations.push(operation);

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
    query: { filter: { where: { name: { neq: 'o-hidden' } } } },
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

@datasource({ driver: PGliteDriver })
class ThroughDataSource extends BasePostgresDataSource<{}, AnyType, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: ThroughDataSource.name,
      config: {},
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

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }

  endDriver(): Promise<void> {
    return this.resolveDriver().end();
  }
}

let client: PGlite;
let dataSource: ThroughDataSource;
let products: DefaultCRUDRepository<typeof productTable>;
let variants: DefaultCRUDRepository<typeof variantTable>;
let options: DefaultCRUDRepository<typeof optionTable>;

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;
  await client.exec(`
    CREATE TABLE through_product (id serial primary key, merchant_id text not null, name text not null);
    CREATE TABLE through_variant (id serial primary key, product_id integer not null references through_product(id), merchant_id text, name text not null);
    CREATE TABLE through_option (id serial primary key, variant_id integer not null references through_variant(id), name text not null);
  `);

  dataSource = new ThroughDataSource({ client });
  products = new DefaultCRUDRepository<typeof productTable>(dataSource as AnyType, {
    entityClass: Product as AnyType,
  });
  variants = new DefaultCRUDRepository<typeof variantTable>(dataSource as AnyType, {
    entityClass: Variant as AnyType,
  });
  options = new DefaultCRUDRepository<typeof optionTable>(dataSource as AnyType, {
    entityClass: Option as AnyType,
  });
});

afterAll(async () => {
  await dataSource.endDriver();
});

/** Products 1 and 2 belong to m1, product 3 to m2. Each product has a variant, each variant an option. */
beforeEach(async () => {
  merchant = 'm1';
  operations = [];
  await client.exec(`
    TRUNCATE through_option, through_variant, through_product RESTART IDENTITY;
    INSERT INTO through_product (merchant_id, name) VALUES ('m1', 'p1'), ('m1', 'p2'), ('m2', 'p3');
    INSERT INTO through_variant (product_id, merchant_id, name) VALUES (1, 'm2', 'v1'), (2, 'm2', 'v2'), (3, 'm1', 'v3');
    INSERT INTO through_option (variant_id, name) VALUES (1, 'o1'), (2, 'o2'), (3, 'o3'), (1, 'o-hidden');
  `);
});

const names = (rows: Array<{ name: string }>): string[] => rows.map((row) => row.name).sort();

describe('a child is scoped by its parent', () => {
  test('find, findOne, findById and count see only the caller merchant', async () => {
    const listed = await variants.find({ filter: {} });
    const foreignByName = await variants.findOne({ filter: { where: { name: 'v3' } } });
    const foreignById = await variants.findById({ id: 3 });
    const ownById = await variants.findById({ id: 1 });
    const counted = await variants.count({ where: {} });

    expect(names(listed)).toEqual(['v1', 'v2']);
    expect(foreignByName ?? null).toBeNull();
    expect(foreignById ?? null).toBeNull();
    expect(ownById?.name).toBe('v1');
    expect(counted.count).toBe(2);
  });

  test('two hops: an option is scoped through its variant and that variant through its product', async () => {
    const ofFirstMerchant = await options.find({ filter: {} });
    expect(names(ofFirstMerchant)).toEqual(['o1', 'o2']);

    merchant = 'm2';
    const ofSecondMerchant = await options.find({ filter: {} });
    expect(names(ofSecondMerchant)).toEqual(['o3']);
  });

  test('the caller where is ANDed with the scope', async () => {
    const matching = await variants.find({ filter: { where: { name: 'v1' } } });
    expect(names(matching)).toEqual(['v1']);
    const outOfScope = await variants.find({ filter: { where: { name: 'v3' } } });
    expect(outOfScope).toEqual([]);
  });

  test('the parent resolver receives READ for a read, at every hop', async () => {
    await options.find({ filter: {} });

    expect(operations).toEqual(['read']);
  });

  test('UNRESTRICTED from the parent leaves the child unrestricted', async () => {
    merchant = ScopeFilters.UNRESTRICTED;

    const allVariants = await variants.find({ filter: {} });
    expect(names(allVariants)).toEqual(['v1', 'v2', 'v3']);
    const allOptions = await options.find({ filter: {} });
    expect(names(allOptions)).toEqual(['o1', 'o2', 'o3']);
  });

  test('a parent that cannot resolve a scope matches nothing under the default onMissing', async () => {
    merchant = null;

    const noVariants = await variants.find({ filter: {} });
    expect(noVariants).toEqual([]);
    const noOptions = await options.find({ filter: {} });
    expect(noOptions).toEqual([]);
  });

  test('a child whose foreign key is null is invisible', async () => {
    await client.exec('ALTER TABLE through_variant ALTER COLUMN product_id DROP NOT NULL');
    await client.exec(`INSERT INTO through_variant (product_id, name) VALUES (NULL, 'orphan')`);

    try {
      const visible = await variants.find({ filter: {} });
      expect(names(visible)).toEqual(['v1', 'v2']);
    } finally {
      await client.exec(`DELETE FROM through_variant WHERE name = 'orphan'`);
      await client.exec('ALTER TABLE through_variant ALTER COLUMN product_id SET NOT NULL');
    }
  });

  test('an included relation applies its own through scope', async () => {
    merchant = ScopeFilters.UNRESTRICTED;
    const all = await variants.find({ filter: { include: [{ relation: 'options' }] } });
    expect(all).toHaveLength(3);

    merchant = 'm1';
    const scoped = await variants.find({
      filter: { include: [{ relation: 'options' }], order: ['id asc'] },
    });

    expect(scoped.map((row) => (row as AnyType).options.map((o: AnyType) => o.name))).toEqual([
      ['o1'],
      ['o2'],
    ]);
  });
});

describe('what the scope is built from', () => {
  test('the SQL is qualified by table and parameterized, so the child columns cannot capture it', async () => {
    const settings = variants.getAccessSettings();

    if (!settings) {
      throw new Error('expected the Variant model to declare access');
    }

    const scope = variants['queryDialect'].resolveAccessScope({
      settings,
      schema: variantTable,
      operation: 'read',
    });
    const subquery = (scope as AnyType).productId.inSql.getSQL();
    const { sql, params } = new PgDialect().sqlToQuery(subquery);

    expect(sql).toBe(
      'select "through_product"."id" from "through_product" where "through_product"."merchant_id" = $1',
    );
    expect(params).toEqual(['m1']);
  });

  test('a child column named like the parent scope column does not change the scope', async () => {
    const listed = await variants.find({ filter: {} });

    expect(names(listed)).toEqual(['v1', 'v2']);
  });

  test('a skipped default filter never lifts the scope', async () => {
    const skipped = await options.find({ filter: {}, options: { shouldSkipDefaultFilter: true } });

    expect(names(skipped)).toEqual(['o-hidden', 'o1', 'o2']);
  });

  test('an include skips the default filter of its relation and keeps the scope', async () => {
    const [first] = await variants.find({
      filter: {
        where: { name: 'v1' },
        include: [{ relation: 'options', shouldSkipDefaultFilter: true }],
      },
    });

    expect(names((first as AnyType).options)).toEqual(['o-hidden', 'o1']);
  });

  test('children included from the parent are scoped through it', async () => {
    const listed = await products.find({
      filter: { include: [{ relation: 'variants' }], order: ['id asc'] },
    });

    expect(listed.map((row) => names((row as AnyType).variants))).toEqual([['v1'], ['v2']]);
  });
});

describe('a through model refuses every write in this release', () => {
  const WRITE_REFUSED = /access\.through/;

  test('create, update and delete are refused, and nothing is written', async () => {
    const attempts = [
      () => variants.create({ data: { productId: 1, name: 'new' } }),
      () => variants.updateById({ id: 1, data: { name: 'renamed' } }),
      () => variants.updateAll({ where: {}, data: { name: 'renamed' } }),
      () => variants.deleteById({ id: 1 }),
      () => variants.deleteAll({ where: {} }),
    ];

    for (const attempt of attempts) {
      let message = '';

      try {
        await attempt();
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }

      expect(message).toMatch(WRITE_REFUSED);
    }

    const { rows } = await client.query<{ name: string }>(
      'SELECT name FROM through_variant ORDER BY id',
    );
    expect(rows.map((row) => row.name)).toEqual(['v1', 'v2', 'v3']);
  });

  test('even an UNRESTRICTED parent does not let a write through', async () => {
    merchant = ScopeFilters.UNRESTRICTED;
    let message = '';

    try {
      await variants.create({ data: { productId: 1, name: 'new' } });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toMatch(WRITE_REFUSED);
  });
});

describe('products still scope themselves', () => {
  test('the parent model works as before', async () => {
    const visible = await products.find({ filter: {} });
    expect(names(visible)).toEqual(['p1', 'p2']);
  });
});
