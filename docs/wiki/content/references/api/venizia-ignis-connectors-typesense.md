---
title: "@venizia/ignis-connectors/typesense"
description: "Every export of @venizia/ignis-connectors/typesense, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/typesense`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

82 exports, 82 with TSDoc.

## `AbstractSearchDataSource`

*class*

Engine contract only (connector, dialect, collection compile/ensure) - mirrors AbstractPostgresDataSource. Discovery/provisioning lives on BaseSearchDataSource.

```ts
export declare abstract class AbstractSearchDataSource<Settings extends object = {}> extends AbstractDataSource<Settings, TSearchSchema> {
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
    static AUTHORIZATION_SUBJECT?: string;
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
     * @default `true` when `APP_ENV_AUTO_PROVISION_COLLECTION` is 'true' or '1', else `false`
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
        kind: 'where' | 'order';
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
    create(schema: unknown, options?: unknown): Promise<unknown>;
    retrieve(options?: unknown): Promise<unknown>;
}

interface ITypesenseCollectionApi {
    documents(): ITypesenseDocumentsApi;
    documents(documentId: string): ITypesenseDocumentApi;
    retrieve(): Promise<unknown>;
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
    export(options?: unknown): Promise<unknown>;
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

## `PersistableSearchRepository`

*class*

Write-tier search-repository - creates/updates through the connector, dialect-translating `where` clauses.

```ts
export declare class PersistableSearchRepository<TDocument extends object = object, TDataSource extends AbstractSearchDataSource = AbstractSearchDataSource> extends ReadableSearchRepository<TDocument, TDataSource> {
    constructor(ds?: TDataSource, opts?: {
        scope?: string;
        entityClass?: TClass<BaseSearchEntity>;
    });
    create(opts: {
        data: TDocument;
        options: IExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    create<R = TDocument>(opts: {
        data: TDocument;
        options?: IExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    createAll(opts: {
        data: Array<TDocument>;
        options: IExtraOptions & {
            shouldReturn: false;
            batchSize?: number;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    createAll<R = TDocument>(opts: {
        data: Array<TDocument>;
        options?: IExtraOptions & {
            shouldReturn?: true;
            batchSize?: number;
        };
    }): Promise<TCount & {
        data: Array<R>;
    }>;
    updateById(opts: {
        id: IdType;
        data: Partial<TDocument>;
        options: IExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    updateById<R = TDocument>(opts: {
        id: IdType;
        data: Partial<TDocument>;
        options?: IExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    /** Count-only: search engines have no RETURNING and no extra read is bolted on, so `data` is always `null` and `shouldReturn` is rejected at the type level - callers wanting the affected documents read them before updating. */
    updateAll(opts: {
        data: Partial<TDocument>;
        where?: TWhere;
        options?: Omit<IExtraOptions, 'shouldReturn'> & {
            force?: boolean;
        };
    }): Promise<TCount & {
        data: null;
    }>;
    deleteById(opts: {
        id: IdType;
        options: IExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    deleteById<R = TDocument>(opts: {
        id: IdType;
        options?: IExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    /** Count-only like updateAll: filter-delete when there is an effective where, truncating the whole collection only when neither where nor settings.query.filter is present - truncate reports no per-document count, so that path returns { count: 0, data: null }. */
    deleteAll(opts?: {
        where?: TWhere;
        options?: Omit<IExtraOptions, 'shouldReturn'> & {
            force?: boolean;
        };
    }): Promise<TCount & {
        data: null;
    }>;
    /** Bulk import through the neutral document facade. Per-row write `action` is Typesense-only vocabulary - callers needing it use `dataSource.getConnector().importDocuments(...)` directly. */
    import(opts: {
        documents: TDocument[];
        batchSize?: number;
    }): Promise<IImportResult<unknown>>;
    /** Resolves filterBy, AND-merging defaultWhere unless shouldSkipDefaultFilter. Returns undefined when there's no effective where - callers decide (updateAll refuses; deleteAll truncates). */
    protected buildFilterBy(opts: {
        where?: TWhere;
        shouldSkipDefaultFilter?: boolean;
    }): string | undefined;
    /**
     * The write-path filter as THREE outcomes, because two of them are catastrophically different
     * here: `filterBy: undefined` means "no effective where", which `deleteAll` treats as licence to
     * truncate when `force` is set. An absorbing where must never land there -
     * `deleteAll({ where: { or: permittedIds.map(...) } })` on an EMPTY permission list has to
     * delete nothing, not the entire collection. `matchNone` is what keeps the two apart.
     */
    protected buildScopedFilter(opts: {
        where?: TWhere;
        shouldSkipDefaultFilter?: boolean;
    }): {
        filterBy?: string;
        matchNone: boolean;
    };
}
```

Source: `packages/connectors/src/search/core/repositories/core/persistable.ts`

## `ReadableSearchRepository`

*class*

Read-only search-repository tier - translates filters via the datasource's dialect and executes through the connector.

```ts
export declare class ReadableSearchRepository<TDocument extends object = object, TDataSource extends AbstractSearchDataSource = AbstractSearchDataSource> extends SearchBaseRepository<TDocument, TDataSource> {
    count(opts: {
        where: TWhere;
        options?: IExtraOptions;
    }): Promise<TCount>;
    existsWith(opts: {
        where: TWhere;
        options?: IExtraOptions;
    }): Promise<boolean>;
    find<R = unknown, const F extends TFields<TDocument> = TFields<TDocument>>(opts: {
        filter: TFilter<any, F>;
        options: TFindRangeOptions<IExtraOptions, TRow<TDocument, R, F>>;
    }): Promise<TDataWithRange<TRow<TDocument, R, F>>>;
    find<R = unknown, const F extends TFields<TDocument> = TFields<TDocument>>(opts: {
        filter: TFilter<any, F>;
        options?: TFindOptions<IExtraOptions, TRow<TDocument, R, F>>;
    }): Promise<Array<TRow<TDocument, R, F>>>;
    findOne<R = unknown, const F extends TFields<TDocument> = TFields<TDocument>>(opts: {
        filter: TFilter<any, F>;
        options?: TFindOneOptions<IExtraOptions, TRow<TDocument, R, F>>;
    }): Promise<TNullable<TRow<TDocument, R, F>>>;
    /**
     * Delegates to findOne with id in where - routing through buildQuery is what makes
     * hiddenFields/settings.query.filter apply, so a soft-deleted document resolves to null. `where` is spread
     * away last so a projection can never widen the id lookup.
     */
    findById<R = unknown, const F extends TFields<TDocument> = TFields<TDocument>>(opts: {
        id: IdType;
        filter?: TByIdFilter<any, F>;
        options?: TFindOneOptions<IExtraOptions, TRow<TDocument, R, F>>;
    }): Promise<TNullable<TRow<TDocument, R, F>>>;
    /**
     * Unified search entry discriminated by `mode`: `raw` is a full passthrough - no dialect, no
     * settings.query.filter, no hiddenFields - while keyword/semantic/hybrid translate through the dialect
     * like `find()`. Nothing engine-specific lives here; `ISearchQueryDialect.applySearchInput`
     * owns it.
     */
    search<R extends object = TDocument>(opts: TSearchInput & {
        options?: IExtraOptions;
    }): Promise<ISearchResult<R>>;
    /** The count of a text search: how many documents match `query` and `where`. Unlike `count()`, which asks the document endpoint for an exact filter-only total, this goes through search, so `isFoundExact` says whether the engine stopped early and `count` is an estimate. */
    searchCount(opts: {
        query: string;
        queryBy?: string[];
        where?: TWhere;
        engineParams?: Record<string, unknown>;
        options?: IExtraOptions;
    }): Promise<{
        count: number;
        isFoundExact: boolean;
    }>;
    /** Facet counts without hits, over the documents that match `query` (all of them when omitted) and `where`. `maxFacetValues` and `facetQuery` are for engines that take them; the others refuse them. */
    facets(opts: {
        facetBy: string[];
        query?: string;
        queryBy?: string[];
        where?: TWhere;
        maxFacetValues?: number;
        facetQuery?: string;
        engineParams?: Record<string, unknown>;
        options?: IExtraOptions;
    }): Promise<{
        facets: ISearchFacetCount[];
        found: number;
        isFoundExact: boolean;
    }>;
    /** Autocomplete: documents whose fields match `query` as typed so far. A keyword search with highlighting off and a small page (`limit`, 8 by default); the last word matches as a prefix, which both engines do by default. A blank `query` answers an empty list without asking the engine. */
    suggest<R extends object = TDocument>(opts: {
        query: string;
        queryBy?: string[];
        limit?: number;
        includeFields?: string[];
        where?: TWhere;
        engineParams?: Record<string, unknown>;
        options?: IExtraOptions;
    }): Promise<R[]>;
    /** Documents lose their hidden fields on the way out, but a facet count or a match on one would still tell the caller what the field holds; so they are refused as `facetBy`, in `facetQuery`, as `queryBy`, as `groupBy` and in the highlight fields (a group key and a highlight snippet carry the value too). */
    protected assertNoHiddenFieldsNamed(opts: {
        input: TTranslatableSearchInput;
    }): void;
    protected withDefaultQueryBy(opts: {
        input: TTranslatableSearchInput;
    }): TTranslatableSearchInput;
    /** @throws Error - disabled in a read-only repository; unlocked progressively by Persistable/DefaultSearchRepository. */
    create(opts: {
        data: TDocument;
        options: IExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    create<R = TDocument>(opts: {
        data: TDocument;
        options?: IExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    /** @throws Error - disabled in a read-only repository. */
    createAll(opts: {
        data: Array<TDocument>;
        options: IExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    createAll<R = TDocument>(opts: {
        data: Array<TDocument>;
        options?: IExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: Array<R>;
    }>;
    /** @throws Error - disabled in a read-only repository. */
    updateById(opts: {
        id: IdType;
        data: Partial<TDocument>;
        options: IExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    updateById<R = TDocument>(opts: {
        id: IdType;
        data: Partial<TDocument>;
        options?: IExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    /**
     * @throws Error - disabled in a read-only repository. `where` is optional where the base contract
     * requires it: the `@model` `settings.query.filter` alone can supply the effective filter, and Persistable
     * refuses the write outright when neither is present.
     */
    updateAll(_opts: {
        data: Partial<TDocument>;
        where?: TWhere;
        options?: Omit<IExtraOptions, 'shouldReturn'> & {
            force?: boolean;
        };
    }): Promise<TCount & {
        data: null;
    }>;
    /** @throws Error - disabled in a read-only repository. */
    deleteById(opts: {
        id: IdType;
        options: IExtraOptions & {
            shouldReturn: false;
        };
    }): Promise<TCount & {
        data: undefined | null;
    }>;
    deleteById<R = TDocument>(opts: {
        id: IdType;
        options?: IExtraOptions & {
            shouldReturn?: true;
        };
    }): Promise<TCount & {
        data: R;
    }>;
    /** @throws Error - disabled in a read-only repository. Unlocked by DefaultSearchRepository. */
    deleteAll(_opts?: {
        where?: TWhere;
        options?: Omit<IExtraOptions, 'shouldReturn'> & {
            force?: boolean;
        };
    }): Promise<TCount & {
        data: null;
    }>;
}

/** The inputs the dialect translates - `raw` has already returned by the time these are resolved, and `applySearchInput` accepts only this narrowed union. */
type TTranslatableSearchInput = Exclude<TSearchInput, {
    mode: typeof SearchModes.RAW;
}>;
```

Source: `packages/connectors/src/search/core/repositories/core/readable.ts`

## `SearchBaseRepository`

*class*

Search-repository plumbing on `AbstractRepository`. `TDataSource` carries the concrete connector type through `this.connector`, so a concretely-bound repository reaches its engine's verbs uncast while an engine-agnostic one is forced to write `connector.alias?.…`.

```ts
export declare abstract class SearchBaseRepository<TDocument extends object = object, TDataSource extends AbstractSearchDataSource = AbstractSearchDataSource> extends AbstractRepository<TDocument, TDocument> {
    constructor(dataSource?: TDataSource, opts?: {
        scope?: string;
        entityClass?: TClass<BaseSearchEntity>;
    });
    get dataSource(): TDataSource;
    set dataSource(value: TDataSource);
    get entity(): BaseSearchEntity;
    set entity(value: BaseSearchEntity);
    get collectionName(): string;
    protected get connector(): ReturnType<TDataSource['getConnector']>;
    protected get queryDialect(): ISearchQueryDialect;
    /**
     * A request filter naming a hidden field is refused with the error the engine's dialect gives for a field the collection does
     * not declare. The filter is read as `buildQuery` reads it: an `include` is refused first, then the order entries, then the
     * where keys; a piece the dialect refuses on its own is refused with the dialect's error.
     */
    protected createRequestFilterJudge(): IRequestFilterJudge;
    /** The error `task` throws, or `undefined`. */
    private static refusalOf;
    get multiSearch(): TDataSource['multiSearch'];
    setDataSource(opts: {
        dataSource: TDataSource;
    }): void;
    /** WRITE responses never pass through the engine's exclude-fields filter, so the hidden properties are stripped here - the relational branch gets the same guarantee from `.returning(visibleProperties)`. */
    protected omitHiddenFields<R>(document: R): R;
    private _nullableFields?;
    /** Names of the fields declared `nullable`: the engine keeps no null, so a read puts it back. Memoized per repository instance, like `collectionFields`. */
    protected get nullableFields(): readonly string[];
    /**
     * The nullable fields a read fills: with a selection (`filter.fields`, which becomes the engine's
     * include list) only the selected ones, because every other key is absent by the caller's own
     * choice and `TRow` says so. No selection, or an empty one the engine reads as none: all of them.
     */
    protected selectedNullableFields(opts: {
        fields?: TFields;
    }): readonly string[];
    /** A document as it leaves the repository: a nullable field the engine dropped is `null` again, a hidden field is gone. The engine's own object is not changed. Writes have no selection. */
    protected shapeDocument<R>(document: R, opts?: {
        fields?: TFields;
    }): R;
    /**
     * A hit's `highlight` as it leaves the repository: it is built from the document's own fields (Meilisearch copies `_formatted`,
     * which holds every retrieved attribute), so it loses the hidden fields the document loses. A record loses its hidden keys;
     * a list of entries loses those whose `field` is hidden. Anything else is returned as it is.
     */
    protected shapeHighlight<R>(highlight: R): R;
    protected shapeDocuments<R>(documents: R[], opts?: {
        fields?: TFields;
    }): R[];
    private shapeWith;
    /** No search engine here has a transaction primitive (this tier is engine-neutral - Typesense and Meilisearch both inherit it) - a caller-supplied options.transaction is rejected loudly instead of silently running outside the transaction the caller expects. */
    protected assertNoTransaction(opts?: {
        transaction?: ITransaction;
    }): void;
    /** Row-level locking (SELECT ... FOR UPDATE) has no search-engine equivalent - same NotSupported convention as assertNoTransaction. */
    protected assertNoLock(opts?: {
        lock?: TLockOptions;
    }): void;
    private _collectionFields?;
    /**
     * Field names the collection declares, or undefined when it declares none - which means
     * "unvalidated", not "no fields": an entity carrying no `ISearchCollectionDefinition` must
     * compile exactly as it did before field checking existed.
     *
     * Read from the entity's own typed `schema` rather than by casting into `entity.constructor`;
     * `BaseSearchEntity.schema` is instance-side and already an `ISearchCollectionDefinition`.
     * Memoized per repository instance - the definition is frozen after boot.
     */
    protected get collectionFields(): ReadonlySet<string> | undefined;
    /**
     * Builds a dialect-translated query, always stripping hiddenFields.
     *
     * The caller's `where` and the repository-owned `defaultWhere` are compiled SEPARATELY and
     * combined after, rather than merged into one tree first. Merging first makes the two
     * indistinguishable, and the repository's own clause would then have to satisfy the
     * caller-facing field check: `SprocketDocument` in integration-wiring.test.ts declares
     * [title, secretCode] but carries `query.filter: { where: { isActive: true } }`, so every
     * request through it would 400 ITSELF. Compiling separately makes the trust boundary a matter
     * of WHICH CALL IS MADE, which - unlike a flag threaded through the recursion - cannot be wrong
     * at a nested level.
     */
    protected buildQuery(opts: {
        filter?: TFilter;
        shouldSkipDefaultFilter?: boolean;
    }): ISearchQuery;
    /**
     * Refuses a caller-supplied page larger than this model allows.
     *
     * POLICY, and the counterweight to a guardrail this tier removed: an engine used to refuse more
     * than 250 hits per page, so an unreasonable `limit` failed fast and cheap. Now that such a page
     * is served, something has to decide when it is unreasonable, and the framework would otherwise
     * be less safe than before it could satisfy the request.
     *
     * It lives in `buildQuery` because that is the one point BOTH `find()` and `search()` pass
     * through - enforcing in `find()` alone would leave `search()` as a way around it, which is not
     * a ceiling. `mode: 'raw'` bypasses `buildQuery` and therefore bypasses this deliberately: raw
     * is the documented escape hatch and its callers own the consequences. They still cannot exceed
     * the connector's physical ceiling, which is the intended layering - policy is opt-out-able,
     * physics is not.
     */
    protected assertLimitWithinCeiling(opts: {
        limit?: number;
        scope?: string;
    }): void;
    /**
     * Compiles the caller clause (field-checked) and the repository-owned default clause
     * (unchecked), then ANDs them via the dialect - `defaultWhere` first, preserving the order the
     * previous `{ and: [defaultWhere, where] }` merge produced.
     */
    protected compileEffectiveWhere(opts: {
        where?: TWhere;
        defaultWhere?: TWhere;
    }): TCompiledWhere;
}
```

Source: `packages/connectors/src/search/core/repositories/core/base.ts`

## `SearchCollectionFactory`

*class*

`define()` validates a collection definition and returns it with its field literals preserved. It throws on an empty name or two synonyms with one id.

```ts
export declare class SearchCollectionFactory {
    /** @throws when two synonym sets in the same collection share an id. */
    private static assertUniqueSynonymIds;
    /** `<const T>` preserves field literals so `TSearchDocument<typeof X>` can map over them - a plain `T extends ISearchCollectionDefinition` would widen `fields` and lose every literal. */
    static define<const T extends ISearchCollectionDefinition>(opts: T): T;
    static deriveDocumentSchema(opts: {
        definition: ISearchCollectionDefinition;
        type: TSchemaType;
    }): z.ZodType;
}
```

Source: `packages/connectors/src/search/core/models/define-search-collection.ts`

## `SearchErrors`

*const*

Codes are LITERAL strings, deliberately not `SearchErrorCodes.*`: `MessageCode.build()` returns `string`, which erases the literal type `TRegisterErrors` is built on and silently kills autocomplete. The values are identical to what those constants produce - they are a public contract and must not shift.

```ts
export declare const SearchErrors: {
    readonly NOT_FOUND: {
        readonly message: {
            readonly text: "Document not found";
            readonly code: "core.search_engine.not_found";
        };
        readonly statusCode: 404;
        readonly category: "business";
    };
    readonly ALREADY_EXISTS: {
        readonly message: {
            readonly text: "Document already exists";
            readonly code: "core.search_engine.already_exists";
        };
        readonly statusCode: 409;
        readonly category: "business";
    };
    /** A `where` key the collection definition does not declare - the search-tier answer to relational's `Column NOT FOUND`. */
    readonly UNKNOWN_FIELD: {
        readonly message: {
            readonly text: "Unknown field in filter";
            readonly code: "core.search_engine.unknown_field";
        };
        readonly statusCode: 400;
        readonly category: "business";
    };
    /** A page this engine cannot deliver in one call - more hits than the multi-search budget covers, or a GROUPED query, whose groups cannot be split across windows without inventing an ordering the engine never produced. */
    readonly PAGE_TOO_LARGE: {
        readonly message: {
            readonly text: "Requested page is too large";
            readonly code: "core.search_engine.page_too_large";
        };
        readonly statusCode: 400;
        readonly category: "business";
    };
    /** An operator this engine cannot express. Catalogued because WHICH engine backs the collection is what decides it - the same `where` is valid against one and not the other, so a caller must be able to branch rather than parse prose. */
    readonly UNSUPPORTED_OPERATOR: {
        readonly message: {
            readonly text: "Operator not supported by this search engine";
            readonly code: "core.search_engine.unsupported_operator";
        };
        readonly statusCode: 400;
        readonly category: "business";
    };
};
```

Source: `packages/connectors/src/search/core/common/errors.ts`

## `SearchFieldTypes`

*class*

Engine-neutral field type vocabulary for the search-collection DSL.

```ts
export declare class SearchFieldTypes {
    static readonly STRING = "string";
    static readonly NUMBER = "number";
    static readonly BOOLEAN = "boolean";
    static readonly GEOPOINT = "geopoint";
    static readonly STRING_ARRAY = "string[]";
    static readonly NUMBER_ARRAY = "number[]";
    static readonly BOOLEAN_ARRAY = "boolean[]";
    static readonly VECTOR = "vector";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TSearchFieldType;
}
```

Source: `packages/connectors/src/search/core/models/common/constants.ts`

## `SearchFilterOutcomes`

*class*

What a `where` tree compiled down to. A filter STRING cannot express the two absorbing
outcomes: `''` is indistinguishable from "no constraint", which is why an empty `or` used to
compile to a filter byte-identical to the unscoped query - widening the very clause meant to
narrow it. The relational branch has always had this vocabulary (`sql\`false\`` vs `undefined`,
relational/repositories/dialect/filter.ts:637-641); this is that vocabulary for the search branch.

```ts
export declare class SearchFilterOutcomes {
    /** A real filter expression the engine should run. */
    static readonly FILTER = "filter";
    /** Vacuously true - impose no constraint. */
    static readonly MATCH_ALL = "matchAll";
    /** Absorbing false - can never match, so the engine must not be asked. */
    static readonly MATCH_NONE = "matchNone";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): input is TSearchFilterOutcome;
}
```

Source: `packages/connectors/src/search/core/repositories/common/types.ts`

## `SearchInputSchema`

*const*

Zod schema of the `search()` input, a discriminated union on `mode`: `keyword`, `semantic`, `hybrid` or `raw`.

```ts
export declare const SearchInputSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
    mode: z.ZodLiteral<"keyword">;
    query: z.ZodOptional<z.ZodString>;
    queryBy: z.ZodOptional<z.ZodArray<z.ZodString>>;
    highlight: z.ZodOptional<z.ZodBoolean>;
    filter: z.ZodOptional<z.ZodObject<{
        where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
        fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
        order: z.ZodOptional<z.ZodArray<z.ZodString>>;
        limit: z.ZodOptional<z.ZodNumber>;
        offset: z.ZodOptional<z.ZodNumber>;
        skip: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    distanceThreshold: z.ZodOptional<z.ZodNumber>;
    ef: z.ZodOptional<z.ZodNumber>;
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
    mode: z.ZodLiteral<"semantic">;
    vectorField: z.ZodString;
    nearVector: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
    queryText: z.ZodOptional<z.ZodString>;
    k: z.ZodOptional<z.ZodNumber>;
    filter: z.ZodOptional<z.ZodObject<{
        where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
        fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
        order: z.ZodOptional<z.ZodArray<z.ZodString>>;
        limit: z.ZodOptional<z.ZodNumber>;
        offset: z.ZodOptional<z.ZodNumber>;
        skip: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    distanceThreshold: z.ZodOptional<z.ZodNumber>;
    ef: z.ZodOptional<z.ZodNumber>;
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
    mode: z.ZodLiteral<"hybrid">;
    query: z.ZodString;
    queryBy: z.ZodArray<z.ZodString>;
    vectorField: z.ZodString;
    nearVector: z.ZodOptional<z.ZodArray<z.ZodNumber>>;
    alpha: z.ZodOptional<z.ZodNumber>;
    k: z.ZodOptional<z.ZodNumber>;
    filter: z.ZodOptional<z.ZodObject<{
        where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
        fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
        order: z.ZodOptional<z.ZodArray<z.ZodString>>;
        limit: z.ZodOptional<z.ZodNumber>;
        offset: z.ZodOptional<z.ZodNumber>;
        skip: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strip>, z.ZodObject<{
    mode: z.ZodLiteral<"raw">;
    params: z.ZodRecord<z.ZodString, z.ZodAny>;
}, z.core.$strip>], "mode">;
```

Source: `packages/connectors/src/search/core/repositories/common/constants.ts`

## `SearchModes`

*class*

Discriminant values for `TSearchInput.mode` - which search strategy `ReadableSearchRepository.search()` runs.

```ts
export declare class SearchModes {
    static readonly KEYWORD = "keyword";
    static readonly SEMANTIC = "semantic";
    static readonly HYBRID = "hybrid";
    static readonly RAW = "raw";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): input is TSearchMode;
}
```

Source: `packages/connectors/src/search/core/repositories/common/constants.ts`

## `SearchQueryParamsUtility`

*class*

Static helpers that convert friendly (camelCase) search params into the connector's query shape.

```ts
export declare class SearchQueryParamsUtility {
    /** Friendly multi-search params -> `ISearchQuery`: list fields comma-joined, the rest pass through; keeps `search()`, `multiSearch()` and `commonParams` on one friendly-to-wire path. */
    static toSearchQueryParams(opts: {
        input: Record<string, unknown>;
    }): Partial<ISearchQuery>;
}
```

Source: `packages/connectors/src/search/core/repositories/common/query-params.ts`

## `TCollectionCreateSchema`

*type*

The `typesense` package's `CollectionCreateSchema`.

```ts
export type TCollectionCreateSchema = CollectionCreateSchema;
```

Source: `packages/connectors/src/search/typesense/common/types/schema.ts`

## `TCollectionFieldSchema`

*type*

The `typesense` package's `CollectionFieldSchema`.

```ts
export type TCollectionFieldSchema = CollectionFieldSchema;
```

Source: `packages/connectors/src/search/typesense/common/types/schema.ts`

## `TCollectionSchema`

*type*

The `typesense` package's `CollectionSchema`.

```ts
export type TCollectionSchema = CollectionSchema;
```

Source: `packages/connectors/src/search/typesense/common/types/schema.ts`

## `TCompiledWhere`

*type*

Result of compiling a `where` tree: `filterBy` is present only when `outcome` is `filter`; `matchAll` and `matchNone` carry no filter string.

```ts
export type TCompiledWhere = {
    outcome: typeof SearchFilterOutcomes.FILTER;
    filterBy: string;
} | {
    outcome: typeof SearchFilterOutcomes.MATCH_ALL;
} | {
    outcome: typeof SearchFilterOutcomes.MATCH_NONE;
};

/**
 * What a `where` tree compiled down to. A filter STRING cannot express the two absorbing
 * outcomes: `''` is indistinguishable from "no constraint", which is why an empty `or` used to
 * compile to a filter byte-identical to the unscoped query - widening the very clause meant to
 * narrow it. The relational branch has always had this vocabulary (`sql\`false\`` vs `undefined`,
 * relational/repositories/dialect/filter.ts:637-641); this is that vocabulary for the search branch.
 */
export declare class SearchFilterOutcomes {
    /** A real filter expression the engine should run. */
    static readonly FILTER = "filter";
    /** Vacuously true - impose no constraint. */
    static readonly MATCH_ALL = "matchAll";
    /** Absorbing false - can never match, so the engine must not be asked. */
    static readonly MATCH_NONE = "matchNone";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): input is TSearchFilterOutcome;
}
```

Source: `packages/connectors/src/search/core/repositories/common/types.ts`

## `TDocumentSchema`

*type*

The `typesense` package's `DocumentSchema`.

```ts
export type TDocumentSchema = DocumentSchema;
```

Source: `packages/connectors/src/search/typesense/common/types/schema.ts`

## `TFieldFlags`

*type*

Per-field builder flags accepted by `field.*` helpers (./define-search-collection.ts).

```ts
export type TFieldFlags = Pick<ISearchFieldDefinition, 'searchable' | 'filterable' | 'facet' | 'sortable' | 'optional' | 'nullable'>;
```

Source: `packages/connectors/src/search/core/models/common/types/field.ts`

## `TImportResponse`

*type*

The `typesense` package's `ImportResponse`, the per-row result of an import.

```ts
export type TImportResponse = ImportResponse;
```

Source: `packages/connectors/src/search/typesense/common/types/search.ts`

## `TMultiSearchEntry`

*type*

Parsed form of one `MultiSearchEntrySchema` entry.

```ts
export type TMultiSearchEntry = z.infer<typeof MultiSearchEntrySchema>;
```

Source: `packages/connectors/src/search/core/repositories/common/constants.ts`

## `TMultiSearchInput`

*type*

Parsed form of `MultiSearchInputSchema`.

```ts
export type TMultiSearchInput = z.infer<typeof MultiSearchInputSchema>;
```

Source: `packages/connectors/src/search/core/repositories/common/constants.ts`

## `TSearchDocument`

*type*

Compile-time document shape for a `SearchCollectionFactory.define` literal. Uses `Exclude<..., { optional: true }>`, not `Extract<..., { optional?: false }>` - the latter is a TS weak type and rejects fields with no `optional` key. A `vector.embed` field is server auto-embedded, so it is omitted entirely.

```ts
export type TSearchDocument<T extends ISearchCollectionDefinition> = {
    id: string;
} & {
    [F in Exclude<T['fields'][number], {
        optional: true;
    }> as F['name'] extends 'id' ? never : F extends {
        vector: {
            embed: object;
        };
    } ? never : F['name']]: TSearchFieldTsType<F['type']>;
} & {
    [F in Extract<T['fields'][number], {
        optional: true;
    }> as F['name'] extends 'id' ? never : F extends {
        vector: {
            embed: object;
        };
    } ? never : F['name']]?: F extends {
        nullable: true;
    } ? TSearchFieldTsType<F['type']> | null : TSearchFieldTsType<F['type']>;
};
```

Source: `packages/connectors/src/search/core/models/common/types/document.ts`

## `TSearchFieldTsType`

*type*

Maps a DSL field-type literal to its TypeScript runtime type - the scalar/array counterpart of `TSearchFieldType`.

```ts
export type TSearchFieldTsType<T extends TSearchFieldType> = T extends 'string' ? string : T extends 'number' ? number : T extends 'boolean' ? boolean : T extends 'geopoint' ? [number, number] : T extends 'string[]' ? string[] : T extends 'number[]' ? number[] : T extends 'boolean[]' ? boolean[] : T extends 'vector' ? number[] : never;
```

Source: `packages/connectors/src/search/core/models/common/types/document.ts`

## `TSearchFieldType`

*type*

Union of the `SearchFieldTypes` values.

```ts
export type TSearchFieldType = TConstValue<typeof SearchFieldTypes>;
```

Source: `packages/connectors/src/search/core/models/common/constants.ts`

## `TSearchFilterOutcome`

*type*

Union of the `SearchFilterOutcomes` values.

```ts
export type TSearchFilterOutcome = TConstValue<typeof SearchFilterOutcomes>;
```

Source: `packages/connectors/src/search/core/repositories/common/types.ts`

## `TSearchInput`

*type*

Parsed `search()` input; narrow on `mode` to reach the fields of one strategy.

```ts
export type TSearchInput = z.infer<typeof SearchInputSchema>;
```

Source: `packages/connectors/src/search/core/repositories/common/constants.ts`

## `TSearchMode`

*type*

Union of the `SearchModes` values.

```ts
export type TSearchMode = TConstValue<typeof SearchModes>;
```

Source: `packages/connectors/src/search/core/repositories/common/constants.ts`

## `TSearchOptions`

*type*

The `typesense` package's per-request `SearchOptions`.

```ts
export type TSearchOptions = SearchOptions;
```

Source: `packages/connectors/src/search/typesense/common/types/search.ts`

## `TSearchParams`

*type*

The `typesense` package's `SearchParams` for documents of `TDocumentSchema`.

```ts
export type TSearchParams = SearchParams<TDocumentSchema>;
```

Source: `packages/connectors/src/search/typesense/common/types/search.ts`

## `TSearchResponse`

*type*

The `typesense` package's `SearchResponse` for documents of type `T`.

```ts
export type TSearchResponse<T extends TDocumentSchema = TDocumentSchema> = SearchResponse<T>;
```

Source: `packages/connectors/src/search/typesense/common/types/search.ts`

## `TSearchSchema`

*type*

Collection definitions, each an `ISearchCollectionDefinition`, keyed by a caller-chosen name.

```ts
export type TSearchSchema = Record<string, ISearchCollectionDefinition>;
```

Source: `packages/connectors/src/search/core/models/common/types/collection.ts`

## `TTypesenseDirtyValue`

*type*

Union of the `TypesenseDirtyValues` values.

```ts
export type TTypesenseDirtyValue = TConstValue<typeof TypesenseDirtyValues>;
```

Source: `packages/connectors/src/search/typesense/common/constants.ts`

## `TTypesenseImportAction`

*type*

Union of the `TypesenseImportActions` values.

```ts
export type TTypesenseImportAction = TConstValue<typeof TypesenseImportActions>;
```

Source: `packages/connectors/src/search/typesense/common/constants.ts`

## `TTypesenseOperationMode`

*type*

What `infix` takes per field: Typesense's `OperationMode`.

```ts
export type TTypesenseOperationMode = 'off' | 'always' | 'fallback';
```

Source: `packages/connectors/src/search/typesense/repositories/common/types.ts`

## `TTypesenseTextMatchType`

*type*

How Typesense combines the scores of several matching fields: its `text_match_type` values.

```ts
export type TTypesenseTextMatchType = 'max_score' | 'max_weight' | 'sum_score';
```

Source: `packages/connectors/src/search/typesense/repositories/common/types.ts`

## `TVectorDistance`

*type*

Union of the `VectorDistances` values: `'cosine'`, `'ip'` or `'l2'`.

```ts
export type TVectorDistance = TConstValue<typeof VectorDistances>;
```

Source: `packages/connectors/src/search/core/models/common/constants.ts`

## `TypesenseBaseRepository`

*class*

Search-repository plumbing on `AbstractRepository`. `TDataSource` carries the concrete connector type through `this.connector`, so a concretely-bound repository reaches its engine's verbs uncast while an engine-agnostic one is forced to write `connector.alias?.…`.

```ts
export declare abstract class SearchBaseRepository<TDocument extends object = object, TDataSource extends AbstractSearchDataSource = AbstractSearchDataSource> extends AbstractRepository<TDocument, TDocument> {
    constructor(dataSource?: TDataSource, opts?: {
        scope?: string;
        entityClass?: TClass<BaseSearchEntity>;
    });
    get dataSource(): TDataSource;
    set dataSource(value: TDataSource);
    get entity(): BaseSearchEntity;
    set entity(value: BaseSearchEntity);
    get collectionName(): string;
    protected get connector(): ReturnType<TDataSource['getConnector']>;
    protected get queryDialect(): ISearchQueryDialect;
    /**
     * A request filter naming a hidden field is refused with the error the engine's dialect gives for a field the collection does
     * not declare. The filter is read as `buildQuery` reads it: an `include` is refused first, then the order entries, then the
     * where keys; a piece the dialect refuses on its own is refused with the dialect's error.
     */
    protected createRequestFilterJudge(): IRequestFilterJudge;
    /** The error `task` throws, or `undefined`. */
    private static refusalOf;
    get multiSearch(): TDataSource['multiSearch'];
    setDataSource(opts: {
        dataSource: TDataSource;
    }): void;
    /** WRITE responses never pass through the engine's exclude-fields filter, so the hidden properties are stripped here - the relational branch gets the same guarantee from `.returning(visibleProperties)`. */
    protected omitHiddenFields<R>(document: R): R;
    private _nullableFields?;
    /** Names of the fields declared `nullable`: the engine keeps no null, so a read puts it back. Memoized per repository instance, like `collectionFields`. */
    protected get nullableFields(): readonly string[];
    /**
     * The nullable fields a read fills: with a selection (`filter.fields`, which becomes the engine's
     * include list) only the selected ones, because every other key is absent by the caller's own
     * choice and `TRow` says so. No selection, or an empty one the engine reads as none: all of them.
     */
    protected selectedNullableFields(opts: {
        fields?: TFields;
    }): readonly string[];
    /** A document as it leaves the repository: a nullable field the engine dropped is `null` again, a hidden field is gone. The engine's own object is not changed. Writes have no selection. */
    protected shapeDocument<R>(document: R, opts?: {
        fields?: TFields;
    }): R;
    /**
     * A hit's `highlight` as it leaves the repository: it is built from the document's own fields (Meilisearch copies `_formatted`,
     * which holds every retrieved attribute), so it loses the hidden fields the document loses. A record loses its hidden keys;
     * a list of entries loses those whose `field` is hidden. Anything else is returned as it is.
     */
    protected shapeHighlight<R>(highlight: R): R;
    protected shapeDocuments<R>(documents: R[], opts?: {
        fields?: TFields;
    }): R[];
    private shapeWith;
    /** No search engine here has a transaction primitive (this tier is engine-neutral - Typesense and Meilisearch both inherit it) - a caller-supplied options.transaction is rejected loudly instead of silently running outside the transaction the caller expects. */
    protected assertNoTransaction(opts?: {
        transaction?: ITransaction;
    }): void;
    /** Row-level locking (SELECT ... FOR UPDATE) has no search-engine equivalent - same NotSupported convention as assertNoTransaction. */
    protected assertNoLock(opts?: {
        lock?: TLockOptions;
    }): void;
    private _collectionFields?;
    /**
     * Field names the collection declares, or undefined when it declares none - which means
     * "unvalidated", not "no fields": an entity carrying no `ISearchCollectionDefinition` must
     * compile exactly as it did before field checking existed.
     *
     * Read from the entity's own typed `schema` rather than by casting into `entity.constructor`;
     * `BaseSearchEntity.schema` is instance-side and already an `ISearchCollectionDefinition`.
     * Memoized per repository instance - the definition is frozen after boot.
     */
    protected get collectionFields(): ReadonlySet<string> | undefined;
    /**
     * Builds a dialect-translated query, always stripping hiddenFields.
     *
     * The caller's `where` and the repository-owned `defaultWhere` are compiled SEPARATELY and
     * combined after, rather than merged into one tree first. Merging first makes the two
     * indistinguishable, and the repository's own clause would then have to satisfy the
     * caller-facing field check: `SprocketDocument` in integration-wiring.test.ts declares
     * [title, secretCode] but carries `query.filter: { where: { isActive: true } }`, so every
     * request through it would 400 ITSELF. Compiling separately makes the trust boundary a matter
     * of WHICH CALL IS MADE, which - unlike a flag threaded through the recursion - cannot be wrong
     * at a nested level.
     */
    protected buildQuery(opts: {
        filter?: TFilter;
        shouldSkipDefaultFilter?: boolean;
    }): ISearchQuery;
    /**
     * Refuses a caller-supplied page larger than this model allows.
     *
     * POLICY, and the counterweight to a guardrail this tier removed: an engine used to refuse more
     * than 250 hits per page, so an unreasonable `limit` failed fast and cheap. Now that such a page
     * is served, something has to decide when it is unreasonable, and the framework would otherwise
     * be less safe than before it could satisfy the request.
     *
     * It lives in `buildQuery` because that is the one point BOTH `find()` and `search()` pass
     * through - enforcing in `find()` alone would leave `search()` as a way around it, which is not
     * a ceiling. `mode: 'raw'` bypasses `buildQuery` and therefore bypasses this deliberately: raw
     * is the documented escape hatch and its callers own the consequences. They still cannot exceed
     * the connector's physical ceiling, which is the intended layering - policy is opt-out-able,
     * physics is not.
     */
    protected assertLimitWithinCeiling(opts: {
        limit?: number;
        scope?: string;
    }): void;
    /**
     * Compiles the caller clause (field-checked) and the repository-owned default clause
     * (unchecked), then ANDs them via the dialect - `defaultWhere` first, preserving the order the
     * previous `{ and: [defaultWhere, where] }` merge produced.
     */
    protected compileEffectiveWhere(opts: {
        where?: TWhere;
        defaultWhere?: TWhere;
    }): TCompiledWhere;
}
```

Source: `packages/connectors/src/search/core/repositories/core/base.ts`

## `TypesenseCollectionCompiler`

*class*

Compiles the engine-neutral collection DSL into a Typesense `CollectionCreateSchema`. Throws on an unsupported field type, a vector field with neither `dimensions` nor `embed`, a dotted field name without `enable_nested_fields`, and a `defaultSort` that is not a scalar numeric field of the collection.

```ts
export declare class TypesenseCollectionCompiler {
    /** Compiles an engine-neutral `ISearchCollectionDefinition` into a Typesense `CollectionCreateSchema`. */
    static compile(opts: {
        definition: ISearchCollectionDefinition;
    }): CollectionCreateSchema;
}
```

Source: `packages/connectors/src/search/typesense/compiler.ts`

## `TypesenseConnector`

*class*

Typesense engine connector - built/injected by TypesenseDataSource, which exposes the raw client via getClient().

````ts
export declare class TypesenseConnector extends BaseSearchConnector {
    private readonly client;
    private readonly createClient;
    /** An injected client is not built from `nodes` and `apiKey`, so a client for a call cannot be built from them either. */
    private readonly canBuildCallClient;
    constructor(opts: ITypesenseConnectorOptions & {
        client?: ITypesenseClientLike;
    });
    getClient(): Client;
    /**
     * The client one call runs on. Without `timeoutMs` it is the connector's own; with it, a client whose
     * `connectionTimeoutSeconds` is that many milliseconds, because `typesense-js` has no timeout per call. What it bounds
     * is the wait for the response (an import answers after the batch is processed) and then the longest silence on the
     * socket, not the whole transfer: a download that keeps arriving never trips it.
     */
    private clientFor;
    protected isNotFoundError(opts: {
        error: unknown;
    }): boolean;
    readonly collection: ISearchCollectionScoped<TCollectionCreateSchema, TCollectionSchema, TCollectionFieldSchema>;
    readonly alias: ISearchAliasScoped;
    readonly synonymSet: ISearchSynonymSetScoped;
    readonly document: ISearchDocumentScoped & {
        find: <T extends object>(opts: {
            collection: string;
            id: string;
        }) => Promise<T | null>;
    };
    getHealth(): Promise<{
        ok: boolean;
    }>;
    createCollection(opts: {
        schema: TCollectionCreateSchema;
    } & ITypesenseCallOptions): Promise<TCollectionSchema | void>;
    ensureCollection(opts: {
        schema: TCollectionCreateSchema;
    }): Promise<TCollectionSchema>;
    getCollection(opts: {
        name: string;
    } & ITypesenseCallOptions): Promise<TCollectionSchema>;
    listCollections(): Promise<TCollectionSchema[]>;
    collectionExists(opts: {
        name: string;
    }): Promise<boolean>;
    patchCollectionSchema(opts: {
        name: string;
        fields: TCollectionFieldSchema[];
    } & ITypesenseCallOptions): Promise<void>;
    deleteCollection(opts: {
        name: string;
    }): Promise<boolean>;
    upsertAlias(opts: {
        name: string;
        collection: string;
    }): Promise<void>;
    getAlias(opts: {
        name: string;
    }): Promise<IAliasInfo | null>;
    upsertSynonymSet(opts: {
        name: string;
        items: ISynonym[];
    }): Promise<void>;
    getSynonymSet(opts: {
        name: string;
    }): Promise<ISynonym[] | null>;
    listSynonymSets(): Promise<string[]>;
    deleteSynonymSet(opts: {
        name: string;
    }): Promise<boolean>;
    linkSynonymSets(opts: {
        collection: string;
        synonymSets: string[];
    }): Promise<void>;
    createDocument<T extends object>(opts: {
        collection: string;
        document: T;
    }): Promise<T>;
    getDocument<T extends object>(opts: {
        collection: string;
        id: string;
    }): Promise<T>;
    /** `getDocument` that answers `null` for a missing document, the way `getAlias` does, where `getDocument` throws `404 core.search_engine.not_found`. Any other failure throws as it does there. */
    findDocument<T extends object>(opts: {
        collection: string;
        id: string;
    }): Promise<T | null>;
    /** Typesense's `found` is exhaustive, so a `per_page: 0` search is already an exact count - no separate endpoint needed. */
    countDocuments(opts: {
        collection: string;
        filterBy?: string;
    }): Promise<number>;
    upsertDocument<T extends object>(opts: {
        collection: string;
        document: T;
    }): Promise<T>;
    updateDocument<T extends object>(opts: {
        collection: string;
        id: string;
        document: Partial<T>;
    }): Promise<T>;
    deleteDocument(opts: {
        collection: string;
        id: string;
    }): Promise<boolean>;
    /** Appends one batch's per-row responses to `responses` and returns that batch's success/fail split. */
    private tallyImportResponses;
    importDocuments<T extends object>(opts: {
        collection: string;
        documents: T[];
        action?: TTypesenseImportAction;
        batchSize?: number;
        dirtyValues?: TTypesenseDirtyValue;
        /**
         * Opt-in. When some rows are rejected, throw `422` after the last batch, with the counts in `extra.details` and
         * every per-row response on the error's `responses`. Off, a rejected row is in `count.fail` and
         * `responses` of the result and nothing throws.
         *
         * @default false
         */
        throwOnFail?: boolean;
    } & ITypesenseCallOptions): Promise<IImportResult<TImportResponse>>;
    updateByFilter<T extends object>(opts: {
        collection: string;
        document: Partial<T>;
        filterBy: string;
    }): Promise<{
        updatedCount: number;
    }>;
    deleteByFilter(opts: {
        collection: string;
        filterBy: string;
        batchSize?: number;
        ignoreNotFound?: boolean;
    }): Promise<number>;
    deleteAllDocuments(opts: {
        collection: string;
    }): Promise<boolean>;
    exportDocuments(opts: {
        collection: string;
        filterBy?: string;
        includeFields?: string[];
        excludeFields?: string[];
    } & ITypesenseCallOptions): Promise<string>;
    /**
     * The export as a stream of NDJSON lines, one document per line without its newline, read as the engine sends
     * them. Memory stays bounded by one chunk and one partial line, so a collection of any size can be written to disk
     * as it arrives, where `exportDocuments` builds the whole export as one string (at most 2^31 - 1 characters on Bun, about 2 GiB of ASCII text).
     *
     * ```typescript
     * for await (const line of connector.streamDocuments({ collection: 'products', timeoutMs: 600_000 })) {
     *   writer.write(`${line}\n`);
     * }
     * ```
     *
     * The call to the engine happens on the first read. A failure before the first line throws as `exportDocuments`
     * does; one in the middle throws the same error from the loop, after the lines already read.
     */
    streamDocuments(opts: {
        collection: string;
        filterBy?: string;
        includeFields?: string[];
        excludeFields?: string[];
    } & ITypesenseCallOptions): AsyncGenerator<string, void, undefined>;
    /**
     * The single transport. Every engine search - one collection or many - is one POST to
     * `/multi_search`.
     *
     * `/multi_search` is a strict superset of GET single-search: it accepts the same per-entry
     * params, and it carries them in the BODY. GET is capped near 4000 characters of query string,
     * which a `filter_by` built from an authorization scope exceeds at roughly ninety ids - so a
     * user with many permitted scopes could not search at all. Choosing between the two at runtime
     * would mean deciding on URL length, which is only knowable after building the query; there is
     * no decision point here, so there is nothing to decide wrongly.
     */
    private executeMultiSearch;
    search<T extends TDocumentSchema = TDocumentSchema>(opts: {
        collection: string;
        params: TSearchParams;
        options?: TSearchOptions;
    }): Promise<ISearchResult<T>>;
    /**
     * Refuses a page that cannot be served honestly, rather than serving part of it.
     *
     * Grouped results are refused outright: groups span windows, so concatenating duplicates them
     * and taking the first window drops the rest. Merging by key would mean re-deriving `group_limit`
     * ordering the engine never produced - inventing an answer, which is the failure class this
     * whole change exists to remove.
     */
    private assertSplittablePage;
    multiSearch<T extends TDocumentSchema = TDocumentSchema>(opts: {
        searches: Array<{
            collection: string;
        } & Partial<TSearchParams>>;
        union: true;
        commonParams?: Partial<TSearchParams>;
        options?: TSearchOptions;
    }): Promise<IUnionSearchResult<T>>;
    multiSearch<T extends TDocumentSchema = TDocumentSchema>(opts: {
        searches: Array<{
            collection: string;
        } & Partial<TSearchParams>>;
        union?: false;
        commonParams?: Partial<TSearchParams>;
        options?: TSearchOptions;
    }): Promise<IMultiSearchResult<T>>;
}
````

Source: `packages/connectors/src/search/typesense/connector.ts`

## `TypesenseDataSource`

*class*

Typesense-backed search datasource: builds/injects a connector, compiles the neutral DSL, and provisions discovered collections.

```ts
export declare class TypesenseDataSource extends BaseSearchDataSource<ITypesenseDataSourceSettings, TypesenseConnector> {
    /** Stateless dialect - shared across every TypesenseDataSource instance. */
    private static readonly queryDialect;
    protected createConnector(): TypesenseConnector;
    getClient(): Client;
    getQueryDialect(): ISearchQueryDialect;
    /** Narrows the neutral `Promise<unknown>` to Typesense's own multi-search envelopes: `results[]` side by side, or ONE merged result set when `union` is set. */
    multiSearch<T extends TDocumentSchema = TDocumentSchema>(opts: {
        searches: TMultiSearchEntry[];
        union: true;
        commonParams?: Omit<TMultiSearchEntry, 'collection'>;
        options?: TSearchOptions;
    }): Promise<IUnionSearchResult<T>>;
    multiSearch<T extends TDocumentSchema = TDocumentSchema>(opts: {
        searches: TMultiSearchEntry[];
        union?: false;
        commonParams?: Omit<TMultiSearchEntry, 'collection'>;
        options?: TSearchOptions;
    }): Promise<IMultiSearchResult<T>>;
    multiSearch<T extends TDocumentSchema = TDocumentSchema>(opts: {
        searches: TMultiSearchEntry[];
        union?: boolean;
        commonParams?: Omit<TMultiSearchEntry, 'collection'>;
        options?: TSearchOptions;
    }): Promise<IMultiSearchResult<T> | IUnionSearchResult<T>>;
    getCapabilities(): ISearchableDataSourceCapabilities;
    compileCollection(opts: {
        definition: ISearchCollectionDefinition;
    }): CollectionCreateSchema;
    ensureCollection(opts: {
        definition: ISearchCollectionDefinition;
    }): Promise<void>;
}
```

Source: `packages/connectors/src/search/typesense/datasources/datasource.ts`

## `TypesenseDirtyValues`

*class*

Values of the import `dirtyValues` option, which selects how the engine treats a field value that does not match its declared type.

```ts
export declare class TypesenseDirtyValues {
    static readonly COERCE_OR_REJECT = "coerce_or_reject";
    static readonly COERCE_OR_DROP = "coerce_or_drop";
    static readonly DROP = "drop";
    static readonly REJECT = "reject";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TTypesenseDirtyValue;
}
```

Source: `packages/connectors/src/search/typesense/common/constants.ts`

## `TypesenseImportActions`

*class*

Values of the import `action` option; `create` is used when none is given.

```ts
export declare class TypesenseImportActions {
    static readonly CREATE = "create";
    static readonly UPSERT = "upsert";
    static readonly UPDATE = "update";
    static readonly EMPLACE = "emplace";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TTypesenseImportAction;
}
```

Source: `packages/connectors/src/search/typesense/common/constants.ts`

## `TypesenseQueryDialect`

*class*

Translates repository-level TFilter/TWhere into Typesense search params - pure string building, no dependency on the `typesense` package. Untranslatable shapes (relations, pattern/regex) throw, as does any field name the collection does not declare.

```ts
export declare class TypesenseQueryDialect extends BaseHelper implements ISearchQueryDialect {
    constructor();
    build(opts: {
        filter?: TFilter;
        hiddenFields?: string[];
        capabilities?: ISearchCompileCapabilities;
    }): ITypesenseSearchQuery;
    /** Maps a camelCase `ISearchQuery` onto Typesense's snake_case wire params via `SearchWireKeys.wireKey`; unmapped keys (`page`, `offset`) pass through unchanged and `engineParams` merges last, verbatim. */
    toWireParams(opts: {
        query: Partial<ISearchQuery>;
    }): Record<string, unknown>;
    /** Writes the mode dispatch, the vector clause and the `prefix` default onto `query`; everything engine-specific about a non-raw search lives here, so the repository tier stays neutral. */
    applySearchInput(opts: {
        query: ISearchQuery;
        input: TTranslatableSearchInput;
    }): void;
    /** Builds Typesense's `<field>:([v1, v2, ...], k: N, alpha: A)` vector-search clause; an omitted `nearVector` emits an empty `[]`, Typesense's server-side auto-embed path, rather than requiring the caller to already hold a vector. */
    private buildVectorClause;
    /** Copies faceting/highlighting/grouping/tuning params (shared by keyword/semantic/hybrid, absent from `raw`) onto the query; arrays are comma-joined as `build` joins queryBy/fields. */
    private applyCommonParams;
    /**
     * this returned `''` for it - indistinguishable from "no constraint", which is precisely how an
     * empty `or` came to widen the query it was written to narrow. It now throws on that input.
     */
    toWhere(opts: {
        where: TWhere;
    }): string;
    /** Compiles a `TWhere` into a Typesense `filter_by` expression or one of the two absorbing outcomes. Top-level keys conjoin. */
    compileWhere(opts: {
        where: TWhere;
        capabilities?: ISearchCompileCapabilities;
    }): TCompiledWhere;
    /** @see ISearchQueryDialect.canExpress */
    canExpress(opts: {
        operator: string;
    }): boolean;
    /** @see ISearchQueryDialect.conjoin */
    conjoin(opts: {
        clauses: TCompiledWhere[];
    }): TCompiledWhere;
    includeNotSupportedError(): Error;
    fieldNotFoundError(opts: {
        kind: 'where' | 'order';
        field: string;
    }): Error;
    private toOrderBy;
    /** A logical group always parenthesises, so precedence never depends on where the group sat in the tree. */
    private compileLogicalGroup;
    private compileFieldClause;
    private compileOperatorClause;
    private escapeValue;
    private escapeArray;
    /** Shared by `between` and `notBetween` so the two cannot disagree on what a valid range is. */
    private assertBetweenTuple;
    private escapeBetween;
}

/** The non-raw search inputs the dialect translates; `raw` bypasses the dialect entirely. */
type TTranslatableSearchInput = Exclude<TSearchInput, {
    mode: typeof SearchModes.RAW;
}>;
```

Source: `packages/connectors/src/search/typesense/repositories/dialect/query-dialect.ts`

## `VectorDistances`

*class*

Distance metrics a `vector` field may declare. An engine that supports fewer rejects the rest in its compiler.

```ts
export declare class VectorDistances {
    static readonly COSINE = "cosine";
    static readonly INNER_PRODUCT = "ip";
    static readonly L2 = "l2";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TVectorDistance;
}
```

Source: `packages/connectors/src/search/core/models/common/constants.ts`
