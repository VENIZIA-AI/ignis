import { MeilisearchConnector } from '@/connectors/meilisearch/connector';
import { runConnectorConformance } from '../../search/conformance/connector-conformance';
import { FakeMeilisearchClient } from './fake-client';

runConnectorConformance({
  engine: 'meilisearch',
  filters: { allPositiveScores: 'score > 0', scoreAboveOne: 'score > 1' },
  build: async () => {
    const client = new FakeMeilisearchClient();
    const connector = new MeilisearchConnector({
      name: 'conformance',
      host: 'http://localhost:7700',
      taskIntervalMs: 1,
      client,
    });

    await connector.collection.ensure({
      schema: { uid: 'articles', primaryKey: 'id', settings: {} },
    });
    return { connector, collection: 'articles' };
  },
});
