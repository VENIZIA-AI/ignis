import type { TAnyDataSourceSchema } from '@/base/datasources';
import { AbstractDataSource } from '@/base/datasources';
import type { IRelationalDriver } from '@/connectors/relational/drivers';
import type {
  IRelationalDataSource,
  IRelationalTransaction,
  TRelationalTransactionOptions,
} from '@/connectors/relational/datasources/common';
import type {
  IRelationalQueryDialect,
  IRelationalQueryExecutor,
} from '@/connectors/relational/repositories/common';
import { MetadataRegistry } from '@/helpers/inversion';
import type { AnyObject, AnyType, TClass, ValueOrPromise } from '@venizia/ignis-helpers';
import { getError } from '@venizia/ignis-helpers';

/**
 * SQL branch root: connector, pool, transactions. Engine-neutral - dialect and executor are
 * declared abstract here and supplied by each engine branch (the Postgres branch returns a
 * `FilterBuilder` / `PostgresQueryExecutor`).
 *
 * `mapSecretToSettings` maps Vault's `{ username, password }` to `{ user, password }`, which is a
 * driver-config convention rather than Postgres SQL, so it stays on this neutral base rather than
 * moving into `connectors/postgres` - do not "fix" it down into the Postgres branch.
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

  /** Builds the driver class named by `@datasource({ driver })` over the client `configure()` assigned, then wires the connector from it. Idempotent and lazy. */
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

  /** Reads the driver CLASS named by `@datasource({ driver })`; rejects a driver-name string from untyped JS callers - a string carries no module into the bundle. */
  protected resolveDriverClass(): TClass<IRelationalDriver<TConnector>> {
    const metadata = MetadataRegistry.getInstance().getDataSourceMetadata({
      target: this.constructor,
    });
    const driver = metadata?.driver;

    if (typeof driver !== 'function') {
      throw getError({
        message: `[${this.constructor.name}][resolveDriverClass] @datasource({ driver }) must name a driver CLASS | Got: ${String(driver)} | Use \`@datasource({ driver: NodePostgresDriver })\` with \`import { NodePostgresDriver } from '@venizia/ignis/postgres/node-postgres'\`, or wire a custom driver with useDriver()`,
      });
    }

    return driver as TClass<IRelationalDriver<TConnector>>;
  }

  protected resolveDriver(): IRelationalDriver<TConnector> {
    this.wireDriverFromMetadata();
    return this.driver as IRelationalDriver<TConnector>;
  }

  /** Assigns `this.driver` AND builds `this.connector` in one step - a driver without its connector would silently bypass the driver on pooled queries. `schema` defaults to `getSchema()`. */
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

  /** Raw driver client (`pg.Pool` / `Sql`). Reads the configured client directly when no driver is resolved yet; throws rather than handing back an `undefined` typed as `Client`. */
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

  /** Soft-evicts the pool after a secret rotation: builds pool + driver + connector against the rotated credentials without touching live fields, swaps atomically, then drains the old pool. On failure the live state is restored, any half-built pool drained, and the error rethrown. */
  async onSecretRotated(opts: { key: string; secret: Record<string, string> }): Promise<void> {
    const logger = this.logger.for(this.onSecretRotated.name);
    const oldClient = this.getClient() as AnyType;

    // Snapshot so a failed rebuild restores the datasource verbatim; `settings` is copied because rotation mutates it in place, and the live client stays untouched so the old pool keeps serving.
    const savedClient = this.client;
    const savedSettings = { ...(this.settings as AnyObject) };

    // Rotation takes effect only through this.settings + configure(); a configure() building its pool from a hard-coded connection string or reading Envs directly rebuilds with stale credentials.
    Object.assign(this.settings as AnyObject, this.mapSecretToSettings({ secret: opts.secret }));

    // configure() overwrites this.client with the freshly-built pool, so it is captured into a local and the old client restored immediately - the live driver/connector stay on the old pool until the swap and the live fields are never nulled.
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
    let newDriver: IRelationalDriver<TConnector>;
    let newConnector: TConnector;
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

    // New pool fully built: commit the live fields in one synchronous step (no null window), then soft-evict the old pool so its in-flight transactions can finish.
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
