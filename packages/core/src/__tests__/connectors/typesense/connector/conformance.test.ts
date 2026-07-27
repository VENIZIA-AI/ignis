import { TypesenseConnector } from '@/connectors/typesense/connector';
import { runConnectorConformance } from '../../search/conformance/connector-conformance';
import { StatefulFakeTypesenseClient } from '../../search/conformance/stateful-typesense-client';

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
});
