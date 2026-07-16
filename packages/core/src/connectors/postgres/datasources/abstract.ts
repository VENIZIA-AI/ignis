import type { TAnyDataSourceSchema } from '@/base/datasources';
import { AbstractDataSource } from '@/base/datasources';
import type { IRelationalDriver } from '@/connectors/postgres/drivers';
import type { IRelationalQueryDialect } from '@/connectors/postgres/repositories/common';
import { FilterBuilder } from '@/connectors/postgres/repositories/dialect/filter';
import { MetadataRegistry } from '@/helpers/inversion';
import type { AnyObject, AnyType, TClass, ValueOrPromise } from '@venizia/ignis-helpers';
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

    const DriverClass = this.resolveDriverClass();
    this.useDriver({ driver: new DriverClass({ client: this.client }) });
  }

  /**
   * Reads the driver CLASS named by `@datasource({ driver })`. Absent for an imperatively-registered
   * datasource; the type forbids a driver-name string, so this catches an untyped JavaScript caller -
   * and a string is exactly the mistake to catch, because it carries no module into the bundle.
   */
  protected resolveDriverClass(): TClass<IRelationalDriver<Schema>> {
    const metadata = MetadataRegistry.getInstance().getDataSourceMetadata({
      target: this.constructor,
    });
    const driver = metadata?.driver;

    if (typeof driver !== 'function') {
      throw getError({
        message: `[${this.constructor.name}][resolveDriverClass] @datasource({ driver }) must name a driver CLASS | Got: ${String(driver)} | Use \`@datasource({ driver: NodePostgresDriver })\` with \`import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres'\`, or wire a custom driver with useDriver()`,
      });
    }

    return driver as TClass<IRelationalDriver<Schema>>;
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

  /**
   * Soft-evicts the connection pool after a secret rotation. Builds a fresh pool + driver + connector
   * against the rotated credentials WITHOUT disturbing the live fields, then swaps them in atomically
   * and drains the old pool - so in-flight work finishes on the old pool while new work uses the new
   * one. If the rebuild throws (bad rotated creds, transient failure) the live state is left exactly
   * as it was, any half-built pool is drained rather than leaked, and the error is rethrown so the
   * dispatcher can surface it - the datasource keeps serving on the old pool throughout.
   */
  async onSecretRotated(opts: { key: string; secret: Record<string, string> }): Promise<void> {
    const logger = this.logger.for(this.onSecretRotated.name);
    const oldClient = this.getClient() as AnyType;

    // Snapshot so a failed rebuild restores the datasource verbatim. `settings` is copied because
    // rotation mutates it in place; the live client stays untouched, keeping the old pool serving.
    const savedClient = this.client;
    const savedSettings = { ...(this.settings as AnyObject) };

    // Rotation takes effect only through this.settings + configure(); a configure() that builds its
    // pool from a hard-coded connection string or reads Envs directly rebuilds with stale credentials.
    Object.assign(this.settings as AnyObject, this.mapSecretToSettings({ secret: opts.secret }));

    // configure() overwrites this.client with the freshly-built pool; capture it into a local and
    // immediately restore the old client so the live driver/connector stay on the old pool until the
    // swap. The old client keeps serving throughout - the live fields are never nulled.
    let newClient: Client;
    try {
      await this.configure();
      newClient = this.client as Client;
    } catch (error) {
      const halfBuilt = this.client as AnyType;
      this.client = savedClient;
      Object.assign(this.settings as AnyObject, savedSettings);
      if (halfBuilt && halfBuilt !== savedClient && typeof halfBuilt.end === 'function') {
        await (halfBuilt as AnyType).end();
      }
      logger.error('Secret rotation failed in configure(); kept old pool | key: %s', opts.key);
      throw error;
    }
    this.client = savedClient;

    // Wire a driver + connector over the new pool into locals, still without touching live state.
    let newDriver: IRelationalDriver<Schema>;
    let newConnector: TRelationalConnector<Schema>;
    try {
      const DriverClass = this.resolveDriverClass();
      newDriver = new DriverClass({ client: newClient as AnyType });
      newConnector = newDriver.createConnector({ schema: this.getSchema() });
    } catch (error) {
      Object.assign(this.settings as AnyObject, savedSettings);
      if (newClient && typeof (newClient as AnyType).end === 'function') {
        await (newClient as AnyType).end();
      }
      logger.error('Secret rotation failed while wiring driver; kept old pool | key: %s', opts.key);
      throw error;
    }

    // New pool fully built: commit the live fields to it in one synchronous step (no null window),
    // then soft-evict the old pool so its in-flight transactions can finish.
    this.client = newClient as AnyType;
    this.driver = newDriver;
    this.connector = newConnector as AnyType;

    if (oldClient && typeof oldClient.end === 'function') {
      await oldClient.end();
      logger.info('Old pool drained after secret rotation | key: %s', opts.key);
    }
  }

  /** Vault's database engine returns `{ username, password }`; pg expects `{ user, password }`. */
  protected mapSecretToSettings(opts: { secret: Record<string, string> }): AnyObject {
    const { username, password } = opts.secret;
    const mapped: AnyObject = {};
    if (username !== undefined) {
      mapped.user = username;
    }
    if (password !== undefined) {
      mapped.password = password;
    }
    return mapped;
  }
}
