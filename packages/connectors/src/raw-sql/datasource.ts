import { AbstractDriverDataSource } from '@/common/driver-data-source';
import type {
  IRawSqlConnector,
  IRawSqlResult,
  TRawSqlDriver,
  TRawSqlQuery,
  TRawSqlSchema,
} from './common';

/**
 * Datasource for an engine that only runs raw SQL and returns rows. It has the normal lifecycle
 * (configure, driver wiring from `@datasource({ driver })` or `useDriver`, close once, soft-evict
 * after a secret rotation) and nothing else: no dialect, no executor, no connection string, no
 * transactions - `beginTransaction()` stays the kernel's NotSupported and `getCapabilities()` says
 * `{ transactions: false }`.
 *
 * `configure()` stays app-written: build the engine's client and assign `this.client`. IGNIS ships
 * no engine connector; the app supplies one `IRawSqlConnector` and one driver (see the
 * "Raw SQL engines" guide).
 */
export abstract class BaseRawSqlDataSource<
  Settings extends object = {},
  Client = unknown,
  TConnector extends IRawSqlConnector = IRawSqlConnector,
  ConfigurableOptions extends object = {},
> extends AbstractDriverDataSource<
  Settings,
  TRawSqlSchema,
  ConfigurableOptions,
  Client,
  TConnector,
  TRawSqlDriver<TConnector, Client>
> {
  constructor(opts: { name: string; config: Settings }) {
    super({ scope: opts.name });

    this.name = opts.name;
    this.settings = opts.config;
    this.schema = {};
  }

  /** The statement run through the connector, so a caller holding the datasource needs no connector in hand. */
  execute(query: TRawSqlQuery): Promise<IRawSqlResult> {
    return this.getConnector().execute(query);
  }
}
