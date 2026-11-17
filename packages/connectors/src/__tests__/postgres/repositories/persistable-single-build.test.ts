import { describe, expect, test, spyOn } from 'bun:test';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { PersistableRepository } from '@/relational/postgres/repositories';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';
import { buildFakeConnector } from './fake-connector';
import { StubDataSource } from './stub-data-source';

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
  const dataSource = new StubDataSource({ connector: () => connector, dialect });

  const repository = new PersistableRepository(dataSource, {
    entityClass: SingleBuildFixtureEntity,
  });

  return { repository, dialect };
};

const pgQueryResult = { rows: [], rowCount: 2 };

/**
 * The where SQL must be compiled exactly once per update/delete: validateWhereCondition hands its
 * compiled condition back rather than leaving the caller to recompile it.
 */
describe('PersistableRepository - where SQL is built once per update/delete', () => {
  test('updateBy builds toWhere exactly once', async () => {
    const { repository, dialect } = buildSetup({ result: pgQueryResult });
    const spy = spyOn(dialect, 'toWhere');

    await repository.updateBy({
      data: { name: 'x' },
      where: { status: 'active' },
      options: { shouldReturn: false },
    });

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('deleteBy builds toWhere exactly once', async () => {
    const { repository, dialect } = buildSetup({ result: pgQueryResult });
    const spy = spyOn(dialect, 'toWhere');

    await repository.deleteBy({
      where: { status: 'active' },
      options: { shouldReturn: false },
    });

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  test('updateBy still reports the driver count (behavior unchanged)', async () => {
    const { repository } = buildSetup({ result: pgQueryResult });

    const result = await repository.updateBy({
      data: { name: 'x' },
      where: { status: 'active' },
      options: { shouldReturn: false },
    });

    expect(result).toEqual({ count: 2, data: null });
  });
});
