import type { TWhere } from '@venizia/ignis-kernel';
import { datasource, model } from '@venizia/ignis-kernel';
import type { TTableInsert, TTableObject } from '@/relational/core/models';
import { BasePostgresDataSource } from '@/relational/postgres/datasources';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { DefaultCRUDRepository } from '@/relational/postgres/repositories';
import type { IDatabaseExtraOptions } from '@/relational/postgres/repositories/common';
import { PostgresFilterBuilder } from '@/relational/postgres/repositories/dialect/filter';
import { PGlite } from '@electric-sql/pglite';
import type { ValueOrPromise } from '@venizia/ignis-helpers/common';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from 'drizzle-orm';
import { integer, PgDialect, pgTable, serial, text } from 'drizzle-orm/pg-core';

/**
 * `inSql`/`ninSql` restrict a column by a caller-built subquery, in every repository read and inside
 * nested groups. Only a Drizzle SQL object is accepted: a string - all a request body can carry -
 * is refused with a 400.
 */
const ORDER_TABLE = 'where_sql_order';
const TAG_TABLE = 'where_sql_tag';

const orderTable = pgTable(ORDER_TABLE, {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
});

const tagTable = pgTable(TAG_TABLE, {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull(),
  label: text('label').notNull(),
});

@model({ type: 'entity' })
class WhereSqlOrder extends BasePostgresEntity<typeof orderTable> {
  static override schema = orderTable;
}

@datasource({ driver: PGliteDriver })
class WhereSqlDataSource extends BasePostgresDataSource<{}, {}, {}, PGlite> {
  constructor(opts: { client: PGlite }) {
    super({
      name: WhereSqlDataSource.name,
      config: {},
      schema: { WhereSqlOrder: orderTable, WhereSqlTag: tagTable },
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

type TOrderRepository = DefaultCRUDRepository<
  typeof orderTable,
  TTableObject<typeof orderTable>,
  TTableInsert<typeof orderTable>,
  IDatabaseExtraOptions,
  WhereSqlDataSource
>;

let client: PGlite;
let dataSource: WhereSqlDataSource;
let orderRepository: TOrderRepository;

const taggedWith = (label: string) =>
  sql`SELECT ${tagTable.orderId} FROM ${tagTable} WHERE ${tagTable.label} = ${label}`;

const ids = (rows: Array<{ id: number }>) => rows.map(row => row.id).sort((a, b) => a - b);

beforeAll(async () => {
  client = new PGlite();
  await client.waitReady;
  await client.exec(`
    CREATE TABLE ${ORDER_TABLE} (id serial primary key, name text not null);
    CREATE TABLE ${TAG_TABLE} (id serial primary key, order_id integer not null, label text not null);
    INSERT INTO ${ORDER_TABLE} (name) VALUES ('o1'), ('o2'), ('o3'), ('o4');
    INSERT INTO ${TAG_TABLE} (order_id, label) VALUES (1, 'red'), (2, 'red'), (3, 'blue');
  `);

  dataSource = new WhereSqlDataSource({ client });
  orderRepository = new DefaultCRUDRepository<
    typeof orderTable,
    TTableObject<typeof orderTable>,
    TTableInsert<typeof orderTable>,
    IDatabaseExtraOptions,
    WhereSqlDataSource
  >(dataSource, { entityClass: WhereSqlOrder });
});

afterAll(async () => {
  await dataSource.endDriver();
});

describe('Postgres - inSql and ninSql', () => {
  test('find: inSql keeps the rows the subquery returns', async () => {
    const rows = await orderRepository.find({
      filter: { where: { id: { inSql: taggedWith('red') } } },
    });
    expect(ids(rows)).toEqual([1, 2]);
  });

  test('find: ninSql drops them', async () => {
    const rows = await orderRepository.find({
      filter: { where: { id: { ninSql: taggedWith('red') } } },
    });
    expect(ids(rows)).toEqual([3, 4]);
  });

  test('findOne and count agree with find', async () => {
    const where: TWhere = { id: { inSql: taggedWith('blue') } };
    const one = await orderRepository.findOne({ filter: { where } });
    const { count } = await orderRepository.count({ where });
    expect(one?.id).toBe(3);
    expect(count).toBe(1);
  });

  test('an empty subquery matches nothing, and its ninSql matches everything', async () => {
    const inNone = await orderRepository.find({
      filter: { where: { id: { inSql: taggedWith('green') } } },
    });
    const ninNone = await orderRepository.find({
      filter: { where: { id: { ninSql: taggedWith('green') } } },
    });
    expect(inNone).toEqual([]);
    expect(ids(ninNone)).toEqual([1, 2, 3, 4]);
  });

  test('inside or and and groups, beside other keys', async () => {
    const rows = await orderRepository.find({
      filter: {
        where: {
          or: [
            { id: { inSql: taggedWith('blue') } },
            { and: [{ id: { inSql: taggedWith('red') } }, { name: 'o2' }] },
          ],
        },
      },
    });
    expect(ids(rows)).toEqual([2, 3]);
  });

  test('the subquery binds its values as parameters', () => {
    const builder = new PostgresFilterBuilder();
    const where = builder.toWhere({
      tableName: 'WhereSqlOrder',
      schema: orderTable,
      where: { id: { inSql: taggedWith("x' OR '1'='1") } },
    });
    const query = new PgDialect().sqlToQuery(where!);
    expect(query.sql).toContain(`"${ORDER_TABLE}"."id" in (SELECT`);
    expect(query.params).toContain("x' OR '1'='1");
  });

  test('a string is refused with a 400, not run as SQL', () => {
    const builder = new PostgresFilterBuilder();
    const where: TWhere = { id: { inSql: 'SELECT 1' } };
    expect(() =>
      builder.toWhere({ tableName: 'WhereSqlOrder', schema: orderTable, where }),
    ).toThrow(/inSql/);
    try {
      builder.toWhere({ tableName: 'WhereSqlOrder', schema: orderTable, where });
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 400 });
    }
  });
});
