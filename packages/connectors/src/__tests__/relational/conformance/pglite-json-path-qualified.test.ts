import type { TFilter, TWhere } from '@venizia/ignis-kernel';
import { datasource, model, RelationTypes } from '@venizia/ignis-kernel';
import { createRelations } from '@/relational/core/repositories/dialect/relations/create';
import type { TRelationConfig } from '@/relational/core/repositories/common';
import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/relational/core/models';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import type { IDatabaseExtraOptions } from '@/relational/postgres/repositories/common';
import { PostgresFilterBuilder } from '@/relational/postgres/repositories/dialect/filter';
import { PGlite } from '@electric-sql/pglite';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { integer, jsonb, PgDialect, pgTable, serial, text } from 'drizzle-orm/pg-core';

/**
 * A plain key renders through the Drizzle column, so Drizzle qualifies it with the table name - or
 * with the alias a relational query gives the table. A JSON-path key must be qualified the same
 * way: joined to a second table that also has a `metadata` column, a bare `"metadata"` is
 * ambiguous and Postgres refuses the query.
 *
 * The model name (`JsonPathOrder`) differs from the SQL table name on purpose: the `tableName` a
 * repository hands the builder is the model name, so qualifying by it names a table the SQL does
 * not have, and qualifying by the SQL table name breaks the aliased relational query.
 */
const ORDER_TABLE = 'json_path_qualified_order';
const SUPPLIER_TABLE = 'json_path_qualified_supplier';
const ORDER_MODEL_NAME = 'JsonPathOrder';
const QUALIFIED_METADATA = `"${ORDER_TABLE}"."metadata"`;

const orderTable = pgTable(ORDER_TABLE, {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  supplierId: integer('supplier_id').notNull(),
  metadata: jsonb('metadata'),
});

const supplierTable = pgTable(SUPPLIER_TABLE, {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  metadata: jsonb('metadata'),
});

const orderRelationsConfig: TRelationConfig[] = [
  {
    name: 'supplier',
    type: RelationTypes.ONE,
    schema: supplierTable,
    metadata: { fields: [orderTable.supplierId], references: [supplierTable.id] },
  },
];

const supplierRelationsConfig: TRelationConfig[] = [
  {
    name: 'orders',
    type: RelationTypes.MANY,
    schema: orderTable,
    metadata: { relationName: 'supplier' },
  },
];

@model({ type: 'entity' })
class JsonPathOrder extends BasePostgresEntity<typeof orderTable> {
  static override schema = orderTable;
  static override relations = (): TRelationConfig[] => orderRelationsConfig;
}

@model({ type: 'entity' })
class JsonPathSupplier extends BasePostgresEntity<typeof supplierTable> {
  static override schema = supplierTable;
  static override relations = (): TRelationConfig[] => supplierRelationsConfig;
}

