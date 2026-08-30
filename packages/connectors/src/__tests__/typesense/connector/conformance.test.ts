import { TypesenseConnector } from '@/search/typesense/connector';
import { runConnectorConformance } from '../../search/conformance/connector-conformance';
import { StatefulFakeTypesenseClient } from '../../search/conformance/stateful-typesense-client';
import { makeHelper } from './fake-client';

runConnectorConformance({
  engine: 'typesense',
  filters: { allPositiveScores: 'score:>0', scoreAboveOne: 'score:>1' },
  build: async () => {
    const client = new StatefulFakeTypesenseClient();
    const connector = new TypesenseConnector({
      name: 'conformance',
      nodes: [{ host: 'localhost', port: 8108 }],
      apiKey: 'k',
      client,
    });

    await connector.collection.ensure({ schema: { name: 'articles', fields: [] } });
    return { connector, collection: 'articles' };
  },
  buildWithFailingHealth: async () => {
    const { helper: connector } = makeHelper({
      throwOn: { 'health.retrieve': new Error('probe down') },
    });
    return { connector };
  },
  buildWithFailingExistenceCheck: async () => {
    const { helper: connector } = makeHelper({
      throwOn: { 'collections.exists': new Error('existence check down') },
    });
    return { connector };
  },
});
