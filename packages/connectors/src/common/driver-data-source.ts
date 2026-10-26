import type { TAnyDataSourceSchema } from '@venizia/ignis-kernel';
import { AbstractDataSource, MetadataRegistry } from '@venizia/ignis-kernel';
import type { AnyObject, AnyType, TClass } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';
import type { IConnectorDriver } from './driver';

/**
 * A datasource that holds one client and a connector built over it through a driver: the lifecycle
 * every connector family that talks to an external engine shares - wiring the driver named by
 * `@datasource({ driver })`, closing once, soft-evicting the client after a secret rotation, draining
 * a client by whichever verb its engine spells it with. No SQL members: the relational family adds
 * its dialect, executor and transactions in `AbstractRelationalDataSource`, a raw-SQL engine adds
 * nothing (`BaseRawSqlDataSource`). Transactions stay NotSupported, as in `AbstractDataSource`.
 *
 * `mapSecretToSettings` is a driver-config convention, not Postgres SQL, so it belongs on this
 * neutral base - do not move it down into a family.
 */
export abstract class AbstractDriverDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
  Client = unknown,
  TConnector = unknown,
  TDriver extends IConnectorDriver<TConnector, AnyType> = IConnectorDriver<TConnector, Client>,
> extends AbstractDataSource<Settings, Schema, ConfigurableOptions> {
  connector: TConnector;

  protected client?: Client;
  protected driver?: TDriver;

  private closePromise?: Promise<void>;

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
  protected resolveDriverClass(): TClass<TDriver> {
    const metadata = MetadataRegistry.getInstance().getDataSourceMetadata({
      target: this.constructor,
    });
    const driver = metadata?.driver;

    if (typeof driver !== 'function') {
      throw getError({
        message: `[${this.constructor.name}][resolveDriverClass] @datasource({ driver }) must name a driver CLASS | Got: ${String(driver)} | Use \`@datasource({ driver: NodePostgresDriver })\` with \`import { NodePostgresDriver } from '@venizia/ignis-connectors/postgres/node-postgres'\`, or wire a custom driver with useDriver()`,
      });
    }

    return driver as TClass<TDriver>;
  }

  protected resolveDriver(): TDriver {
    this.wireDriverFromMetadata();
    return this.driver as TDriver;
  }

  /**
   * Assigns `this.driver` AND builds `this.connector` in one step - a
   * driver without its connector is silently bypassed on pooled queries.
   */
  protected useDriver(opts: { driver: TDriver; schema?: Schema }): void {
    this.driver = opts.driver;
    this.connector = opts.driver.createConnector({ schema: opts.schema ?? this.getSchema() });
  }

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

  /**
   * Ends the connection `configure()` opened. Runs once: every later call returns the first call's
   * promise. Goes through the driver, wired now if nothing queried yet, because its `end()` is the
   * engine's whole teardown - PGlite also clears the exit status it plants on the host process.
   */
  override close(): Promise<void> {
    this.closePromise ??= this.endConnection();
    return this.closePromise;
  }

  private async endConnection(): Promise<void> {
    if (!this.driver && this.client === undefined) {
      return;
    }

    let driver: TDriver;
    try {
      driver = this.resolveDriver();
    } catch (error) {
      this.logger
        .for(this.close.name)
        .warn('No driver to end the connection with | draining the client | error: %s', error);
      await this.drainClient({ client: this.client });
      return;
    }

    // A hand-made driver cast past `IConnectorDriver` can lack the `end()` its type promises.
    if (typeof driver.end !== 'function') {
      this.logger.for(this.close.name).warn('The driver has no end() | draining the client');
      await this.drainClient({ client: this.client });
      return;
    }

    await driver.end();
  }

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
      this.restoreSettings({ saved: savedSettings });

      if (halfBuilt && halfBuilt !== savedClient) {
        await this.drainClient({ client: halfBuilt });
      }

      logger.error('Secret rotation failed in configure(); kept old pool | key: %s', opts.key);
      throw error;
    }

    this.client = savedClient;

    // Wired into locals: live state must stay on the old pool until the swap below.
    let newDriver: TDriver;
    let newConnector: TConnector;
    try {
      const DriverClass = this.resolveDriverClass();
      newDriver = new DriverClass({ client: newClient as AnyType });
      newConnector = newDriver.createConnector({ schema: this.getSchema() });
    } catch (error) {
      this.restoreSettings({ saved: savedSettings });
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

  /** Puts `settings` back to the snapshot: a key the failed rotation added (the rotated `password`) is removed, not left behind. */
  private restoreSettings(opts: { saved: AnyObject }): void {
    const settings = this.settings as AnyObject;

    for (const key of Object.keys(settings)) {
      if (!(key in opts.saved)) {
        delete settings[key];
      }
    }

    Object.assign(settings, opts.saved);
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
