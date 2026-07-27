import { EnvironmentKeys } from '@/common/environments';
import { datasource } from '@venizia/ignis';
import { TypesenseDataSource } from '@venizia/ignis/typesense';
import { applicationEnvironment, int, toDelimitedArray } from '@venizia/ignis-helpers';

/**
 * SearchDataSource - the only datasource in this example, zero Postgres.
 *
 * Same auto-discovery contract as the SQL branch's BaseDataSource: collections are discovered
 * from every @repository binding that points at this class, then provisioned (additive-only,
 * via ensureCollection()) when configure() runs during boot. `configure()` needs no override
 * here - TypesenseDataSource already implements discovery + provisioning.
 */
/** `APP_ENV_TYPESENSE_NODES` (comma-separated `host:port`) enables cluster mode; falls back to the single HOST/PORT pair. */
const resolveNodes = (): Array<{ host: string; port: number; protocol: string }> => {
  const protocol = applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_TYPESENSE_PROTOCOL);

  // env get() transform: raw csv -> parsed node list in one read.
  const clusterNodes = applicationEnvironment.get<
    Array<{ host: string; port: number; protocol: string }>,
    string
  >(EnvironmentKeys.APP_ENV_TYPESENSE_NODES, {
    defaultValue: [],
    transform: value =>
      toDelimitedArray(value).map(entry => {
        const [host, port] = entry.split(':');
        return { host, port: int(port), protocol };
      }),
  });

  if (clusterNodes.length > 0) {
    return clusterNodes;
  }

  return [
    {
      host: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_TYPESENSE_HOST),
      port: int(applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_TYPESENSE_PORT)),
      protocol,
    },
  ];
};

@datasource()
export class SearchDataSource extends TypesenseDataSource {
  constructor() {
    super({
      name: SearchDataSource.name,
      config: {
        nodes: resolveNodes(),
        apiKey: applicationEnvironment.get<string>(EnvironmentKeys.APP_ENV_TYPESENSE_API_KEY),
      },
      // NO schema property - auto-discovered from @repository bindings, same as the Postgres branch.
    });
  }
}
