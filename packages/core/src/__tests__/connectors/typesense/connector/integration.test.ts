// Env-gated (skips unless APP_ENV_TYPESENSE_NODES / APP_ENV_TYPESENSE_API_KEY are set).
import { describe, test, expect } from 'bun:test';
import { TypesenseConnector } from '@/connectors/typesense/connector';
import { TypesenseImportActions } from '@/connectors/typesense/types';

const rawNodes = process.env['APP_ENV_TYPESENSE_NODES'];
const apiKey = process.env['APP_ENV_TYPESENSE_API_KEY'];
const hasEnv = Boolean(rawNodes && apiKey);

const parseNodes = (value: string) =>
  value.split(',').map(part => {
    const [protocol, host, port] = part.split(':');
    return {
      protocol: protocol || 'http',
      host: host || 'localhost',
      port: parseInt(port || '8108', 10),
    };
  });

describe.if(hasEnv)('TypesenseConnector integration (live)', () => {
  const helper = new TypesenseConnector({
    name: 'integration',
    nodes: hasEnv ? parseNodes(rawNodes as string) : [{ host: 'localhost', port: 8108 }],
    apiKey: apiKey ?? '',
  });
  const collection = 'ignis_core_it';

  test('create → import → search → delete round-trip', async () => {
    expect(await helper.ping()).toBe(true);
    await helper.deleteCollection({ name: collection });
    await helper.createCollection({
      schema: {
        name: collection,
        fields: [
          { name: 'id', type: 'string' },
          { name: 'title', type: 'string' },
        ],
      },
    });

    const importResult = await helper.importDocuments({
      collection,
      documents: [
        { id: '1', title: 'Running Shoe' },
        { id: '2', title: 'Hiking Boot' },
      ],
      action: TypesenseImportActions.UPSERT,
    });
    expect(importResult.count.success).toBe(2);

    const searchParams: Record<string, unknown> = { q: 'shoe' };
    searchParams['query_by'] = 'title';
    const search = await helper.search({ collection, params: searchParams });
    expect(search.found).toBeGreaterThanOrEqual(1);

    expect(await helper.deleteCollection({ name: collection })).toBe(true);
  });
});

describe.if(!hasEnv)('TypesenseConnector integration (skipped)', () => {
  test('skipped without APP_ENV_TYPESENSE_NODES / APP_ENV_TYPESENSE_API_KEY', () => {
    expect(hasEnv).toBe(false);
  });
});