@datasource({ driver: PGliteDriver })
class JsonPathDataSource extends BasePostgresDataSource<{}, {}, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: JsonPathDataSource.name,
      config: {},
      schema: {
        // Keyed by the registered model name, as auto-discovery keys a real application.
        [ORDER_MODEL_NAME]: orderTable,
        JsonPathSupplier: supplierTable,
        orderRelations: createRelations({ source: orderTable, relations: orderRelationsConfig })
          .relations,
        supplierRelations: createRelations({
          source: supplierTable,
          relations: supplierRelationsConfig,
        }).relations,
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

type TRepository<Schema extends TTableSchemaWithId> = DefaultCRUDRepository<
  Schema,
  TTableObject<Schema>,
  TTableInsert<Schema>,
  IDatabaseExtraOptions,
  JsonPathDataSource
>;

interface IOrderRow {
  id: number;
  supplier?: { id: number };
}

interface ISupplierRow {
  id: number;
  orders?: IOrderRow[];
}

const pgDialect = new PgDialect();
const builder = new PostgresFilterBuilder();

const compile = (expression: SQL | undefined): string =>
  expression ? pgDialect.sqlToQuery(expression).sql : '';

const renderWhere = (where: TWhere): string =>
  compile(builder.toWhere({ tableName: ORDER_MODEL_NAME, schema: orderTable, where }));

const renderOrderBy = (order: string[]): string[] =>
  builder
    .toOrderBy({ tableName: ORDER_MODEL_NAME, schema: orderTable, order })
    .map(entry => compile(entry));

/** Every `"metadata"` in the statement belongs to the order table - none is left bare. */
const expectOnlyQualifiedMetadata = (statement: string) => {
  expect(statement).toContain(QUALIFIED_METADATA);
  expect(statement.replaceAll(QUALIFIED_METADATA, '')).not.toContain('"metadata"');
};

let client: PGlite;
let dataSource: JsonPathDataSource;
let orderRepository: TRepository<typeof orderTable>;
let supplierRepository: TRepository<typeof supplierTable>;

/** Ids of the orders a join of both tables selects, or the database's refusal. */
const selectJoinedOrderIds = async (opts: {
  where?: TWhere;
  order?: string[];
}): Promise<{ ids: number[] } | { error: string }> => {
  const { where, order } = opts;
  const db = drizzle(client);

  try {
    const base = db
      .select({ id: orderTable.id })
      .from(orderTable)
      .innerJoin(supplierTable, eq(orderTable.supplierId, supplierTable.id))
      .$dynamic();

    const filtered = where
      ? base.where(builder.toWhere({ tableName: ORDER_MODEL_NAME, schema: orderTable, where }))
      : base;

    const ordered = order
      ? filtered.orderBy(
          ...builder.toOrderBy({ tableName: ORDER_MODEL_NAME, schema: orderTable, order }),
        )
      : filtered.orderBy(orderTable.id);

    const rows = await ordered;
    return { ids: rows.map(row => row.id) };
  } catch (error) {
    // Drizzle wraps the driver error; the database's own refusal is its cause.
    if (error instanceof Error && error.cause instanceof Error) {
      return { error: error.cause.message };
    }

    throw error;
  }
};

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;

  // The supplier `metadata` carries the same keys with different values, so a query that read the
  // wrong table's column would answer with different rows rather than the same ones by accident.
  await client.exec(`
    CREATE TABLE ${SUPPLIER_TABLE} (id serial primary key, name text not null, metadata jsonb);
    CREATE TABLE ${ORDER_TABLE} (id serial primary key, name text not null, supplier_id integer not null, metadata jsonb);
    INSERT INTO ${SUPPLIER_TABLE} (name, metadata) VALUES
      ('s1', '{"tier":"silver","priority":100}'),
      ('s2', '{"tier":"gold","priority":0}');
    INSERT INTO ${ORDER_TABLE} (name, supplier_id, metadata) VALUES
      ('o1', 1, '{"tier":"gold","priority":2}'),
      ('o2', 2, '{"tier":"gold","priority":10}'),
      ('o3', 1, '{"tier":"silver","priority":5}'),
      ('o4', 1, '{"tier":"gold","priority":7}');
  `);

  dataSource = new JsonPathDataSource({ client });
  orderRepository = new DefaultCRUDRepository<
    typeof orderTable,
    TTableObject<typeof orderTable>,
    TTableInsert<typeof orderTable>,
    IDatabaseExtraOptions,
    JsonPathDataSource
  >(dataSource, { entityClass: JsonPathOrder });
  supplierRepository = new DefaultCRUDRepository<
    typeof supplierTable,
    TTableObject<typeof supplierTable>,
    TTableInsert<typeof supplierTable>,
    IDatabaseExtraOptions,
    JsonPathDataSource
  >(dataSource, { entityClass: JsonPathSupplier });
});

afterAll(async () => {
  await dataSource.endDriver();
});

