import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { BasePostgresEntity } from '@/connectors/postgres/models';
import { PersistableRepository } from '@/connectors/postgres/repositories';
import { FilterBuilder } from '@/connectors/postgres/repositories/dialect/filter';
import { buildFakeConnector } from './fake-connector';

/** Covers the three `readAffectedRowCount` call sites in persistable.ts's `shouldReturn: false` branches - none call `.returning()`, so `{ count }` comes entirely from `readAffectedRowCount`. */

const table = pgTable('persistable_count_fixture', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  status: varchar('status', { length: 50 }),
});

/** Real entity (not a mock) so `this.entity.schema` resolves via the actual class. */
class PersistableCountFixtureEntity extends BasePostgresEntity {
  static override schema = table;
  static override TABLE_NAME = 'persistable_count_fixture';
}

/** Minimal datasource stub: the query dialect lives on the datasource (getQueryDialect()), and `resolveConnector()` calls `dataSource.getConnector()` when no transaction is passed. */
const buildRepository = (opts: { result: unknown }) => {
  const connector = buildFakeConnector({ result: opts.result });
  const dataSource = {
    getQueryDialect: () => new FilterBuilder(),
    getConnector: () => connector,
  } as AnyType;

  return new PersistableRepository<AnyType>(dataSource, {
    entityClass: PersistableCountFixtureEntity,
  });
};

/** node-postgres shape: `pg.QueryResult` - `{ rows, rowCount }`. */
const pgQueryResult = { rows: [], rowCount: 3 };

/** postgres-js shape: a `RowList` - an ARRAY carrying a `count` property. */
const postgresJsRowList = Object.assign([], { count: 3 });

describe('PersistableRepository - create() reports count from the driver result (no RETURNING)', () => {
  test('a pg.QueryResult shape ({ rows, rowCount }) reports count from rowCount', async () => {
    const repository = buildRepository({ result: pgQueryResult });

    const result = await repository.create({
      data: { name: 'new', status: 'active' },
      options: { shouldReturn: false },
    });

    expect(result).toEqual({ count: 3, data: null });
  });

  test('a postgres-js RowList shape (array + count) reports count from count', async () => {
    const repository = buildRepository({ result: postgresJsRowList });

    const result = await repository.create({
      data: { name: 'new', status: 'active' },
      options: { shouldReturn: false },
    });

    expect(result).toEqual({ count: 3, data: null });
  });
});

describe('PersistableRepository - updateAll() reports count from the driver result (no RETURNING)', () => {
  test('a pg.QueryResult shape ({ rows, rowCount }) reports count from rowCount', async () => {
    const repository = buildRepository({ result: pgQueryResult });

    const result = await repository.updateAll({
      data: { name: 'updated' },
      where: { status: 'active' },
      options: { shouldReturn: false },
    });

    expect(result).toEqual({ count: 3, data: null });
  });

  test('a postgres-js RowList shape (array + count) reports count from count', async () => {
    const repository = buildRepository({ result: postgresJsRowList });

    const result = await repository.updateAll({
      data: { name: 'updated' },
      where: { status: 'active' },
      options: { shouldReturn: false },
    });

    expect(result).toEqual({ count: 3, data: null });
  });
});

describe('PersistableRepository - deleteAll() reports count from the driver result (no RETURNING)', () => {
  test('a pg.QueryResult shape ({ rows, rowCount }) reports count from rowCount', async () => {
    const repository = buildRepository({ result: pgQueryResult });

    const result = await repository.deleteAll({
      where: { status: 'active' },
      options: { shouldReturn: false },
    });

    expect(result).toEqual({ count: 3, data: null });
  });

  test('a postgres-js RowList shape (array + count) reports count from count', async () => {
    const repository = buildRepository({ result: postgresJsRowList });

    const result = await repository.deleteAll({
      where: { status: 'active' },
      options: { shouldReturn: false },
    });

    expect(result).toEqual({ count: 3, data: null });
  });
});
