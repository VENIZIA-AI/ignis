import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import type { AnyType, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { datasource, model, ScopeThrough } from '@venizia/ignis-kernel';
import { afterAll, beforeAll } from 'bun:test';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { RelationsFactory } from '@/relational/core/repositories/dialect/relations/create';
import { BaseSqliteDataSource } from '@/relational/sqlite/datasources';
import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';
import { many, ModelFactory, one, RelationDeclarations } from '@/relational/sqlite/models';
import { DefaultSqliteRepository } from '@/relational/sqlite/repositories';
import { defineScopeCompositionCases, ROWS } from './scope-composition-cases';

/** The access scope is ANDed with the caller's where on libsql; the cases are shared with libsql. */
const PRODUCT_TABLE = 'comp_product';
const VARIANT_TABLE = 'comp_variant';
const NOTE_TABLE = 'comp_note';
const ITEM_TABLE = 'comp_item';

const productTable = sqliteTable(PRODUCT_TABLE, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  merchantId: text('merchant_id'),
  region: text('region').notNull(),
  name: text('name').notNull(),
});

const variantTable = sqliteTable(VARIANT_TABLE, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id')
    .notNull()
    .references(() => productTable.id),
  name: text('name').notNull(),
});

const noteTable = sqliteTable(NOTE_TABLE, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id')
    .notNull()
    .references(() => productTable.id),
  merchantId: text('merchant_id'),
  name: text('name').notNull(),
});

const itemTable = sqliteTable(ITEM_TABLE, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  merchantId: text('merchant_id'),
  status: text('status').notNull(),
  name: text('name').notNull(),
});

let itemScope: AnyType = {};
let productScope: AnyType = {};
let noteScope: AnyType = {};

const ProductBase = ModelFactory.defineEntity({
  table: productTable,
  relations: () => ({
    variants: many(variantTable, { relationName: 'product' }),
    notes: many(noteTable, { relationName: 'product' }),
  }),
});

@model({ type: 'entity', settings: { access: { resolve: () => productScope } } })
class Product extends ProductBase {}

const VariantBase = ModelFactory.defineEntity({
  table: variantTable,
  relations: () => ({ product: one(productTable) }),
});

@model({
  type: 'entity',
  settings: {
    access: { through: ScopeThrough.of({ entity: VariantBase, relation: 'product' }) },
  },
})
class Variant extends VariantBase {}

const NoteBase = ModelFactory.defineEntity({
  table: noteTable,
  relations: () => ({ product: one(productTable) }),
});

@model({
  type: 'entity',
  settings: {
    access: { resolve: () => noteScope },
    query: { filter: { where: { name: 'n1' } } },
  },
})
class Note extends NoteBase {}

const ItemBase = ModelFactory.defineEntity({ table: itemTable });

@model({
  type: 'entity',
  settings: {
    access: { resolve: () => itemScope },
    query: { filter: { where: { status: 'live' } } },
  },
})
class Item extends ItemBase {}

