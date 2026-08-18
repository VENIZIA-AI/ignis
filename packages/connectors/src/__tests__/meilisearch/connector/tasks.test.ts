import { beforeEach, describe, expect, test } from 'bun:test';
import { MeilisearchConnector } from '@/search/meilisearch/connector';
import { MeilisearchTaskStatuses } from '@/search/meilisearch/types';
import { FakeMeilisearchClient } from './fake-client';
import { captureRejection } from './test-helpers';

const buildConnector = async (opts?: {
  taskStatuses?: string[];
  repeatLast?: boolean;
  taskError?: unknown;
  taskTimeoutMs?: number;
  taskIntervalMs?: number;
}) => {
  const client = new FakeMeilisearchClient({
    taskStatuses: opts?.taskStatuses,
    repeatLast: opts?.repeatLast,
    taskError: opts?.taskError,
  });

  const connector = new MeilisearchConnector({
    name: 'meili-test',
    host: 'http://localhost:7700',
    taskTimeoutMs: opts?.taskTimeoutMs,
    taskIntervalMs: opts?.taskIntervalMs ?? 1,
    client,
  });

  return { client, connector };
};

describe('MeilisearchConnector - waitForTask', () => {
  test('a write polls until the task reaches succeeded', async () => {
    const { client, connector } = await buildConnector({
      taskStatuses: [
        MeilisearchTaskStatuses.ENQUEUED,
        MeilisearchTaskStatuses.PROCESSING,
        MeilisearchTaskStatuses.SUCCEEDED,
      ],
    });

    await connector.collection.ensure({
      schema: { uid: 'articles', primaryKey: 'id', settings: {} },
    });

    const before = client.taskPollCount;
    await connector.document.create({ collection: 'articles', document: { id: '1', title: 'a' } });

    // enqueued -> processing -> succeeded: three polls for the single create task.
    expect(client.taskPollCount - before).toBe(3);
  });

  test('a create resolves only once the document is retrievable - no sleep, no retry', async () => {
    const { connector } = await buildConnector({
      taskStatuses: [MeilisearchTaskStatuses.ENQUEUED, MeilisearchTaskStatuses.SUCCEEDED],
    });

    await connector.collection.ensure({
      schema: { uid: 'articles', primaryKey: 'id', settings: {} },
    });
    await connector.document.create({ collection: 'articles', document: { id: '2', title: 'b' } });

    const found = await connector.document.get<{ id: string }>({ collection: 'articles', id: '2' });
    expect(found.id).toBe('2');
  });

  test('a failed task raises the sanitized dependency error', async () => {
    const { connector } = await buildConnector({
      taskStatuses: [MeilisearchTaskStatuses.SUCCEEDED],
    });
    await connector.collection.ensure({
      schema: { uid: 'articles', primaryKey: 'id', settings: {} },
    });

    const { connector: failing } = await buildConnector({
      taskStatuses: [MeilisearchTaskStatuses.FAILED],
      taskError: { code: 'internal', message: 'boom' },
    });

    const error = await captureRejection(() =>
      failing.collection.ensure({ schema: { uid: 'x', primaryKey: 'id', settings: {} } }),
    );

    expect((error as Error).message).toMatch(/temporarily unavailable/);
  });

  test('a task that never terminates times out', async () => {
    const { connector } = await buildConnector({
      taskStatuses: [MeilisearchTaskStatuses.ENQUEUED],
      repeatLast: true,
      taskTimeoutMs: 20,
      taskIntervalMs: 2,
    });

    const error = await captureRejection(() =>
      connector.collection.ensure({ schema: { uid: 'articles', settings: {} } }),
    );

    expect((error as Error).message).toMatch(/timed out/i);
  });
});

