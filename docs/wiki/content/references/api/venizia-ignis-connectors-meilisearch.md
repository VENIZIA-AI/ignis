---
title: "@venizia/ignis-connectors/meilisearch"
description: "Every export of @venizia/ignis-connectors/meilisearch, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/meilisearch`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

16 exports, 16 with TSDoc.

## `IMeilisearchClientLike`

*interface*

Narrow structural view of the Meilisearch client the connector needs, so a test fake can stand in for the real client.

```ts
export interface IMeilisearchClientLike {
    index(uid: string): IMeilisearchIndexApi;
    createIndex(uid: string, options?: unknown): Promise<IMeilisearchTask>;
    getIndex(uid: string): Promise<unknown>;
    getIndexes(params?: unknown): Promise<{
        results: unknown[];
    }>;
    deleteIndex(uid: string): Promise<IMeilisearchTask>;
    swapIndexes(pairs: Array<{
        indexes: string[];
    }>): Promise<IMeilisearchTask>;
    getTask(taskUid: number): Promise<IMeilisearchTask>;
    health(): Promise<{
        status: string;
    }>;
    multiSearch(params: unknown): Promise<unknown>;
}
```

Source: `packages/connectors/src/search/meilisearch/common/types.ts`

## `IMeilisearchConnectorOptions`

*interface*

Options of `MeilisearchConnector`.

```ts
export interface IMeilisearchConnectorOptions {
    name: string;
    host: string;
    apiKey?: string;
    /** Ceiling for awaiting a write task. The SDK's own `waitForTask` defaults to 5000 ms, far too short for a bulk import, so this connector never relies on that default.
     *
     * @default 300_000
     */
    taskTimeoutMs?: number;
    /**
     * Starting poll interval while awaiting a task; it doubles up to a 1 s ceiling.
     *
     * @default 50
     */
    taskIntervalMs?: number;
    scope?: string;
    identifier?: string;
    onInitialized?: (opts: {
        name: string;
    }) => void;
    onError?: (opts: {
        name: string;
        error: unknown;
    }) => void;
}
```

Source: `packages/connectors/src/search/meilisearch/common/types.ts`

## `IMeilisearchDataSourceSettings`

*interface*

Datasource `config` for Meilisearch; the fields are forwarded to `IMeilisearchConnectorOptions`.

```ts
export interface IMeilisearchDataSourceSettings {
    host: string;
    apiKey?: string;
    taskTimeoutMs?: number;
    taskIntervalMs?: number;
}
```

Source: `packages/connectors/src/search/meilisearch/common/types.ts`

## `IMeilisearchDocumentsPage`

*interface*

One page of `getDocuments` results with the total number of matching documents.

```ts
export interface IMeilisearchDocumentsPage {
    results: unknown[];
    total: number;
}
```

Source: `packages/connectors/src/search/meilisearch/common/types.ts`

## `IMeilisearchIndexApi`

*interface*

Narrow structural view of the client surface this connector needs - the real client and the in-test fake both satisfy it.

```ts
export interface IMeilisearchIndexApi {
    addDocuments(documents: unknown[], options?: unknown): Promise<IMeilisearchTask>;
    updateDocuments(documents: unknown[], options?: unknown): Promise<IMeilisearchTask>;
    getDocument(id: string, options?: unknown): Promise<unknown>;
    getDocuments(params: unknown): Promise<IMeilisearchDocumentsPage>;
    deleteDocument(id: string): Promise<IMeilisearchTask>;
    deleteDocuments(params: unknown): Promise<IMeilisearchTask>;
    deleteAllDocuments(): Promise<IMeilisearchTask>;
    search(query: string | null, params?: unknown): Promise<unknown>;
    updateSettings(settings: unknown): Promise<IMeilisearchTask>;
    getSettings(): Promise<Record<string, unknown>>;
    updateSynonyms(synonyms: Record<string, string[]>): Promise<IMeilisearchTask>;
    resetSynonyms(): Promise<IMeilisearchTask>;
}
```

Source: `packages/connectors/src/search/meilisearch/common/types.ts`

## `IMeilisearchIndexPlan`

*interface*

Meilisearch is schemaless: a collection compiles to an index uid plus settings, not a field schema; the DSL's `searchable`/`filterable` flags are load-bearing here (Typesense drops them).

```ts
export interface IMeilisearchIndexPlan {
    uid: string;
    primaryKey?: string;
    settings: Record<string, unknown>;
}
```

