import { PGlite } from '@electric-sql/pglite';
import type { Client } from '@libsql/client';
import { createClient } from '@libsql/client';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import type { ApplicationError } from '@venizia/ignis-helpers/core';
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import type { AnyColumn, SQL, SQLWrapper } from 'drizzle-orm';
import { eq, sql } from 'drizzle-orm';
import { drizzle as drizzleLibsql } from 'drizzle-orm/libsql';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import {
  integer as pgInteger,
  jsonb,
  PgDialect,
  pgTable,
  serial,
  text as pgText,
} from 'drizzle-orm/pg-core';
import {
  integer as sqliteInteger,
  SQLiteSyncDialect,
  sqliteTable,
  text as sqliteText,
} from 'drizzle-orm/sqlite-core';
import { PGliteDriver } from '@/relational/postgres/drivers/pglite';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';
import { SqliteQueryDialect } from '@/relational/sqlite/repositories/dialect/query-dialect';

/**
 * `toOrderBy` reads each entry through `parseOrderEntry` and resolves its key against an optional
 * `expressions` map before the JSON path and the schema column. The runtime blocks sort a JOIN on
 * PGlite and libsql, because a joined column and a computed `COALESCE` are exactly what the schema
 * columns cannot name.
 */

const ITEM_TABLE = 'order_entries_item';

const pgGroups = pgTable('order_entries_group', {
  id: serial('id').primaryKey(),
  label: pgText('label').notNull(),
});

const pgItems = pgTable(ITEM_TABLE, {
  id: serial('id').primaryKey(),
  name: pgText('name').notNull(),
  nickname: pgText('nickname'),
  groupId: pgInteger('group_id').notNull(),
  score: pgInteger('score').notNull(),
  metadata: jsonb('metadata'),
});

const sqliteGroups = sqliteTable('order_entries_group', {
  id: sqliteInteger('id').primaryKey(),
  label: sqliteText('label').notNull(),
});

const sqliteItems = sqliteTable(ITEM_TABLE, {
  id: sqliteInteger('id').primaryKey(),
  name: sqliteText('name').notNull(),
  nickname: sqliteText('nickname'),
  groupId: sqliteInteger('group_id').notNull(),
  score: sqliteInteger('score').notNull(),
  metadata: sqliteText('metadata', { mode: 'json' }),
});

const pgExpressions = {
  groupLabel: pgGroups.label,
  displayName: sql`COALESCE(${pgItems.nickname}, ${pgItems.name})`,
};

const sqliteExpressions = {
  groupLabel: sqliteGroups.label,
  displayName: sql`COALESCE(${sqliteItems.nickname}, ${sqliteItems.name})`,
};

/**
 * Display names (COALESCE of nickname, name): 1 delta, 2 zulu, 3 charlie, 4 charlie, 5 alpha.
 * Items 3 and 4 tie on group AND display name, so only the id tie-breaker orders them. Inserted
 * in descending id order so an engine returning rows as stored does not hand the tie-breaker a
 * free pass.
 */
const SEED_SQL = `
  INSERT INTO order_entries_group (id, label) VALUES (1, 'alpha'), (2, 'beta');
  INSERT INTO ${ITEM_TABLE} (id, name, nickname, group_id, score, metadata) VALUES
    (5, 'alpha', NULL, 2, 10, '{"rank":1}'),
    (4, 'echo', 'charlie', 1, 30, '{"rank":2}'),
    (3, 'charlie', NULL, 1, 20, '{"rank":2}'),
    (2, 'bravo', 'zulu', 1, 20, '{"rank":1}'),
    (1, 'delta', NULL, 2, 10, '{"rank":3}');
`;

const pgDialect = new PgDialect();
const postgresQueryDialect = new PostgresQueryDialect();

const compilePostgres = (entries: SQL[]): string[] =>
  entries.map(entry => pgDialect.sqlToQuery(entry).sql);

const captureError = (task: () => unknown): ApplicationError => {
  try {
    task();
  } catch (error) {
    if (isApplicationError(error)) {
      return error;
    }

    throw error;
  }

  throw new Error('expected the call to throw, but it returned normally');
};

const toPostgresOrderBy = (order: string[]): SQL[] =>
  postgresQueryDialect.toOrderBy({ tableName: ITEM_TABLE, schema: pgItems, order });

const toPostgresOrderByWithExpressions = (
  order: string[],
  expressions: Readonly<Record<string, AnyColumn | SQLWrapper>>,
): SQL[] =>
  postgresQueryDialect.toOrderBy({ tableName: ITEM_TABLE, schema: pgItems, order, expressions });

const ID_TIE_BREAKER = `"${ITEM_TABLE}"."id" asc`;

