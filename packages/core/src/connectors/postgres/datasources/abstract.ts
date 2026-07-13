import type { TAnyDataSourceSchema } from '@/base/datasources';
import { AbstractDataSource } from '@/base/datasources';
import type { IRelationalDriver } from '@/connectors/postgres/drivers';
import { resolveDatabaseDriver } from '@/connectors/postgres/drivers';
import type { IRelationalQueryDialect } from '@/connectors/postgres/repositories/common';
import { FilterBuilder } from '@/connectors/postgres/repositories/dialect/filter';
import type { ValueOrPromise } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';
import type { Pool } from 'pg';
import type {
  IDatabaseTransaction,
  IDatabaseTransactionOptions,
  IPostgresDataSource,
  TRelationalConnector,
} from './common';

/** SQL branch root: connector, pool, transactions. */
export abstract class AbstractRelationalDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
  Client = Pool,
>
  extends AbstractDataSource<Settings, Schema, ConfigurableOptions>
  implements IPostgresDataSource<Settings, Schema, ConfigurableOptions, Client>
{
  connector: TRelationalConnector<Schema>;

  /**
   * The raw driver client a pool-only datasource was configured with: a `pg.Pool`, a postgres-js
   * `Sql`. Genuinely absent once `configure()` wires a driver instead - every reader guards.
   */
  protected client?: Client;

  /** Owns connection acquisition and the raw control statements. Assign in `configure()`. */
  protected driver?: IRelationalDriver<Schema>;

  private static queryDialect?: IRelationalQueryDialect;

  private driverResolution?: Promise<IRelationalDriver<Schema>>;

  /**
   * Adopts a pool-only datasource (no `this.driver` set) into whichever driver matches its client,
   * once. No warning is logged: the adoption is exact, and a boot-time warning on every legacy
   * datasource would be noise, not information.
   *
   * Async because the concrete driver is imported on demand - see `resolveDatabaseDriver`. The
   * in-flight promise is cached, not just its result, so concurrent `beginTransaction()` calls
   * share one driver over one pool instead of each constructing their own.
   */
  protected async resolveDriver(): Promise<IRelationalDriver<Schema>> {
    if (this.driver) {
      return this.driver;
    }

    if (!this.client) {
      throw getError({
        message: `[${this.constructor.name}][resolveDriver] No driver and no client | Assign this.driver in configure()`,
      });
    }

    this.driverResolution ??= resolveDatabaseDriver<Schema>({ client: this.client });

    try {
      this.driver = await this.driverResolution;
    } catch (error) {
      // A rejected resolution must not stay cached: the failure can be transient (module load,
      // classification against a not-yet-ready client), and a poisoned cache would fail every
      // later transaction with this stale error forever.
      this.driverResolution = undefined;
      this.logger
        .for(this.resolveDriver.name)
        .error('Driver resolution failed - will retry on the next call | Error: %s', error);
      throw error;
    }

    return this.driver;
  }

  /**
   * Wires a driver in one step: assigns `this.driver` AND builds `this.connector` from it. The
   * two-step form (driver set, connector forgotten) yields a datasource whose pooled queries
   * silently bypass the driver - this helper makes that state unrepresentable. `schema` defaults to
   * `getSchema()`; pass it explicitly when configure() computes the schema locally.
   */
  protected useDriver(opts: { driver: IRelationalDriver<Schema>; schema?: Schema }): void {
    this.driver = opts.driver;
    this.connector = opts.driver.createConnector({ schema: opts.schema ?? this.getSchema() });
  }

  abstract getConnectionString(): ValueOrPromise<string>;
  abstract override beginTransaction(
    opts?: IDatabaseTransactionOptions,
  ): Promise<IDatabaseTransaction<Schema>>;

  getConnector() {
    return this.connector;
  }

  /**
   * The raw driver client: `pg.Pool` for node-postgres, `Sql` for postgres-js. Stays synchronous by
   * reading the configured client directly when no driver has been resolved yet - for a bare client
   * there is nothing to await. Throws rather than handing back an `undefined` typed as `Client`.
   */
  getClient(): Client {
    if (this.driver) {
      return this.driver.getClient() as Client;
    }

    if (!this.client) {
      throw getError({
        message: `[${this.constructor.name}][getClient] No driver and no client | Assign this.driver in configure()`,
      });
    }

    return this.client;
  }

  getQueryDialect(): IRelationalQueryDialect {
    AbstractRelationalDataSource.queryDialect ??= new FilterBuilder();

    return AbstractRelationalDataSource.queryDialect;
  }
}
