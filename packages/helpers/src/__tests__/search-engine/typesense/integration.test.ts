import { describe, test, expect } from 'bun:test';
import { TypesenseHelper } from '@/modules/search-engine/typesense/helper';
import { TypesenseImportActions } from '@/modules/search-engine/typesense/types';

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

describe.if(hasEnv)('TypesenseHelper integration (live)', () => {
  const helper = new TypesenseHelper({
    name: 'integration',
    nodes: hasEnv ? parseNodes(rawNodes as string) : [{ host: 'localhost', port: 8108 }],
    apiKey: apiKey ?? '',
  });
  const collection = 'ignis_helper_it';

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
      } as never,
    });

    const importResult = await helper.importDocuments({
      collection,
      documents: [
        { id: '1', title: 'Running Shoe' },
        { id: '2', title: 'Hiking Boot' },
      ],
      action: TypesenseImportActions.UPSERT,
    });
    expect(importResult.successCount).toBe(2);

    const search = await helper.search({
      collection,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      params: { q: 'shoe', query_by: 'title' } as never,
    });
    expect(search.found).toBeGreaterThanOrEqual(1);

    expect(await helper.deleteCollection({ name: collection })).toBe(true);
  });
});

describe.if(!hasEnv)('TypesenseHelper integration (skipped)', () => {
  test('skipped without APP_ENV_TYPESENSE_NODES / APP_ENV_TYPESENSE_API_KEY', () => {
    expect(hasEnv).toBe(false);
  });
});
