import { beforeEach, describe, expect, test } from 'bun:test';
import { ApplicationError } from '@venizia/ignis-helpers';
import type { ISearchConnector } from '@/connectors/search';

interface IConformanceDocument extends Record<string, unknown> {
  id: string;
  title: string;
  score: number;
}

/**
 * Every search connector must satisfy this suite against an in-memory fake of its own client. It
 * asserts the NEUTRAL contract only - never an engine's wire shape - so a passing engine is
 * substitutable behind `ISearchConnector`. This is the artifact that makes the paradigm lift
 * falsifiable: a seam that only one engine can satisfy is not a seam.
 */
export const runConnectorConformance = (opts: {
  engine: string;
  build: () => Promise<{ connector: ISearchConnector; collection: string }>;
  /** `score > 0` in each engine's own filter grammar - the one thing the suite cannot write itself. */
  filters: { allPositiveScores: string; scoreAboveOne: string };
}): void => {
  const { engine, build, filters } = opts;

  describe(`ISearchConnector conformance - ${engine}`, () => {
    let connector: ISearchConnector;
    let collection: string;

    const seed = async (documents: IConformanceDocument[]): Promise<void> => {
      for (const document of documents) {
        await connector.document.create<IConformanceDocument>({ collection, document });
      }
    };

    beforeEach(async () => {
      ({ connector, collection } = await build());
    });

    test('ping() reports healthy', async () => {
      expect(await connector.ping()).toBe(true);
    });

    test('collection.exists() distinguishes present from absent', async () => {
      expect(await connector.collection.exists({ name: collection })).toBe(true);
      expect(await connector.collection.exists({ name: 'no-such-collection' })).toBe(false);
    });

    test('create() then get() round-trips a document', async () => {
      await seed([{ id: '1', title: 'alpha', score: 1 }]);

      const found = await connector.document.get<IConformanceDocument>({ collection, id: '1' });
      expect(found.title).toBe('alpha');
    });

    test('create() resolves only once the document is retrievable', async () => {
      await seed([{ id: '2', title: 'beta', score: 2 }]);

      // No sleep, no retry: an asynchronous engine must have awaited its own task before resolving.
      const found = await connector.document.get<IConformanceDocument>({ collection, id: '2' });
      expect(found.id).toBe('2');
    });

    test('update() merges rather than replaces', async () => {
      await seed([{ id: '3', title: 'gamma', score: 3 }]);

      await connector.document.update<IConformanceDocument>({
        collection,
        id: '3',
        document: { title: 'gamma-2' },
      });

      const found = await connector.document.get<IConformanceDocument>({ collection, id: '3' });
      expect(found.title).toBe('gamma-2');
      expect(found.score).toBe(3);
    });

    test('count() is exact, with and without a filter', async () => {
      await seed([
        { id: '1', title: 't-1', score: 1 },
        { id: '2', title: 't-2', score: 2 },
        { id: '3', title: 't-3', score: 3 },
      ]);

      expect(await connector.document.count({ collection })).toBe(3);
      expect(await connector.document.count({ collection, filterBy: filters.scoreAboveOne })).toBe(
        2,
      );
    });

    test('updateBy() patches every matching document and leaves the rest alone', async () => {
      await seed([
        { id: '1', title: 'old', score: 1 },
        { id: '2', title: 'old', score: 2 },
        { id: '3', title: 'old', score: 3 },
      ]);

      const result = await connector.document.updateBy<IConformanceDocument>({
        collection,
        document: { title: 'new' },
        filterBy: filters.scoreAboveOne,
      });

      expect(result.updatedCount).toBe(2);

      const patched = await connector.document.get<IConformanceDocument>({ collection, id: '2' });
      expect(patched.title).toBe('new');

      const untouched = await connector.document.get<IConformanceDocument>({ collection, id: '1' });
      expect(untouched.title).toBe('old');
    });

    test('deleteBy() removes matching documents and returns the count', async () => {
      await seed([
        { id: '1', title: 'a', score: 5 },
        { id: '2', title: 'b', score: 6 },
      ]);

      expect(
        await connector.document.deleteBy({ collection, filterBy: filters.allPositiveScores }),
      ).toBe(2);
      expect(await connector.document.count({ collection })).toBe(0);
    });

    test('deleteAll() empties the collection', async () => {
      await seed([{ id: '1', title: 'a', score: 1 }]);

      await connector.document.deleteAll({ collection });
      expect(await connector.document.count({ collection })).toBe(0);
    });

    test('delete() removes one document', async () => {
      await seed([{ id: '1', title: 'a', score: 1 }]);

      expect(await connector.document.delete({ collection, id: '1' })).toBe(true);
      expect(await connector.document.count({ collection })).toBe(0);
    });

    test('import() reports success and failure counts', async () => {
      const result = await connector.document.import<IConformanceDocument>({
        collection,
        documents: [
          { id: '1', title: 'a', score: 1 },
          { id: '2', title: 'b', score: 2 },
        ],
      });

      expect(result.count.success).toBe(2);
      expect(result.count.fail).toBe(0);
      expect(await connector.document.count({ collection })).toBe(2);
    });

    test('create() rejects a duplicate id; upsert() replaces', async () => {
      await seed([{ id: '1', title: 'first', score: 1 }]);

      let caught: unknown;
      try {
        await connector.document.create<IConformanceDocument>({
          collection,
          document: { id: '1', title: 'second', score: 2 },
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
      expect(
        (await connector.document.get<IConformanceDocument>({ collection, id: '1' })).title,
      ).toBe('first');

      // upsert is the explicit last-write-wins verb.
      await connector.document.upsert<IConformanceDocument>({
        collection,
        document: { id: '1', title: 'second', score: 2 },
      });
      expect(
        (await connector.document.get<IConformanceDocument>({ collection, id: '1' })).title,
      ).toBe('second');
    });

    test('create with duplicate id throws 409 already_exists', async () => {
      await seed([{ id: '1', title: 'first', score: 1 }]);

      let caught: unknown;
      try {
        await connector.document.create<IConformanceDocument>({
          collection,
          document: { id: '1', title: 'second', score: 2 },
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ApplicationError);
      expect((caught as ApplicationError).statusCode).toBe(409);
      expect((caught as ApplicationError).normalized.code).toBe(
        'core.search_engine.already_exists',
      );
    });

    test('export() returns every document, not just the first page', async () => {
      // Larger than any engine's internal fetch page size, so a single-fetch export truncates.
      const documents = Array.from({ length: 1200 }, (_, index) => ({
        id: String(index),
        title: `t-${index}`,
        score: 1,
      }));

      await connector.document.import<IConformanceDocument>({ collection, documents });

      const exported = await connector.document.export({ collection });
      const lines = exported.split('\n').filter(line => line.length > 0);

      expect(lines).toHaveLength(1200);
    });

    test('search hits preserve every stored document field', async () => {
      await seed([{ id: '1', title: 'alpha', score: 1 }]);

      const result = await connector.search<IConformanceDocument>({
        collection,
        params: { q: '*' },
      });

      // Engines attach response metadata to a hit; none of it may displace a stored field.
      expect(result.hits?.[0]?.document).toEqual({ id: '1', title: 'alpha', score: 1 });
    });

    test('search() returns the neutral envelope with isFoundExact set', async () => {
      await seed([{ id: '1', title: 'alpha', score: 1 }]);

      const result = await connector.search<IConformanceDocument>({
        collection,
        params: { q: '*' },
      });

      expect(typeof result.found).toBe('number');
      expect(typeof result.isFoundExact).toBe('boolean');
      expect(result.hits?.[0]?.document.id).toBe('1');
    });

    test('getting a missing document raises a not-found error', async () => {
      let caught: unknown;

      try {
        await connector.document.get({ collection, id: 'missing' });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeDefined();
    });
  });
};
