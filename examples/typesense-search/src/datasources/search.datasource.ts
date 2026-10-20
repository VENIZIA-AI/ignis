import { datasource } from '@venizia/ignis';
import { TypesenseDataSource } from '@venizia/ignis/typesense';
import { blankToUndefined } from '@venizia/ignis-helpers';

// Matches examples/typesense-search/docker-compose.yml, which maps host port 18108 to the
// container's 8108 - a non-default port so this example never clashes with another local Typesense.
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 18108;
const DEFAULT_API_KEY = 'xyz';

/**
 * The only datasource in this example - zero Postgres. Collections are discovered from every
 * `@repository` binding that targets this class, then provisioned (create-if-absent) at boot since
 * `autoProvision` is on; a production datasource would leave that off and provision out of band.
 */
@datasource()
export class SearchDataSource extends TypesenseDataSource {
  constructor() {
    super({
      name: SearchDataSource.name,
      autoProvision: true,
      config: {
        nodes: [
          {
            host: blankToUndefined(process.env.APP_ENV_TYPESENSE_HOST) ?? DEFAULT_HOST,
            port: Number(blankToUndefined(process.env.APP_ENV_TYPESENSE_PORT) ?? DEFAULT_PORT),
            protocol: blankToUndefined(process.env.APP_ENV_TYPESENSE_PROTOCOL) ?? 'http',
          },
        ],
        apiKey: blankToUndefined(process.env.APP_ENV_TYPESENSE_API_KEY) ?? DEFAULT_API_KEY,
      },
    });
  }
}
