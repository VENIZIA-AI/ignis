import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';

import { AbstractRepository } from '@/base/repositories/core';
import type { TCount, TFilter } from '@/base/repositories/common';
import { buildDataRange, RepositoryErrorCodes } from '@/base/repositories/common';
import { ReadableRelationalRepository } from '@/connectors/relational/repositories/core/readable';
import { ReadableSearchRepository } from '@/connectors/search/repositories';

import {
  FakeSearchDataSource,
  ProductDocument,
} from '../connectors/search/repositories/fake-search-connector';

/** The engine-neutral relational readable with every engine-touching seam of `find()` stubbed out, so the test exercises the real range-building tail of `find()` without a database or an engine binding. */
class StubbedRelationalRepository extends ReadableRelationalRepository {
  rows: Array<Record<string, unknown>> = [];
  total = 0;

  override applyDefaultFilter<DataObject = any>(opts: {
    userFilter?: TFilter<DataObject>;
  }): TFilter<DataObject> {
    return opts.userFilter ?? {};
  }

  override getDefaultLimit(): number | undefined {
    return undefined;
  }

  protected override validateLockOptions(): void {}

  protected override async findWithCoreAPI<R = any>(): Promise<Array<R>> {
    return this.rows as Array<R>;
  }

  override async count(): Promise<TCount> {
    return { count: this.total };
  }
}

describe('shared AbstractRepository core helpers', () => {
  describe('denyOperation', () => {
    test('is owned by AbstractRepository - no readable family redeclares it', () => {
      expect(
        Object.getOwnPropertyDescriptor(AbstractRepository.prototype, 'denyOperation'),
      ).toBeDefined();
      expect(
        Object.getOwnPropertyDescriptor(ReadableRelationalRepository.prototype, 'denyOperation'),
      ).toBeUndefined();
      expect(
        Object.getOwnPropertyDescriptor(ReadableSearchRepository.prototype, 'denyOperation'),
      ).toBeUndefined();
    });

    test('both readable families throw the identical deny message', () => {
      const relationalRepository = new StubbedRelationalRepository();
      const searchRepository = new ReadableSearchRepository(
        new FakeSearchDataSource({ name: 'deny-search-ds', config: {} }),
        { entityClass: ProductDocument },
      );

      const expectedMessage = '[create] Repository operation is NOT ALLOWED | scope: READ_ONLY';

      expect(() => relationalRepository.create({ data: {} as any })).toThrow(expectedMessage);
      expect(() => searchRepository.create({ data: {} })).toThrow(expectedMessage);
    });

    test('the denial carries a machine-readable messageCode, identical for both families', () => {
      const relationalRepository = new StubbedRelationalRepository();
      const searchRepository = new ReadableSearchRepository(
        new FakeSearchDataSource({ name: 'deny-code-search-ds', config: {} }),
        { entityClass: ProductDocument },
      );

      // Returns undefined when the call did NOT throw, which fails the expectation below just as loudly as a wrong code, without needing a raw `new Error` guard.
      const denialCodeOf = (repository: AnyType): string | undefined => {
        try {
          repository.create({ data: {} });
          return undefined;
        } catch (error) {
          return (error as { normalized?: { code?: string } }).normalized?.code;
        }
      };

      const denialCodes = [relationalRepository, searchRepository].map(repository =>
        denialCodeOf(repository),
      );

      // The literal value is the contract: clients branch on the code, never on the message text, so changing this string is a breaking change for every caller that maps it.
      expect(denialCodes).toEqual([
        'core.repository.operation_not_allowed',
        'core.repository.operation_not_allowed',
      ]);
      expect(RepositoryErrorCodes.OPERATION_NOT_ALLOWED).toBe(
        'core.repository.operation_not_allowed',
      );
    });
  });

  describe('buildDataRange', () => {
    test('follows the HTTP Content-Range convention (inclusive end index)', () => {
      expect(buildDataRange({ skip: 20, dataLength: 2, total: 100 })).toEqual({
        start: 20,
        end: 21,
        total: 100,
      });
      expect(buildDataRange({ offset: 5, dataLength: 3, total: 9 })).toEqual({
        start: 5,
        end: 7,
        total: 9,
      });
      expect(buildDataRange({ dataLength: 0, total: 0 })).toEqual({ start: 0, end: 0, total: 0 });
    });

    test('skip wins over offset', () => {
      expect(buildDataRange({ skip: 10, offset: 3, dataLength: 1, total: 50 })).toEqual({
        start: 10,
        end: 10,
        total: 50,
      });
    });

    test('the relational readable builds its range through the shared helper', async () => {
      const repository = new StubbedRelationalRepository();
      repository.rows = [{ id: 21 }, { id: 22 }];
      repository.total = 100;

      const result = await repository.find({
        filter: { skip: 20, limit: 2 },
        options: { shouldQueryRange: true },
      });

      expect(result.range).toEqual(buildDataRange({ skip: 20, dataLength: 2, total: 100 }));
    });

    test('the search readable builds its range through the shared helper', async () => {
      const dataSource = new FakeSearchDataSource({ name: 'range-search-ds', config: {} });
      const repository = new ReadableSearchRepository(dataSource, { entityClass: ProductDocument });

      dataSource.fakeConnector.searchResponse = {
        found: 100,
        isFoundExact: true,
        hits: [{ document: { id: '21' } }, { document: { id: '22' } }],
      };

      const result = await repository.find({
        filter: { skip: 20, limit: 2 },
        options: { shouldQueryRange: true },
      });

      expect(result.range).toEqual(buildDataRange({ skip: 20, dataLength: 2, total: 100 }));
    });
  });
});