describe('MeilisearchConnector - count and updateBy', () => {
  let connector: MeilisearchConnector;

  beforeEach(async () => {
    ({ connector } = await buildConnector());
    await connector.collection.ensure({
      schema: { uid: 'articles', primaryKey: 'id', settings: {} },
    });
  });

  test('count() reads the exact total from the document route, never the search route', async () => {
    for (const id of ['1', '2', '3']) {
      await connector.document.create({
        collection: 'articles',
        document: { id, score: Number(id) },
      });
    }

    expect(await connector.document.count({ collection: 'articles' })).toBe(3);
    expect(await connector.document.count({ collection: 'articles', filterBy: 'score > 1' })).toBe(
      2,
    );
  });

  test('updateBy() patches every matching document and preserves untouched fields', async () => {
    for (const id of ['1', '2', '3']) {
      await connector.document.create({
        collection: 'articles',
        document: { id, score: Number(id), title: 'old' },
      });
    }

    const result = await connector.document.updateBy<{ title: string }>({
      collection: 'articles',
      document: { title: 'new' },
      filterBy: 'score > 1',
    });

    expect(result.updatedCount).toBe(2);

    const patched = await connector.document.get<{ title: string; score: number }>({
      collection: 'articles',
      id: '2',
    });
    expect(patched.title).toBe('new');
    // Merge, not replace: `score` survives the patch.
    expect(patched.score).toBe(2);

    const untouched = await connector.document.get<{ title: string }>({
      collection: 'articles',
      id: '1',
    });
    expect(untouched.title).toBe('old');
  });

  test('updateBy() pages past a single fetch page', async () => {
    // 2500 documents > the 1000-document fetch page size, so `collectMatchingIds` must loop.
    const documents = Array.from({ length: 2500 }, (_, index) => ({
      id: String(index),
      score: 5,
      title: 'old',
    }));

    await connector.document.import({ collection: 'articles', documents });

    const result = await connector.document.updateBy<{ title: string }>({
      collection: 'articles',
      document: { title: 'new' },
      filterBy: 'score > 1',
    });

    expect(result.updatedCount).toBe(2500);

    const last = await connector.document.get<{ title: string }>({
      collection: 'articles',
      id: '2499',
    });
    expect(last.title).toBe('new');
  });
});

describe('MeilisearchConnector - engine-specific groups', () => {
  test('swap exchanges two indexes atomically; alias does not exist', async () => {
    const { connector } = await buildConnector();

    await connector.collection.ensure({ schema: { uid: 'live', primaryKey: 'id', settings: {} } });
    await connector.collection.ensure({ schema: { uid: 'next', primaryKey: 'id', settings: {} } });
    await connector.document.create({ collection: 'next', document: { id: 'new' } });

    await connector.swap.indexes({ pairs: [['live', 'next']] });

    const swapped = await connector.document.get<{ id: string }>({
      collection: 'live',
      id: 'new',
    });
    expect(swapped.id).toBe('new');

    // `alias` is absent from MeilisearchConnector - a runtime witness of a compile-time fact.
    expect(Reflect.get(connector, 'alias')).toBeUndefined();
  });

  test('synonyms round-trip through the flat per-index dictionary', async () => {
    const { connector } = await buildConnector();
    await connector.collection.ensure({ schema: { uid: 'products', settings: {} } });

    await connector.synonyms.set({
      collection: 'products',
      items: [{ id: 'jacket', synonyms: ['jacket', 'coat'] }],
    });

    const stored = await connector.synonyms.get({ collection: 'products' });
    expect(stored).toEqual([
      { id: 'jacket', synonyms: ['coat'] },
      { id: 'coat', synonyms: ['jacket'] },
    ]);
  });

  test('union multi-search throws NotSupported rather than silently degrading', async () => {
    const { connector } = await buildConnector();

    const error = await captureRejection(() =>
      connector.multiSearch({ searches: [], union: true }),
    );

    expect((error as Error).message).toMatch(/Union multi-search is not supported/);
  });

  test('patchSchema throws - Meilisearch is schemaless', async () => {
    const { connector } = await buildConnector();

    expect(() => connector.collection.patchSchema({ name: 'articles', fields: [] })).toThrow(
      /schemaless/,
    );
  });
});