Source: `packages/connectors/src/search/meilisearch/compiler.ts`

## `IMeilisearchSearchQuery`

*interface*

Meilisearch-only search parameters. `MeilisearchQueryDialect` is the only writer.

```ts
export interface IMeilisearchSearchQuery extends ISearchQuery {
    /** `semanticRatio` 0..1: 0 = pure keyword, 1 = pure vector. `embedder` names an `embedders` entry. */
    hybrid?: {
        semanticRatio: number;
        embedder: string;
    };
    /** Caller-supplied query vector, used with a `userProvided` embedder or to bypass auto-embedding. */
    vector?: number[];
}
```

Source: `packages/connectors/src/search/meilisearch/repositories/common/types.ts`

## `IMeilisearchTask`

*interface*

A Meilisearch task as `getTask` and write calls return it; `status` is one of `MeilisearchTaskStatuses`.

```ts
export interface IMeilisearchTask {
    taskUid: number;
    status: string;
    error?: unknown;
    /** A finished task reports what it actually did, e.g. `deletedDocuments` on a documentDeletion. */
    details?: Record<string, unknown>;
}
```

Source: `packages/connectors/src/search/meilisearch/common/types.ts`

## `MEILISEARCH_DEFAULT_FETCH_PAGE_SIZE`

*const*

Page size used when walking `documents/fetch` for ids during an emulated update-by-filter.

```ts
export declare const MEILISEARCH_DEFAULT_FETCH_PAGE_SIZE = 1000;
```

Source: `packages/connectors/src/search/meilisearch/common/types.ts`

## `MEILISEARCH_DEFAULT_UPDATE_BATCH_SIZE`

*const*

Documents per merge-PUT batch. Bounded by the server's payload limit, not by a document count.

```ts
export declare const MEILISEARCH_DEFAULT_UPDATE_BATCH_SIZE = 1000;
```

Source: `packages/connectors/src/search/meilisearch/common/types.ts`

## `MeilisearchCollectionCompiler`

*class*

Compiles the engine-neutral collection DSL into a Meilisearch index plan. Meilisearch supports only cosine vector distance.

```ts
export declare class MeilisearchCollectionCompiler {
    /** Compiles the neutral collection DSL into a Meilisearch index plan. */
    static compile(opts: {
        definition: ISearchCollectionDefinition;
    }): IMeilisearchIndexPlan;
}
```

Source: `packages/connectors/src/search/meilisearch/compiler.ts`

## `MeilisearchConnector`

*class*

Meilisearch-backed search connector. Every write awaits its task, so `create()` resolves only once the document is retrievable.

