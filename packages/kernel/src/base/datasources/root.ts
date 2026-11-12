import { NotSupportedUtility } from '@/utilities/not-supported.utility';
import type { AnyType, TClass, ValueOrPromise } from '@venizia/ignis-helpers/common';
import { BaseHelper, getError } from '@venizia/ignis-helpers/core';
import type {
  IDataSource,
  IDataSourceCapabilities,
  IDataSourceOpening,
  ITransaction,
  ITransactionOptions,
  TAnyDataSourceSchema,
  TDataSourceOpenMode,
} from './common';
import { DataSourceOpenDefaults, DataSourceOpenModes } from './common';
import { OPENING_HANDLES } from './opening-handles';

/**
 * Brands the datasource root so `@repository` can recognise a subclass WITHOUT `instanceof`.
 *
 * Two copies of this package give two `DataSourceRoot` classes, and `instanceof` across them is
 * false - the same trap `isApplicationError` exists to avoid for `ApplicationError`. `Symbol.for` is
 * realm-keyed, so both copies produce this exact symbol, and a static is inherited by every
 * subclass however deep.
 */
/**
 * The key keeps its old name, `abstract-data-source`, so a copy of the package from before `DataSourceRoot` still recognises the
 * classes of a newer one, and the other way round.
 */
export const DATA_SOURCE_BRAND = Symbol.for('@venizia/ignis-kernel:abstract-data-source');

/** True for `DataSourceRoot` itself and for any class extending it (`AbstractDataSource` among them), across package copies. */
export const isDataSourceClass = (value: unknown): value is TClass<AnyType> => {
  return typeof value === 'function' && DATA_SOURCE_BRAND in value;
};

/** The two ways a race between the open and its timeout can end. */
const OPEN_DONE = 'done';
const OPEN_TIMED_OUT = 'timed-out';

/**
 * The datasource root with no dependency-injection import: the brand, the settings, the open-on-first-use state machine
 * and the no-op defaults. A client that only talks HTTP extends this, so a browser bundle does not carry the metadata
 * registry; {@link AbstractDataSource} adds what reads `@datasource` and `@repository` metadata.
 */
