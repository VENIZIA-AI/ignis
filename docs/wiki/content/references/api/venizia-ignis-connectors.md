---
title: "@venizia/ignis-connectors"
description: "Every export of @venizia/ignis-connectors, from the built declarations (generated)."
---

# `@venizia/ignis-connectors`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

3 exports, 3 with TSDoc. 128 more are re-exported from other entries (listed at the end).

## `AbstractDriverDataSource`

*class*

A datasource that holds one client and a connector built over it through a driver: the lifecycle
every connector family that talks to an external engine shares - wiring the driver named by
`@datasource({ driver })`, closing once, soft-evicting the client after a secret rotation, draining
a client by whichever verb its engine spells it with. No SQL members: the relational family adds
its dialect, executor and transactions in `AbstractRelationalDataSource`, a raw-SQL engine adds
nothing (`BaseRawSqlDataSource`). Transactions stay NotSupported, as in `AbstractDataSource`.

`mapSecretToSettings` is a driver-config convention, not Postgres SQL, so it belongs on this
neutral base - do not move it down into a family.

```ts
export declare abstract class AbstractDriverDataSource<Settings extends object = {}, Schema extends TAnyDataSourceSchema = TAnyDataSourceSchema, ConfigurableOptions extends object = {}, Client = unknown, TConnector = unknown, TDriver extends IConnectorDriver<TConnector, AnyType> = IConnectorDriver<TConnector, Client>> extends AbstractDataSource<Settings, Schema, ConfigurableOptions> {
    connector: TConnector;
    protected client?: Client;
    protected driver?: TDriver;
    private closePromise?;
    /**
     * Lazy and idempotent: builds the driver named by `@datasource({ driver })` over the client
     * `configure()` assigned, then the connector from it.
     */
    protected wireDriverFromMetadata(): void;
    /**
     * Rejects a driver-name string from untyped JS
     * callers: a string carries no module into the bundle.
     */
    protected resolveDriverClass(): TClass<TDriver>;
    protected resolveDriver(): TDriver;
    /**
     * Assigns `this.driver` AND builds `this.connector` in one step - a
     * driver without its connector is silently bypassed on pooled queries.
     */
    protected useDriver(opts: {
        driver: TDriver;
        schema?: Schema;
    }): void;
    /** A datasource that opens on first use has no client, driver or connector until the first call that needs it has awaited `ensureOpen()`. */
    private assertOpenForSyncUse;
    /** Wires the driver on first use, so a `configure()` that only builds `this.client` is enough. */
    getConnector(): TConnector;
    /**
     * Raw driver client (`pg.Pool` / `Sql`). Throws rather
     * than handing back an `undefined` typed as `Client`.
     */
    getClient(): Client;
    /**
     * Ends the connection `configure()` opened. Runs once: every later call returns the first call's
     * promise. Goes through the driver, wired now if nothing queried yet, because its `end()` is the
     * engine's whole teardown - PGlite also clears the exit status it plants on the host process.
     */
    close(): Promise<void>;
    /** Ends a client that a failed open left half-built and forgets the driver and connector, so the next open starts from nothing. */
    protected discardPartialOpen(): Promise<void>;
    private endConnection;
    /**
     * Soft-evicts the pool after a secret rotation: rebuilds against the rotated credentials without
     * touching live fields, swaps atomically, then drains the old pool. On failure live state is
     * restored, any half-built pool drained, and the error rethrown.
     */
    onSecretRotated(opts: {
        key: string;
        secret: Record<string, string>;
    }): Promise<void>;
    /** Puts `settings` back to the snapshot: a key the failed rotation added (the rotated `password`) is removed, not left behind. */
    private restoreSettings;
    /**
     * Shuts a client down by whichever verb its engine spells it with -
     * `pg.Pool` and postgres.js have `end()`, PGlite and libsql only `close()`.
     * Probed rather than type-tested: this tier must not name an engine, and a
     * client left undrained keeps a WASM instance or file handle alive forever.
     */
    protected drainClient(opts: {
        client: unknown;
    }): Promise<boolean>;
    /** Vault's database engine returns `{ username, password }`; pg expects `{ user, password }`. */
    protected mapSecretToSettings(opts: {
        secret: Record<string, string>;
    }): AnyObject;
}
```

Source: `packages/connectors/src/common/driver-data-source.ts`

## `IConnectorDriver`

*interface*

What every connector driver supplies, whatever the engine: a connector built over its client, the
raw client, and its teardown. A relational driver adds connection acquisition for transactions
(`IRelationalDriver`); a raw-SQL driver adds nothing. `configure()` stays app-written: the
framework never builds the driver for you.

