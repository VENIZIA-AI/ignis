---
title: "@venizia/ignis-connectors/typesense/controllers (1 of 3)"
description: "Every export of @venizia/ignis-connectors/typesense/controllers, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/typesense/controllers (1 of 3)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 1 of 3 of [`@venizia/ignis-connectors/typesense/controllers`](/references/api/venizia-ignis-connectors-typesense-controllers).

## `AbstractSearchController`

*class*

Base tier of a generated search controller: the repository handle plus the search / multi-search verbs; SearchControllerFactory returns a thin subclass that only builds route configs and wires them.

```ts
export declare abstract class AbstractSearchController<TEntity extends AbstractEntity<TAnyObjectSchema> = AbstractEntity<TAnyObjectSchema>, RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ConfigurableOptions extends object = {}, TDataObject extends object = TEntityDataObject<TEntity>, TExtra extends object = {}, Inject extends TInjectMap = {}> extends BaseRestController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions> {
    repository: ReadableSearchRepository<TDataObject>;
    searchScope?: TSearchScopeResolver<RouteEnv, TExtra, Inject>;
    /** The `engineParams` names a caller may send, normalised (see {@link SearchEngineParams}). Empty: any `engineParams` is refused. */
    allowedEngineParams: ReadonlySet<string>;
    /** The friendly modes the controller serves (`modes.allow`). */
    allowedModes: ReadonlyArray<TSearchFriendlyMode>;
    /** Whether the controller serves `mode: 'raw'` and multi-search over HTTP (`modes.raw`). Closed by default: see {@link SearchRawAccess}. */
    isRawAllowed: boolean;
    /** `request.body.extend` was given: its keys are the scope's to read, and they do not go on to the repository. */
    isBodyExtended: boolean;
    /** The `query` option, resolved: the server's settings for a query. */
    querySettings?: ISearchResolvedQuery<RouteEnv, TExtra, Inject>;
    /** The `response` option when it is on. */
    responseTransform?: ISearchLooseResponse<RouteEnv, Inject>;
    /** The instances of the classes `inject` declares, by name: what every function source receives as `injected`. */
    injected: TInjected<Inject>;
    constructor(opts: {
        scope: string;
        isStrict?: boolean;
        repository: ReadableSearchRepository<TDataObject>;
        definitions: Record<string, IAuthRouteConfig>;
        /** Per-request search scope; see {@link TSearchScopeResolver}. */
        searchScope?: TSearchScopeResolver<RouteEnv, TExtra, Inject>;
        /** Names from `query.allow.tuning`, as `SearchEngineParams.resolveAllowlist` answers them. */
        allowedEngineParams?: ReadonlySet<string>;
        /** `modes.allow`, as `SearchModeAllowlist.resolve` answers it. */
        allowedModes?: ReadonlyArray<TSearchFriendlyMode>;
        /** `modes.raw`, as `SearchRawAccess.resolve` answers it. */
        isRawAllowed?: boolean;
        /** `request.body.extend` was given. */
        isBodyExtended?: boolean;
        /** The `query` option, as `SearchControllerOptionsUtility.resolve` answers it. */
        querySettings?: ISearchResolvedQuery<RouteEnv, TExtra, Inject>;
        /** The `response` option when it is on. */
        responseTransform?: ISearchLooseResponse<RouteEnv, Inject>;
        /** The instances of the classes `inject` declares, by name: `Injection.collect` answers them. Left out, none are declared. */
        injected?: TInjected<Inject>;
    });
    /** POST /search - single-collection keyword/semantic/hybrid/raw search. Carries the list headers of every IGNIS list endpoint; the body keeps `{ found, isFoundExact, hits }` because `isFoundExact` has no place in a `{ count, data }` envelope, and it is the only carrier of "found is an estimate". */
    search(opts: {
        context: TRouteContext<RouteEnv>;
    }): Promise<import("@venizia/ignis-kernel").TJsonResponse<unknown, 200>>;
    /** POST /multi-search - cross-collection search, forwarded verbatim to the engine. */
    multiSearch(opts: {
        context: TRouteContext<RouteEnv>;
    }): Promise<import("@venizia/ignis-kernel").TJsonResponse<unknown, 200>>;
}
```

Source: `packages/connectors/src/search/core/controllers/abstract.ts`

## `ISearchControllerOptions`

*interface*

Configuration options for creating a search controller via SearchControllerFactory.build.

