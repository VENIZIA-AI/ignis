---
title: "@venizia/ignis-connectors/typesense/controllers (3 of 3)"
description: "Every export of @venizia/ignis-connectors/typesense/controllers, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/typesense/controllers (3 of 3)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 3 of 3 of [`@venizia/ignis-connectors/typesense/controllers`](/references/api/venizia-ignis-connectors-typesense-controllers).

## `SearchEngineParams`

*class*

What a search request's `engineParams` may carry. `engineParams` hands the engine its own wire parameters, and some of
them choose the rows (`filter_by`), the fields (`include_fields`, `query_by`, `facet_by`, `highlight_fields`) or both
(a preset). Over the wire it is refused on every search controller, scoped or not, unless the controller names the
parameters a caller may send (`query.allow.tuning`). A parameter that selects rows or fields, or reorders them, can
never be named. Server code passes `engineParams` on the repository call as before.

```ts
export declare class SearchEngineParams {
    /** Two spellings of one parameter (`numTypos`, `num_typos`, `NumTypos`) are one name. */
    static isSameName(opts: {
        left: string;
        right: string;
    }): boolean;
    /** A parameter that selects rows, fields or order, in either spelling: no allowlist and no server tuning can hold it. */
    static isNeverAllowed(opts: {
        name: string;
    }): boolean;
    /**
     * Parameters no allowlist can hold, in the form `normalize` gives: they choose rows, fields or order, in either engine.
     * `preset` and `override_tags` / `pinned_hits` / `hidden_hits` change which rows come back, and `vector_query` /
     * `vector` / `hybrid` search by similarity, which reveals a field's content as surely as a filter does.
     */
    static readonly NEVER_ALLOWED: ReadonlySet<string>;
    /** The allowlist of a controller, validated: strings only, none that selects rows or fields. Throws at definition time, so a bad list never boots. */
    static resolveAllowlist(opts: {
        scope: string;
        allow?: unknown;
    }): ReadonlySet<string>;
    /** Refuses (400) an `engineParams` that carries a name the controller does not allow. With no allowlist, any `engineParams` is refused. */
    static assertAllowed(opts: {
        engineParams?: unknown;
        allowed: ReadonlySet<string>;
    }): void;
    /** The check for a single-collection search body. `raw` mode has no `engineParams`: it is the controller's own choice to serve it. */
    static assertSearchInput(opts: {
        input: TSearchInput;
        allowed: ReadonlySet<string>;
    }): void;
    /** The check for every entry of a multi-search body. */
    static assertMultiSearchInput(opts: {
        input: TMultiSearchInput;
        allowed: ReadonlySet<string>;
    }): void;
}
```

Source: `packages/connectors/src/search/core/controllers/engine-params.ts`

## `SearchModeAllowlist`

*class*

The modes `POST /search` accepts besides `raw`, from `modes.allow`.

```ts
export declare class SearchModeAllowlist {
    /** Left out, every friendly mode is served. */
    static readonly DEFAULTS: ReadonlyArray<TSearchFriendlyMode>;
    /** `allow` as the body schema takes it; an empty list, a duplicate or a name that is not a friendly mode throws. */
    static resolve(opts: {
        scope: string;
        allow: unknown;
    }): ReadonlyArray<TSearchFriendlyMode>;
    /** Refuses (400) a body whose mode is not allowed: the check the body schema makes, repeated for a caller that skips the validator. `raw` is `SearchRawAccess`'s. */
    static assertInput(opts: {
        input: TSearchInput;
        allowed: ReadonlyArray<TSearchFriendlyMode>;
    }): void;
}
```

Source: `packages/connectors/src/search/core/controllers/modes.ts`

## `SearchRawAccess`

*class*

`mode: 'raw'` and multi-search bypass the model's filter and hidden fields, so a search controller refuses both (400) unless `modes.raw` is `{ use: true }`.

