import { describe, test, expect, beforeEach } from 'bun:test';
import { ApplicationError, HTTP } from '@venizia/ignis-helpers';
import type { ITransaction } from '@/base/datasources';
import { DefaultSearchRepository } from '@/connectors/typesense/repositories';
import { FakeSearchDataSource, ProductDocument } from './fake-search-connector';

/**
 * Typesense has no transaction primitive - every verb rejects `options.transaction` loudly via
 * `throwNotSupported`, instead of silently executing outside the transaction it claims to join.
 */
const fakeTransaction: ITransaction = {
  isActive: true,
  commit: async () => {},
  rollback: async () => {},
};

const expectNotSupported = (caught: unknown): void => {
  expect(caught).toBeInstanceOf(ApplicationError);
  const appError = caught as ApplicationError;
  expect(appError.statusCode).toBe(HTTP.ResultCodes.RS_5.NotImplemented);
  expect(appError.messageCode).toBe('core.not_supported');
};

describe('Typesense repository verbs reject options.transaction (NotSupported)', () => {
  let dataSource: FakeSearchDataSource;
  let repository: DefaultSearchRepository<any>;

  beforeEach(() => {
    dataSource = new FakeSearchDataSource({ name: 'not-supported-tx-ds', config: {} });
    repository = new DefaultSearchRepository(dataSource, { entityClass: ProductDocument });
  });

  test('count', async () => {
    let caught: unknown;
    try {
      await repository.count({ where: {}, options: { transaction: fakeTransaction } });
    } catch (error) {
      caught = error;
    }
    expectNotSupported(caught);
  });

  test('existsWith (delegates to count)', async () => {
    let caught: unknown;
    try {
      await repository.existsWith({ where: {}, options: { transaction: fakeTransaction } });
    } catch (error) {
      caught = error;
    }
    expectNotSupported(caught);
  });

  test('find', async () => {
    let caught: unknown;
    try {
      await repository.find({ filter: {}, options: { transaction: fakeTransaction } });
    } catch (error) {
      caught = error;
    }
    expectNotSupported(caught);
  });

  test('findOne (delegates to find)', async () => {
    let caught: unknown;
    try {
      await repository.findOne({ filter: {}, options: { transaction: fakeTransaction } });
    } catch (error) {
      caught = error;
    }
    expectNotSupported(caught);
  });

  test('findById (delegates to findOne)', async () => {
    let caught: unknown;
    try {
      await repository.findById({ id: '1', options: { transaction: fakeTransaction } });
    } catch (error) {
      caught = error;
    }
    expectNotSupported(caught);
  });

  test('create', async () => {
    let caught: unknown;
    try {
      await repository.create({
        data: { title: 'A' },
        options: { transaction: fakeTransaction },
      });
    } catch (error) {
      caught = error;
    }
    expectNotSupported(caught);
  });

  test('createAll', async () => {
    let caught: unknown;
    try {
      await repository.createAll({
        data: [{ title: 'A' }],
        options: { transaction: fakeTransaction },
      });
    } catch (error) {
      caught = error;
    }
    expectNotSupported(caught);
  });

  test('updateById', async () => {
    let caught: unknown;
    try {
      await repository.updateById({
        id: '1',
        data: { title: 'A' },
        options: { transaction: fakeTransaction },
      });
    } catch (error) {
      caught = error;
    }
    expectNotSupported(caught);
  });

  test('updateAll', async () => {
    let caught: unknown;
    try {
      await repository.updateAll({
        data: { title: 'A' },
        where: { title: 'B' },
        options: { transaction: fakeTransaction },
      });
    } catch (error) {
      caught = error;
    }
    expectNotSupported(caught);
  });

  test('deleteById', async () => {
    let caught: unknown;
    try {
      await repository.deleteById({ id: '1', options: { transaction: fakeTransaction } });
    } catch (error) {
      caught = error;
    }
    expectNotSupported(caught);
  });

  test('deleteAll', async () => {
    let caught: unknown;
    try {
      await repository.deleteAll({
        where: { title: 'B' },
        options: { transaction: fakeTransaction },
      });
    } catch (error) {
      caught = error;
    }
    expectNotSupported(caught);
  });
});