```ts
export interface ISearchControllerOptions<Repository extends TCrudRepositoryClass = TCrudRepositoryClass, Shape extends z.ZodRawShape = {}, TOutDocument extends object = TRepositoryDataObject<InstanceType<Repository>>, Inject extends TInjectMap = {}, RouteEnv extends Env = Env> {
    /** The repository class; its name is the binding the container injects, and its `@repository({ model })` supplies the entity whose SELECT schema drives the `hits[].document` shape in the response. */
    repository: Repository;
    /** When true, /search and /search/ are different routes. @default true */
    isStrict?: boolean;
    /**
     * The classes the function sources below need, by name: `inject: { products: ProductRepository }`. The container resolves
     * them once, with the controller, so a class that is not registered fails the boot and not a request. Every function
     * source (`scope`, `query.fixed`, `query.default`, `query.normalize`, `response.transform`) receives the instances as
     * `injected`, typed from this map: `({ hits, injected }) => injected.products.find(...)`. Classes only. A subclass that
     * declares its own constructor must pass every argument on to `super`.
     */
    inject?: Inject;
    /**
     * Authentication of both generated routes. Required: `{ strategies: [Authentication.STRATEGY_JWT] }` admits
     * a JWT caller only, and opening the routes means writing `{ skip: true }`. A config with no strategy and no `skip`
     * is refused when the controller is built, so a route is never open by omission.
     */
    authenticate: TRouteAuthenticateConfig;
    /** Authorization config applied to both generated routes. `authenticate: { skip: true }` drops it, as it does for any route. */
    authorize?: IAuthorizationSpec | IAuthorizationSpec[];
    /** The routes to generate: `{ search: { use: true } }`. A route left out, or `{ use: false }`, is not served. */
    routes: ISearchRoutes;
    /**
     * A function of the request context returning the filter this caller may search within. It is
     * ANDed into `input.filter.where` on the server: the client's own `where` can narrow it, never
     * widen or remove it. Fails closed - a scope that is null, undefined or throws refuses the
     * request with 403. Return `ScopeFilters.UNRESTRICTED` to apply none for a trusted caller.
     *
     * `raw` mode hands the engine its own wire parameters, and a multi-search entry carries a raw
     * `filterBy`; neither can take a scope, so a scoped controller refuses `raw` (400) and must disable the
     * multi-search route (leave `routes.multiSearch` out), which `SearchControllerFactory.build` requires.
     * `engineParams` is refused on every controller unless `query.allow.tuning` lists it.
     */
    scope?: TSearchScopeResolver<RouteEnv, TSearchExtra<Shape>, Inject>;
    /**
     * Adds keys to the body of `POST /search`, on every `mode`: `request.body.extend` is a Zod shape, and each key is
     * validated with the rest of the body (a bad value is a 400) and shown in the OpenAPI document. The validated body,
     * typed from the shape, reaches `scope` as `input`, so a facet the engine does not know can still narrow the scope
     * (an `ids` list that must all match, say). The extra keys are not search fields: nothing else reads them.
     * A key the base body already has is refused when the controller is built.
     */
    request?: {
        body?: {
            extend: Shape;
        };
    };
    /**
     * What the server decides for a query (`fixed` wins over the client, `default` fills in what the client left out) and
     * which tuning knobs a client may send (`allow.tuning`). Typed against the model's fields and the datasource's engine.
     * A field the model hides, or a `queryBy` field that is not text, is refused when the controller is built, or with 500
     * when a function source returns it. `fixed` and `default` cannot be combined with `modes.raw` or `routes.multiSearch`:
     * both hand the engine their own parameters.
     */
    query?: ISearchQueryOptions<TRepositoryDataObject<InstanceType<Repository>>, TRepositoryTuning<Repository>, TSearchExtra<Shape>, Inject, RouteEnv>;
    /** Reshapes the hits of `POST /search` before they leave the route: `{ use: true, document, transform }`. */
    response?: TToggle<ISearchResponseTransform<TRepositoryDataObject<InstanceType<Repository>>, TOutDocument, Inject, RouteEnv>>;
    /**
     * `modes.raw: { use: true }` serves `mode: 'raw'` and multi-search over HTTP; left out, both answer 400, because they
     * bypass the model's default filter and hidden fields. A scoped controller cannot opt in.
     *
     * `modes.allow` names the other modes `POST /search` takes (left out: all three). The body schema and the OpenAPI
     * document are built from it; an empty list or a duplicate refuses the build.
     */
    modes?: {
        allow?: ReadonlyArray<TSearchFriendlyMode>;
        raw?: TToggle;
    };
}
```

Source: `packages/connectors/src/search/core/controllers/factory.ts`

## `ISearchFieldCatalog`

*interface*

What the model says about its fields, read once when the controller is built.