describe('toOrderBy - order entries', () => {
  test('an entry with more than two tokens is a 400 naming the entry, not a silent truncation', () => {
    const error = captureError(() => toPostgresOrderBy(['name DESC NULLS LAST']));

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('name DESC NULLS LAST');
  });

  test('an invalid direction is a 400 naming the whole entry', () => {
    const error = captureError(() => toPostgresOrderBy(['name sideways']));

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('name sideways');
  });

  test('a line break in the entry reaches the message escaped, on one line', () => {
    const entry = 'name\nFAKE LOG LINE desc';
    const error = captureError(() => toPostgresOrderBy([entry]));

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain(JSON.stringify(entry));
    expect(error.message).not.toContain('\n');
  });

  test('an unknown column is still a 400 naming the key', () => {
    const error = captureError(() => toPostgresOrderBy(['missing DESC']));

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain("Column NOT FOUND | key: 'missing'");
  });

  test('a list that never names id ends in exactly one id ASC tie-breaker', () => {
    expect(compilePostgres(toPostgresOrderBy(['score DESC', 'name ASC']))).toEqual([
      `"${ITEM_TABLE}"."score" desc`,
      `"${ITEM_TABLE}"."name" asc`,
      ID_TIE_BREAKER,
    ]);
  });

  test('naming id anywhere in the list suppresses the tie-breaker', () => {
    expect(compilePostgres(toPostgresOrderBy(['id DESC', 'score DESC']))).toEqual([
      `"${ITEM_TABLE}"."id" desc`,
      `"${ITEM_TABLE}"."score" desc`,
    ]);
  });
});

describe('toOrderBy - expressions', () => {
  test('a joined column and a COALESCE sort in one call, followed by one tie-breaker', () => {
    expect(
      compilePostgres(
        toPostgresOrderByWithExpressions(['groupLabel ASC', 'displayName DESC'], pgExpressions),
      ),
    ).toEqual([
      `"order_entries_group"."label" asc`,
      `COALESCE("${ITEM_TABLE}"."nickname", "${ITEM_TABLE}"."name") desc`,
      ID_TIE_BREAKER,
    ]);
  });

  test('an expression, a JSON path and a column mix in one call', () => {
    expect(
      compilePostgres(
        toPostgresOrderByWithExpressions(
          ['groupLabel DESC', 'metadata.rank ASC', 'score DESC'],
          pgExpressions,
        ),
      ),
    ).toEqual([
      `"order_entries_group"."label" desc`,
      `"metadata" #> '{rank}' ASC`,
      `"${ITEM_TABLE}"."score" desc`,
      ID_TIE_BREAKER,
    ]);
  });

  test('naming the id column alongside an expression suppresses the tie-breaker', () => {
    expect(
      compilePostgres(
        toPostgresOrderByWithExpressions(['displayName ASC', 'id DESC'], pgExpressions),
      ),
    ).toEqual([
      `COALESCE("${ITEM_TABLE}"."nickname", "${ITEM_TABLE}"."name") asc`,
      `"${ITEM_TABLE}"."id" desc`,
    ]);
  });

  test('an expression keyed id resolves to the expression and never counts as naming id', () => {
    expect(
      compilePostgres(toPostgresOrderByWithExpressions(['id DESC'], { id: pgGroups.id })),
    ).toEqual([`"order_entries_group"."id" desc`, ID_TIE_BREAKER]);
  });

  test('an expression key wins over a JSON path spelled the same way', () => {
    expect(
      compilePostgres(
        toPostgresOrderByWithExpressions(['metadata.rank DESC'], {
          'metadata.rank': pgGroups.label,
        }),
      ),
    ).toEqual([`"order_entries_group"."label" desc`, ID_TIE_BREAKER]);
  });

  test.each([['constructor'], ['__proto__'], ['toString'], ['hasOwnProperty']])(
    'a key %p inherited by the expressions object is an unknown column, not a resolved one',
    key => {
      const error = captureError(() =>
        toPostgresOrderByWithExpressions([`${key} ASC`], pgExpressions),
      );

      expect(error.statusCode).toBe(400);
      expect(error.message).toContain(`Column NOT FOUND | key: '${key}'`);
    },
  );

  test('the order node for an expression is built once per object and direction', () => {
    const first = toPostgresOrderByWithExpressions(['displayName DESC'], pgExpressions);
    const second = toPostgresOrderByWithExpressions(['displayName DESC'], pgExpressions);

    expect(second[0]).toBe(first[0]);
  });

  test('extra tokens on an expression entry are a 400 as well', () => {
    const error = captureError(() =>
      toPostgresOrderByWithExpressions(['displayName DESC NULLS LAST'], pgExpressions),
    );

    expect(error.statusCode).toBe(400);
    expect(error.message).toContain('displayName DESC NULLS LAST');
  });
});