describe('MeilisearchConnector - search mapping', () => {
  test('page mode reports an exact total; offset mode reports an estimate', async () => {
    const { connector } = await buildConnector();
    await connector.collection.ensure({
      schema: { uid: 'articles', primaryKey: 'id', settings: {} },
    });
    await connector.document.create({ collection: 'articles', document: { id: '1', title: 'a' } });

    const exact = await connector.search({
      collection: 'articles',
      params: { q: '*', hitsPerPage: 10, page: 1 },
    });
    expect(exact.found).toBe(1);
    expect(exact.isFoundExact).toBe(true);

    const estimated = await connector.search({ collection: 'articles', params: { q: '*' } });
    expect(estimated.found).toBe(1);
    expect(estimated.isFoundExact).toBe(false);
  });

  test('reserved response metadata is stripped, and _geo - a stored field - survives', async () => {
    const { connector } = await buildConnector();
    await connector.collection.ensure({
      schema: { uid: 'articles', primaryKey: 'id', settings: {} },
    });
    await connector.document.create({
      collection: 'articles',
      document: { id: '1', title: 'a', _geo: { lat: 1, lng: 2 } },
    });

    const result = await connector.search<{ id: string; title: string }>({
      collection: 'articles',
      params: { q: '*', hitsPerPage: 10 },
    });

    // `_geo` is the ONLY name Meilisearch accepts for a geo field, so stripping by `_` prefix would delete it from every hit.
    expect(result.hits?.[0]?.document).toEqual({
      id: '1',
      title: 'a',
      _geo: { lat: 1, lng: 2 },
    } as never);

    // Engine-attached response metadata does not leak into the document.
    expect(Reflect.get(result.hits?.[0]?.document ?? {}, '_rankingScore')).toBeUndefined();
    expect(Reflect.get(result.hits?.[0]?.document ?? {}, '_formatted')).toBeUndefined();
    expect(result.hits?.[0]?.score).toBe(0.9);
  });

  test('searching a missing collection returns an empty result rather than throwing', async () => {
    const { connector } = await buildConnector();

    const result = await connector.search({ collection: 'nope', params: { q: '*' } });
    expect(result.found).toBe(0);
    expect(result.hits).toEqual([]);
  });
});

describe('MeilisearchConnector - importDocuments keeps framework-shaped errors intact', () => {
  test('a batch whose task times out surfaces the 504 task_timeout, not a generic 503', async () => {
    // The index is seeded directly on the fake because statuses are per-task and an ensure() call would consume the hang too, leaving the import's task enqueued past the deadline so waitForTask's shaped 504 reaches the batch catch.
    const { client, connector } = await buildConnector({
      taskStatuses: [MeilisearchTaskStatuses.ENQUEUED],
      repeatLast: true,
      taskTimeoutMs: 20,
      taskIntervalMs: 2,
    });
    await client.createIndex('articles', {});

    const error = await captureRejection(() =>
      connector.importDocuments({
        collection: 'articles',
        documents: [{ id: '1', title: 'A' }],
      }),
    );

    // waitForTask already shaped this failure as 504 + task_timeout; re-wrapping it as a 503 dependency_unavailable would erase the timeout semantics the caller needs.
    expect((error as { statusCode?: number }).statusCode).toBe(504);
    expect((error as { normalized?: { code?: string } }).normalized?.code).toBe(
      'core.search_engine.task_timeout',
    );

    // Partial progress rides along on the shaped error too - the batches before the timeout are already persisted server-side.
    const details = (error as { extra?: { details?: Record<string, unknown> } }).extra?.details;
    expect(details?.['totalCount']).toBe(1);
    expect(details?.['processedCount']).toBe(0);
  });
});
