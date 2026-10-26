import type { TAnyDataSourceSchema } from '@venizia/ignis-kernel';

/**
 * What every connector driver supplies, whatever the engine: a connector built over its client, the
 * raw client, and its teardown. A relational driver adds connection acquisition for transactions
 * (`IRelationalDriver`); a raw-SQL driver adds nothing. `configure()` stays app-written: the
 * framework never builds the driver for you.
 */
export interface IConnectorDriver<TConnector, Client = unknown> {
  createConnector(opts: { schema: TAnyDataSourceSchema }): TConnector;
  getClient(): Client;
  end(): Promise<void>;
}