describe('Postgres - a JSON-path key renders a qualified column', () => {
  test('control: a plain key is qualified with the SQL table name, not the model name', () => {
    expect(renderWhere({ name: 'o1' })).toBe(`"${ORDER_TABLE}"."name" = $1`);
  });

  test('where, text extraction', () => {
    const statement = renderWhere({ 'metadata.tier': 'gold' });

    expect(statement).toContain(`${QUALIFIED_METADATA} #>> '{tier}'`);
    expectOnlyQualifiedMetadata(statement);
  });

  test('where, text extraction through an operator object', () => {
    const statement = renderWhere({ 'metadata.tier': { like: 'go%' } });

    expect(statement).toContain(`${QUALIFIED_METADATA} #>> '{tier}'`);
    expectOnlyQualifiedMetadata(statement);
  });

  test('where, numeric-cast branch of a bare value', () => {
    const statement = renderWhere({ 'metadata.priority': 5 });

    expect(statement).toContain('::numeric');
    expectOnlyQualifiedMetadata(statement);
  });

  test('where, numeric-cast branch of an operator', () => {
    const statement = renderWhere({ 'metadata.priority': { gt: 3 } });

    expect(statement).toContain('::numeric');
    expectOnlyQualifiedMetadata(statement);
  });

  test('where, numeric-cast branch under not', () => {
    const statement = renderWhere({ 'metadata.priority': { not: 5 } });

    expect(statement).toContain('::numeric');
    expect(statement.toLowerCase()).toContain('not');
    expectOnlyQualifiedMetadata(statement);
  });

  test('order by', () => {
    const [statement] = renderOrderBy(['metadata.priority DESC']);

    expect(statement).toContain(`${QUALIFIED_METADATA} #> '{priority}'`);
    expect(statement).toContain('DESC');
    expectOnlyQualifiedMetadata(statement);
  });

  test('a path segment still reaches the SQL only as the validated literal', () => {
    expect(() => renderWhere({ "metadata.a'b": 1 })).toThrow("Invalid JSON path component: 'a'b'");
  });
});

describe('Postgres - a JSON-path key runs on a join with a same-named column', () => {
  test('control: the join itself runs', async () => {
    expect(await selectJoinedOrderIds({})).toEqual({ ids: [1, 2, 3, 4] });
  });

  test('where on a JSON path, text extraction', async () => {
    expect(await selectJoinedOrderIds({ where: { 'metadata.tier': 'gold' } })).toEqual({
      ids: [1, 2, 4],
    });
  });

  test('where on a JSON path, numeric-cast branch', async () => {
    expect(await selectJoinedOrderIds({ where: { 'metadata.priority': { gt: 3 } } })).toEqual({
      ids: [2, 3, 4],
    });
  });

  test('order by a JSON path', async () => {
    expect(await selectJoinedOrderIds({ order: ['metadata.priority DESC'] })).toEqual({
      ids: [2, 4, 3, 1],
    });
  });
});

describe('Postgres - a JSON-path key in the relational query API (aliased tables)', () => {
  test('control: find with include, where and order on the root model', async () => {
    // A JSON-path key is not a property of the row type, so the filter is typed loosely.
    const filter: TFilter = {
      where: { 'metadata.tier': 'gold' },
      order: ['metadata.priority DESC'],
      include: [{ relation: 'supplier' }],
    };
    const rows = await orderRepository.find<IOrderRow>({ filter });

    expect(rows.map(row => ({ id: row.id, supplierId: row.supplier?.id }))).toEqual([
      { id: 2, supplierId: 2 },
      { id: 4, supplierId: 1 },
      { id: 1, supplierId: 1 },
    ]);
  });

  test('control: find with include, numeric-cast where on the root model', async () => {
    const filter: TFilter = {
      where: { 'metadata.priority': { gt: 3 } },
      order: ['id ASC'],
      include: [{ relation: 'supplier' }],
    };
    const rows = await orderRepository.find<IOrderRow>({ filter });

    expect(rows.map(row => row.id)).toEqual([2, 3, 4]);
  });

  test('control: a JSON-path where and order inside an include scope', async () => {
    const filter: TFilter = {
      order: ['id ASC'],
      include: [
        {
          relation: 'orders',
          scope: { where: { 'metadata.tier': 'gold' }, order: ['metadata.priority DESC'] },
        },
      ],
    };
    const rows = await supplierRepository.find<ISupplierRow>({ filter });

    expect(rows.map(row => ({ id: row.id, orders: row.orders?.map(order => order.id) }))).toEqual([
      { id: 1, orders: [4, 1] },
      { id: 2, orders: [2] },
    ]);
  });
});
