import { describe, expect, test } from 'bun:test';
import { MeilisearchConnector } from '@/connectors/meilisearch/connector';
import { FakeMeilisearchClient } from './fake-client';
import { captureRejection } from './test-helpers';

const buildConnector = (opts?: {
  client?: FakeMeilisearchClient;
}): { client: FakeMeilisearchClient; connector: MeilisearchConnector } => {
  const client = opts?.client ?? new FakeMeilisearchClient();
  const connector = new MeilisearchConnector({
    name: 'meili-review',
    host: 'http://localhost:7700',
    taskIntervalMs: 1,
    client,
  });

  return { client, connector };
};

describe('MeilisearchConnector - explicit id wins over a pk-carrying patch', () => {
  test('updateDocument targets the path id, never the id embedded in the patch', async () => {
    const { client, connector } = buildConnector();
    await connector.collection.ensure({
      schema: { uid: 'articles', primaryKey: 'id', settings: {} },
    });
    await connector.document.create({
      collection: 'articles',
      document: { id: '1', title: 'old' },
    });

    await connector.document.update<{ id: string; title: string }>({
      collection: 'articles',
      id: '1',
      // A patch that carries a DIFFERENT primary key must not redirect the write.
      document: { id: '999', title: 'new' },
    });

    // The payload that reached the SDK carries the TARGET id, not the patch's id.
    const payload = client.updateDocumentsCalls[0]?.[0] as Record<string, unknown>;
    expect(payload['id']).toBe('1');

    const updated = await connector.document.get<{ id: string; title: string }>({
      collection: 'articles',
      id: '1',
    });
    expect(updated.title).toBe('new');

    // The patch's id must NOT have spawned a second row.
    const stray = await captureRejection(() =>
      connector.document.get({ collection: 'articles', id: '999' }),
    );
    expect(stray).toBeDefined();
  });

  test('updateByFilter keeps each matched row on its own id', async () => {
    const { client, connector } = buildConnector();
    await connector.collection.ensure({
      schema: { uid: 'articles', primaryKey: 'id', settings: {} },
    });
    for (const id of ['1', '2', '3']) {
      await connector.document.create({
        collection: 'articles',
        document: { id, score: Number(id), title: 'old' },
      });
    }

    const result = await connector.document.updateBy<{ id: string; title: string }>({
      collection: 'articles',
      // A pk-carrying patch would collapse every match onto id '999' under the old spread order.
      document: { id: '999', title: 'new' },
      filterBy: 'score > 1',
    });

    expect(result.updatedCount).toBe(2);

    const sentIds = client.updateDocumentsCalls
      .flat()
      .map(entry => (entry as Record<string, unknown>)['id']);
    expect(sentIds.sort()).toEqual(['2', '3']);

    for (const id of ['2', '3']) {
      const patched = await connector.document.get<{ id: string; title: string }>({
        collection: 'articles',
        id,
      });
      expect(patched.title).toBe('new');
    }

    const collapsed = await captureRejection(() =>
      connector.document.get({ collection: 'articles', id: '999' }),
    );
    expect(collapsed).toBeDefined();
  });
});

describe('MeilisearchConnector - updateDocument on a missing id throws 404', () => {
  test('a missing id raises the not-found error and issues no write', async () => {
    const { client, connector } = buildConnector();
    await connector.collection.ensure({
      schema: { uid: 'articles', primaryKey: 'id', settings: {} },
    });

    const error = await captureRejection(() =>
      connector.document.update({
        collection: 'articles',
        id: 'missing',
        document: { title: 'x' },
      }),
    );

    expect((error as { statusCode?: number }).statusCode).toBe(404);
    expect((error as { normalized?: { code?: string } }).normalized?.code).toBe(
      'core.search_engine.not_found',
    );
    // The upsert must never fire for an absent target.
    expect(client.updateDocumentsCalls).toHaveLength(0);
  });
});

describe('MeilisearchConnector - resolvePrimaryKey failures are sanitized', () => {
  /** A client whose `getIndex` explodes with a raw engine error - resolvePrimaryKey must not leak it. */
  class GetIndexFailingClient extends FakeMeilisearchClient {
    override async getIndex(): Promise<unknown> {
      throw new Error('raw engine explosion at getIndex');
    }
  }

  test('a raw getIndex failure surfaces as the sanitized dependency error', async () => {
    // No ensure(): the collection is uncached, so createDocument must reach getIndex.
    const client = new GetIndexFailingClient();
    const { connector } = buildConnector({ client });

    const error = await captureRejection(() =>
      connector.document.create({ collection: 'articles', document: { id: '1' } }),
    );

    expect((error as { statusCode?: number }).statusCode).toBe(503);
    expect((error as { normalized?: { code?: string } }).normalized?.code).toBe(
      'core.search_engine.dependency_unavailable',
    );
    expect((error as Error).message).not.toMatch(/raw engine explosion/);
  });
});

describe('MeilisearchConnector - import failure carries partial progress', () => {
  test('a failing second batch reports processedCount equal to the first batch size', async () => {
    // Fail the SECOND addDocuments call; batch size 2 means the first two documents land.
    const client = new FakeMeilisearchClient({ failAddDocumentsCall: 2 });
    const { connector } = buildConnector({ client });
    await connector.collection.ensure({
      schema: { uid: 'articles', primaryKey: 'id', settings: {} },
    });

    const documents = [
      { id: '1', score: 1 },
      { id: '2', score: 2 },
      { id: '3', score: 3 },
      { id: '4', score: 4 },
    ];

    const error = await captureRejection(() =>
      connector.document.import({ collection: 'articles', documents, batchSize: 2 }),
    );

    const details = (error as { extra?: { details?: Record<string, unknown> } }).extra?.details;
    expect(details?.['totalCount']).toBe(4);
    expect(details?.['processedCount']).toBe(2);
  });
});
