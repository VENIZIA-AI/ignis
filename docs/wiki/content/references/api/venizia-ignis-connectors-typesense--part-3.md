---
title: "@venizia/ignis-connectors/typesense (3 of 3)"
description: "Every export of @venizia/ignis-connectors/typesense, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/typesense (3 of 3)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 3 of 3 of [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense).

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
    /** The camelCase import options as Typesense's snake_case parameters; a number must be a positive integer and a flag a boolean, so a typo is refused here and not by the engine. The connector's own `action`, `batchSize`, `dirtyValues` and `throwOnFail` are not in this list: they stay single-source. */
    private toImportParams;
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
        /** Typesense-only (Meilisearch has no equivalent). For a collection embedded by a remote provider: the embedding batch, wait and tries of this import. See {@link ITypesenseRemoteEmbeddingOptions}. */
        remoteEmbedding?: ITypesenseRemoteEmbeddingOptions;
        /** Typesense-only. Each row of `responses` carries the document `id` (`return_id`). Memory grows with the import. */
        returnId?: boolean;
        /** Typesense-only. Each row of `responses` carries the stored `document` (`return_doc`): the whole import stays in memory as `responses`. */
        returnDoc?: boolean;
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
    readonly $inferTuning?: ITypesenseTuning;
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
export declare class TypesenseDirtyValues extends ConstClass {
    static readonly COERCE_OR_REJECT = "coerce_or_reject";
    static readonly COERCE_OR_DROP = "coerce_or_drop";
    static readonly DROP = "drop";
    static readonly REJECT = "reject";
}
```

Source: `packages/connectors/src/search/typesense/common/constants.ts`

## `TypesenseImportActions`

*class*

Values of the import `action` option; `create` is used when none is given.

```ts
export declare class TypesenseImportActions extends ConstClass {
    static readonly CREATE = "create";
    static readonly UPSERT = "upsert";
    static readonly UPDATE = "update";
    static readonly EMPLACE = "emplace";
}
```

Source: `packages/connectors/src/search/typesense/common/constants.ts`

## `TypesenseOperationModes`

*class*

The values of Typesense's `OperationMode`.

```ts
export declare class TypesenseOperationModes {
    static readonly OFF = "off";
    static readonly ALWAYS = "always";
    static readonly FALLBACK = "fallback";
}
```

Source: `packages/connectors/src/search/typesense/repositories/common/types.ts`

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
        clause: TRequestFilterClause;
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

## `TypesenseTextMatchTypes`

*class*

The values of Typesense's `text_match_type`.

```ts
export declare class TypesenseTextMatchTypes {
    static readonly MAX_SCORE = "max_score";
    static readonly MAX_WEIGHT = "max_weight";
    static readonly SUM_SCORE = "sum_score";
}
```

Source: `packages/connectors/src/search/typesense/repositories/common/types.ts`

## `VectorDistances`

*class*

Distance metrics a `vector` field may declare. An engine that supports fewer rejects the rest in its compiler.

```ts
export declare class VectorDistances extends ConstClass {
    static readonly COSINE = "cosine";
    static readonly INNER_PRODUCT = "ip";
    static readonly L2 = "l2";
}
```

Source: `packages/connectors/src/search/core/models/common/constants.ts`
