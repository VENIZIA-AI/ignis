import type { TScopeResolution } from './scope-resolution';
import { PGlite } from '@electric-sql/pglite';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { datasource, model, ScopeThrough, type TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import { afterAll, beforeAll } from 'bun:test';
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { RelationsFactory } from '@/relational/core/repositories/dialect/relations/create';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { many, ModelFactory, one, RelationDeclarations } from '@/relational/postgres/models';
import { PGliteDefaultRepository } from './pglite-repositories';
import {
  defineScopeCompositionCases,
  ROWS,
  type IItemInsert,
  type IItemRecord,
  type INoteInsert,
  type INoteRecord,
  type IProductInsert,
  type IProductRecord,
  type IVariantInsert,
  type IVariantRecord,
} from './scope-composition-cases';
import type { TSameShape } from './table-shape';

/** The access scope is ANDed with the caller's where on PGlite; the cases are shared with libsql. */
const PRODUCT_TABLE = 'comp_product';
const VARIANT_TABLE = 'comp_variant';
const NOTE_TABLE = 'comp_note';
const ITEM_TABLE = 'comp_item';

const productTable = pgTable(PRODUCT_TABLE, {
  id: serial('id').primaryKey(),
  merchantId: text('merchant_id'),
  region: text('region').notNull(),
  name: text('name').notNull(),
});

const variantTable = pgTable(VARIANT_TABLE, {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .notNull()
    .references((): AnyPgColumn => productTable.id),
  name: text('name').notNull(),
});

const noteTable = pgTable(NOTE_TABLE, {
  id: serial('id').primaryKey(),
  productId: integer('product_id')
    .notNull()
    .references((): AnyPgColumn => productTable.id),
  merchantId: text('merchant_id'),
  name: text('name').notNull(),
});

const itemTable = pgTable(ITEM_TABLE, {
  id: serial('id').primaryKey(),
  merchantId: text('merchant_id'),
  status: text('status').notNull(),
  name: text('name').notNull(),
});

/** The cases type rows and data on these records and inserts; this fails to compile if a table drifts from them. */
export const tableShapes: [
  TSameShape<typeof productTable.$inferSelect, IProductRecord>,
  TSameShape<typeof productTable.$inferInsert, IProductInsert>,
  TSameShape<typeof variantTable.$inferSelect, IVariantRecord>,
  TSameShape<typeof variantTable.$inferInsert, IVariantInsert>,
  TSameShape<typeof noteTable.$inferSelect, INoteRecord>,
  TSameShape<typeof noteTable.$inferInsert, INoteInsert>,
  TSameShape<typeof itemTable.$inferSelect, IItemRecord>,
  TSameShape<typeof itemTable.$inferInsert, IItemInsert>,
] = [true, true, true, true, true, true, true, true];

let itemScope: TScopeResolution = {};
let productScope: TScopeResolution = {};
let noteScope: TScopeResolution = {};

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

@datasource({ driver: PGliteDriver })
class CompositionDataSource extends BasePostgresDataSource<{}, TAnyDataSourceSchema, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: CompositionDataSource.name,
      config: {},
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

  override getConnectionString(): ValueOrPromise<string> {
    return 'pglite://memory';
  }

  endDriver(): Promise<void> {
    return this.resolveDriver().end();
  }
}

let client: PGlite;
let dataSource: CompositionDataSource;
let products: PGliteDefaultRepository<typeof productTable>;
let variants: PGliteDefaultRepository<typeof variantTable>;
let notes: PGliteDefaultRepository<typeof noteTable>;
let items: PGliteDefaultRepository<typeof itemTable>;

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;
  await client.exec(`
    CREATE TABLE ${PRODUCT_TABLE} (id serial primary key, merchant_id text, region text not null, name text not null);
    CREATE TABLE ${VARIANT_TABLE} (id serial primary key, product_id integer not null references ${PRODUCT_TABLE}(id) on delete cascade, name text not null);
    CREATE TABLE ${ITEM_TABLE} (id serial primary key, merchant_id text, status text not null, name text not null);
    CREATE TABLE ${NOTE_TABLE} (id serial primary key, product_id integer not null references ${PRODUCT_TABLE}(id) on delete cascade, merchant_id text, name text not null);
  `);

  dataSource = new CompositionDataSource({ client });
  products = new PGliteDefaultRepository<typeof productTable>(dataSource, {
    entityClass: Product,
  });
  variants = new PGliteDefaultRepository<typeof variantTable>(dataSource, {
    entityClass: Variant,
  });
  notes = new PGliteDefaultRepository<typeof noteTable>(dataSource, {
    entityClass: Note,
  });
  items = new PGliteDefaultRepository<typeof itemTable>(dataSource, {
    entityClass: Item,
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
    const result = await client.query<{ name: string }>(
      `SELECT name FROM ${ITEM_TABLE} ORDER BY id`,
    );

    return result.rows.map((row) => row.name);
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
    await client.exec(
      `TRUNCATE ${NOTE_TABLE}, ${VARIANT_TABLE}, ${PRODUCT_TABLE}, ${ITEM_TABLE} RESTART IDENTITY`,
    );
    await client.exec(
      `INSERT INTO ${ITEM_TABLE} (merchant_id, status, name) VALUES ('m1','live','a'), ('m1','archived','b'), ('m2','live','c'), ('m2','archived','d');`,
    );
    await client.exec(
      ROWS.map(
        (row) =>
          `INSERT INTO ${PRODUCT_TABLE} (merchant_id, region, name) VALUES (${sqlText(row.merchantId)}, '${row.region}', '${row.name}');`,
      ).join('\n'),
    );
    // Two variants under each of the first four products (v1..v8), one note per product, in its merchant.
    await client.exec(
      [1, 2, 3, 4]
        .map(
          (id) =>
            `INSERT INTO ${VARIANT_TABLE} (product_id, name) VALUES (${id}, 'v${id * 2 - 1}'), (${id}, 'v${id * 2}');`,
        )
        .join('\n'),
    );
    await client.exec(
      ROWS.map(
        (row, index) =>
          `INSERT INTO ${NOTE_TABLE} (product_id, merchant_id, name) VALUES (${index + 1}, ${sqlText(row.merchantId)}, 'n${index + 1}');`,
      ).join('\n'),
    );
  },
  productNames: async () => {
    const result = await client.query<{ name: string }>(
      `SELECT name FROM ${PRODUCT_TABLE} ORDER BY id`,
    );

    return result.rows.map((row) => row.name);
  },
  renamedNames: async () => {
    const result = await client.query<{ name: string }>(
      `SELECT name FROM ${PRODUCT_TABLE} WHERE name = 'renamed'`,
    );

    return result.rows.map((row) => row.name);
  },
}));