const relationsOf = (opts: {
  source: typeof productTable | typeof variantTable | typeof noteTable;
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
class CompositionDataSource extends BaseSqliteDataSource<{ url: string }, AnyType, {}, Client> {
  constructor(opts: { client: Client }) {
    super({
      name: CompositionDataSource.name,
      config: { url: ':memory:' },
      schema: {
        [PRODUCT_TABLE]: productTable,
        [VARIANT_TABLE]: variantTable,
        [NOTE_TABLE]: noteTable,
        [ITEM_TABLE]: itemTable,
        productRelations: relationsOf({ source: productTable, entity: ProductBase }),
        variantRelations: relationsOf({ source: variantTable, entity: VariantBase }),
        noteRelations: relationsOf({ source: noteTable, entity: NoteBase }),
      },
    });

    this.client = opts.client;
  }

  override configure(): ValueOrPromise<void> {}

  endDriver(): Promise<void> {
    return this.resolveDriver().end();
  }
}

let client: Client;
let dataSource: CompositionDataSource;
let products: DefaultSqliteRepository<typeof productTable>;
let variants: DefaultSqliteRepository<typeof variantTable>;
let notes: DefaultSqliteRepository<typeof noteTable>;
let items: DefaultSqliteRepository<typeof itemTable>;

beforeAll(async () => {
  client = createClient({ url: ':memory:' });
  await client.executeMultiple(`
    CREATE TABLE ${PRODUCT_TABLE} (id integer primary key autoincrement, merchant_id text, region text not null, name text not null);
    CREATE TABLE ${VARIANT_TABLE} (id integer primary key autoincrement, product_id integer not null references ${PRODUCT_TABLE}(id) on delete cascade, name text not null);
    CREATE TABLE ${ITEM_TABLE} (id integer primary key autoincrement, merchant_id text, status text not null, name text not null);
    CREATE TABLE ${NOTE_TABLE} (id integer primary key autoincrement, product_id integer not null references ${PRODUCT_TABLE}(id) on delete cascade, merchant_id text, name text not null);
  `);

  dataSource = new CompositionDataSource({ client });
  products = new DefaultSqliteRepository<typeof productTable>(dataSource as AnyType, {
    entityClass: Product as AnyType,
  });
  variants = new DefaultSqliteRepository<typeof variantTable>(dataSource as AnyType, {
    entityClass: Variant as AnyType,
  });
  notes = new DefaultSqliteRepository<typeof noteTable>(dataSource as AnyType, {
    entityClass: Note as AnyType,
  });
  items = new DefaultSqliteRepository<typeof itemTable>(dataSource as AnyType, {
    entityClass: Item as AnyType,
  });
}, 30_000);

afterAll(async () => {
  await dataSource.endDriver();
});

const sqlText = (value: string | null): string => (value === null ? 'null' : `'${value}'`);

defineScopeCompositionCases(() => ({
  products,
  notes,
  variants,
  items,
  itemNames: async () => {
    const result = await client.execute(`SELECT name FROM ${ITEM_TABLE} ORDER BY id`);

    return result.rows.map((row) => String(row.name));
  },
  setItemScope: (scope) => {
    itemScope = scope;
  },
  setProductScope: (scope) => {
    productScope = scope;
  },
  setNoteScope: (scope) => {
    noteScope = scope;
  },
  reset: async () => {
    await client.executeMultiple(
      `DELETE FROM ${NOTE_TABLE}; DELETE FROM ${VARIANT_TABLE}; DELETE FROM ${PRODUCT_TABLE}; DELETE FROM ${ITEM_TABLE}; DELETE FROM sqlite_sequence WHERE name IN ('${NOTE_TABLE}', '${VARIANT_TABLE}', '${PRODUCT_TABLE}', '${ITEM_TABLE}');`,
    );
    await client.executeMultiple(
      `INSERT INTO ${ITEM_TABLE} (merchant_id, status, name) VALUES ('m1','live','a'), ('m1','archived','b'), ('m2','live','c'), ('m2','archived','d');`,
    );
    await client.executeMultiple(
      ROWS.map(
        (row) =>
          `INSERT INTO ${PRODUCT_TABLE} (merchant_id, region, name) VALUES (${sqlText(row.merchantId)}, '${row.region}', '${row.name}');`,
      ).join('\n'),
    );
    // Two variants under each of the first four products (v1..v8), one note per product, in its merchant.
    await client.executeMultiple(
      [1, 2, 3, 4]
        .map(
          (id) =>
            `INSERT INTO ${VARIANT_TABLE} (product_id, name) VALUES (${id}, 'v${id * 2 - 1}'), (${id}, 'v${id * 2}');`,
        )
        .join('\n'),
    );
    await client.executeMultiple(
      ROWS.map(
        (row, index) =>
          `INSERT INTO ${NOTE_TABLE} (product_id, merchant_id, name) VALUES (${index + 1}, ${sqlText(row.merchantId)}, 'n${index + 1}');`,
      ).join('\n'),
    );
  },
  productNames: async () => {
    const result = await client.execute(`SELECT name FROM ${PRODUCT_TABLE} ORDER BY id`);

    return result.rows.map((row) => String(row.name));
  },
  renamedNames: async () => {
    const result = await client.execute(`SELECT name FROM ${PRODUCT_TABLE} WHERE name = 'renamed'`);

    return result.rows.map((row) => String(row.name));
  },
}));