```ts
export declare class MeilisearchConnector extends BaseSearchConnector {
    private readonly client;
    private readonly rawClient?;
    private readonly taskTimeoutMs;
    private readonly taskIntervalMs;
    private readonly primaryKeyByCollection;
    constructor(opts: IMeilisearchConnectorOptions & {
        client?: IMeilisearchClientLike;
    });
    /** The raw SDK client - the escape hatch for anything this connector does not model (fire-and-forget writes, federation, facet search). */
    getClient(): Meilisearch;
    protected isNotFoundError(opts: {
        error: unknown;
    }): boolean;
    readonly collection: ISearchCollectionScoped<IMeilisearchIndexPlan, unknown, never>;
    /** Meilisearch has no alias layer; a zero-downtime reindex swaps two index uids atomically. */
    readonly swap: ISearchSwapScoped;
    /** A flat per-index dictionary. There is no named, linkable synonym-set resource. */
    readonly synonyms: ISearchSynonymScoped;
    readonly document: ISearchDocumentScoped;
    /** Never throws - `BaseSearchConnector.ping()` reads `.ok` and returns it, so a probe failure has to resolve as `{ ok: false }` rather than surface as a 503. */
    getHealth(): Promise<{
        ok: boolean;
    }>;
    /** Writes are invisible until their task succeeds; polls manually against a caller-configured ceiling because the SDK's own `waitForTask` 5 s default is too short for bulk imports. */
    private waitForTask;
    /** Runs the write, awaits its task, and returns the FINISHED task so callers reading `details` (`deletedDocuments`) get the terminal record. */
    private awaitWrite;
    createCollection(opts: {
        schema: IMeilisearchIndexPlan;
    }): Promise<void>;
    /** Create-if-absent, then apply settings. Both steps await their task, so the index is queryable on return. */
    ensureCollection(opts: {
        schema: IMeilisearchIndexPlan;
    }): Promise<unknown>;
    getCollection(opts: {
        name: string;
    }): Promise<unknown>;
    listCollections(): Promise<unknown[]>;
    collectionExists(opts: {
        name: string;
    }): Promise<boolean>;
    /** Meilisearch is schemaless: there is no field schema to patch. Settings are applied by ensureCollection. */
    patchCollectionSchema(): Promise<void>;
    deleteCollection(opts: {
        name: string;
    }): Promise<boolean>;
    swapIndexes(opts: {
        pairs: Array<[string, string]>;
    }): Promise<void>;
    setSynonyms(opts: {
        collection: string;
        items: ISynonym[];
    }): Promise<void>;
    getSynonyms(opts: {
        collection: string;
    }): Promise<ISynonym[]>;
    resetSynonyms(opts: {
        collection: string;
    }): Promise<void>;
    getDocument<T extends object>(opts: {
        collection: string;
        id: string;
    }): Promise<T>;
    /** Exact and uncapped: `pagination.maxTotalHits` bounds the SEARCH route only, so `total` from `documents/fetch` never lies on large filtered sets. */
    countDocuments(opts: {
        collection: string;
        filterBy?: string;
    }): Promise<number>;
    /** Create-only per the neutral contract. `addDocuments` is add-or-REPLACE, so the id is checked first; that check is NOT atomic - concurrent creates can both pass it and the second write wins. Use `upsert` for last-write-wins. */
    createDocument<T extends object>(opts: {
        collection: string;
        document: T;
    }): Promise<T>;
    private documentExists;
    /** Add-or-replace by primary key. Awaits the task, so the document is retrievable when this resolves. */
    upsertDocument<T extends object>(opts: {
        collection: string;
        document: T;
    }): Promise<T>;
    /** Merge-update by primary key, preserving absent patch fields. The write returns only a task, so the merged document is read back - NOT atomic: a concurrent write between task success and read-back means the return is not necessarily what this call wrote. */
    updateDocument<T extends object>(opts: {
        collection: string;
        id: string;
        document: Partial<T>;
    }): Promise<T>;
    /** No native update-by-filter (`documents/edit` is experimental and buggy), so ids are paged out of the uncapped `documents/fetch` route and merged back in batches. NOT atomic: a concurrent write to a matched document may be overwritten. */
    updateByFilter<T extends object>(opts: {
        collection: string;
        document: Partial<T>;
        filterBy: string;
    }): Promise<{
        updatedCount: number;
    }>;
    /** Walks `documents/fetch` until exhausted. Not bounded by `pagination.maxTotalHits`. */
    private fetchAllDocuments;
    private collectMatchingIds;
    deleteDocument(opts: {
        collection: string;
        id: string;
    }): Promise<boolean>;
    /** Native delete-by-filter; count is read from the FINISHED task's `details.deletedDocuments` because a pre-count would be wrong under concurrent writes. */
    deleteByFilter(opts: {
        collection: string;
        filterBy: string;
    }): Promise<number>;
    deleteAllDocuments(opts: {
        collection: string;
    }): Promise<boolean>;
    /** Re-throws an import failure with partial progress attached. An error the framework already shaped (waitForTask's 504 task_timeout, its task-failed 503, a sanitized 4xx) keeps its statusCode/messageCode - re-wrapping would erase those semantics behind a generic 503, so progress is merged onto it instead. */
    private throwImportFailure;
    /** Batches through addDocuments, awaiting each task. Import is batch-atomic, so `count.fail` is always 0 - a batch lands whole or throws, and a thrown import carries `processedCount` in the error's `details` so callers can resume past the batches that already landed. */
    importDocuments<T extends object>(opts: {
        collection: string;
        documents: T[];
        batchSize?: number;
    }): Promise<IImportResult<unknown>>;
    /** Newline-delimited JSON, matching the Typesense connector's export contract. */
    exportDocuments(opts: {
        collection: string;
        filterBy?: string;
        includeFields?: string[];
    }): Promise<string>;
    search<TDocument extends object = object>(opts: {
        collection: string;
        params: unknown;
    }): Promise<ISearchResult<TDocument>>;
    /** Batched, non-federated: N queries in one round trip, N result sets back. `commonParams` are defaults - a per-query param always wins over them, so a query's own `q` is never clobbered. */
    multiSearch(opts: {
        searches: unknown[];
        union?: boolean;
        commonParams?: unknown;
        options?: unknown;
    }): Promise<unknown>;
    /** Meilisearch infers the primary key from the first document; the compiler pins it, and the index reports it. */
    private resolvePrimaryKey;
}
```

