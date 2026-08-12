import { describe, test, expect, beforeEach } from 'bun:test';
import { ApplicationError } from '@venizia/ignis-helpers/core';

import {
  DefaultSearchRepository,
  PersistableSearchRepository,
} from '@/connectors/typesense/repositories';
import {
  FakeSearchDataSource,
  ProductDocument,
  ProductDocumentNoDefaultFilter,
} from './fake-search-connector';

describe('PersistableSearchRepository', () => {
  let dataSource: FakeSearchDataSource;
  let repository: PersistableSearchRepository<any>;

  beforeEach(() => {
    dataSource = new FakeSearchDataSource({ name: 'persistable-search-ds', config: {} });
    repository = new PersistableSearchRepository(dataSource, { entityClass: ProductDocument });
  });

  describe('create', () => {
    test('calls connector.createDocument and wraps the result', async () => {
      const data = { title: 'A' };
      const result = await repository.create({ data });

      expect(result).toEqual({ count: 1, data });

      const [call] = dataSource.fakeConnector.createDocumentCalls;
      expect(call.collection).toBe('products');
      expect(call.document).toBe(data);
    });

    test('strips hiddenProperties from the write response', async () => {
      // A write response never passes through the engine's exclude-fields, so the repository must strip them itself or `hiddenProperties: ['secret']` leaks straight back to the caller.
      const data = { title: 'A', secret: 'do-not-leak' };
      const result = await repository.create({ data });

      expect(result.data).toEqual({ title: 'A' });
      expect(Reflect.get(result.data ?? {}, 'secret')).toBeUndefined();

      // The document actually sent to the engine still carries the hidden field.
      const [call] = dataSource.fakeConnector.createDocumentCalls;
      expect(Reflect.get(call.document as object, 'secret')).toBe('do-not-leak');
    });
  });

  describe('createAll', () => {
    test('calls connector.importDocuments and wraps count.success', async () => {
      dataSource.fakeConnector.importDocumentsResponse = {
        count: { success: 2, fail: 0 },
        responses: [],
      };
      const data = [{ title: 'A' }, { title: 'B' }];

      const result = await repository.createAll({ data });

      // Typesense's bulk import never echoes documents back; `data` is the caller's own input rows filtered to the ones the batch accepted (all of them here, since responses is empty).
      expect(result).toEqual({ count: 2, data });

      const [call] = dataSource.fakeConnector.importDocumentsCalls;
      expect(call.collection).toBe('products');
      expect(call.documents).toBe(data);
      expect(call.batchSize).toBeUndefined();
    });

    test('strips hiddenProperties from every returned document', async () => {
      dataSource.fakeConnector.importDocumentsResponse = {
        count: { success: 2, fail: 0 },
        responses: [],
      };
      const data = [
        { title: 'A', secret: 'leak-a' },
        { title: 'B', secret: 'leak-b' },
      ];

      const result = await repository.createAll({ data });

      expect(result.data).toEqual([{ title: 'A' }, { title: 'B' }]);
    });

    test('forwards options.batchSize to the connector', async () => {
      await repository.createAll({ data: [{ title: 'A' }], options: { batchSize: 40 } });

      const [call] = dataSource.fakeConnector.importDocumentsCalls;
      expect(call.batchSize).toBe(40);
    });
  });

  describe('updateById', () => {
    // ProductDocument has a defaultFilter, so the filter-guard reads the document back through findById/search first and the fake connector must report a matching hit before it passes.
    const seedFoundDocument = (doc: { id: string; title: string }) => {
      dataSource.fakeConnector.searchResponse = {
        found: 1,
        isFoundExact: true,
        hits: [{ document: doc }],
      };
    };

    test('calls connector.updateDocument and wraps the result', async () => {
      seedFoundDocument({ id: '1', title: 'A' });
      const data = { title: 'Updated' };
      const result = await repository.updateById({ id: '1', data });

      expect(result).toEqual({ count: 1, data });

      const [call] = dataSource.fakeConnector.updateDocumentCalls;
      expect(call.collection).toBe('products');
      expect(call.id).toBe('1');
      expect(call.document).toBe(data);
    });

    test('strips hiddenProperties from the write response', async () => {
      seedFoundDocument({ id: '1', title: 'A' });
      const data = { title: 'Updated', secret: 'do-not-leak' };

      const result = await repository.updateById({ id: '1', data });

      expect(result.data).toEqual({ title: 'Updated' });
      expect(Reflect.get(result.data ?? {}, 'secret')).toBeUndefined();
    });

    // Intentional SQL-parity break: SQL's updateById reports { count: 0 } on a missing row and never throws, but search's TDocument is non-nullable, so it throws its own sanitized 404 from the filter-guard instead.
    test('throws a sanitized 404 when the document is genuinely missing (no search hit)', async () => {
      let caught: unknown;

      try {
        await repository.updateById({ id: 'missing', data: { title: 'Updated' } });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ApplicationError);
      expect((caught as ApplicationError).statusCode).toBe(404);
      expect(dataSource.fakeConnector.updateDocumentCalls.length).toBe(0);
    });

    test('throws a sanitized 404 for a defaultFilter-excluded (soft-deleted) document', async () => {
      // Same wire shape as "genuinely missing" from the repository's point of view - the guard cannot distinguish "no such id" from "id exists but excluded by defaultWhere".
      dataSource.fakeConnector.searchResponse = { found: 0, isFoundExact: true, hits: [] };

      let caught: unknown;

      try {
        await repository.updateById({ id: 'soft-deleted', data: { title: 'Updated' } });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ApplicationError);
      expect((caught as ApplicationError).statusCode).toBe(404);
      expect(dataSource.fakeConnector.updateDocumentCalls.length).toBe(0);
    });

    test('shouldSkipDefaultFilter bypasses the filter-guard entirely', async () => {
      // No search seeded: if the guard ran it would 404, so shouldSkipDefaultFilter means it never runs at all and the connector is called directly.
      const data = { title: 'Updated' };
      const result = await repository.updateById({
        id: 'soft-deleted',
        data,
        options: { shouldSkipDefaultFilter: true },
      });

      expect(result).toEqual({ count: 1, data });
      expect(dataSource.fakeConnector.searchCalls.length).toBe(0);

      const [call] = dataSource.fakeConnector.updateDocumentCalls;
      expect(call.id).toBe('soft-deleted');
    });

    test('skips the guard entirely when the model has no defaultFilter', async () => {
      const noFilterRepository = new PersistableSearchRepository<any>(dataSource, {
        entityClass: ProductDocumentNoDefaultFilter,
      });
      const data = { title: 'Updated' };

      const result = await noFilterRepository.updateById({ id: 'any-id', data });

      expect(result).toEqual({ count: 1, data });
      expect(dataSource.fakeConnector.searchCalls.length).toBe(0);
    });
  });

  describe('updateBy - postgres-parity alias for updateAll (factory PATCH / route)', () => {
    test('routes through toWhere with the default-filter merge, same as updateAll', async () => {
      dataSource.fakeConnector.updateByFilterResponse = { updatedCount: 3 };

      const result = await repository.updateBy({
        data: { title: 'x' },
        where: { status: 'active' },
      });

      // updateBy aliases updateAll: bulk writes on search engines have no RETURNING, so data is always null and no extra engine read happens.
      expect(result).toEqual({ count: 3, data: null });
      expect(dataSource.fakeConnector.searchCalls.length).toBe(0);

      const [call] = dataSource.fakeConnector.updateByFilterCalls;
      expect(call.collection).toBe('products');
      expect(call.filterBy).toBe('(isActive:=true && status:=`active`)');
      expect(call.document).toEqual({ title: 'x' });
    });
  });

  describe('updateAll', () => {
    test('merges defaultWhere and forwards toWhere output as filterBy', async () => {
      dataSource.fakeConnector.updateByFilterResponse = { updatedCount: 3 };

      const result = await repository.updateAll({
        data: { title: 'x' },
        where: { status: 'active' },
      });

      // Bulk update on a search engine returns count only - no RETURNING, no bolted-on read.
      expect(result).toEqual({ count: 3, data: null });
      expect(dataSource.fakeConnector.searchCalls.length).toBe(0);

      const [call] = dataSource.fakeConnector.updateByFilterCalls;
      expect(call.collection).toBe('products');
      expect(call.filterBy).toBe('(isActive:=true && status:=`active`)');
      expect(call.document).toEqual({ title: 'x' });
    });

    test('no where still applies the default filter', async () => {
      dataSource.fakeConnector.updateByFilterResponse = { updatedCount: 1 };

      await repository.updateAll({ data: { title: 'x' } });

      const [call] = dataSource.fakeConnector.updateByFilterCalls;
      expect(call.filterBy).toBe('isActive:=true');
    });

    test('performs NO engine read even when hits exist to be read - count is the whole contract', async () => {
      dataSource.fakeConnector.updateByFilterResponse = { updatedCount: 2 };
      dataSource.fakeConnector.searchResponse = {
        found: 2,
        isFoundExact: true,
        hits: [
          { document: { id: '1', title: 'A', status: 'active' } },
          { document: { id: '2', title: 'B', status: 'active' } },
        ],
      };

      const result = await repository.updateAll({
        data: { status: 'inactive' },
        where: { status: 'active' },
      });

      expect(result).toEqual({ count: 2, data: null });
      expect(dataSource.fakeConnector.searchCalls.length).toBe(0);
      expect(dataSource.fakeConnector.updateByFilterCalls.length).toBe(1);
    });

    test('throws when there is no effective where (no where, no default filter)', async () => {
      const noFilterRepository = new PersistableSearchRepository<any>(dataSource, {
        entityClass: ProductDocumentNoDefaultFilter,
      });

      let caught: unknown;

      try {
        await noFilterRepository.updateAll({ data: { title: 'x' } });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      expect(dataSource.fakeConnector.updateByFilterCalls.length).toBe(0);
    });
  });

  describe('deleteAll', () => {
    test('returns count only - data is always null, no engine read', async () => {
      dataSource.fakeConnector.deleteByFilterResponse = 4;
      dataSource.fakeConnector.searchResponse = {
        found: 4,
        isFoundExact: true,
        hits: [{ document: { id: '1', title: 'A', status: 'active' } }],
      };

      const result = await repository.deleteAll({ where: { status: 'active' } });

      expect(result).toEqual({ count: 4, data: null });
      expect(dataSource.fakeConnector.searchCalls.length).toBe(0);
    });
  });

  describe('import', () => {
    test('passes through batchSize and returns the raw IImportResult', async () => {
      dataSource.fakeConnector.importDocumentsResponse = {
        count: { success: 5, fail: 1 },
        responses: ['x'],
      };
      const documents = [{ title: 'A' }];

      const result = await repository.import({ documents, batchSize: 10 });

      expect(result).toEqual(dataSource.fakeConnector.importDocumentsResponse);

      const [call] = dataSource.fakeConnector.importDocumentsCalls;
      expect(call.collection).toBe('products');
      expect(call.documents).toBe(documents);
      expect(call.batchSize).toBe(10);
      // `action` (create/upsert/update/emplace) is Typesense-only vocabulary the neutral tier never forwards - reach getConnector().importDocuments() for that.
      expect(call.action).toBeUndefined();
    });

    test('omits action/batchSize from the connector call when not provided', async () => {
      await repository.import({ documents: [{ title: 'A' }] });

      const [call] = dataSource.fakeConnector.importDocumentsCalls;
      expect(call.action).toBeUndefined();
      expect(call.batchSize).toBeUndefined();
    });
  });
});

describe('DefaultSearchRepository', () => {
  let dataSource: FakeSearchDataSource;
  let repository: DefaultSearchRepository<any>;

  beforeEach(() => {
    dataSource = new FakeSearchDataSource({ name: 'default-search-ds', config: {} });
    repository = new DefaultSearchRepository(dataSource, { entityClass: ProductDocument });
  });

  describe('deleteById', () => {
    // ProductDocument has a defaultFilter, so deleteById's filter-guard reads the document back through findById/search first (see default-search.ts), same as updateById.
    test('connector returns true -> count 1', async () => {
      dataSource.fakeConnector.searchResponse = {
        found: 1,
        isFoundExact: true,
        hits: [{ document: { id: '1' } }],
      };
      dataSource.fakeConnector.deleteDocumentResult = true;

      const result = await repository.deleteById({ id: '1' });

      // The defaultFilter guard already read the document, so deleteById's `data` reuses that read rather than issuing a second one just to satisfy shouldReturn.
      expect(result).toEqual({ count: 1, data: { id: '1' } });

      const [call] = dataSource.fakeConnector.deleteDocumentCalls;
      expect(call.collection).toBe('products');
      expect(call.id).toBe('1');
    });

    test('connector returns false (404, no throw) -> count 0', async () => {
      dataSource.fakeConnector.searchResponse = {
        found: 1,
        isFoundExact: true,
        hits: [{ document: { id: '1' } }],
      };
      dataSource.fakeConnector.deleteDocumentResult = false;

      const result = await repository.deleteById({ id: '1' });

      expect(result).toEqual({ count: 0, data: null });
    });

    test('filter-guard: a genuinely missing document -> count 0 without calling the connector', async () => {
      // Default fake searchResponse is { found: 0, isFoundExact: true, hits: [] }.
      const result = await repository.deleteById({ id: 'missing' });

      expect(result).toEqual({ count: 0, data: null });
      expect(dataSource.fakeConnector.deleteDocumentCalls.length).toBe(0);
    });

    test('filter-guard: a defaultFilter-excluded (soft-deleted) document -> count 0', async () => {
      dataSource.fakeConnector.searchResponse = { found: 0, isFoundExact: true, hits: [] };

      const result = await repository.deleteById({ id: 'soft-deleted' });

      expect(result).toEqual({ count: 0, data: null });
      expect(dataSource.fakeConnector.deleteDocumentCalls.length).toBe(0);
    });

    test('shouldSkipDefaultFilter bypasses the filter-guard entirely', async () => {
      dataSource.fakeConnector.deleteDocumentResult = true;

      const result = await repository.deleteById({
        id: 'soft-deleted',
        options: { shouldSkipDefaultFilter: true },
      });

      // No guard read happened (skipped), so there is nothing to report back as `data` even though shouldReturn was not explicitly false - deleteById never reads purely to populate it.
      expect(result).toEqual({ count: 1, data: null });
      expect(dataSource.fakeConnector.searchCalls.length).toBe(0);
    });

    test('skips the guard entirely when the model has no defaultFilter', async () => {
      const noFilterRepository = new DefaultSearchRepository<any>(dataSource, {
        entityClass: ProductDocumentNoDefaultFilter,
      });
      dataSource.fakeConnector.deleteDocumentResult = true;

      const result = await noFilterRepository.deleteById({ id: 'any-id' });

      expect(result).toEqual({ count: 1, data: null });
      expect(dataSource.fakeConnector.searchCalls.length).toBe(0);
    });
  });

  describe('deleteBy - postgres-parity alias for deleteAll (factory DELETE / route)', () => {
    test('routes through toWhere with the default-filter merge, same as deleteAll', async () => {
      dataSource.fakeConnector.deleteByFilterResponse = 7;

      const result = await repository.deleteBy({ where: { status: 'inactive' } });

      // deleteBy aliases deleteAll: count-only, no RETURNING on search engines.
      expect(result).toEqual({ count: 7, data: null });
      expect(dataSource.fakeConnector.searchCalls.length).toBe(0);

      const [call] = dataSource.fakeConnector.deleteByFilterCalls;
      expect(call.collection).toBe('products');
      expect(call.filterBy).toBe('(isActive:=true && status:=`inactive`)');
    });
  });

  describe('deleteAll', () => {
    test('with where -> merges default filter and uses deleteByFilter', async () => {
      dataSource.fakeConnector.deleteByFilterResponse = 7;

      const result = await repository.deleteAll({ where: { status: 'inactive' } });

      expect(result).toEqual({ count: 7, data: null });

      const [call] = dataSource.fakeConnector.deleteByFilterCalls;
      expect(call.collection).toBe('products');
      expect(call.filterBy).toBe('(isActive:=true && status:=`inactive`)');
      expect(dataSource.fakeConnector.deleteAllDocumentsCalls.length).toBe(0);
    });

    test('no where but a default filter is present -> filter delete, NOT truncate', async () => {
      dataSource.fakeConnector.deleteByFilterResponse = 4;

      const result = await repository.deleteAll();

      expect(result).toEqual({ count: 4, data: null });

      const [call] = dataSource.fakeConnector.deleteByFilterCalls;
      expect(call.filterBy).toBe('isActive:=true');
      expect(dataSource.fakeConnector.deleteAllDocumentsCalls.length).toBe(0);
    });

    test('no where and no default filter -> truncate ONLY on an explicit force', async () => {
      const noFilterRepository = new DefaultSearchRepository<any>(dataSource, {
        entityClass: ProductDocumentNoDefaultFilter,
      });
      dataSource.fakeConnector.deleteAllDocumentsResponse = true;

      // Without `force` this is refused: an unfiltered delete used to wipe the collection while reporting `{ count: 0 }`, so nothing surfaced the damage.
      const result = await noFilterRepository.deleteAll({ options: { force: true } });

      // Truncate reports no per-document count (an engine limitation) - count stays 0.
      expect(result).toEqual({ count: 0, data: null });
      expect(dataSource.fakeConnector.deleteAllDocumentsCalls.length).toBe(1);
      expect(dataSource.fakeConnector.deleteAllDocumentsCalls[0].collection).toBe(
        'products_no_default_filter',
      );
      expect(dataSource.fakeConnector.deleteByFilterCalls.length).toBe(0);
    });
  });
});
