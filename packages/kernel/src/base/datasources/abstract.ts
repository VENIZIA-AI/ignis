import { MetadataRegistry } from '@/helpers/inversion';
import { NotSupportedUtility } from '@/utilities';
import type { AnyType, TClass, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import type {
  IDataSource,
  IDataSourceCapabilities,
  ITransaction,
  ITransactionOptions,
  TAnyDataSourceSchema,
  TDataSourceOpenMode,
} from './common';
import { DataSourceOpenModes } from './common';

/**
 * Brands the datasource root so `@repository` can recognise a subclass WITHOUT `instanceof`.
 *
 * Two copies of this package give two `AbstractDataSource` classes, and `instanceof` across them is
 * false - the same trap `isApplicationError` exists to avoid for `ApplicationError`. `Symbol.for` is
 * realm-keyed, so both copies produce this exact symbol, and a static is inherited by every
 * subclass however deep.
 */
export const DATA_SOURCE_BRAND = Symbol.for('@venizia/ignis-kernel:abstract-data-source');

/** True for `AbstractDataSource` itself and for any class extending it, across package copies. */
export const isDataSourceClass = (value: unknown): value is TClass<AnyType> => {
  return typeof value === 'function' && DATA_SOURCE_BRAND in value;
};

/** Engine-neutral datasource root - NO SQL members. Every connector family extends this. */
export abstract class AbstractDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
>
  extends BaseHelper
  implements IDataSource<Settings, Schema, ConfigurableOptions>
{
  /** Read by {@link isDataSourceClass}. Static, so every subclass inherits it. */
  static readonly [DATA_SOURCE_BRAND] = true;

  name: string;
  settings: Settings;
  schema: Schema;

  abstract configure(opts?: ConfigurableOptions): ValueOrPromise<void>;

  /** The options the boot would have given `configure()`, kept for the open that the first use starts. */
  private deferredOptions?: ConfigurableOptions;

  /** The open in flight: every call that arrives meanwhile awaits this one promise. */
  private opening?: Promise<void>;

  private isOpened = false;
  private isShutDown = false;

  /**
   * Whether this family can open on first use: only a family whose every entry point first awaits {@link ensureOpen}
   * says yes (the relational one does). A family that does not is refused at boot rather than left half-working.
   */
  protected supportsDeferredOpen(): boolean {
    return false;
  }

  /** The `open.on` of `@datasource`, `start` when unset. */
  getOpenMode(): TDataSourceOpenMode {
    const metadata = MetadataRegistry.getInstance().getDataSourceMetadata({
      target: this.constructor,
    });

    return metadata?.open?.on ?? DataSourceOpenModes.START;
  }

  isOpenDeferred(): boolean {
    return this.getOpenMode() === DataSourceOpenModes.FIRST_USE;
  }

  /** Whether a datasource that opens on first use has been opened (and not closed since). Always false for one that opens at start: the boot configures it. */
  isOpen(): boolean {
    return this.isOpened && !this.isShutDown;
  }

  /** Whether `close()` has begun. A datasource that opens on first use is not reopened after it. */
  isClosed(): boolean {
    return this.isShutDown;
  }

  /**
   * The boot's replacement for `configure()` on a datasource that opens on first use: records the options and opens nothing.
   * Refused for a family that cannot honour it.
   */
  deferOpen(opts: { options?: object }): void {
    if (!this.supportsDeferredOpen()) {
      throw getError({
        message: `[${this.constructor.name}][deferOpen] open: 'first-use' is not supported by this datasource family | Use open: { on: 'start' }, or remove the option`,
      });
    }

    this.deferredOptions = opts.options as ConfigurableOptions | undefined;
  }

  /**
   * Resolves once the datasource is open. At once for one that opens with the application, or is open already. Otherwise
   * the first caller starts `configure()` and the rest await the same promise, so it runs once; a failure rejects all of
   * them, undoes what the failed `configure()` left ({@link discardPartialOpen}) and clears the slot, so the next call
   * opens afresh. Rejects after `close()`: a stopped application does not reopen its datasources.
   */
  ensureOpen(): Promise<void> {
    if (!this.isOpenDeferred() || this.isOpened) {
      return Promise.resolve();
    }

    if (this.isShutDown) {
      return Promise.reject(
        getError({
          message: `[${this.constructor.name}][ensureOpen] The datasource is closed | It opens on first use only before close()`,
        }),
      );
    }

    this.opening ??= this.runOpen();

    return this.opening;
  }

  private async runOpen(): Promise<void> {
    try {
      await this.configure(this.deferredOptions);
      this.isOpened = true;
    } catch (error) {
      await this.discardOpenAttempt();

      throw error;
    } finally {
      this.opening = undefined;
    }
  }

  private async discardOpenAttempt(): Promise<void> {
    try {
      await this.discardPartialOpen();
      // eslint-disable-next-line venizia/no-silent-catch -- the open's own error is what the caller must see: a failed clean-up is logged, never thrown over it
    } catch (cleanupError) {
      this.logger
        .for(this.ensureOpen.name)
        .warn('Clean-up after a failed open also failed | error: %s', cleanupError);
    }
  }

  /** Undoes what a `configure()` that threw left behind, so the next open starts clean. The root holds nothing; a family that keeps a client overrides it. */
  protected discardPartialOpen(): ValueOrPromise<void> {}

  /**
   * Waits for an open in flight and refuses any later one. A family's `close()` calls it first, so a stop that arrives
   * during the first use closes what that open built instead of racing it.
   */
  protected async settleOpening(): Promise<void> {
    this.isShutDown = true;

    try {
      await this.opening;
      // eslint-disable-next-line venizia/no-silent-catch -- the failed open was reported to its own waiters; stopping goes on
    } catch (openError) {
      this.logger
        .for(this.close.name)
        .debug('The open in flight failed while stopping | error: %s', openError);
    }
  }

  getSettings() {
    return this.settings;
  }

  getSchema(): Schema {
    if (!this.schema) {
      throw getError({
        message: `[${this.constructor.name}] Schema not initialized. Override getSchema() or provide schema in constructor.`,
      });
    }

    return this.schema;
  }

  /** Capability probe, overridden by connectors that support it (e.g. postgres reports `{ transactions: true }`). */
  getCapabilities(): IDataSourceCapabilities {
    return { transactions: false };
  }

  /** Nothing to release at this root; a family that holds a connection overrides it. */
  close(): Promise<void> {
    return Promise.resolve();
  }

  /** Defaults to throwing NotSupported - only connectors with real transaction support override this; async so callers get a rejected promise, not a synchronous throw that skips try/catch. */
  async beginTransaction(_opts?: ITransactionOptions): Promise<ITransaction> {
    return NotSupportedUtility.throwNotSupported({
      scope: this.constructor.name,
      feature: 'Transactions',
      logger: this.logger,
    });
  }

  /** Model classes bound to this datasource via `@repository` metadata - paradigm-free (no schema/relation resolution). */
  protected getBoundModelClasses(): Array<TClass<unknown>> {
    return MetadataRegistry.getInstance().getModelClasses({
      dataSource: this.constructor as TClass<IDataSource>,
    });
  }

  /** Walks model classes bound to this datasource, reads a connector-specific artifact via `read`, and returns a name-keyed registry - skips undefined reads, throws on duplicate names, honors `autoDiscovery: false`. */
  protected discoverDefinitions<TDefinition extends { name: string }>(opts: {
    read: (modelClass: TClass<unknown>) => TDefinition | undefined;
    kind: string;
  }): Record<string, TDefinition> {
    const { read, kind } = opts;
    const logger = this.logger.for(this.discoverDefinitions.name);
    const registry = MetadataRegistry.getInstance();

    const metadata = registry.getDataSourceMetadata({ target: this.constructor });

    if (metadata?.autoDiscovery === false) {
      logger.debug('Auto-discovery disabled for %s', this.name);

      return {};
    }

    const modelClasses = this.getBoundModelClasses();

    const definitions: Record<string, TDefinition> = {};
    const definitionOwners = new Map<string, string>();

    for (const modelClass of modelClasses) {
      const definition = read(modelClass);

      if (!definition) {
        logger.warn(
          'Model has no %s definition | Skipping | Name: %s | Model: %s',
          kind,
          this.name,
          modelClass.name,
        );
        continue;
      }

      const existingOwner = definitionOwners.get(definition.name);

      if (existingOwner !== undefined && existingOwner !== modelClass.name) {
        throw getError({
          message: `[${this.constructor.name}][discoverDefinitions] Duplicate ${kind} name '${definition.name}' | Name: ${this.name} | Classes: ${existingOwner}, ${modelClass.name}`,
        });
      }

      definitionOwners.set(definition.name, modelClass.name);
      definitions[definition.name] = definition;
    }

    const names = Object.keys(definitions);
    logger.debug(
      'Detected %s(s) | Name: %s | Count: %s | Names: %j',
      kind,
      this.name,
      names.length,
      names,
    );

    return definitions;
  }
}
