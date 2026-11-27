---
title: "@venizia/ignis-connectors/typesense (1 of 3)"
description: "Every export of @venizia/ignis-connectors/typesense, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/typesense (1 of 3)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 1 of 3 of [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense).

## `AbstractSearchDataSource`

*class*

Engine contract only (connector, dialect, collection compile/ensure) - mirrors AbstractPostgresDataSource. Discovery/provisioning lives on BaseSearchDataSource.

```ts
export declare abstract class AbstractSearchDataSource<Settings extends object = {}> extends AbstractDataSource<Settings, TSearchSchema> {
    /** Phantom, never set at runtime: the engine's typed tuning knobs, read by `SearchControllerFactory.build` to type `query`. A datasource that does not bind it leaves `query.tuning` closed; `TypesenseDataSource` binds `ITypesenseTuning`. */
    readonly $inferTuning?: unknown;
    abstract getConnector(): ISearchConnector;
    abstract getQueryDialect(): ISearchQueryDialect;
    abstract compileCollection(opts: {
        definition: ISearchCollectionDefinition;
    }): unknown;
    abstract ensureCollection(opts: {
        definition: ISearchCollectionDefinition;
    }): Promise<void>;
    /** Cross-collection search. Return is `unknown` because each engine's envelope differs (Typesense union, Meilisearch federation) and a concrete datasource narrows it; declared here so a datasource-generic repository can read it. */
    abstract multiSearch(opts: {
        searches: TMultiSearchEntry[];
        union?: boolean;
        commonParams?: Omit<TMultiSearchEntry, 'collection'>;
        options?: unknown;
    }): Promise<unknown>;
}
```

Source: `packages/connectors/src/search/core/datasources/abstract.ts`

## `BaseSearchConnector`

*class*

Base of every search connector: `ping()` answers from `getHealth()`, `assertNonEmpty` guards required string arguments, and `runEngineCall` turns raw engine failures into a sanitized 503.

```ts
export declare abstract class BaseSearchConnector extends BaseHelper implements ISearchConnector {
    constructor(opts: {
        scope: string;
        identifier: string;
    });
    ping(): Promise<boolean>;
    protected assertNonEmpty(opts: {
        value?: string | null;
        name: string;
        method: string;
    }): void;
    protected runEngineCall<T>(opts: {
        method: string;
        run: () => ValueOrPromise<T>;
        tolerate?: {
            when: (error: unknown) => boolean;
            handle: (error: unknown) => ValueOrPromise<T>;
        };
    }): Promise<T>;
    /** Which errors mean "not found" is engine-specific classification; the sanitized throw and the benign fallback are not. */
    protected abstract isNotFoundError(opts: {
        error: unknown;
    }): boolean;
    /** Tolerated-404 branch shared by getCollection/patchCollectionSchema/getDocument/updateDocument: throws the sanitized not-found error. */
    protected notFoundTolerance(opts: {
        method: string;
        subject: string;
    }): {
        when: (error: unknown) => boolean;
        handle: (error: unknown) => never;
    };
    /** Tolerated-404 branch shared by deleteCollection/getAlias/getSynonymSet/deleteSynonymSet/deleteDocument: logs and returns a benign sentinel instead of throwing. */
    protected notFoundFallback<T>(opts: {
        method: string;
        message: string;
        args?: unknown[];
        fallback: T;
    }): {
        when: (error: unknown) => boolean;
        handle: (error: unknown) => T;
    };
    abstract getHealth(): Promise<{
        ok: boolean;
    }>;
    abstract collection: ISearchCollectionScoped;
    abstract document: ISearchDocumentScoped;
    abstract search<TDocument extends object = object>(opts: {
        collection: string;
        params: unknown;
    }): Promise<ISearchResult<TDocument>>;
    abstract multiSearch(opts: {
        searches: unknown[];
        union?: boolean;
        commonParams?: unknown;
    }): Promise<unknown>;
}
```

Source: `packages/connectors/src/search/core/connector.ts`

## `BaseSearchDataSource`

*class*

Collection discovery/provisioning + connector lifecycle, mirroring BasePostgresDataSource. Paradigm seam: the connector is held via the `ISearchConnector`-bounded generic, never an engine type - engines supply only `createConnector()`.

