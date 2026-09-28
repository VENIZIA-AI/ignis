import type { TFilter, TWhere } from '@venizia/ignis-kernel';
import { datasource, model, RelationTypes } from '@venizia/ignis-kernel';
import { createRelations } from '@/relational/core/repositories/dialect/relations/create';
import type { TRelationConfig } from '@/relational/core/repositories/common';
import type { TTableInsert, TTableObject, TTableSchemaWithId } from '@/relational/core/models';
import { BaseSqliteDataSource } from '@/relational/sqlite/datasources';
import { LibSqlDriver } from '@/relational/sqlite/drivers/libsql';
import { BaseSqliteEntity } from '@/relational/sqlite/models';
import { DefaultSqliteRepository } from '@/relational/sqlite/repositories';
import type { ISqliteExtraOptions } from '@/relational/sqlite/repositories/common';
import { SqliteFilterBuilder } from '@/relational/sqlite/repositories/dialect/filter';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { SQL } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { integer, SQLiteSyncDialect, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * The SQLite side of the qualified JSON-path column: `json_extract` must name the column the way a
 * plain key does, or a join to a second table with a `metadata` column fails with `ambiguous column
 * name`. The model name differs from the SQL table name for the same reason as the Postgres suite.
 */
const ORDER_TABLE = 'json_path_qualified_sqlite_order';
const SUPPLIER_TABLE = 'json_path_qualified_sqlite_supplier';
const ORDER_MODEL_NAME = 'JsonPathSqliteOrder';
const QUALIFIED_METADATA = `"${ORDER_TABLE}"."metadata"`;

const orderTable = sqliteTable(ORDER_TABLE, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  supplierId: integer('supplier_id').notNull(),
  metadata: text('metadata', { mode: 'json' }),
});

const supplierTable = sqliteTable(SUPPLIER_TABLE, {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  metadata: text('metadata', { mode: 'json' }),
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
class JsonPathSqliteOrder extends BaseSqliteEntity<typeof orderTable> {
  static override schema = orderTable;
  static override relations = (): TRelationConfig[] => orderRelationsConfig;
}

@model({ type: 'entity' })
class JsonPathSqliteSupplier extends BaseSqliteEntity<typeof supplierTable> {
  static override schema = supplierTable;
  static override relations = (): TRelationConfig[] => supplierRelationsConfig;
}

@datasource({ driver: LibSqlDriver })
class JsonPathSqliteDataSource extends BaseSqliteDataSource<{ url: string }, {}, {}, Client> {
  constructor(opts: { client: Client }) {
    super({
      name: JsonPathSqliteDataSource.name,
      config: { url: ':memory:' },
      schema: {
        // Keyed by the registered model name, as auto-discovery keys a real application.
        [ORDER_MODEL_NAME]: orderTable,
        JsonPathSqliteSupplier: supplierTable,
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
}

type TRepository<Schema extends TTableSchemaWithId> = DefaultSqliteRepository<
  Schema,
  TTableObject<Schema>,
  TTableInsert<Schema>,
  ISqliteExtraOptions,
  JsonPathSqliteDataSource
>;

interface IOrderRow {
  id: number;
  supplier?: { id: number };
}

interface ISupplierRow {
  id: number;
  orders?: IOrderRow[];
}

const sqliteDialect = new SQLiteSyncDialect();
const builder = new SqliteFilterBuilder();

const compile = (expression: SQL | undefined): string =>
  expression ? sqliteDialect.sqlToQuery(expression).sql : '';

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

let client: Client;
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
  client = createClient({ url: ':memory:' });

  // The supplier `metadata` carries the same keys with different values, so a query that read the
  // wrong table's column would answer with different rows rather than the same ones by accident.
  await client.executeMultiple(`
    CREATE TABLE ${SUPPLIER_TABLE} (id integer primary key autoincrement, name text not null, metadata text);
    CREATE TABLE ${ORDER_TABLE} (id integer primary key autoincrement, name text not null, supplier_id integer not null, metadata text);
    INSERT INTO ${SUPPLIER_TABLE} (name, metadata) VALUES
      ('s1', '{"tier":"silver","priority":100}'),
      ('s2', '{"tier":"gold","priority":0}');
    INSERT INTO ${ORDER_TABLE} (name, supplier_id, metadata) VALUES
      ('o1', 1, '{"tier":"gold","priority":2}'),
      ('o2', 2, '{"tier":"gold","priority":10}'),
      ('o3', 1, '{"tier":"silver","priority":5}'),
      ('o4', 1, '{"tier":"gold","priority":7}');
  `);

  const dataSource = new JsonPathSqliteDataSource({ client });
  orderRepository = new DefaultSqliteRepository<
    typeof orderTable,
    TTableObject<typeof orderTable>,
    TTableInsert<typeof orderTable>,
    ISqliteExtraOptions,
    JsonPathSqliteDataSource
  >(dataSource, { entityClass: JsonPathSqliteOrder });
  supplierRepository = new DefaultSqliteRepository<
    typeof supplierTable,
    TTableObject<typeof supplierTable>,
    TTableInsert<typeof supplierTable>,
    ISqliteExtraOptions,
    JsonPathSqliteDataSource
  >(dataSource, { entityClass: JsonPathSqliteSupplier });
});

afterAll(() => {
  client.close();
});

describe('SQLite - a JSON-path key renders a qualified column', () => {
  test('control: a plain key is qualified with the SQL table name, not the model name', () => {
    expect(renderWhere({ name: 'o1' })).toBe(`"${ORDER_TABLE}"."name" = ?`);
  });

  test('where, bare value', () => {
    const statement = renderWhere({ 'metadata.tier': 'gold' });

    expect(statement).toContain(`json_extract(${QUALIFIED_METADATA}, '$."tier"')`);
    expectOnlyQualifiedMetadata(statement);
  });

  test('where, operator object', () => {
    const statement = renderWhere({ 'metadata.priority': { gt: 3 } });

    expect(statement).toContain(`json_extract(${QUALIFIED_METADATA}, '$."priority"')`);
    expectOnlyQualifiedMetadata(statement);
  });

  test('where, the coalesce of both readings of a numeric component', () => {
    const statement = renderWhere({ 'metadata.counts.0': { gt: 5 } });

    expect(statement).toContain('coalesce(');
    expect(statement).toContain(`json_extract(${QUALIFIED_METADATA}, '$."counts"[0]')`);
    expect(statement).toContain(`json_extract(${QUALIFIED_METADATA}, '$."counts"."0"')`);
    expectOnlyQualifiedMetadata(statement);
  });

  test('order by', () => {
    const [statement] = renderOrderBy(['metadata.priority DESC']);

    expect(statement).toContain(`json_extract(${QUALIFIED_METADATA}, '$."priority"')`);
    expect(statement).toContain('DESC');
    expectOnlyQualifiedMetadata(statement);
  });
});

describe('SQLite - a JSON-path key runs on a join with a same-named column', () => {
  test('control: the join itself runs', async () => {
    expect(await selectJoinedOrderIds({})).toEqual({ ids: [1, 2, 3, 4] });
  });

  test('where on a JSON path, bare value', async () => {
    expect(await selectJoinedOrderIds({ where: { 'metadata.tier': 'gold' } })).toEqual({
      ids: [1, 2, 4],
    });
  });

  test('where on a JSON path, operator object', async () => {
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

describe('SQLite - a JSON-path key in the relational query API (aliased tables)', () => {
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
