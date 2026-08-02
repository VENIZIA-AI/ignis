import { describe, test, expect } from 'bun:test';
import { PersistableRepository } from '@/connectors/postgres/repositories';
import { PostgresQueryDialect } from '@/connectors/postgres/repositories/dialect/query-dialect';
import { PostgresQueryExecutor } from '@/connectors/postgres/repositories/executor';
import { BasePostgresEntity } from '@/connectors/postgres/models';
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';

/** Minimal datasource stub: the query dialect lives on the datasource (getQueryDialect()), so a repository needs one to translate a where. Only getQueryDialect is exercised here. */
const stubDataSource = {
  getQueryDialect: () => new PostgresQueryDialect(),
  getQueryExecutor: () => new PostgresQueryExecutor(),
} as any;

const table = pgTable('test_entity', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  status: varchar('status', { length: 50 }),
});

/** Real entity (not a mock) so `this.entity.schema` resolves via the actual class. */
class ValidateWhereFixtureEntity extends BasePostgresEntity {
  static override schema = table;
  static override TABLE_NAME = 'test_entity';
}

/** validateWhereCondition must treat a where as empty when it resolves to NO SQL condition ({} and all-undefined wheres) - otherwise updateAll/updateBy/deleteAll/deleteBy run table-wide. */
class TestRepository extends PersistableRepository<any> {
  constructor() {
    super(stubDataSource, {});
    this.entity = new ValidateWhereFixtureEntity();
  }

  callValidateWhere(where: any, force?: boolean) {
    return this.validateWhereCondition({ where, force, operationName: '_update' });
  }
}

describe('PersistableRepository.validateWhereCondition (resolved-SQL emptiness)', () => {
  const repo = new TestRepository();

  test('throws on empty object where', () => {
    expect(() => repo.callValidateWhere({})).toThrow(/Empty where condition/);
  });

  test('throws on all-undefined where (the gap isEmpty missed)', () => {
    expect(() => repo.callValidateWhere({ status: undefined })).toThrow(/Empty where condition/);
  });

  test('throws on a where that resolves to no condition (empty and-group)', () => {
    expect(() => repo.callValidateWhere({ and: [] })).toThrow(/Empty where condition/);
  });

  test('does NOT throw for a real condition; reports isEmptyWhere false', () => {
    expect(() => repo.callValidateWhere({ status: 'active' })).not.toThrow();
    expect(repo.callValidateWhere({ status: 'active' }).isEmptyWhere).toBe(false);
  });

  test('does NOT throw for a real condition; returns the built condition', () => {
    expect(repo.callValidateWhere({ status: 'active' }).condition).toBeDefined();
  });

  test('force bypasses the guard and reports empty (isEmptyWhere true)', () => {
    expect(() => repo.callValidateWhere({}, true)).not.toThrow();
    expect(repo.callValidateWhere({ status: undefined }, true).isEmptyWhere).toBe(true);
  });
});

describe('updateAll / deleteAll reject an all-undefined where without force', () => {
  const repo = new TestRepository();

  async function rejectionMessage(op: Promise<unknown>): Promise<string | null> {
    try {
      await op;
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }

  test('updateAll rejects { status: undefined }', async () => {
    const message = await rejectionMessage(
      repo.updateAll({ data: { name: 'x' }, where: { status: undefined } }),
    );
    expect(message).toMatch(/Empty where condition/);
  });

  test('deleteAll rejects { status: undefined }', async () => {
    const message = await rejectionMessage(repo.deleteAll({ where: { status: undefined } }));
    expect(message).toMatch(/Empty where condition/);
  });

  test('updateBy (alias) rejects { status: undefined }', async () => {
    const message = await rejectionMessage(
      repo.updateBy({ data: { name: 'x' }, where: { status: undefined } }),
    );
    expect(message).toMatch(/Empty where condition/);
  });
});
