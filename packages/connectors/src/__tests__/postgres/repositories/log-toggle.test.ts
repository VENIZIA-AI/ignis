import { describe, expect, test } from 'bun:test';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';
import type { TRepositoryLogOptions } from '@venizia/ignis-kernel';
import { BasePostgresEntity } from '@/relational/postgres/models';
import { PersistableRepository } from '@/relational/postgres/repositories';
import { PostgresQueryDialect } from '@/relational/postgres/repositories/dialect/query-dialect';
import { buildFakeConnector } from './fake-connector';
import { StubDataSource } from './stub-data-source';

const table = pgTable('log_toggle_fixture', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }),
});

class LogToggleFixtureEntity extends BasePostgresEntity {
  static override schema = table;
  static override TABLE_NAME = 'log_toggle_fixture';
}

const buildRepository = () => {
  const connector = buildFakeConnector({ result: { rows: [], rowCount: 1 } });
  const dataSource = new StubDataSource({
    connector: () => connector,
    dialect: new PostgresQueryDialect(),
  });

  return new PersistableRepository(dataSource, { entityClass: LogToggleFixtureEntity });
};

const where = { id: 1 };

const writes = (log: TRepositoryLogOptions | undefined) => {
  const repository = buildRepository();
  const options = { shouldReturn: false, log } as const;

  return [
    ['create', () => repository.create({ data: { name: 'x' }, options })],
    ['upsert', () => repository.upsert({ data: { id: 1, name: 'x' }, options })],
    ['updateBy', () => repository.updateBy({ data: { name: 'x' }, where, options })],
    ['deleteBy', () => repository.deleteBy({ where, options })],
  ] as const;
};

describe('PersistableRepository - the log toggle', () => {
  test('every write refuses a use that is not a boolean', async () => {
    for (const [verb, write] of writes(JSON.parse('{"use":"false"}'))) {
      const [outcome] = await Promise.allSettled([write()]);

      expect({ verb, outcome }).toMatchObject({
        verb,
        outcome: {
          status: 'rejected',
          reason: { message: expect.stringContaining('A toggle must be') },
        },
      });
    }
  });

  test('an absent log, and one that is off, write as before', async () => {
    for (const log of [undefined, { use: false }]) {
      const repository = buildRepository();
      const result = await repository.updateBy({
        data: { name: 'x' },
        where,
        options: { shouldReturn: false, log },
      });

      expect(result).toEqual({ count: 1, data: null });
    }
  });
});