```ts
export declare abstract class BaseSearchDataSource<Settings extends object = {}, TConnector extends ISearchConnector = ISearchConnector> extends AbstractSearchDataSource<Settings> {
    protected autoProvision: boolean;
    protected hiddenFieldsByCollectionMap?: Record<string, string[]>;
    protected connector?: TConnector;
    private readonly injectedConnector?;
    constructor(opts: ISearchDataSourceOptions<Settings> & {
        connector?: TConnector;
    });
    /** The engine's connector instance - the ONLY engine-specific step of the lifecycle. */
    protected abstract createConnector(): TConnector;
    /** Builds the connector (unless injected, e.g. for tests), then provisions collections. Re-entrant-safe: a second call is a logged no-op, not a re-provision. */
    configure(): Promise<void>;
    getConnector(): TConnector;
    /** Auto-discovers collections from repositories if not manually provided. */
    getSchema(): TSearchSchema;
    hasDiscoverableModels(): boolean;
    /** Cross-collection, so it lives on the datasource, not a repository; the envelope is engine-specific, so the return is `unknown` and `TypesenseDataSource` narrows it. */
    multiSearch(opts: {
        searches: TMultiSearchEntry[];
        union?: boolean;
        commonParams?: Omit<TMultiSearchEntry, 'collection'>;
        options?: unknown;
    }): Promise<unknown>;
    /** Reads `static searchCollection`, falling back to shape-guarded `static schema`; honors `@datasource({ autoDiscovery: false })` same as the postgres branch. */
    protected discoverCollections(): TSearchSchema;
    /** Reads a bound model class's collection definition - dual-schema `searchCollection` first, then shape-guarded `schema`; undefined when it carries neither. */
    private readCollectionDefinition;
    /** Collection name -> `@model` properties.hidden for cross-collection operations. Collections with none are omitted, so callers own exclusion for absent entries; memoized per instance and never invalidated because the metadata is frozen after boot. */
    protected hiddenFieldsByCollection(): Record<string, string[]>;
    /** The registry/model walk behind `hiddenFieldsByCollection` - mirrors the `getSchema()` / `discoverCollections()` split. */
    protected discoverHiddenFieldsByCollection(): Record<string, string[]>;
    /** Unions a collection's hidden fields into one multiSearch entry's excludeFields; an entry whose collection is not a discovered definition passes through untouched - the caller owns exclusion there. */
    private applyHiddenExclusion;
    /** Provisions discovered collections via ensureCollection (additive-only; destructive migration is caller policy). Skipped if autoProvision is false; failures propagate so boot fails loudly. */
    protected provisionCollections(): Promise<void>;
    /** Engines expose synonyms as named linkable sets, a flat per-collection dictionary, or neither - both groups are optional on `ISearchConnector`, hence the branch. */
    protected provisionSynonyms(opts: {
        definition: ISearchCollectionDefinition;
    }): Promise<void>;
}
```

Source: `packages/connectors/src/search/core/datasources/base.ts`

## `BaseSearchEntity`

*class*

Engine-neutral search-document entity deriving zod schemas from an `ISearchCollectionDefinition`. `Schema` is instance-side only so `schema` carries the caller's literal collection type - mirrors `BasePostgresEntity`'s static-wide / instance-narrow duality.

```ts
export declare class BaseSearchEntity<Schema extends ISearchCollectionDefinition = ISearchCollectionDefinition> extends AbstractEntity {
    schema: Schema;
    readonly $inferData?: TSearchDocument<Schema>;
    readonly $inferPersist?: TSearchDocument<Schema>;
    static COLLECTION_NAME?: string;
    /**
     * What an authorization rule names this model by: the `authorize.principal` of `@model`, else the model's name (the class
     * name, which a minified build changes: give the principal to any model a rule names). `@model` defines the principal on
     * the class; a class that is not decorated, or has no principal, answers its name, so the value is never `undefined` and
     * `Model.AUTHORIZATION_SUBJECT` needs no `!`.
     */
    static get AUTHORIZATION_SUBJECT(): string;
    /**
     * A subclass that declares `static readonly AUTHORIZATION_SUBJECT = '...'` is compiled by `tsc` (with
     * `useDefineForClassFields: false`, which IGNIS needs) to an assignment: this setter turns it into the class's own value,
     * as a field declaration would be under Bun.
     */
    static set AUTHORIZATION_SUBJECT(value: string);
    static schema: ISearchCollectionDefinition;
    static documentSchema?: z.ZodType;
    private static readonly _schemaCache;
    constructor(opts?: {
        name?: string;
        schema?: Schema;
    });
    getSchema<T = unknown>(opts: {
        type: TSchemaType;
    }): T;
}
```

Source: `packages/connectors/src/search/core/models/base.ts`

## `DefaultSearchRepository`

*class*

Full CRUD search-repository tier - convenience alias over `PersistableSearchRepository` (which already carries every write, including delete).

```ts
export declare class DefaultSearchRepository<TDocument extends object = object, TDataSource extends AbstractSearchDataSource = AbstractSearchDataSource> extends PersistableSearchRepository<TDocument, TDataSource> {
}
```

Source: `packages/connectors/src/search/core/repositories/core/default.ts`

## `field`

*const*

Builders for `ISearchFieldDefinition` entries: `id()` is the reserved `id` string field, the rest set the field type and accept `TFieldFlags`; `vector` takes `dimensions`, `distance` and `embed` instead.

