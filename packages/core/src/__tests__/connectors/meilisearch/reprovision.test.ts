import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@venizia/ignis-helpers';
import { MeilisearchConnector } from '@/connectors/meilisearch/connector';
import { FakeMeilisearchClient } from './connector/fake-client';

/** Creating an existing index is the NORMAL path on restart with auto-provisioning. Meilisearch
 * reports it as a FAILED TASK (`index_already_exists`), not a thrown API error - the sanitized-503
 * wrap must not destroy the code, or the already-exists tolerance can never fire. */
const buildConnector = (client: FakeMeilisearchClient) => {
  return new MeilisearchConnector({
    name: 'reprovision-connector',
    host: 'http://localhost:7700',
    client: client as AnyType,
  }) as AnyType;
};

const plan = { uid: 'products', primaryKey: 'id', settings: {} };

describe('createCollection is idempotent - a second boot must not die', () => {
  test('creating an index that already exists is tolerated, not a 503', async () => {
    const client = new FakeMeilisearchClient();
    const connector = buildConnector(client);

    await connector.createCollection({ schema: plan });

    // Second boot, same app, same index.
    await connector.createCollection({ schema: plan });

    expect(await client.getIndexes()).toEqual({ results: [{ uid: 'products' }] });
  });

  test('a task that fails as index_already_exists is tolerated even when it is not a thrown error', async () => {
    const client = new FakeMeilisearchClient({
      taskStatuses: ['failed'],
      taskError: { code: 'index_already_exists', message: 'Index `products` already exists.' },
    });
    const connector = buildConnector(client);

    // The engine accepted the request (202) and then failed the TASK - the shape a live Meilisearch
    // actually produces. A fake that throws synchronously instead would hide this entirely.
    expect(await connector.createCollection({ schema: plan })).toBeUndefined();
  });

  test('a task that fails for any OTHER reason still surfaces as a dependency error', async () => {
    const client = new FakeMeilisearchClient({
      taskStatuses: ['failed'],
      taskError: { code: 'internal', message: 'disk full' },
    });
    const connector = buildConnector(client);

    let thrown: unknown;
    try {
      await connector.createCollection({ schema: plan });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeDefined();
  });
});
