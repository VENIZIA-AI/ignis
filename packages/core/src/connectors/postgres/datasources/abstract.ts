import type { TAnyDataSourceSchema } from '@/base/datasources';
import { AbstractDataSource } from '@/base/datasources';
import type { IRelationalDriver } from '@/connectors/postgres/drivers';
import type { IRelationalQueryDialect } from '@/connectors/postgres/repositories/common';
import { FilterBuilder } from '@/connectors/postgres/repositories/dialect/filter';
import { MetadataRegistry } from '@/helpers/inversion';
import type { TClass, ValueOrPromise } from '@venizia/ignis-helpers';
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

  protected client?: Client;
  protected driver?: IRelationalDriver<Schema>;

  private static queryDialect?: IRelationalQueryDialect;

  /**
   * Builds the driver class named by `@datasource({ driver })` over the client `configure()`
   * assigned, then wires the connector from it. Idempotent and lazy.
   */
  protected wireDriverFromMetadata(): void {
    if (this.connector) {
      return;
    }

    if (this.driver) {
      this.connector = this.driver.createConnector({ schema: this.getSchema() });
      return;
    }

    if (!this.client) {
      throw getError({
        message: `[${this.constructor.name}][wireDriverFromMetadata] No driver and no client | Assign this.client in configure(), or wire a custom driver with useDriver()`,
      });
    }

    // Absent for an imperatively-registered datasource.
    const metadata = MetadataRegistry.getInstance().getDataSourceMetadata({
      target: this.constructor,
    });
    const driver = metadata?.driver;

    // The type forbids a driver-name string, so this catches an untyped JavaScript caller - and a
    // string is exactly the mistake to catch, because it carries no module into the bundle.
    if (typeof driver !== 'function') {
      throw getError({
        message: `[${this.constructor.name}][wireDriverFromMetadata] @datasource({ driver }) must name a driver CLASS | Got: ${String(driver)} | Use \`@datasource({ driver: NodePostgresDriver })\` with \`import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres'\`, or wire a custom driver with useDriver()`,
      });
    }

    const DriverClass = driver as TClass<IRelationalDriver<Schema>>;
    this.useDriver({ driver: new DriverClass({ client: this.client }) });
  }

  protected resolveDriver(): IRelationalDriver<Schema> {
    this.wireDriverFromMetadata();
    return this.driver as IRelationalDriver<Schema>;
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

  /** Wires the driver on first use, so a `configure()` that only builds `this.client` is enough. */
  getConnector(): TRelationalConnector<Schema> {
    this.wireDriverFromMetadata();
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