```ts
export declare const field: {
    id: () => {
        name: "id";
        type: "string";
    };
    string: <const N extends string, const O extends TFieldFlags = {}>(name: N, opts?: O | undefined) => {
        name: N;
        type: "string";
    } & O;
    strings: <const N extends string, const O extends TFieldFlags = {}>(name: N, opts?: O | undefined) => {
        name: N;
        type: "string[]";
    } & O;
    number: <const N extends string, const O extends TFieldFlags = {}>(name: N, opts?: O | undefined) => {
        name: N;
        type: "number";
    } & O;
    numbers: <const N extends string, const O extends TFieldFlags = {}>(name: N, opts?: O | undefined) => {
        name: N;
        type: "number[]";
    } & O;
    boolean: <const N extends string, const O extends TFieldFlags = {}>(name: N, opts?: O | undefined) => {
        name: N;
        type: "boolean";
    } & O;
    booleans: <const N extends string, const O extends TFieldFlags = {}>(name: N, opts?: O | undefined) => {
        name: N;
        type: "boolean[]";
    } & O;
    geopoint: <const N extends string, const O extends TFieldFlags = {}>(name: N, opts?: O | undefined) => {
        name: N;
        type: "geopoint";
    } & O;
    /** `vector` carries its own `O` shape (dimensions/distance/embed) instead of routing through `buildField`; the `O extends { optional: true }` conditional makes `optional` appear, in type and at runtime, only when set - keeping `TSearchDocument`'s optional split working. */
    vector: <const N extends string, const O extends {
        dimensions?: number;
        distance?: TVectorDistance;
        embed?: ISearchEmbedConfig;
        optional?: boolean;
    }>(name: N, opts: O) => {
        name: N;
        type: typeof SearchFieldTypes.VECTOR;
        vector: Omit<O, "optional">;
    } & (O extends {
        optional: true;
    } ? {
        optional: true;
    } : object);
};
```

Source: `packages/connectors/src/search/core/models/define-search-collection.ts`

## `IAliasInfo`

*interface*

An alias name and the physical collection it points to.

```ts
export interface IAliasInfo {
    name: string;
    collection: string;
}
```

Source: `packages/connectors/src/search/core/connector.ts`

## `IImportResult`

*interface*

Outcome of a bulk import: how many rows succeeded and failed, and the engine's per-row responses.

```ts
export interface IImportResult<TResponse = unknown> {
    count: {
        success: number;
        fail: number;
    };
    responses: TResponse[];
}
```

Source: `packages/connectors/src/search/core/connector.ts`

## `IMultiSearchResult`

*interface*

Result of a federated multi-search: one `SearchResponse` per search, in request order.

```ts
export interface IMultiSearchResult<T extends TDocumentSchema = TDocumentSchema> {
    results: TSearchResponse<T>[];
}
```

Source: `packages/connectors/src/search/typesense/common/types/search.ts`

## `ISearchAliasScoped`

*interface*

A named pointer to one physical collection. Engines without aliases omit this group entirely.

```ts
export interface ISearchAliasScoped {
    upsert(opts: {
        name: string;
        collection: string;
    }): Promise<void>;
    get(opts: {
        name: string;
    }): Promise<IAliasInfo | null>;
}
```

Source: `packages/connectors/src/search/core/connector.ts`

## `ISearchCollectionDefinition`

*interface*

Engine-neutral definition of one search collection; an engine's collection compiler turns it into that engine's schema. `defaultSort` names one of `fields`.

```ts
export interface ISearchCollectionDefinition {
    name: string;
    fields: readonly ISearchFieldDefinition[];
    defaultSort?: string;
    defaultQueryBy?: string[];
    /** Declarative synonym sets provisioned alongside the collection (see `BaseSearchDataSource.provisionCollections`). */
    synonyms?: ISynonym[];
    engineOverrides?: {
        typesense?: object;
        meilisearch?: object;
        opensearch?: object;
        elasticsearch?: object;
    } & {
        [engine: string]: object | undefined;
    };
}
```

Source: `packages/connectors/src/search/core/models/common/types/collection.ts`

## `ISearchCollectionScoped`

*interface*

Collection management verbs of a search connector. The three generics are the engine's own create-schema, schema and field-schema types.

```ts
export interface ISearchCollectionScoped<CreateSchema = unknown, Schema = unknown, FieldSchema = unknown> {
    create(opts: {
        schema: CreateSchema;
    }): Promise<Schema | void>;
    ensure(opts: {
        schema: CreateSchema;
    }): Promise<Schema>;
    get(opts: {
        name: string;
    }): Promise<Schema>;
    list(): Promise<Schema[]>;
    exists(opts: {
        name: string;
    }): Promise<boolean>;
    patchSchema(opts: {
        name: string;
        fields: FieldSchema[];
    }): Promise<void>;
    delete(opts: {
        name: string;
    }): Promise<boolean>;
}
```

Source: `packages/connectors/src/search/core/connector.ts`

## `ISearchCompileCapabilities`

*interface*

Query-time capabilities a dialect compiles against. Passed per call, never stored: every
datasource shares ONE dialect instance (`typesense/datasources/datasource.ts:29` holds it in a
static), so a dialect that remembered a collection would answer the next collection's query
with the previous one's fields.

```ts
export interface ISearchCompileCapabilities {
    /**
     * Field names the collection declares. ABSENT means "unvalidated" - an entity carrying no
     * collection definition must still compile, exactly as it did before field checking existed.
     */
    fields?: ReadonlySet<string>;
}
```

Source: `packages/connectors/src/search/core/repositories/common/types.ts`

## `ISearchConnector`

*interface*

The verb contract every search engine implements - an interface so tests can fake it clientless. `collection`/`document` are the true intersection; `alias`/`synonymSet`/`synonyms`/`swap` are optional since no engine has all four, so agnostic callers must write `connector.alias?.…`.