```ts
export declare class SearchRawAccess {
    /** Reads `modes.raw`: only `{ use: true }` opens it. A scoped controller cannot open it, and the definition throws. */
    static resolve(opts: {
        scope: string;
        raw?: unknown;
        isScoped: boolean;
    }): boolean;
    /** Defence in depth: refuses (400) a `raw` search body when the controller did not opt in, even when the body schema was skipped (a subclass, a direct `search` call). */
    static assertSearchInput(opts: {
        input: TSearchInput;
        isAllowed: boolean;
    }): void;
    /** Refuses (400) a multi-search request when the controller did not opt in: its entries carry the engine's own parameters and name any collection. */
    static assertMultiSearch(opts: {
        isAllowed: boolean;
    }): void;
}
```

Source: `packages/connectors/src/search/core/controllers/raw-access.ts`

## `SearchResponseUtility`

*class*

Runs the `response` transform of a search controller.

```ts
export declare class SearchResponseUtility {
    /**
     * The trust boundary of `response`: the typed option erases the document type here. It holds a Zod schema to parse
     * with and a function to call, which `apply` checks again on what the function returns.
     */
    static isResponse<RouteEnv extends Env = Env, Inject extends TInjectMap = {}>(value: unknown): value is ISearchLooseResponse<RouteEnv, Inject>;
    /**
     * The transformed hits, each document parsed against `response.document`. The transform may drop hits. It is the
     * server's code, so a transform that throws, returns no list, or returns a document the schema refuses answers 500.
     */
    static apply<RouteEnv extends Env = Env, Inject extends TInjectMap = {}>(opts: {
        response: ISearchLooseResponse<RouteEnv, Inject>;
        hits: Array<TSearchHit<object>>;
        found: number;
        context: TRouteContext<RouteEnv>;
        input: Exclude<TSearchInput, {
            mode: 'raw';
        }>;
        injected: TInjected<Inject>;
    }): Promise<Array<TSearchLooseHit>>;
}
```

Source: `packages/connectors/src/search/core/controllers/response.ts`

## `SearchSettingsUtility`

*class*

Reads, checks and merges the `query` settings of a search controller.