/**
 * The dialect remembers parsed entries between calls. Each test uses its own instance so what it
 * remembers comes only from the calls in that test.
 */
describe('toOrderBy - entries remembered between calls', () => {
  const compileOn = (dialect: PostgresQueryDialect, order: string[]): string[] =>
    compilePostgres(dialect.toOrderBy({ tableName: ITEM_TABLE, schema: pgItems, order }));

  test('the same field with another direction or spelling is never served a stale direction', () => {
    const dialect = new PostgresQueryDialect();
    const score = `"${ITEM_TABLE}"."score"`;

    expect(compileOn(dialect, ['score DESC'])[0]).toBe(`${score} desc`);
    expect(compileOn(dialect, ['score asc'])[0]).toBe(`${score} asc`);
    expect(compileOn(dialect, ['score Desc'])[0]).toBe(`${score} desc`);
    expect(compileOn(dialect, ['score'])[0]).toBe(`${score} asc`);
    expect(compileOn(dialect, ['score  DESC'])[0]).toBe(`${score} desc`);
    expect(compileOn(dialect, ['score DESC'])[0]).toBe(`${score} desc`);
    expect(compileOn(dialect, ['score ASC'])[0]).toBe(`${score} asc`);
  });

  test('more distinct entries than the dialect remembers still parse correctly, before and after', () => {
    const dialect = new PostgresQueryDialect();
    const total = 2500;

    for (let index = 0; index < total; index++) {
      const isDescending = index % 2 === 0;
      const [compiled] = compileOn(dialect, [
        `metadata.key${index} ${isDescending ? 'DESC' : 'asc'}`,
      ]);

      expect(compiled).toBe(`"metadata" #> '{key${index}}' ${isDescending ? 'DESC' : 'ASC'}`);
    }

    expect(compileOn(dialect, ['metadata.key0 ASC'])[0]).toBe(`"metadata" #> '{key0}' ASC`);
    expect(compileOn(dialect, ['metadata.key1 DESC'])[0]).toBe(`"metadata" #> '{key1}' DESC`);
    expect(compileOn(dialect, ['score DESC'])[0]).toBe(`"${ITEM_TABLE}"."score" desc`);
  });

  test('an entry longer than the cache takes still resolves correctly on every call', () => {
    const dialect = new PostgresQueryDialect();
    const longKey = `sortKey${'x'.repeat(300)}`;
    const expressions = { [longKey]: pgGroups.label };
    const label = `"order_entries_group"."label"`;
    const run = (entry: string): string[] =>
      compilePostgres(
        dialect.toOrderBy({ tableName: ITEM_TABLE, schema: pgItems, order: [entry], expressions }),
      );

    expect(run(`${longKey} DESC`)[0]).toBe(`${label} desc`);
    expect(run(`${longKey} DESC`)[0]).toBe(`${label} desc`);
    expect(run(`${longKey} asc`)[0]).toBe(`${label} asc`);
    expect(run(longKey)[0]).toBe(`${label} asc`);
    expect(run(`${longKey} DESC`)[0]).toBe(`${label} desc`);

    const unknown = `${longKey}Missing DESC`;
    for (let attempt = 0; attempt < 2; attempt++) {
      const error = captureError(() => run(unknown));
      expect(error.message).toContain(`Column NOT FOUND | key: '${longKey}Missing'`);
    }
  });

  test('a rejected entry stays rejected on every call', () => {
    const dialect = new PostgresQueryDialect();

    for (let attempt = 0; attempt < 3; attempt++) {
      const error = captureError(() => compileOn(dialect, ['score sideways']));

      expect(error.statusCode).toBe(400);
      expect(error.message).toContain('score sideways');
    }
  });

  test('a remembered entry is resolved again on each call, with or without expressions', () => {
    const dialect = new PostgresQueryDialect();
    const withExpressions = compilePostgres(
      dialect.toOrderBy({
        tableName: ITEM_TABLE,
        schema: pgItems,
        order: ['groupLabel ASC'],
        expressions: pgExpressions,
      }),
    );

    expect(withExpressions[0]).toBe(`"order_entries_group"."label" asc`);

    const error = captureError(() => compileOn(dialect, ['groupLabel ASC']));
    expect(error.message).toContain("Column NOT FOUND | key: 'groupLabel'");
  });
});