```ts
export interface ISearchConnector {
    getHealth(): Promise<{
        ok: boolean;
    }>;
    ping(): Promise<boolean>;
    collection: ISearchCollectionScoped;
    document: ISearchDocumentScoped;
    alias?: ISearchAliasScoped;
    synonymSet?: ISearchSynonymSetScoped;
    synonyms?: ISearchSynonymScoped;
    swap?: ISearchSwapScoped;
    search<TDocument extends object = object>(opts: {
        collection: string;
        params: unknown;
    }): Promise<ISearchResult<TDocument>>;
    multiSearch(opts: {
        searches: unknown[];
        union?: boolean;
        commonParams?: unknown;
        options?: unknown;
    }): Promise<unknown>;
}
```

Source: `packages/connectors/src/search/core/connector.ts`

## `ISearchConnectorCallbacks`

*interface*

Optional hooks a connector calls once its client is created (`onInitialized`) or creating it throws (`onError`).

```ts
export interface ISearchConnectorCallbacks {
    onInitialized?: (opts: {
        name: string;
    }) => void;
    onError?: (opts: {
        name: string;
        error: unknown;
    }) => void;
}
```

Source: `packages/connectors/src/search/core/connector.ts`

## `ISearchDataSourceOptions`

*interface*

Options of a search datasource: its `name` and the engine-specific `config` settings.

```ts
export interface ISearchDataSourceOptions<Settings extends object = {}> {
    name: string;
    config: Settings;
    /**
     * Auto-provision discovered collections on configure().
     *
     * @default `APP_ENV_AUTO_PROVISION_COLLECTION` read by `ParseUtility.toBoolean`: `false` when unset
     */
    autoProvision?: boolean;
}
```

Source: `packages/connectors/src/search/core/datasources/common/types.ts`

## `ISearchDocumentScoped`

*interface*

Document verbs of a search connector; every call names its target collection, and `id` addresses one document.

```ts
export interface ISearchDocumentScoped {
    get<T extends object>(opts: {
        collection: string;
        id: string;
    }): Promise<T>;
    /** Exact count of documents matching `filterBy`. Engines whose search endpoint caps or estimates its total must answer from a document-listing endpoint instead. */
    count(opts: {
        collection: string;
        filterBy?: string;
    }): Promise<number>;
    create<T extends object>(opts: {
        collection: string;
        document: T;
    }): Promise<T>;
    upsert<T extends object>(opts: {
        collection: string;
        document: T;
    }): Promise<T>;
    update<T extends object>(opts: {
        collection: string;
        id: string;
        document: Partial<T>;
    }): Promise<T>;
    updateBy<T extends object>(opts: {
        collection: string;
        document: Partial<T>;
        filterBy: string;
    }): Promise<{
        updatedCount: number;
    }>;
    delete(opts: {
        collection: string;
        id: string;
    }): Promise<boolean>;
    deleteBy(opts: {
        collection: string;
        filterBy: string;
    }): Promise<number>;
    deleteAll(opts: {
        collection: string;
    }): Promise<boolean>;
    import<T extends object>(opts: {
        collection: string;
        documents: T[];
        batchSize?: number;
    }): Promise<IImportResult<unknown>>;
    export(opts: {
        collection: string;
        filterBy?: string;
        includeFields?: string[];
    }): Promise<string>;
}
```

Source: `packages/connectors/src/search/core/connector.ts`

## `ISearchEmbedConfig`

*interface*

Server-side auto-embedding for a `vector` field: the engine generates the vector from the `from` fields using `model`.

```ts
export interface ISearchEmbedConfig {
    from: string[];
    model: ISearchEmbedModelConfig;
}
```

Source: `packages/connectors/src/search/core/models/common/types/embedding.ts`

## `ISearchEmbedModelConfig`

*interface*

Embedding-model config for a server-side auto-embedded vector field: built-in models need only `name`, remote providers add `apiKey` and/or auth fields, and compilers map these camelCase keys to wire vocabulary. Source secrets from env - never hardcode them into a committed schema.

```ts
export interface ISearchEmbedModelConfig {
    /** Built-in (`ts/...`) or remote (`openai/...`, `google/...`, `azure/...`). */
    name: string;
    /** Remote providers (OpenAI, Google, Azure). */
    apiKey?: string;
    /** Azure / self-hosted endpoints. */
    url?: string;
    accessToken?: string;
    refreshToken?: string;
    clientId?: string;
    clientSecret?: string;
    projectId?: string;
    /** Escape for any provider field not modeled above; pass it already in the target engine's wire form. */
    [key: string]: unknown;
}
```

Source: `packages/connectors/src/search/core/models/common/types/embedding.ts`

## `ISearchFacetCount`

*interface*

The counts of one faceted field. `sampled` is set when the engine counted a sample of the matches instead of all of them.

```ts
export interface ISearchFacetCount {
    fieldName: string;
    counts: ISearchFacetValue[];
    sampled?: boolean;
    stats?: ISearchFacetStats;
}
```

Source: `packages/connectors/src/search/core/connector.ts`

## `ISearchFacetStats`

*interface*

