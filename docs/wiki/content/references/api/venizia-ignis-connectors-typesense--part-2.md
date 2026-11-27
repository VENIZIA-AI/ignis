---
title: "@venizia/ignis-connectors/typesense (2 of 3)"
description: "Every export of @venizia/ignis-connectors/typesense, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/typesense (2 of 3)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 2 of 3 of [`@venizia/ignis-connectors/typesense`](/references/api/venizia-ignis-connectors-typesense).

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
    updateBy(opts: {
        data: Partial<TDocument>;
        where: TWhere;
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
    /** Count-only like updateBy: filter-delete when there is an effective where, truncating the whole collection only when neither where nor settings.query.filter is present - truncate reports no per-document count, so that path returns { count: 0, data: null }. */
    deleteBy(opts: {
        where: TWhere;
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
    /** Resolves filterBy, AND-merging defaultWhere unless shouldSkipDefaultFilter. Returns undefined when there's no effective where - callers decide (updateBy refuses; deleteBy truncates). */
    protected buildFilterBy(opts: {
        where?: TWhere;
        shouldSkipDefaultFilter?: boolean;
    }): string | undefined;
    /**
     * The write-path filter as THREE outcomes, because two of them are catastrophically different
     * here: `filterBy: undefined` means "no effective where", which `deleteBy` treats as licence to
     * truncate when `force` is set. An absorbing where must never land there -
     * `deleteBy({ where: { or: permittedIds.map(...) } })` on an EMPTY permission list has to
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
    /** @throws Error - disabled in a read-only repository. */
    updateBy(_opts: {
        data: Partial<TDocument>;
        where: TWhere;
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
    deleteBy(_opts: {
        where: TWhere;
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
export declare class SearchFieldTypes extends ConstClass {
    static readonly STRING = "string";
    static readonly NUMBER = "number";
    static readonly BOOLEAN = "boolean";
    static readonly GEOPOINT = "geopoint";
    static readonly STRING_ARRAY = "string[]";
    static readonly NUMBER_ARRAY = "number[]";
    static readonly BOOLEAN_ARRAY = "boolean[]";
    static readonly VECTOR = "vector";
    /** Full-text search matches text fields only (`string`, `string[]`): the rule `defaultQueryBy` and a route's `query.queryBy` share. */
    static isText(type: string): boolean;
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
export declare class SearchFilterOutcomes extends ConstClass {
    /** A real filter expression the engine should run. */
    static readonly FILTER = "filter";
    /** Vacuously true - impose no constraint. */
    static readonly MATCH_ALL = "matchAll";
    /** Absorbing false - can never match, so the engine must not be asked. */
    static readonly MATCH_NONE = "matchNone";
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
        where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
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
        where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
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
        where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
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
export declare class SearchModes extends ConstClass {
    static readonly KEYWORD = "keyword";
    static readonly SEMANTIC = "semantic";
    static readonly HYBRID = "hybrid";
    static readonly RAW = "raw";
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
export declare class SearchFilterOutcomes extends ConstClass {
    /** A real filter expression the engine should run. */
    static readonly FILTER = "filter";
    /** Vacuously true - impose no constraint. */
    static readonly MATCH_ALL = "matchAll";
    /** Absorbing false - can never match, so the engine must not be asked. */
    static readonly MATCH_NONE = "matchNone";
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
export type TTypesenseOperationMode = TConstValue<typeof TypesenseOperationModes>;
```

Source: `packages/connectors/src/search/typesense/repositories/common/types.ts`

## `TTypesenseTextMatchType`

*type*

How Typesense combines the scores of several matching fields: its `text_match_type` values.

```ts
export type TTypesenseTextMatchType = TConstValue<typeof TypesenseTextMatchTypes>;
```

Source: `packages/connectors/src/search/typesense/repositories/common/types.ts`

## `TVectorDistance`

*type*

Union of the `VectorDistances` values: `'cosine'`, `'ip'` or `'l2'`.

```ts
export type TVectorDistance = TConstValue<typeof VectorDistances>;
```

Source: `packages/connectors/src/search/core/models/common/constants.ts`