```ts
export interface ISearchFieldCatalog {
    /** Field name to field type. */
    fields: ReadonlyMap<string, string>;
    hidden: ReadonlySet<string>;
    /** The model's own `defaultQueryBy`: the names a keyed setting aligns to when no `queryBy` is set. */
    defaultQueryBy: readonly string[];
}
```

Source: `packages/connectors/src/search/core/controllers/settings.ts`

## `ISearchLooseResponse`

*interface*

`response` when it is on, with the document type erased: what the controller runs, whatever the model.

```ts
export interface ISearchLooseResponse<RouteEnv extends Env = Env, Inject extends TInjectMap = {}> {
    document: z.ZodType;
    transform: (opts: {
        hits: Array<TSearchHit<object>>;
        found: number;
        context: TRouteContext<RouteEnv>;
        input: Exclude<TSearchInput, {
            mode: 'raw';
        }>;
        injected: TInjected<Inject>;
    }) => ValueOrPromise<Array<TSearchLooseHit>>;
}
```

Source: `packages/connectors/src/search/core/controllers/response.ts`

## `ISearchLooseSettings`

*interface*

`ISearchQuerySettings` with its names as plain strings: what the build-time and per-request checks read, whatever the document.

```ts
export interface ISearchLooseSettings {
    queryBy?: string[];
    queryByWeights?: Record<string, number | undefined>;
    order?: string[];
    tuning?: Record<string, unknown>;
}
```

Source: `packages/connectors/src/search/core/controllers/settings.ts`

## `ISearchOptionsInput`

*interface*

The options of `SearchControllerFactory.build`, with the types that depend on the model and the engine left open: what `resolve` reads and checks at runtime.

```ts
export interface ISearchOptionsInput {
    authenticate?: TRouteAuthenticateConfig;
    authorize?: IAuthorizationSpec | IAuthorizationSpec[];
    routes: {
        search?: TToggle<ISearchRouteOptions>;
        multiSearch?: TToggle<ISearchRouteOptions>;
    };
    modes?: {
        raw?: TToggle;
        allow?: unknown;
    };
    query?: {
        fixed?: unknown;
        default?: unknown;
        normalize?: unknown;
        allow?: {
            tuning?: unknown;
        };
    };
    /** `inject`: the classes the function sources receive as `injected`. */
    inject?: unknown;
    response?: {
        use: boolean;
        document?: unknown;
        transform?: unknown;
    };
    hasScope: boolean;
}
```

Source: `packages/connectors/src/search/core/controllers/options.ts`

## `ISearchQueryOptions`

*interface*

The `query` option: what the server decides for a query, and what a client may still send.

```ts
export interface ISearchQueryOptions<Document extends object, Tuning extends object, TExtra extends object = {}, Inject extends TInjectMap = {}, RouteEnv extends Env = Env> {
    /** Wins over the client. A client value for a fixed setting is refused (400). */
    fixed?: TSearchSettingsSource<Document, Tuning, RouteEnv, TExtra, Inject>;
    /** Used when the client sent nothing for that setting; above the model's `defaultQueryBy`. */
    default?: TSearchSettingsSource<Document, Tuning, RouteEnv, TExtra, Inject>;
    /**
     * Rewrites the query text before anything else reads it: `query` of a keyword or hybrid request, `queryText` of a
     * semantic one. It runs after the scope and before `fixed` and `default`, so a function source reads the text it
     * returns. It is not called for a request that carries no text, and the engine still turns an empty string into `*`.
     * A throw, or a result that is not a string, answers 500.
     */
    normalize?: (opts: {
        text: string;
        context: TRouteContext<RouteEnv>;
        input: Exclude<TSearchInput, {
            mode: 'raw';
        }> & TExtra;
        injected: TInjected<Inject>;
    }) => ValueOrPromise<string>;
    /** What a client may send. `tuning` names the knobs a request's `engineParams` may carry; a name is fixed or allowed, never both. */
    allow?: {
        tuning?: [Tuning] extends [never] ? never[] : Array<Exclude<keyof Tuning & string, 'sortBy'>>;
    };
}
```

Source: `packages/connectors/src/search/core/controllers/types.ts`

## `ISearchQuerySettings`

*interface*

What the application chooses for a query. Every name is camelCase and typed against the document.

```ts
export interface ISearchQuerySettings<Document extends object, Tuning extends object> {
    /** The text fields searched, in order. Keyword and hybrid only: semantic search has none. */
    queryBy?: Array<TSearchField<Document>>;
    /** The weight of each `queryBy` field, by name: the controller writes the positional list the engine wants. Name every `queryBy` field. */
    queryByWeights?: Partial<Record<TSearchField<Document>, number>>;
    /** Typed order entries (`'price'`, `'price DESC'`). Give it instead of a `tuning.sortBy`, never with it. */
    order?: Array<TOrderEntry<Document>>;
    /** The engine's typed tuning knobs. Absent for a datasource that binds none. */
    tuning?: [Tuning] extends [never] ? never : TSearchTuningInput<Document, Tuning>;
}
```

