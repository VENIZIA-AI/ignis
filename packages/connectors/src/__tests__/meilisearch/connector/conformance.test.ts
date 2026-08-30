import { MeilisearchConnector } from '@/search/meilisearch/connector';
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
  buildWithFailingHealth: async () => {
    const client = new FakeMeilisearchClient({ healthError: new Error('probe down') });
    const connector = new MeilisearchConnector({
      name: 'conformance-unhealthy',
      host: 'http://localhost:7700',
      taskIntervalMs: 1,
      client,
    });
    return { connector };
  },
  buildWithFailingExistenceCheck: async () => {
    const client = new FakeMeilisearchClient({ getIndexError: new Error('existence check down') });
    const connector = new MeilisearchConnector({
      name: 'conformance-existence-check-failure',
      host: 'http://localhost:7700',
      taskIntervalMs: 1,
      client,
    });
    return { connector };
  },
});