```ts
export interface IConnectorDriver<TConnector, Client = unknown> {
    createConnector(opts: {
        schema: TAnyDataSourceSchema;
    }): TConnector;
    getClient(): Client;
    end(): Promise<void>;
}
```

Source: `packages/connectors/src/common/driver.ts`

## `ScopeFilterUtility`

*class*

Boot-time checks for models that declare `settings.access` (scope filtering).

```ts
export declare class ScopeFilterUtility {
    /**
     * Why a `through` chain cannot work, or undefined. Walks from `name` toward the model that holds a resolver: every
     * hop needs a `one` relation with a single-column key, the parent needs an `access`, and the chain is at most
     * `ScopeThroughLink.MAX_DEPTH` hops with no model twice. A key with no index is a warning: it still works, slowly.
     */
    private static throughProblem;
    /**
     * Refuses to boot when `settings.access` is declared where it cannot be honoured. Both cases
     * are silent at runtime and fail in OPPOSITE directions: a search-backed model returns more rows,
     * a context-less one returns none. The caller supplies `asyncContextEnabled` so no application
     * config type reaches into this tier.
     */
    static assertScopeFilterSupported(opts: {
        asyncContextEnabled: boolean;
        logger?: ILogger;
    }): void;
}
```

Source: `packages/connectors/src/common/scope-filter.ts`

## Re-exported

- `AbstractRelationalDataSource` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `AbstractSearchDataSource` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `AuditUserResolver` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `BaseRelationalDataSource` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `BaseRelationalEntity` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `BaseSearchConnector` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `BaseSearchDataSource` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `BaseSearchEntity` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `DefaultRelationalRepository` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `DefaultSearchRepository` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `field` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `FilterBuilder` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IAliasInfo` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ICountOptions` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IDefinedEntity` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IEntity` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IImportResult` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `IInsertOptions` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IManyRelation` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IMigration` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IOneRelation` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IRecursiveTreeOptions` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IRelationalConnection` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IRelationalDataSource` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IRelationalDriver` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IRelationalExtraOptions` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IRelationalQueryDialect` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IRelationalQueryExecutor` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IRelationalQueryOptions` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IRelationalTransaction` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IRemoveOptions` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `ISearchAliasScoped` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchCollectionDefinition` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchCollectionScoped` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchCompileCapabilities` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchConnector` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchConnectorCallbacks` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchDataSourceOptions` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchDocumentScoped` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchEmbedConfig` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchEmbedModelConfig` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchFacetCount` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchFacetStats` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchFacetValue` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchFieldDefinition` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchQuery` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchQueryDialect` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchResult` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchSwapScoped` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchSynonymScoped` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISearchSynonymSetScoped` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ISelectOptions` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `isRelationalTransaction` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IStatementResult` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `ISynonym` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ITransformedUpdateData` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IUpdateOptions` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IWriteResult` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `JSON_PATH_PATTERN` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `JsonPathUtility` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `many` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `ModelFactory` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `MultiSearchEntrySchema` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `MultiSearchInputSchema` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `one` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `PersistableRelationalRepository` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `PersistableSearchRepository` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `ReadableRelationalRepository` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `ReadableSearchRepository` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `RecursiveTreeDirections` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `RecursiveTreeSql` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `RelationalBaseRepository` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `RelationalDialects` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `RelationalEntityUtility` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `RelationalMigrationRunner` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `RelationalUpdateBuilder` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `RelationDeclarations` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `RelationsFactory` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `ScopeFilterDenial` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `ScopeResolution` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `SearchBaseRepository` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `SearchCollectionFactory` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `SearchErrors` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `SearchFieldTypes` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `SearchFilterOutcomes` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `SearchInputSchema` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `SearchModes` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `SearchQueryParamsUtility` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `SoftDeletableRelationalRepository` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TableColumnCache` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TColumnDefinition` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TColumnDefinitions` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TColumnSelection` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TCompiledWhere` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `TDefinedEntityClass` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TDeletedAtColumn` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TEntityObject` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TFieldFlags` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `TGetIdType` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TIdColumn` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TMultiSearchEntry` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `TMultiSearchInput` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `TPrimaryKey` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRecursiveTreeDirection` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationalConnectorOf` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationalDialect` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationalTransactionOf` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationalTransactionOptions` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationalTransactionOptionsOf` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationConfig` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationDefinition` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationDefinitions` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationMetadata` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TSearchDocument` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `TSearchFieldTsType` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `TSearchFieldType` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `TSearchFilterOutcome` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `TSearchInput` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `TSearchMode` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `TSearchSchema` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `TSoftDeletableTableSchema` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TTableColumns` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TTableInsert` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TTableObject` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TTableSchemaWithId` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TVectorDistance` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `TypesenseBaseRepository` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
- `VectorDistances` from [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense)
