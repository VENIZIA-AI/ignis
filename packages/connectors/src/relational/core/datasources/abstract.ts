import type { TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import { AbstractDataSource } from '@venizia/ignis-kernel';
import type { IRelationalDriver } from '@/relational/core/drivers';
import type {
  IRelationalDataSource,
  IRelationalTransaction,
  TRelationalTransactionOptions,
} from '@/relational/core/datasources/common';
import type {
  IRelationalQueryDialect,
  IRelationalQueryExecutor,
} from '@/relational/core/repositories/common';
import { MetadataRegistry } from '@venizia/ignis-kernel';
import type { AnyObject, AnyType, TClass, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';

/**
 * SQL branch root: connector, pool, transactions. Engine-neutral - dialect and executor are
 * declared abstract here and supplied by each engine branch.
 *
 * `mapSecretToSettings` is a driver-config convention, not Postgres SQL, so it belongs on this
 * neutral base - do not move it down into `connectors/postgres`.
 */
export abstract class AbstractRelationalDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
  Client = unknown,
  TConnector = unknown,
>
  extends AbstractDataSource<Settings, Schema, ConfigurableOptions>
  implements IRelationalDataSource<Settings, Schema, ConfigurableOptions, Client, TConnector>
{
  connector: TConnector;

  protected client?: Client;
  protected driver?: IRelationalDriver<TConnector>;

  /**
   * Lazy and idempotent: builds the driver named by `@datasource({ driver })` over the client
   * `configure()` assigned, then the connector from it.
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
   * Rejects a driver-name string from untyped JS
   * callers: a string carries no module into the bundle.
   */
  protected resolveDriverClass(): TClass<IRelationalDriver<TConnector>> {
    const metadata = MetadataRegistry.getInstance().getDataSourceMetadata({
      target: this.constructor,
    });
    const driver = metadata?.driver;

    if (typeof driver !== 'function') {
      throw getError({
        message: `[${this.constructor.name}][resolveDriverClass] @datasource({ driver }) must name a driver CLASS | Got: ${String(driver)} | Use \`@datasource({ driver: NodePostgresDriver })\` with \`import { NodePostgresDriver } from '@venizia/ignis-connectors/postgres/node-postgres'\`, or wire a custom driver with useDriver()`,
      });
    }

    return driver as TClass<IRelationalDriver<TConnector>>;
  }

  protected resolveDriver(): IRelationalDriver<TConnector> {
    this.wireDriverFromMetadata();
    return this.driver as IRelationalDriver<TConnector>;
  }

  /**
   * Assigns `this.driver` AND builds `this.connector` in one step - a
   * driver without its connector is silently bypassed on pooled queries.
   */
  protected useDriver(opts: { driver: IRelationalDriver<TConnector>; schema?: Schema }): void {
    this.driver = opts.driver;
    this.connector = opts.driver.createConnector({ schema: opts.schema ?? this.getSchema() });
  }

  abstract getConnectionString(): ValueOrPromise<string>;
  abstract override beginTransaction(
    opts?: TRelationalTransactionOptions,
  ): Promise<IRelationalTransaction<TConnector>>;

  /** Wires the driver on first use, so a `configure()` that only builds `this.client` is enough. */
  getConnector(): TConnector {
    this.wireDriverFromMetadata();
    return this.connector;
  }

  /**
   * Raw driver client (`pg.Pool` / `Sql`). Throws rather
   * than handing back an `undefined` typed as `Client`.
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

  abstract getQueryDialect(): IRelationalQueryDialect;
  abstract getQueryExecutor(): IRelationalQueryExecutor<TConnector>;

  /**
   * Soft-evicts the pool after a secret rotation: rebuilds against the rotated credentials without
   * touching live fields, swaps atomically, then drains the old pool. On failure live state is
   * restored, any half-built pool drained, and the error rethrown.
   */
  async onSecretRotated(opts: { key: string; secret: Record<string, string> }): Promise<void> {
    const logger = this.logger.for(this.onSecretRotated.name);
    const oldClient = this.getClient() as AnyType;

    // Snapshot so a failed rebuild restores the datasource verbatim;
    // `settings` is copied because rotation mutates it in place.
    const savedClient = this.client;
    const savedSettings = { ...(this.settings as AnyObject) };

    // Rotation only takes effect through this.settings + configure(); a configure() that
    // hard-codes its connection string or reads Envs directly rebuilds with stale credentials.
    Object.assign(this.settings as AnyObject, this.mapSecretToSettings({ secret: opts.secret }));

    // configure() overwrites this.client, so the new pool is captured
    // into a local and the old client restored at once - live fields
    // are never nulled and the old pool keeps serving until the swap.
    let newClient: Client;
    try {
      await this.configure();
      newClient = this.client as Client;
    } catch (error) {
      const halfBuilt = this.client as AnyType;
      this.client = savedClient;
      Object.assign(this.settings as AnyObject, savedSettings);

      if (halfBuilt && halfBuilt !== savedClient) {
        await this.drainClient({ client: halfBuilt });
      }

      logger.error('Secret rotation failed in configure(); kept old pool | key: %s', opts.key);
      throw error;
    }

    this.client = savedClient;

    // Wired into locals: live state must stay on the old pool until the swap below.
    let newDriver: IRelationalDriver<TConnector>;
    let newConnector: TConnector;
    try {
      const DriverClass = this.resolveDriverClass();
      newDriver = new DriverClass({ client: newClient as AnyType });
      newConnector = newDriver.createConnector({ schema: this.getSchema() });
    } catch (error) {
      Object.assign(this.settings as AnyObject, savedSettings);
      await this.drainClient({ client: newClient });

      logger.error('Secret rotation failed while wiring driver; kept old pool | key: %s', opts.key);
      throw error;
    }

    // Commit the live fields in one synchronous step so there is no null window,
    // then soft-evict the old pool so its in-flight transactions can finish.
    this.client = newClient as AnyType;
    this.driver = newDriver;
    this.connector = newConnector as AnyType;

    const isDrained = await this.drainClient({ client: oldClient });
    if (isDrained) {
      logger.info('Old pool drained after secret rotation | key: %s', opts.key);
    }
  }

  /**
   * Shuts a client down by whichever verb its engine spells it with -
   * `pg.Pool` and postgres.js have `end()`, PGlite and libsql only `close()`.
   * Probed rather than type-tested: this tier must not name an engine, and a
   * client left undrained keeps a WASM instance or file handle alive forever.
   */
  protected async drainClient(opts: { client: unknown }): Promise<boolean> {
    const client = opts.client as AnyType;

    const drain = typeof client?.end === 'function' ? client.end : client?.close;

    if (typeof drain !== 'function') {
      this.logger
        .for(this.drainClient.name)
        .warn('Client exposes neither end() nor close(); nothing to drain');
      return false;
    }

    await drain.call(client);

    return true;
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
