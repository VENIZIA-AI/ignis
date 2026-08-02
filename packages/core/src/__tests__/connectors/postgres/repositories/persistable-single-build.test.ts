import { describe, expect, test, spyOn } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { BasePostgresEntity } from '@/connectors/postgres/models';
import { PersistableRepository } from '@/connectors/postgres/repositories';
import { PostgresQueryDialect } from '@/connectors/postgres/repositories/dialect/query-dialect';
import { PostgresQueryExecutor } from '@/connectors/postgres/repositories/executor';
import { buildFakeConnector } from './fake-connector';

const table = pgTable('single_build_fixture', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  status: varchar('status', { length: 50 }),
});

class SingleBuildFixtureEntity extends BasePostgresEntity {
  static override schema = table;
  static override TABLE_NAME = 'single_build_fixture';
}

const buildSetup = (opts: { result: unknown }) => {
  const dialect = new PostgresQueryDialect();
  const connector = buildFakeConnector({ result: opts.result });
  const dataSource = {
    getQueryDialect: () => dialect,
    getConnector: () => connector,
    getQueryExecutor: () => new PostgresQueryExecutor(),
  } as AnyType;

  const repository = new PersistableRepository<AnyType>(dataSource, {
    entityClass: SingleBuildFixtureEntity,
  });

  return { repository, dialect };
};

const pgQueryResult = { rows: [], rowCount: 2 };

/** The where SQL must be compiled exactly once per update/delete - validateWhereCondition hands its compiled condition to the caller rather than the caller recompiling it. */
describe('PersistableRepository - where SQL is built once per update/delete', () => {
  test('updateAll builds toWhere exactly once', async () => {
    const { repository, dialect } = buildSetup({ result: pgQueryResult });
    const spy = spyOn(dialect, 'toWhere');

    await repository.updateAll({
      data: { name: 'x' },
      where: { status: 'active' },
      options: { shouldReturn: false },
    });

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('deleteAll builds toWhere exactly once', async () => {
    const { repository, dialect } = buildSetup({ result: pgQueryResult });
    const spy = spyOn(dialect, 'toWhere');

    await repository.deleteAll({
      where: { status: 'active' },
      options: { shouldReturn: false },
    });

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('updateAll still reports the driver count (behavior unchanged)', async () => {
    const { repository } = buildSetup({ result: pgQueryResult });

    const result = await repository.updateAll({
      data: { name: 'x' },
      where: { status: 'active' },
      options: { shouldReturn: false },
    });

    expect(result).toEqual({ count: 2, data: null });
  });
});