describe('toOrderBy - runtime order on PGlite', () => {
  let client: PGlite;
  let driver: PGliteDriver;

  const selectIds = async (order: SQL[]): Promise<number[]> => {
    const db = drizzlePglite({ client });
    const rows = await db
      .select({ id: pgItems.id })
      .from(pgItems)
      .innerJoin(pgGroups, eq(pgItems.groupId, pgGroups.id))
      .orderBy(...order);

    return rows.map(row => row.id);
  };

  beforeAll(async () => {
    client = new PGlite();
    await client.waitReady;
    driver = new PGliteDriver({ client });

    await client.exec(`
      CREATE TABLE order_entries_group (id serial primary key, label text not null);
      CREATE TABLE ${ITEM_TABLE} (
        id serial primary key,
        name text not null,
        nickname text,
        group_id integer not null,
        score integer not null,
        metadata jsonb
      );
      ${SEED_SQL}
    `);
  });

  // Through the driver: `end()` also clears the exit status PGlite plants on the host process.
  afterAll(async () => {
    await driver.end();
  });

  test('joined column then COALESCE, the tie on items 3 and 4 broken by id', async () => {
    const order = toPostgresOrderByWithExpressions(
      ['groupLabel ASC', 'displayName DESC'],
      pgExpressions,
    );

    expect(await selectIds(order)).toEqual([2, 3, 4, 1, 5]);
  });

  test('expression, JSON path and column mixed in one call', async () => {
    const order = toPostgresOrderByWithExpressions(
      ['groupLabel DESC', 'metadata.rank ASC', 'score DESC'],
      pgExpressions,
    );

    expect(await selectIds(order)).toEqual([5, 1, 2, 4, 3]);
  });

  test('a JSON path and a column without expressions sort as before', async () => {
    expect(await selectIds(toPostgresOrderBy(['metadata.rank DESC', 'name ASC']))).toEqual([
      1, 3, 4, 5, 2,
    ]);
  });
});

describe('toOrderBy - runtime order on libsql', () => {
  const sqliteQueryDialect = new SqliteQueryDialect();
  const sqliteDialect = new SQLiteSyncDialect();
  let client: Client;

  const toSqliteOrderBy = (order: string[]): SQL[] =>
    sqliteQueryDialect.toOrderBy({ tableName: ITEM_TABLE, schema: sqliteItems, order });

  const toSqliteOrderByWithExpressions = (order: string[]): SQL[] =>
    sqliteQueryDialect.toOrderBy({
      tableName: ITEM_TABLE,
      schema: sqliteItems,
      order,
      expressions: sqliteExpressions,
    });

  const selectIds = async (order: SQL[]): Promise<number[]> => {
    const db = drizzleLibsql({ client });
    const rows = await db
      .select({ id: sqliteItems.id })
      .from(sqliteItems)
      .innerJoin(sqliteGroups, eq(sqliteItems.groupId, sqliteGroups.id))
      .orderBy(...order);

    return rows.map(row => row.id);
  };

  beforeAll(async () => {
    client = createClient({ url: ':memory:' });

    await client.executeMultiple(`
      CREATE TABLE order_entries_group (id integer primary key, label text not null);
      CREATE TABLE ${ITEM_TABLE} (
        id integer primary key,
        name text not null,
        nickname text,
        group_id integer not null,
        score integer not null,
        metadata text
      );
      ${SEED_SQL}
    `);
  });

  afterAll(() => {
    client.close();
  });

  test('the compiled list ends in exactly one id tie-breaker', () => {
    const compiled = toSqliteOrderByWithExpressions(['groupLabel ASC', 'displayName DESC']).map(
      entry => sqliteDialect.sqlToQuery(entry).sql,
    );

    expect(compiled).toEqual([
      `"order_entries_group"."label" asc`,
      `COALESCE("${ITEM_TABLE}"."nickname", "${ITEM_TABLE}"."name") desc`,
      ID_TIE_BREAKER,
    ]);
  });

  test('joined column then COALESCE, the tie on items 3 and 4 broken by id', async () => {
    const order = toSqliteOrderByWithExpressions(['groupLabel ASC', 'displayName DESC']);

    expect(await selectIds(order)).toEqual([2, 3, 4, 1, 5]);
  });

  test('expression, JSON path and column mixed in one call', async () => {
    const order = toSqliteOrderByWithExpressions([
      'groupLabel DESC',
      'metadata.rank ASC',
      'score DESC',
    ]);

    expect(await selectIds(order)).toEqual([5, 1, 2, 4, 3]);
  });

  test('a JSON path and a column without expressions sort as before', async () => {
    expect(await selectIds(toSqliteOrderBy(['metadata.rank DESC', 'name ASC']))).toEqual([
      1, 3, 4, 5, 2,
    ]);
  });
});