Source: `packages/connectors/src/search/meilisearch/connector.ts`

## `MeilisearchDataSource`

*class*

Meilisearch-backed search datasource: builds/injects a connector, compiles the neutral DSL, and provisions discovered collections.

```ts
export declare class MeilisearchDataSource extends BaseSearchDataSource<IMeilisearchDataSourceSettings, MeilisearchConnector> {
    /** Stateless dialect - shared across every MeilisearchDataSource instance. */
    private static readonly queryDialect;
    protected createConnector(): MeilisearchConnector;
    getClient(): Meilisearch;
    getQueryDialect(): ISearchQueryDialect;
    /** `union: false` is honest: Meilisearch merges results through its `federation` option, which this connector does not model, so `multiSearch` is batched-but-not-merged. */
    getCapabilities(): ISearchableDataSourceCapabilities;
    compileCollection(opts: {
        definition: ISearchCollectionDefinition;
    }): IMeilisearchIndexPlan;
    ensureCollection(opts: {
        definition: ISearchCollectionDefinition;
    }): Promise<void>;
}
```

Source: `packages/connectors/src/search/meilisearch/datasources/datasource.ts`

## `MeilisearchQueryDialect`

*class*

Translates repository-level TFilter/TWhere into Meilisearch search params - pure string building, no dependency on the `meilisearch` package. Untranslatable shapes throw rather than degrade.

```ts
export declare class MeilisearchQueryDialect extends BaseHelper implements ISearchQueryDialect {
    constructor();
    build(opts: {
        filter?: TFilter;
        hiddenFields?: string[];
        capabilities?: ISearchCompileCapabilities;
    }): IMeilisearchSearchQuery;
    /**
     * The include list sent to the engine. A caller's selection loses any hidden field it names (and falls back to the visible
     * fields when nothing else is left). With no selection, a model that hides fields asks for every declared field that is
     * visible, plus `id` (the primary key, declared or not). A model that hides nothing, or one whose fields are unknown, sends
     * the caller's selection as it is.
     */
    private toIncludedFields;
    /** Maps the neutral query onto Meilisearch wire params. Pagination always uses the exhaustive `page`/`hitsPerPage` mode (exact `totalHits`), never `offset`/`limit`; `engineParams` merges last, verbatim. */
    toWireParams(opts: {
        query: Partial<ISearchQuery>;
    }): Record<string, unknown>;
    /** Writes the mode dispatch and the hybrid/vector params onto `query`, and refuses any knob Meilisearch cannot honor. */
    applySearchInput(opts: {
        query: ISearchQuery;
        input: TTranslatableSearchInput;
    }): void;
    /**
     * returned `''` for it - indistinguishable from "no constraint", which is precisely how an empty
     * `or` came to widen the query it was written to narrow. It now throws on that input.
     */
    toWhere(opts: {
        where: TWhere;
    }): string;
    /** Compiles a `TWhere` into a Meilisearch filter expression or one of the two absorbing outcomes. Top-level keys conjoin. */
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
    private assertNoUnsupportedKnobs;
    private jsonPathError;
    includeNotSupportedError(): Error;
    fieldNotFoundError(opts: {
        kind: 'where' | 'order';
        field: string;
    }): Error;
    /** Each order field must be one the collection declares, as in a `where`: an undeclared one is refused before the engine. */
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

Source: `packages/connectors/src/search/meilisearch/repositories/dialect/query-dialect.ts`

## `MeilisearchTaskStatuses`

*class*

Meilisearch task lifecycle. Every write returns a task uid and is invisible to search until SUCCEEDED.

```ts
export declare class MeilisearchTaskStatuses {
    static readonly ENQUEUED = "enqueued";
    static readonly PROCESSING = "processing";
    static readonly SUCCEEDED = "succeeded";
    static readonly FAILED = "failed";
    static readonly CANCELED = "canceled";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TMeilisearchTaskStatus;
    static isTerminal(value: string): boolean;
}
```

Source: `packages/connectors/src/search/meilisearch/common/types.ts`

## `TMeilisearchTaskStatus`

*type*

Union of the `MeilisearchTaskStatuses` values.

```ts
export type TMeilisearchTaskStatus = TConstValue<typeof MeilisearchTaskStatuses>;
```

Source: `packages/connectors/src/search/meilisearch/common/types.ts`