Numeric statistics an engine reports for a numeric facet field; only the members the engine returned are set.

```ts
export interface ISearchFacetStats {
    avg?: number;
    max?: number;
    min?: number;
    sum?: number;
    totalValues?: number;
}
```

Source: `packages/connectors/src/search/core/connector.ts`

## `ISearchFacetValue`

*interface*

One value of a facet: how many matching documents carry it. `value` is always a string, numbers included, as the engine sends it.

```ts
export interface ISearchFacetValue {
    value: string;
    count: number;
    highlighted?: string;
}
```

Source: `packages/connectors/src/search/core/connector.ts`

## `ISearchFieldDefinition`

*interface*

One field of a search collection; the flags say how the engine may index it, and `vector` applies to fields of type `vector`.

```ts
export interface ISearchFieldDefinition {
    name: string;
    type: TSearchFieldType;
    searchable?: boolean;
    filterable?: boolean;
    facet?: boolean;
    sortable?: boolean;
    optional?: boolean;
    /**
     * Only with `optional: true`. A search engine may keep no null (Typesense drops the key), so a read
     * returns `null` for this field when the key is absent. A plain optional field stays absent.
     * Never sent to the engine.
     */
    nullable?: boolean;
    vector?: {
        dimensions?: number;
        distance?: TVectorDistance;
        embed?: ISearchEmbedConfig;
    };
}
```

Source: `packages/connectors/src/search/core/models/common/types/field.ts`

## `ISearchQuery`

*interface*

Search-engine query parameters translated from a repository-level TFilter. Only the cross-engine intersection lives here - an engine's own tuning knobs go on its own extension. Field names stay camelCase; wire format is produced only at the dialect's `toWireParams` boundary.

```ts
export interface ISearchQuery {
    /** Full-text search term. Use '*' for pure filter listings. */
    query: string;
    filterBy?: string;
    sortBy?: string;
    page?: number;
    perPage?: number;
    includeFields?: string;
    excludeFields?: string;
    offset?: number;
    queryBy?: string;
    queryByWeights?: string;
    facetBy?: string;
    facetQuery?: string;
    maxFacetValues?: number;
    highlightFields?: string;
    highlightFullFields?: string;
    highlightStartTag?: string;
    highlightEndTag?: string;
    snippetThreshold?: number;
    groupBy?: string;
    groupLimit?: number;
    groupMissingValues?: boolean;
    /** Engine-native wire parameters, merged last into `toWireParams` output verbatim and unvalidated; keys use the engine's own vocabulary (`num_typos`, not `numTypos`). */
    engineParams?: Record<string, unknown>;
    /** The `where` compiled to an absorbing false: no query can match, so the repository answers empty WITHOUT calling the engine. Internal - `toWireParams` strips it, so it never reaches the wire. */
    matchNone?: boolean;
}
```

Source: `packages/connectors/src/search/core/repositories/common/types.ts`

## `ISearchQueryDialect`

*interface*

Translates repository-level `TFilter`/`TWhere` into a search-engine-specific query.

```ts
export interface ISearchQueryDialect {
    build(opts: {
        filter?: TFilter;
        hiddenFields?: string[];
        capabilities?: ISearchCompileCapabilities;
    }): ISearchQuery;
    /**
     * The filter string of a `where`. A filter string cannot say "matches nothing" and `''` cannot be told from "no
     * constraint", so a `where` that matches nothing (an empty `or`) THROWS instead of answering wrongly.
     *
     * @deprecated Use {@link compileWhere}, which answers match-all and match-none explicitly.
     */
    toWhere(opts: {
        where: TWhere;
    }): string;
    /** The error this engine gives for a `where` key or an `order` field that names no field: a request guard throws it for a hidden field, so the two cannot be told apart. */
    fieldNotFoundError(opts: {
        clause: TRequestFilterClause;
        field: string;
    }): Error;
    /** The error `build` throws for a filter with an `include`: no search query reads relations. */
    includeNotSupportedError(): Error;
    /**
     * Compiles a `where` tree, resolving what a filter string cannot express. `capabilities` is
     * per-call, never retained - one dialect instance serves every datasource.
     */
    compileWhere(opts: {
        where: TWhere;
        capabilities?: ISearchCompileCapabilities;
    }): TCompiledWhere;
    /**
     * Whether this engine can express `operator` at all. Published by the dialect rather than
     * hand-copied by callers, so it cannot drift from the engine's own `switch`; every member of
     * `QueryOperators.SCHEME_SET` has an answer, which is what stops a new engine from silently
     * leaving one unclassified.
     */
    canExpress(opts: {
        operator: string;
    }): boolean;
    /**
     * ANDs already-compiled clauses using this engine's own conjunction, honouring the absorbing
     * outcomes. The repository needs this to combine a caller clause with a repository-owned one it
     * compiled SEPARATELY - the joiner belongs to the engine, so the dialect supplies it rather
     * than the caller guessing `&&` versus `AND`.
     */
    conjoin(opts: {
        clauses: TCompiledWhere[];
    }): TCompiledWhere;
    /** Writes every engine-specific consequence of a non-raw search input onto `query` (mode dispatch, vector clause, tuning knobs) - keeping `ReadableSearchRepository` engine-free. */
    applySearchInput(opts: {
        query: ISearchQuery;
        input: Exclude<TSearchInput, {
            mode: typeof SearchModes.RAW;
        }>;
    }): void;
    /** Maps a camelCase query record onto the engine's wire-format field names via a key lookup, never a wire-cased identifier; `engineParams` merges last. */
    toWireParams(opts: {
        query: Partial<ISearchQuery>;
    }): Record<string, unknown>;
}
```

