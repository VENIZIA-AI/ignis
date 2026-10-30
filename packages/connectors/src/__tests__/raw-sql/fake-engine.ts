import type { IRawSqlConnector, IRawSqlResult, TRawSqlDriver, TRawSqlQuery } from '@/raw-sql';
import { BaseRawSqlDataSource } from '@/raw-sql';
import type { TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import { datasource } from '@venizia/ignis-kernel';
import type { AnyType } from '@venizia/ignis-helpers/common';

/**
 * A made-up analytics engine, the shape a ClickHouse or DuckDB adapter has: a client that runs SQL
 * text and a connector that turns a statement into that call. Nothing here is a real engine.
 */
export class FakeClient {
  readonly statements: string[] = [];
  ended = false;

  constructor(readonly settings: { host: string; token?: string }) {}

  async run(statement: string): Promise<Array<Record<string, unknown>>> {
    this.statements.push(statement);
    return [{ host: this.settings.host, statement }];
  }

  async end(): Promise<void> {
    this.ended = true;
  }
}

/** The extra method proves the repository sees the connector's own type, not `IRawSqlConnector`. */
export class FakeConnector implements IRawSqlConnector {
  constructor(private readonly client: FakeClient) {}

  async execute(query: TRawSqlQuery): Promise<IRawSqlResult> {
    const statement = typeof query === 'string' ? query : JSON.stringify(query);
    const result = await this.client.run(statement);
    return { rows: result };
  }

  hostName(): string {
    return this.client.settings.host;
  }
}

export class FakeDriver implements TRawSqlDriver<FakeConnector, FakeClient> {
  readonly client: FakeClient;

  constructor(opts: { client: FakeClient }) {
    this.client = opts.client;
  }

  createConnector(_opts: { schema: TAnyDataSourceSchema }): FakeConnector {
    return new FakeConnector(this.client);
  }

  getClient(): FakeClient {
    return this.client;
  }

  async end(): Promise<void> {
    await this.client.end();
  }
}

export interface IFakeSettings {
  host: string;
  token?: string;
}

export abstract class FakeEngineDataSource extends BaseRawSqlDataSource<
  IFakeSettings,
  FakeClient,
  FakeConnector
> {
  readonly builds: FakeClient[] = [];
  failNextConfigure = false;

  configure(): void {
    const client = new FakeClient({ ...this.getSettings() });
    this.builds.push(client);
    this.client = client;

    if (this.failNextConfigure) {
      throw new Error('bad rotated token');
    }
  }
}

@datasource({ driver: FakeDriver })
export class FakeDataSource extends FakeEngineDataSource {
  constructor() {
    super({ name: 'fake-engine', config: { host: 'analytics.local', token: 'old' } });
  }
}

export type TAnyDriver = AnyType;

/** bun's `expect().rejects` is not typed as a Thenable, so a rejection is captured explicitly. */
export const captureRejection = async (task: () => Promise<unknown>): Promise<unknown> => {
  try {
    await task();
  } catch (error) {
    return error;
  }

  return undefined;
};