Source: `packages/connectors/src/search/core/controllers/types.ts`

## `ISearchResolvedOptions`

*interface*

What the controller needs from its options, after every default and every cross-check.

```ts
export interface ISearchResolvedOptions<RouteEnv extends Env = Env, TExtra extends object = {}, Inject extends TInjectMap = {}> {
    authenticate: {
        strategies?: TAuthStrategy[];
        mode?: TAuthMode;
    };
    /** `authenticate: { skip: true }` drops it, as for any route: with no caller, no authorization applies. */
    authorize?: IAuthorizationSpec | IAuthorizationSpec[];
    isRawAllowed: boolean;
    /** The friendly modes the body schema takes (`modes.allow`; every one when left out). */
    allowedModes: ReadonlyArray<TSearchFriendlyMode>;
    allowedEngineParams: ReadonlySet<string>;
    isSearchOn: boolean;
    isMultiSearchOn: boolean;
    /** The `request.headers` of each route that is on and names some. */
    requestHeaders: {
        search?: TAnyObjectSchema;
        multiSearch?: TAnyObjectSchema;
    };
    query?: ISearchResolvedQuery<RouteEnv, TExtra, Inject>;
    response?: ISearchLooseResponse<RouteEnv, Inject>;
}
```

Source: `packages/connectors/src/search/core/controllers/options.ts`

## `ISearchResolvedQuery`

*interface*

The `query` option as the controller keeps it.

```ts
export interface ISearchResolvedQuery<RouteEnv extends Env = Env, TExtra extends object = {}, Inject extends TInjectMap = {}> {
    fixed?: TSearchLooseSource<RouteEnv, TExtra, Inject>;
    default?: TSearchLooseSource<RouteEnv, TExtra, Inject>;
    normalize?: TSearchLooseNormalize<RouteEnv, TExtra, Inject>;
    /** The names of `query.allow.tuning`. */
    allowedTuning: ReadonlySet<string>;
    catalog: ISearchFieldCatalog;
}
```

Source: `packages/connectors/src/search/core/controllers/settings.ts`

## `ISearchResponseTransform`

*interface*

The `response` option when it is on: reshapes the hits before they leave the route.

```ts
export interface ISearchResponseTransform<Document extends object, TOutDocument extends object, Inject extends TInjectMap = {}, RouteEnv extends Env = Env> {
    /** The documents of the response: it replaces the model's schema in the OpenAPI document, and every transformed document is parsed against it (a mismatch answers 500). */
    document: z.ZodType<TOutDocument>;
    /** May drop hits. `found` stays the engine's count. Never runs for `raw` mode. */
    transform: (opts: {
        hits: Array<TSearchHit<Document>>;
        found: number;
        context: TRouteContext<RouteEnv>;
        input: Exclude<TSearchInput, {
            mode: 'raw';
        }>;
        /** The instances of the classes `inject` declares: reread rows from another repository, say. */
        injected: TInjected<Inject>;
    }) => ValueOrPromise<Array<TSearchHit<TOutDocument>>>;
}
```

Source: `packages/connectors/src/search/core/controllers/types.ts`

## `ISearchRouteOptions`

*interface*

What a search route takes beside `use`: the request headers its OpenAPI document shows, the same `request.headers` a CRUD route takes.

```ts
export interface ISearchRouteOptions {
    request?: Pick<NonNullable<TCustomizableRouteConfig['request']>, 'headers'>;
}
```

Source: `packages/connectors/src/search/core/controllers/factory.ts`

## `ISearchRoutes`

*interface*

The routes of a search controller: a route that is not `{ use: true }` does not exist.

```ts
export interface ISearchRoutes {
    search?: TToggle<ISearchRouteOptions>;
    multiSearch?: TToggle<ISearchRouteOptions>;
}
```

Source: `packages/connectors/src/search/core/controllers/factory.ts`

## `ISearchSourceOptions`

*interface*

What a function source is called with, whatever the document: the same context, scoped input and injected instances the typed options declare.

```ts
export interface ISearchSourceOptions<RouteEnv extends Env, TExtra extends object, Inject extends TInjectMap> {
    context: TRouteContext<RouteEnv>;
    input: TNonRawInput & TExtra;
    injected: TInjected<Inject>;
}

type TNonRawInput = Exclude<TSearchInput, {
    mode: typeof SearchModes.RAW;
}>;
```

Source: `packages/connectors/src/search/core/controllers/settings.ts`
