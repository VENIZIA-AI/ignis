import type {
  AnyType,
  IConfigurable,
  TClass,
  TConstValue,
  ValueOrPromise,
} from '@venizia/ignis-helpers/common';

/** Names of the supported datasource drivers, split into relational and search sets. `isValid` checks a value against all of them. */
export class DataSourceDrivers {
  // Relational - PGlite is a Postgres DRIVER (Postgres compiled to WASM), not a separate engine.
  static readonly NODE_POSTGRES = 'node-postgres';
  static readonly POSTGRES_JS = 'postgres-js';
  static readonly PGLITE = 'pglite';
  static readonly LIBSQL = 'libsql';

  // Search
  static readonly TYPESENSE = 'typesense';
  static readonly MEILISEARCH = 'meilisearch';

  static readonly RELATIONAL_SCHEME_SET = new Set([
    this.NODE_POSTGRES,
    this.POSTGRES_JS,
    this.PGLITE,
    this.LIBSQL,
  ]);

  static readonly SEARCH_SCHEME_SET = new Set([this.TYPESENSE, this.MEILISEARCH]);

  static readonly SCHEME_SET = new Set([
    // Relational
    this.NODE_POSTGRES,
    this.POSTGRES_JS,
    this.PGLITE,
    this.LIBSQL,

    // Search
    this.TYPESENSE,
    this.MEILISEARCH,
  ]);

  static isValid(value: string): boolean {
    return this.SCHEME_SET.has(value);
  }
}

/** When a datasource opens: with the application (`start`, the default) or at the first call that needs it (`first-use`). */
export class DataSourceOpenModes {
  static readonly START = 'start';
  static readonly FIRST_USE = 'first-use';

  static readonly SCHEME_SET = new Set([this.START, this.FIRST_USE]);

  static isValid(value: string): value is TDataSourceOpenMode {
    return this.SCHEME_SET.has(value);
  }
}

/** Defaults of the `open` option. */
export class DataSourceOpenDefaults {
  /** How long a first use waits for the open before it gives up (ms): a WASM boot on a slow link fits, a `configure()` that waits on itself does not hang for ever. */
  static readonly TIMEOUT_MS = 60_000;
}

/** One of the {@link DataSourceOpenModes} values. */
export type TDataSourceOpenMode = TConstValue<typeof DataSourceOpenModes>;

/** The `open` option of `@datasource`. */
export interface IDataSourceOpenOptions {
  /**
   * `start`: `configure()` runs when the application starts, and `listen()` waits for it. `first-use`: the application
   * starts without opening the datasource; the first call that needs it runs `configure()` once, and every call that
   * arrives meanwhile waits for that one open. A failed open rejects every waiting call, leaves nothing half-open, and is
   * tried again by the next call.
   *
   * @default 'start'
   */
  on?: TDataSourceOpenMode;

  /**
   * `first-use` only: how long the open may take (ms) before every waiting call is rejected with a named error and the
   * attempt is abandoned. An abandoned `configure()` that finishes later is closed and never published, and the next call
   * waits until it has settled before trying again. `0` waits for ever.
   *
   * @default 60000
   */
  timeoutMs?: number;
}

/**
 * What `configure()` is given to do its database work while the datasource is opening: the connector, the client and a
 * transaction, through the datasource's own ungated internals. Only `configure()` receives it, so nothing outside can use it
 * and every other caller still waits for the open to finish. Generic over the datasource's connector, client and
 * transaction types, so `opening.getClient()` of a PGlite datasource is a `PGlite`.
 *
 * Inside the open of a datasource that opens on first use, the public `getConnector()`, `getClient()` and
 * `beginTransaction()` are gated (they wait for the open, which waits for `configure()`), and a repository cannot be used:
 * use these handles instead.
 */
export interface IDataSourceOpening<
  TConnector = unknown,
  Client = unknown,
  TTransaction extends ITransaction = ITransaction,
  TTransactionOptions extends ITransactionOptions = ITransactionOptions,
> {
  getConnector(): TConnector;
  getClient(): Client;
  beginTransaction(opts?: TTransactionOptions): Promise<TTransaction>;
}

// `(string & {})` keeps autocomplete for the known values
// while still accepting any other engine-driver string.
/** A driver name: one of `DataSourceDrivers`, or any other string for an unlisted engine. */
export type TDataSourceDriver = TConstValue<typeof DataSourceDrivers> | (string & {});

/**
 * A driver CLASS, named by `@datasource({ driver })`. The class reference is what pulls the peer
 * package into a bundle - a name string pulls nothing, and a bare side-effect import may be
 * dropped. Untyped because `IRelationalDriver` lives under `connectors/`, off-limits to `base/`.
 */
export type TDataSourceDriverClass = TClass<AnyType>;

/** Loose schema record of a datasource; the default `Schema` type argument of `IDataSource`. */
export type TAnyDataSourceSchema = Record<string, any>;

/** Engine-neutral datasource contract - the root every connector family implements. */
export interface IDataSource<
  Settings extends object = {},
  Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema,
  ConfigurableOptions extends object = {},
> extends IConfigurable<ConfigurableOptions> {
  name: string;
  settings: Settings;
  schema: Schema;

  getSettings(): Settings;
  getSchema(): Schema;

  /** Releases what `configure()` opened. `stop()` calls it on every datasource the boot configured. */
  close?(): Promise<void>;

  /** The datasource's own `configure()` receives the handles of {@link IDataSourceOpening} as its second argument. */
  configure(opts?: ConfigurableOptions, opening?: IDataSourceOpening): ValueOrPromise<void>;

  /** The handles `configure()` is given: the boot passes them in every mode, so the same body works whether the datasource opens at start or on first use. */
  getOpening?(): IDataSourceOpening;

  /** True when the datasource opens on first use (`@datasource({ open: { on: 'first-use' } })`): the boot then calls {@link deferOpen} instead of `configure()`. */
  isOpenDeferred?(): boolean;

  /** Records the options `configure()` will get when the datasource opens on first use; nothing is opened. */
  deferOpen?(opts: { options?: object }): void;

  /** Resolves once the datasource is open: at once when it opens with the application or is already open, else after the one open that the first use starts. */
  ensureOpen?(): Promise<void>;
}

/**
 * Neutral transaction options - isolation levels are engine vocabulary, so `isolationLevel` stays
 * a loose string here and connectors narrow it in their own `ITransactionOptions` extension.
 */
export interface ITransactionOptions {
  isolationLevel?: string;
}

/** Neutral transaction handle - the minimum shape every connector's transaction satisfies. */
export interface ITransaction {
  isActive: boolean;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/** What a datasource supports. `transactions` tells whether it can open transactions. */
export interface IDataSourceCapabilities {
  transactions: boolean;
}

/** Capabilities of a search datasource. Each `search` flag tells whether the engine supports that feature. */
export interface ISearchableDataSourceCapabilities extends IDataSourceCapabilities {
  search?: {
    /** Vector / semantic / hybrid search (search engines). */
    vector?: boolean;

    /** Batched multi-query search across collections. */
    multi?: boolean;

    /** Merged (union) result set across a multi-search. */
    union?: boolean;

    /** Synonym sets (multi-way / one-way). */
    synonyms?: boolean;
  };
}