Source: `packages/connectors/src/search/core/repositories/common/types.ts`

## `ISearchResult`

*interface*

Search-response envelope, read without a boundary cast. `score` scales are unrelated across engines - never compare or threshold one against another; `isFoundExact` is false when `found` is approximate. A hit's `score` is the keyword match score in every mode, hybrid included; `rankFusionScore` and `vectorDistance` are the hybrid and vector scores, set only by an engine that reports them.

```ts
export interface ISearchResult<DocumentType extends object = object, HighlightType = unknown, FacetCountType = ISearchFacetCount, GroupedHitType = unknown> {
    found: number;
    isFoundExact: boolean;
    outOf?: number;
    searchTimeMs?: number;
    hits?: Array<{
        document: DocumentType;
        highlight?: HighlightType;
        highlights?: HighlightType[];
        score?: number;
        rankFusionScore?: number;
        vectorDistance?: number;
    }>;
    facetCounts?: FacetCountType[];
    groupedHits?: GroupedHitType[];
}
```

Source: `packages/connectors/src/search/core/connector.ts`

## `ISearchSwapScoped`

*interface*

Atomic exchange of two collections' documents and settings - the alias-less path to a zero-downtime reindex.

```ts
export interface ISearchSwapScoped {
    indexes(opts: {
        pairs: Array<[string, string]>;
    }): Promise<void>;
}
```

Source: `packages/connectors/src/search/core/connector.ts`

## `ISearchSynonymScoped`

*interface*

A flat per-collection synonym dictionary - no named, linkable set resource.

```ts
export interface ISearchSynonymScoped {
    set(opts: {
        collection: string;
        items: ISynonym[];
    }): Promise<void>;
    get(opts: {
        collection: string;
    }): Promise<ISynonym[]>;
    reset(opts: {
        collection: string;
    }): Promise<void>;
}
```

Source: `packages/connectors/src/search/core/connector.ts`

## `ISearchSynonymSetScoped`

*interface*

Named synonym sets, available only on engines that have them; engines with a flat per-collection dictionary use `ISearchSynonymScoped`.

```ts
export interface ISearchSynonymSetScoped {
    upsert(opts: {
        name: string;
        items: ISynonym[];
    }): Promise<void>;
    get(opts: {
        name: string;
    }): Promise<ISynonym[] | null>;
    list(): Promise<string[]>;
    delete(opts: {
        name: string;
    }): Promise<boolean>;
    link(opts: {
        collection: string;
        synonymSets: string[];
    }): Promise<void>;
}
```

Source: `packages/connectors/src/search/core/connector.ts`

## `ISynonym`

*interface*

A synonym set. `root` set = one-way (query for root also matches synonyms); absent = multi-way (all interchangeable).

```ts
export interface ISynonym {
    id: string;
    synonyms: string[];
    root?: string;
}
```

Source: `packages/connectors/src/search/core/models/common/types/collection.ts`

## `ITypesenseCallOptions`

*interface*

What a call can say about itself.

```ts
export interface ITypesenseCallOptions {
    /**
     * Overrides the client's `connectionTimeoutSeconds` for this call: a positive integer of milliseconds.
     * It is how long to wait for the engine's answer and, once a body is arriving, the longest silence before the call fails;
     * it is not a deadline for the whole transfer. A call that answers late (an import, a schema change) needs it; a stream
     * whose reader pauses (an import of each batch, a slow disk) needs it larger than the longest pause.
     */
    timeoutMs?: number;
}
```

Source: `packages/connectors/src/search/typesense/common/types/options.ts`

## `ITypesenseClientLike`

*interface*

Narrow structural view of the Typesense client the connector needs, so a test fake can stand in for the real `Client`.