```ts
export declare class SearchSettingsUtility {
    /**
     * The trust boundary of a function option (`query.fixed`, `query.default`, `query.normalize`): the typed options erase the
     * document and the engine here, and what the function returns is checked on every request.
     */
    static isFunctionOf<Fn extends (...args: never[]) => unknown>(value: unknown): value is Fn;
    /** `statusCode` is set for what a request carries and for what a function source returns; a definition error leaves it unset, as every build error does. */
    private static fail;
    /** The values of `record` for `names`, in that order; `undefined` when `names` is empty or one of them has no value. */
    private static toList;
    /** A keyed list knob (`{ title: 1, sku: 0 }`) becomes the positional list of `names`; any other value passes. */
    private static toKnob;
    /**
     * Checks one layer (`fixed` or `default`) against the model: only known settings; every field exists, is not hidden, and
     * `queryBy` holds text fields; weights and keyed knobs name exactly the layer's `queryBy`; `order` and `tuning.sortBy` are not both given.
     * A fixed tuning name that is also in `allow.tuning` is refused.
     */
    static assert(opts: {
        settings: unknown;
        scope: string;
        catalog: ISearchFieldCatalog;
        allowedTuning: ReadonlySet<string>;
        isFixed: boolean;
        statusCode?: number;
    }): ISearchLooseSettings;
    /** The sort names the engine defines itself: not fields of the model. */
    static readonly ENGINE_SORT_NAMES: ReadonlySet<string>;
    /**
     * Every run of characters in a sort string that can be part of a field name: quotes are dropped, and whitespace, brackets,
     * commas and the operators of an `_eval` split it. A name with a hyphen or a non-ASCII letter stays whole.
     */
    static sortTokens(opts: {
        value: string;
    }): string[];
    /** The top-level entries of an engine sort string: a comma inside brackets or a quoted string does not split. */
    static splitSortBy(opts: {
        value: string;
    }): string[];
    /** The name an entry starts with: the run before the first `(`, `:` or whitespace, without quotes. */
    static sortEntryName(opts: {
        entry: string;
    }): string;
    /** A source's settings for this request: a value as it is, a function called with `{ context, input }` and its result checked like a definition. A function that throws, or returns what is not a valid shape, answers 500: the value is the server's. */
    static resolveSource<RouteEnv extends Env = Env, TExtra extends object = {}, Inject extends TInjectMap = {}>(opts: {
        source?: TSearchLooseSource<RouteEnv, TExtra, Inject>;
        context: TRouteContext<RouteEnv>;
        input: TNonRawInput & TExtra;
        injected: TInjected<Inject>;
        query: ISearchResolvedQuery<RouteEnv, TExtra, Inject>;
        isFixed: boolean;
    }): Promise<ISearchLooseSettings>;
    /**
     * Layers the settings of one request: `fixed`, else what the client sent (a tuning name only when allowed), else `default`,
     * else the model's `defaultQueryBy`. A client value for a fixed setting is a 400. A keyed setting becomes the positional
     * list of the request's `queryBy`; one that does not name every field is a 400 when it is fixed and dropped when it is a default.
     * `serverTuning` is the part of `engineParams` the server chose.
     */
    static merge(opts: {
        input: TNonRawInput;
        fixed: ISearchLooseSettings;
        defaults: ISearchLooseSettings;
        catalog: ISearchFieldCatalog;
    }): {
        input: Record<string, unknown>;
        serverTuning: Record<string, unknown>;
        serverOrder?: string[];
    };
    /**
     * The input with the query text `query.normalize` returned: `query` of a keyword or hybrid request, `queryText` of a
     * semantic one. A request without text is left as it is. A throw, or a result that is not a string, answers 500: the
     * function is the server's.
     */
    static normalize<RouteEnv extends Env = Env, TExtra extends object = {}, Inject extends TInjectMap = {}>(opts: {
        query: ISearchResolvedQuery<RouteEnv, TExtra, Inject>;
        context: TRouteContext<RouteEnv>;
        input: TNonRawInput & TExtra;
        injected: TInjected<Inject>;
    }): Promise<TNonRawInput & TExtra>;
    /**
     * The input of a request with the controller's `query` settings applied. What the server chose is checked with the engine's
     * own converter before the repository runs, so a bad value (`numTypos: -1`) is the server's 500 and not the client's 400.
     * The result is parsed with `SearchInputSchema`, which also drops the keys `request.body.extend` added.
     */
    static apply<RouteEnv extends Env = Env, TExtra extends object = {}, Inject extends TInjectMap = {}>(opts: {
        query: ISearchResolvedQuery<RouteEnv, TExtra, Inject>;
        context: TRouteContext<RouteEnv>;
        input: TSearchInput & TExtra;
        injected: TInjected<Inject>;
        dialect: ISearchQueryDialect;
    }): Promise<TSearchInput>;
}

type TNonRawInput = Exclude<TSearchInput, {
    mode: typeof SearchModes.RAW;
}>;
```

Source: `packages/connectors/src/search/core/controllers/settings.ts`

## `TRepositoryTuning`

*type*

The tuning knobs of the engine a repository's datasource binds with `$inferTuning`; `never` for a datasource that binds none, which closes `query.tuning`.

```ts
export type TRepositoryTuning<Repository extends TCrudRepositoryClass> = InstanceType<Repository> extends {
    dataSource: {
        $inferTuning?: infer Tuning;
    };
} ? unknown extends Tuning ? never : Tuning extends object ? Tuning : never : never;
```

Source: `packages/connectors/src/search/core/controllers/types.ts`

## `TSearchExtra`

*type*

The keys `request.body.extend` adds to the body: none for an empty shape, so a function source's `input` is not intersected with an index signature.

```ts
export type TSearchExtra<Shape extends z.ZodRawShape> = {} extends Shape ? {} : z.infer<z.ZodObject<Shape>>;
```

Source: `packages/connectors/src/search/core/controllers/types.ts`

## `TSearchField`

*type*

A field name of the search document.

```ts
export type TSearchField<Document> = keyof Document & string;
```

Source: `packages/connectors/src/search/core/controllers/types.ts`

## `TSearchFriendlyMode`

*type*

A mode `modes.allow` can name: every mode but `raw`, which is its own toggle (`modes.raw`).

```ts
export type TSearchFriendlyMode = Exclude<TSearchMode, typeof SearchModes.RAW>;
```

Source: `packages/connectors/src/search/core/controllers/modes.ts`

## `TSearchHit`

*type*

One hit of a search response.

```ts
export type TSearchHit<Document extends object> = NonNullable<ISearchResult<Document>['hits']>[number];
```

Source: `packages/connectors/src/search/core/controllers/types.ts`

## `TSearchLooseFunction`

*type*

A function `query.fixed` or `query.default`: its result is checked on every request, so it is `unknown` here.

```ts
export type TSearchLooseFunction<RouteEnv extends Env = Env, TExtra extends object = {}, Inject extends TInjectMap = {}> = (opts: ISearchSourceOptions<RouteEnv, TExtra, Inject>) => ValueOrPromise<unknown>;
```

Source: `packages/connectors/src/search/core/controllers/settings.ts`

## `TSearchLooseHit`

*type*

A hit whose document is not typed yet: the transform's output is parsed against `response.document` before it is trusted.

```ts
export type TSearchLooseHit = Omit<TSearchHit<object>, 'document'> & {
    document: unknown;
};
```

Source: `packages/connectors/src/search/core/controllers/response.ts`

## `TSearchLooseNormalize`

*type*

A `query.normalize`, with the text its mode carries.

```ts
export type TSearchLooseNormalize<RouteEnv extends Env = Env, TExtra extends object = {}, Inject extends TInjectMap = {}> = (opts: ISearchSourceOptions<RouteEnv, TExtra, Inject> & {
    text: string;
}) => ValueOrPromise<unknown>;
```

Source: `packages/connectors/src/search/core/controllers/settings.ts`

## `TSearchLooseSource`

*type*

A `query.fixed` or `query.default` as the controller keeps it: checked settings, or a function checked per request.

```ts
export type TSearchLooseSource<RouteEnv extends Env = Env, TExtra extends object = {}, Inject extends TInjectMap = {}> = ISearchLooseSettings | TSearchLooseFunction<RouteEnv, TExtra, Inject>;
```

Source: `packages/connectors/src/search/core/controllers/settings.ts`

## `TSearchScopeResolver`

*type*

A per-request search scope: the filter the caller is allowed to search within (a merchant, a
sharing rule). Return a `where`, `ScopeFilters.UNRESTRICTED` to apply none for this call, or
null/undefined when the caller's scope is unknown - which refuses the request.

```ts
export type TSearchScopeResolver<RouteEnv extends Env = Env, TExtra extends object = {}, Inject extends TInjectMap = {}> = (opts: {
    context: TRouteContext<RouteEnv>;
    /** The validated request body: the search input, and the keys the controller's `request.body.extend` adds. */
    input: TSearchInput & TExtra;
    /** The instances of the classes `inject` declares. */
    injected: TInjected<Inject>;
}) => ValueOrPromise<TNullable<TWhere | typeof ScopeFilters.UNRESTRICTED>>;
```

Source: `packages/connectors/src/search/core/controllers/scope.ts`

## `TSearchSettingsSource`

*type*

A value, or a function of the request: its `input` is the validated, scoped, typed body, as `scope` reads it. TypeScript widens
a string literal a function returns inside a generic call: write `'off' as const`. Do not pass type arguments to `build`: they switch the inference off, and `injected` would be typed `{}`.

```ts
export type TSearchSettingsSource<Document extends object, Tuning extends object, RouteEnv extends Env = Env, TExtra extends object = {}, Inject extends TInjectMap = {}> = ISearchQuerySettings<Document, Tuning> | ((opts: {
    context: TRouteContext<RouteEnv>;
    input: Exclude<TSearchInput, {
        mode: 'raw';
    }> & TExtra;
    /** The instances of the classes `inject` declares. */
    injected: TInjected<Inject>;
}) => ValueOrPromise<ISearchQuerySettings<Document, Tuning>>);
```

Source: `packages/connectors/src/search/core/controllers/types.ts`

## `TSearchTuningInput`

*type*

`Tuning` for one query: a list-valued knob (`numTypos`, `infix`) is written as a record keyed by field name, so it cannot drift from `queryBy`.

```ts
export type TSearchTuningInput<Document, Tuning extends object> = {
    [Key in keyof Tuning]?: Tuning[Key] extends infer Value ? Value extends readonly (infer Item)[] ? Partial<Record<TSearchField<Document>, Item>> : Value : never;
};
```

Source: `packages/connectors/src/search/core/controllers/types.ts`