export abstract class DataSourceRoot<
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

  abstract configure(
    opts?: ConfigurableOptions,
    opening?: IDataSourceOpening,
  ): ValueOrPromise<void>;

  /** The options the boot would have given `configure()`, kept for the open that the first use starts. */
  private deferredOptions?: ConfigurableOptions;

  /** The open in flight: every call that arrives meanwhile awaits this one promise. */
  private opening?: Promise<void>;

  /**
   * An open that outlived its timeout and has not settled. Nothing is retried until it has: two `configure()` must never
   * run at once, and when it does settle what it built is closed, never published.
   */
  private abandoned?: Promise<void>;

  private isOpened = false;
  private isShutDown = false;

  /**
   * Whether this family can open on first use: only a family whose every entry point first awaits {@link ensureOpen}
   * says yes (the relational one does). A family that does not is refused at boot rather than left half-working.
   */
  protected supportsDeferredOpen(): boolean {
    return false;
  }

  /** How the datasource opens: `start` here. {@link AbstractDataSource} reads the `open.on` of `@datasource`. */
  getOpenMode(): TDataSourceOpenMode {
    return DataSourceOpenModes.START;
  }

  isOpenDeferred(): boolean {
    return this.getOpenMode() === DataSourceOpenModes.FIRST_USE;
  }

  /** How long an open may take (ms; `0` waits for ever): 60 s here. {@link AbstractDataSource} reads the `open.timeoutMs` of `@datasource`. */
  getOpenTimeoutMs(): number {
    return DataSourceOpenDefaults.TIMEOUT_MS;
  }

  /**
   * Whether the datasource is open. One that opens on first use: after the first use has finished, until `close()`. One that
   * opens at start: from the moment the application has started it, until `close()`.
   */
  isOpen(): boolean {
    if (this.isShutDown) {
      return false;
    }

    return this.isOpenDeferred() ? this.isOpened : true;
  }

  /** Whether the first use is opening the datasource right now. */
  isOpening(): boolean {
    return this.opening !== undefined;
  }

  /** Whether `close()` has begun. A datasource that opens on first use is not reopened after it. */
  isClosed(): boolean {
    return this.isShutDown;
  }

  /**
   * What the application boot calls to get the handles it passes to `configure()` of a datasource that opens at start. Keyed by a
   * symbol the package does not export, so nothing else can obtain the handles: see {@link OPENING_HANDLES}.
   */
  [OPENING_HANDLES](): IDataSourceOpening {
    return this.createOpening();
  }

  /**
   * The handles `configure()` gets as its second argument, in both modes. The root has no connector, client or transaction to
   * hand out; a family that has them overrides this. Protected: the only ways out are the argument of `configure()` and the
   * boot's private key.
   */
  protected createOpening(): IDataSourceOpening {
    const refuse = (member: string): never =>
      NotSupportedUtility.throwNotSupported({
        scope: this.constructor.name,
        feature: `opening.${member}`,
        logger: this.logger,
      });

    return {
      getConnector: () => refuse('getConnector'),
      getClient: () => refuse('getClient'),
      beginTransaction: () => Promise.resolve().then(() => refuse('beginTransaction')),
    };
  }

  /**
   * The boot's replacement for `configure()` on a datasource that opens on first use: records the options and opens nothing.
   * Refused for a family that cannot honour it.
   */
  deferOpen(opts: { options?: ConfigurableOptions }): void {
    if (!this.supportsDeferredOpen()) {
      throw getError({
        message: `[${this.constructor.name}][deferOpen] open: 'first-use' is not supported by this datasource family | Use open: { on: 'start' }, or remove the option`,
      });
    }

    this.deferredOptions = opts.options;
  }

  /**
   * Resolves once the datasource is open. At once for one that opens with the application. Otherwise the first caller
   * starts `configure()` and the rest await the same promise, so it runs once; a failure rejects all of them, undoes what the
   * failed `configure()` left ({@link discardPartialOpen}) and clears the slot, so the next call opens afresh. After
   * `close()` it rejects: a stopped application does not reopen its datasources.
   */
  ensureOpen(): Promise<void> {
    if (!this.isOpenDeferred()) {
      return Promise.resolve();
    }

    // Closed first: a call after `close()` is told so, whether or not the datasource had been opened.
    if (this.isShutDown) {
      return Promise.reject(
        getError({
          message: `[${this.constructor.name}][ensureOpen] The datasource is closed | It opens on first use only before close()`,
        }),
      );
    }

    if (this.isOpened) {
      return Promise.resolve();
    }

    if (this.abandoned) {
      return Promise.reject(
        getError({
          message: `[${this.constructor.name}][ensureOpen] The previous open is still running after its timeout | It is retried once it has settled`,
        }),
      );
    }

    this.opening ??= this.runOpen();

    return this.opening;
  }

  private async runOpen(): Promise<void> {
    const timeoutMs = this.getOpenTimeoutMs();
    const work = Promise.resolve().then(() =>
      this.configure(this.deferredOptions, this.createOpening()),
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<typeof OPEN_TIMED_OUT>((resolve) => {
      if (timeoutMs > 0) {
        timer = setTimeout(() => resolve(OPEN_TIMED_OUT), timeoutMs);
      }
    });

    try {
      const outcome = await Promise.race([work.then(() => OPEN_DONE), expired]);

      if (outcome === OPEN_TIMED_OUT) {
        this.abandoned = this.settleAbandoned({ work });

        throw getError({
          message: `[${this.constructor.name}][ensureOpen] The open did not finish within ${timeoutMs} ms | Does configure() await the datasource (a repository, ensureOpen)? Use the opening argument inside configure()`,
        });
      }

      this.isOpened = true;
    } catch (error) {
      await this.discardOpenAttempt();

      throw error;
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }

      this.opening = undefined;
    }
  }

  /** When an abandoned open finally settles, whatever it built is closed (it was never published) and retries are allowed again. */
  private async settleAbandoned(opts: { work: Promise<unknown> }): Promise<void> {
    try {
      await opts.work;
      // eslint-disable-next-line venizia/no-silent-catch -- the abandoned attempt's own outcome was already reported by the timeout; only its clean-up matters now
    } catch {
      // Falls through to the clean-up.
    }

    await this.discardOpenAttempt();
    this.abandoned = undefined;
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
}