```ts
export interface ITypesenseClientLike {
    collections(): ITypesenseCollectionsApi;
    collections(collectionName: string): ITypesenseCollectionApi;
    aliases(): ITypesenseAliasesApi;
    aliases(aliasName: string): ITypesenseAliasApi;
    synonymSets(): ITypesenseSynonymSetsApi;
    synonymSets(synonymSetName: string): ITypesenseSynonymSetApi;
    health: {
        retrieve(): Promise<unknown>;
    };
    multiSearch: {
        perform(searchRequests: unknown, commonParams?: unknown, options?: unknown): Promise<unknown>;
    };
}

interface ITypesenseCollectionsApi {
    create(schema: CollectionCreateSchema): Promise<CollectionSchema>;
    retrieve(options?: unknown): Promise<CollectionSchema[]>;
}

interface ITypesenseCollectionApi {
    documents(): ITypesenseDocumentsApi;
    documents(documentId: string): ITypesenseDocumentApi;
    retrieve(): Promise<CollectionSchema>;
    update(schema: unknown): Promise<unknown>;
    delete(options?: unknown): Promise<unknown>;
    exists(): Promise<boolean>;
}

interface ITypesenseDocumentsApi {
    create(document: unknown, options?: unknown): Promise<unknown>;
    upsert(document: unknown, options?: unknown): Promise<unknown>;
    update(document: unknown, options: unknown): Promise<unknown>;
    delete(query?: unknown): Promise<unknown>;
    import(documents: unknown[], options?: unknown): Promise<unknown>;
    search(searchParameters: unknown, options?: unknown): Promise<unknown>;
    export(options?: unknown): Promise<string>;
    /** The export as a stream of NDJSON text: a Node `Readable` (`typesense-js`), which is async-iterable. */
    exportStream(options?: unknown): Promise<AsyncIterable<string | Uint8Array>>;
}

interface ITypesenseDocumentApi {
    retrieve(): Promise<unknown>;
    update(partialDocument: unknown, options?: unknown): Promise<unknown>;
    delete(options?: unknown): Promise<unknown>;
}

interface ITypesenseAliasesApi {
    upsert(name: string, mapping: unknown): Promise<unknown>;
}

interface ITypesenseAliasApi {
    retrieve(): Promise<unknown>;
}

interface ITypesenseSynonymSetsApi {
    retrieve(): Promise<unknown>;
}

interface ITypesenseSynonymSetApi {
    upsert(params: unknown): Promise<unknown>;
    retrieve(): Promise<unknown>;
    delete(): Promise<unknown>;
}
```

Source: `packages/connectors/src/search/typesense/common/types/client.ts`

## `ITypesenseConnectorOptions`

*interface*

Options of `TypesenseConnector`.

```ts
export interface ITypesenseConnectorOptions extends ISearchConnectorCallbacks {
    name: string;
    nodes: ITypesenseNode[];
    apiKey: string;
    /**
     * Timeout of the whole client, in seconds.
     *
     * @default 5
     */
    connectionTimeoutSeconds?: number;
    numRetries?: number;
    scope?: string;
    identifier?: string;
    /**
     * Builds the client of one call that sets `timeoutMs`: `typesense-js` has one timeout per client, so a per-call
     * timeout runs on its own client with `connectionTimeoutSeconds` set. The default builds a `Client` from `nodes`,
     * `apiKey` and `numRetries`; pass it when you inject your own `client` (a test fake, a wrapped client).
     */
    createClient?: (opts: {
        connectionTimeoutSeconds: number;
    }) => ITypesenseClientLike;
}
```

Source: `packages/connectors/src/search/typesense/common/types/options.ts`

## `ITypesenseDataSourceSettings`

*interface*

Datasource `config` for Typesense: server nodes, API key, and the client's timeout and retry settings.

```ts
export interface ITypesenseDataSourceSettings {
    nodes: Array<{
        host: string;
        port: number;
        protocol?: string;
    }>;
    apiKey: string;
    connectionTimeoutSeconds?: number;
    numRetries?: number;
}
```

Source: `packages/connectors/src/search/typesense/common/types/options.ts`

## `ITypesenseNode`

*interface*

One Typesense server node; `protocol` falls back to `http` when omitted.

```ts
export interface ITypesenseNode {
    host: string;
    port: number;
    protocol?: string;
}
```

Source: `packages/connectors/src/search/typesense/common/types/client.ts`

## `ITypesenseRemoteEmbeddingOptions`

*interface*

The remote-embedding parameters of an import, each a positive integer; a field left out is the engine's default. Sent as `remote_embedding_batch_size`, `remote_embedding_timeout_ms` and `remote_embedding_num_tries`.

```ts
export interface ITypesenseRemoteEmbeddingOptions {
    batchSize?: number;
    /** How long Typesense waits for the provider; not this client's request timeout. */
    timeoutMs?: number;
    numTries?: number;
}
```

Source: `packages/connectors/src/search/typesense/common/types/options.ts`

## `ITypesenseSearchQuery`

*interface*

Typesense-only search params written by `TypesenseQueryDialect`, mapped to snake_case wire by `toWireParams`; tuning not typed here travels through `engineParams` under the engine's own wire names.

```ts
export interface ITypesenseSearchQuery extends ISearchQuery, ITypesenseTuning {
    /** Typesense's `<field>:([v1, v2], k: N, alpha: A)` vector-search clause. */
    vectorQuery?: string;
    /** Forced off for semantic/hybrid - remote embedders reject prefix search; passes through unmapped (same wire name). */
    prefix?: boolean | string;
    /**
     * Page size for OFFSET pagination - Typesense's companion to `offset`, and the counterpart of
     * `perPage` in the page/per_page pair. The dialect emits one pair or the other and never both,
     * because Typesense documents them as alternatives without stating which wins when both appear.
     * Passes through unmapped (same wire name).
     */
    limit?: number;
}
```

Source: `packages/connectors/src/search/typesense/repositories/common/types.ts`

## `ITypesenseTuning`

*interface*

Typesense tuning params in camelCase, mapped to the wire names by `TypesenseQueryDialect` (`numTypos` -> `num_typos`).
They are accepted as fields of `ITypesenseSearchQuery` and as keys of `engineParams`, next to wire-named keys, which still pass verbatim.
The numeric ones must be non-negative integers (`maxCandidates`: positive); anything else is a 400 before a request.

````ts
export interface ITypesenseTuning {
    /** Typos allowed per match; a list sets it per `queryBy` field. */
    numTypos?: number | number[];
    dropTokensThreshold?: number;
    typoTokensThreshold?: number;
    /** Match inside a word, per field when a list. */
    infix?: TTypesenseOperationMode | TTypesenseOperationMode[];
    prioritizeExactMatch?: boolean;
    prioritizeTokenPosition?: boolean;
    prioritizeNumMatchingFields?: boolean;
    textMatchType?: TTypesenseTextMatchType;
    rerankHybridMatches?: boolean;
    useCache?: boolean;
    /** Seconds a cached result is served. */
    cacheTtl?: number;
    /** How many candidate documents Typesense considers for a typo or prefix match; a positive integer. */
    maxCandidates?: number;
    /**
     * Typesense's own `sort_by`, for the sorts `filter.order` cannot name: `_text_match:desc,_eval([(status:=ACTIVATED):1]):desc,createdAt:desc`.
     * At most three top-level entries, `_eval(...)` counted as one; field names are Typesense's to check. Give it instead of `filter.order`, never with it.
     *
     * @example
     * ```typescript
     * import { DefaultSearchRepository } from '@venizia/ignis-connectors/typesense';
     *
     * declare const repository: DefaultSearchRepository<{ name: string }>;
     *
     * await repository.search({
     *   mode: 'keyword',
     *   query: 'shoes',
     *   queryBy: ['name'],
     *   engineParams: { sortBy: '_text_match:desc,createdAt:desc' },
     * });
     * ```
     */
    sortBy?: string;
}
````

Source: `packages/connectors/src/search/typesense/repositories/common/types.ts`

## `IUnionSearchResult`

*interface*

Result of a union multi-search: all searches merged into one result set.

```ts
export interface IUnionSearchResult<T extends TDocumentSchema = TDocumentSchema> extends UnionSearchResponse<T> {
}
```

Source: `packages/connectors/src/search/typesense/common/types/search.ts`

## `MultiSearchEntrySchema`

*const*

One collection's query within a multi-search - same friendly field names as `search()`. `filterBy` is a raw engine filter string because cross-collection search has no per-collection model to translate a `TFilter` against; the datasource maps entries to wire form via the dialect.

```ts
export declare const MultiSearchEntrySchema: z.ZodObject<{
    facetBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
    facetQuery: z.ZodOptional<z.ZodString>;
    maxFacetValues: z.ZodOptional<z.ZodNumber>;
    highlightFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
    highlightFullFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
    highlightStartTag: z.ZodOptional<z.ZodString>;
    highlightEndTag: z.ZodOptional<z.ZodString>;
    snippetThreshold: z.ZodOptional<z.ZodNumber>;
    groupBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
    groupLimit: z.ZodOptional<z.ZodNumber>;
    groupMissingValues: z.ZodOptional<z.ZodBoolean>;
    queryByWeights: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
    engineParams: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    collection: z.ZodString;
    query: z.ZodOptional<z.ZodString>;
    queryBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
    filterBy: z.ZodOptional<z.ZodString>;
    sortBy: z.ZodOptional<z.ZodString>;
    page: z.ZodOptional<z.ZodNumber>;
    perPage: z.ZodOptional<z.ZodNumber>;
    offset: z.ZodOptional<z.ZodNumber>;
    includeFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
    excludeFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
    vectorQuery: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
```

Source: `packages/connectors/src/search/core/repositories/common/constants.ts`

## `MultiSearchInputSchema`

*const*

Cross-collection multi-search input: friendly `searches` entries plus the union flag.

```ts
export declare const MultiSearchInputSchema: z.ZodObject<{
    searches: z.ZodArray<z.ZodObject<{
        facetBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
        facetQuery: z.ZodOptional<z.ZodString>;
        maxFacetValues: z.ZodOptional<z.ZodNumber>;
        highlightFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
        highlightFullFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
        highlightStartTag: z.ZodOptional<z.ZodString>;
        highlightEndTag: z.ZodOptional<z.ZodString>;
        snippetThreshold: z.ZodOptional<z.ZodNumber>;
        groupBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
        groupLimit: z.ZodOptional<z.ZodNumber>;
        groupMissingValues: z.ZodOptional<z.ZodBoolean>;
        queryByWeights: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
        engineParams: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        collection: z.ZodString;
        query: z.ZodOptional<z.ZodString>;
        queryBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
        filterBy: z.ZodOptional<z.ZodString>;
        sortBy: z.ZodOptional<z.ZodString>;
        page: z.ZodOptional<z.ZodNumber>;
        perPage: z.ZodOptional<z.ZodNumber>;
        offset: z.ZodOptional<z.ZodNumber>;
        includeFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
        excludeFields: z.ZodOptional<z.ZodArray<z.ZodString>>;
        vectorQuery: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    union: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
```

Source: `packages/connectors/src/search/core/repositories/common/constants.ts`
