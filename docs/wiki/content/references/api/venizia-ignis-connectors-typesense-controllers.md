---
title: "@venizia/ignis-connectors/typesense/controllers"
description: "Every export of @venizia/ignis-connectors/typesense/controllers, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/typesense/controllers`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

31 exports, 31 with TSDoc.

## `AbstractSearchController`

*class*

Base tier of a generated search controller: the repository handle plus the search / multi-search verbs; SearchControllerFactory returns a thin subclass that only builds route configs and wires them.

```ts
export declare abstract class AbstractSearchController<TEntity extends AbstractEntity<TAnyObjectSchema> = AbstractEntity<TAnyObjectSchema>, RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ConfigurableOptions extends object = {}, TDataObject extends object = TEntityDataObject<TEntity>, TExtra extends object = {}, Inject extends TInjectMap = {}> extends BaseRestController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions> {
    repository: ReadableSearchRepository<TDataObject>;
    searchScope?: TSearchScopeResolver<RouteEnv, TExtra, Inject>;
    /** The `engineParams` names a caller may send, normalised (see {@link SearchEngineParams}). Empty: any `engineParams` is refused. */
    allowedEngineParams: ReadonlySet<string>;
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
     * `modes.raw: { use: true }` serves `mode: 'raw'` and multi-search over HTTP. Left out, both answer 400: they hand the
     * engine their parameters as they are, so the model's default filter and its hidden fields do not apply to them, and
     * opting in exposes the whole collection to every caller the route admits. A scoped controller cannot opt in. Server
     * code keeps `search({ mode: 'raw' })` and `multiSearch()` on the repository.
     */
    modes?: {
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

## `SearchControllerFactory`

*class*

Factory for generating turnkey search controllers (single-collection + cross-collection) from entity definitions.

```ts
export declare class SearchControllerFactory extends BaseHelper {
    constructor();
    /**
     * `SearchInputSchema` with `shape` added to each of its four modes (a discriminated union has no `extend` of its own), and
     * with `engineParams` of the three friendly modes narrowed to the names of `query.allow.tuning`: a strict object, so an
     * unknown name is a 400 and the OpenAPI document lists the names a client may send.
     */
    private static extendSearchBody;
    static defineRouteConfigs(opts: {
        selectSchema: z.ZodType;
        authenticate?: {
            strategies?: TAuthStrategy[];
            mode?: TAuthMode;
        };
        authorize?: IAuthorizationSpec | IAuthorizationSpec[];
        /** The keys `request.body.extend` adds to every `mode` of the search body; none leaves `SearchInputSchema` as it is. */
        bodyExtension?: z.ZodRawShape;
        /** The names of `query.allow.tuning`: what `engineParams` of the search body may carry. */
        allowedTuning?: string[];
        /** `query.fixed` or `query.default` is set: a hybrid body then takes its `queryBy` from the server when the client sends none. */
        isQueryBySettable?: boolean;
        /** The `request.headers` of `routes.search` and `routes.multiSearch`; none leaves the route config without headers. */
        requestHeaders?: {
            search?: TAnyObjectSchema;
            multiSearch?: TAnyObjectSchema;
        };
        /** `response.document`: the documents of the response, in place of the model's schema. */
        responseDocument?: z.ZodType;
    }): {
        readonly SEARCH: {
            readonly method: "post";
            readonly path: "/search";
            readonly description: "Single-collection search (keyword, semantic, hybrid, or raw passthrough)";
            readonly authenticate: {
                strategies?: TAuthStrategy[];
                mode?: TAuthMode;
            };
            readonly authorize: IAuthorizationSpec<Env, string, string> | IAuthorizationSpec<Env, string, string>[] | undefined;
            readonly request: {
                readonly body: {
                    description: string;
                    content: {
                        'application/json': {
                            schema: z.ZodDiscriminatedUnion<[z.ZodObject<{
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
                            }, z.core.$strip>], "mode"> | z.ZodDiscriminatedUnion<[z.ZodObject<{
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
                                engineParams: z.ZodOptional<z.ZodObject<{
                                    [x: string]: z.ZodOptional<z.ZodUnknown>;
                                }, z.core.$strict>>;
                            } | {
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
                                engineParams?: undefined;
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
                                engineParams: z.ZodOptional<z.ZodObject<{
                                    [x: string]: z.ZodOptional<z.ZodUnknown>;
                                }, z.core.$strict>>;
                            } | {
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
                                engineParams?: undefined;
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
                                mode: z.ZodLiteral<"hybrid">;
                                query: z.ZodString;
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
                                queryBy?: z.ZodOptional<z.ZodArray<z.ZodString>> | undefined;
                                engineParams: z.ZodOptional<z.ZodObject<{
                                    [x: string]: z.ZodOptional<z.ZodUnknown>;
                                }, z.core.$strict>>;
                            } | {
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
                                mode: z.ZodLiteral<"hybrid">;
                                query: z.ZodString;
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
                                queryBy?: z.ZodOptional<z.ZodArray<z.ZodString>> | undefined;
                                engineParams?: undefined;
                            }, z.core.$strip>, z.ZodObject<{
                                [x: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                            }, z.core.$strip>], "mode">;
                        };
                    };
                    required: boolean | undefined;
                };
                readonly headers?: TAnyObjectSchema | undefined;
            };
            readonly responses: {
                '4XX': {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodObject<{
                                statusCode: z.ZodOptional<z.ZodNumber>;
                                message: z.ZodString;
                                normalized: z.ZodOptional<z.ZodObject<{
                                    text: z.ZodString;
                                    code: z.ZodString;
                                    args: z.ZodRecord<z.ZodString, z.ZodAny>;
                                }, z.core.$strip>>;
                                extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                                requestId: z.ZodOptional<z.ZodString>;
                                details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                };
                '5XX': {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodObject<{
                                statusCode: z.ZodOptional<z.ZodNumber>;
                                message: z.ZodString;
                                normalized: z.ZodOptional<z.ZodObject<{
                                    text: z.ZodString;
                                    code: z.ZodString;
                                    args: z.ZodRecord<z.ZodString, z.ZodAny>;
                                }, z.core.$strip>>;
                                extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                                requestId: z.ZodOptional<z.ZodString>;
                                details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                };
                200: {
                    description: string;
                    content: {
                        'application/json': {
                            schema: z.ZodObject<{
                                found: z.ZodNumber;
                                isFoundExact: z.ZodBoolean;
                                hits: z.ZodArray<z.ZodObject<{
                                    document: z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                                }, z.core.$strip>>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                } | {
                    headers: never;
                    description: string;
                    content: {
                        'application/json': {
                            schema: z.ZodObject<{
                                found: z.ZodNumber;
                                isFoundExact: z.ZodBoolean;
                                hits: z.ZodArray<z.ZodObject<{
                                    document: z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                                }, z.core.$strip>>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                };
            };
        };
        readonly MULTI_SEARCH: {
            readonly method: "post";
            readonly path: "/multi-search";
            readonly description: "Cross-collection search, forwarded verbatim to the search engine";
            readonly authenticate: {
                strategies?: TAuthStrategy[];
                mode?: TAuthMode;
            };
            readonly authorize: IAuthorizationSpec<Env, string, string> | IAuthorizationSpec<Env, string, string>[] | undefined;
            readonly request: {
                readonly body: {
                    description: string;
                    content: {
                        'application/json': {
                            schema: z.ZodObject<{
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
                        };
                    };
                    required: boolean | undefined;
                };
                readonly headers?: TAnyObjectSchema | undefined;
            };
            readonly responses: {
                '4XX': {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodObject<{
                                statusCode: z.ZodOptional<z.ZodNumber>;
                                message: z.ZodString;
                                normalized: z.ZodOptional<z.ZodObject<{
                                    text: z.ZodString;
                                    code: z.ZodString;
                                    args: z.ZodRecord<z.ZodString, z.ZodAny>;
                                }, z.core.$strip>>;
                                extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                                requestId: z.ZodOptional<z.ZodString>;
                                details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                };
                '5XX': {
                    description: string;
                    content: {
                        "application/json": {
                            schema: z.ZodObject<{
                                statusCode: z.ZodOptional<z.ZodNumber>;
                                message: z.ZodString;
                                normalized: z.ZodOptional<z.ZodObject<{
                                    text: z.ZodString;
                                    code: z.ZodString;
                                    args: z.ZodRecord<z.ZodString, z.ZodAny>;
                                }, z.core.$strip>>;
                                extra: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                                requestId: z.ZodOptional<z.ZodString>;
                                details: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodAny>>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                };
                200: {
                    description: string;
                    content: {
                        'application/json': {
                            schema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                        };
                    };
                    required: boolean | undefined;
                } | {
                    headers: never;
                    description: string;
                    content: {
                        'application/json': {
                            schema: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                        };
                    };
                    required: boolean | undefined;
                };
            };
        };
    };
    /** Creates a search controller with the routes you list: `POST /search` via `repository.search()`, and `POST /multi-search` via `repository.dataSource.multiSearch()`. The path is the `@controller({ path })` of the subclass. */
    static build<Repository extends TCrudRepositoryClass, RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ConfigurableOptions extends object = {}, TDataObject extends object = TRepositoryDataObject<InstanceType<Repository>>, Shape extends z.ZodRawShape = {}, TOutDocument extends object = TDataObject, Inject extends TInjectMap = {}>(opts: ISearchControllerOptions<Repository, Shape, TOutDocument, Inject, RouteEnv>): {
        new (repositoryInstance: ReadableSearchRepository<TDataObject>, ...instances: unknown[]): {
            /** The routes of a generated controller come from `routes`; a subclass adds its own here. */
            binding(): ValueOrPromise<void>;
            /** Registers each route that is on, after the subclass's `binding()`. */
            bindDefaultRoutes(): ValueOrPromise<void>;
            repository: ReadableSearchRepository<TDataObject, import("../index.js").AbstractSearchDataSource<{}>>;
            searchScope?: TSearchScopeResolver<RouteEnv, TSearchExtra<Shape>, Inject> | undefined;
            allowedEngineParams: ReadonlySet<string>;
            isRawAllowed: boolean;
            isBodyExtended: boolean;
            querySettings?: import("./settings.js").ISearchResolvedQuery<RouteEnv, TSearchExtra<Shape>, Inject> | undefined;
            responseTransform?: import("./response.js").ISearchLooseResponse<RouteEnv, Inject> | undefined;
            injected: import("@venizia/ignis-kernel").TInjected<Inject>;
            search(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<RouteEnv>;
            }): Promise<import("@venizia/ignis-kernel").TJsonResponse<unknown, 200>>;
            multiSearch(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<RouteEnv>;
            }): Promise<import("@venizia/ignis-kernel").TJsonResponse<unknown, 200>>;
            measure<R>(opts: {
                scope: string;
                args: unknown;
                task: () => Promise<R>;
            }): Promise<R>;
            normalizeCountData<ResponseSchema, RequestContext extends import("@venizia/ignis-kernel").TRouteContext<RouteEnv> = import("@venizia/ignis-kernel").TRouteContext<RouteEnv>, ResponseData extends {
                count: number;
                data?: import("@venizia/ignis-helpers").TNullable<ResponseSchema>;
            } = {
                count: number;
                data?: import("@venizia/ignis-helpers").TNullable<ResponseSchema>;
            }>(opts: {
                context: RequestContext;
                payload: ResponseData;
            }): ResponseData | import("@venizia/ignis-helpers").TNullable<ResponseSchema>;
            getRequestedExtras(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<RouteEnv>;
            }): Array<import("@venizia/ignis-kernel").IRequestedExtra>;
            respond<R>(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<RouteEnv>;
                format: import("@venizia/ignis-kernel").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-helpers").TNullable<R>;
                };
                range?: import("@venizia/ignis-kernel").TDataRange;
                extra?: never;
            }): R | {
                count: number;
                data?: import("@venizia/ignis-helpers").TNullable<R>;
            } | null | undefined;
            respond<R, Extra extends Record<string, import("@venizia/ignis-kernel").TResponseExtra>>(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<RouteEnv>;
                format: import("@venizia/ignis-kernel").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-helpers").TNullable<R>;
                };
                range?: import("@venizia/ignis-kernel").TDataRange;
                extra: Extra;
            }): Promise<R | {
                count: number;
                data?: import("@venizia/ignis-helpers").TNullable<R>;
            } | {
                count?: number;
// ... cut
```

Source: `packages/connectors/src/search/core/controllers/factory.ts`

## `SearchControllerOptionsUtility`

*class*

Reads every option of `SearchControllerFactory.build` in one place, applies its defaults and makes every cross-check. Throws `[scope] what | why`, so a bad definition never boots.

```ts
export declare class SearchControllerOptionsUtility {
    private static fail;
    /** What the model says about its fields: names and types, the hidden ones, and `defaultQueryBy`. */
    static readCatalog(opts: {
        scope: string;
        entityClass: TClass<AbstractEntity>;
    }): ISearchFieldCatalog;
    /** The `request.headers` schema of a route that is on, when it names one: it must be a Zod object schema. */
    private static readHeaders;
    /** `inject` names classes only: a key, an instance or an optional dependency is not declared here. */
    private static assertInject;
    /** `authenticate` is required: a route is open only by an explicit `{ skip: true }`. */
    private static resolveAuthenticate;
    /** One `query.fixed` or `query.default`: a function is kept for the request, a value is checked now. */
    private static resolveSource;
    static resolve<RouteEnv extends Env = Env, TExtra extends object = {}, Inject extends TInjectMap = {}>(opts: {
        scope: string;
        options: ISearchOptionsInput;
        entityClass: TClass<AbstractEntity>;
    }): ISearchResolvedOptions<RouteEnv, TExtra, Inject>;
}
```

Source: `packages/connectors/src/search/core/controllers/options.ts`

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

## `SearchRawAccess`

*class*

Whether a search controller serves the engine's own parameters over HTTP. `mode: 'raw'` and a multi-search entry hand
the engine their parameters as they are: the model's default filter and its hidden fields are not applied to them.
So every generated search controller refuses both (400) unless `modes.raw` is `{ use: true }`. Server code is not
affected: the repository's `search({ mode: 'raw' })` and `multiSearch()` work as before.

```ts
export declare class SearchRawAccess {
    /** Reads `modes.raw`: only `{ use: true }` opens it. A scoped controller cannot open it, and the definition throws. */
    static resolve(opts: {
        scope: string;
        raw?: unknown;
        isScoped: boolean;
    }): boolean;
    /** Refuses (400) a `raw` search body when the controller did not opt in. */
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
     * One entry of an engine sort string: the name before the first `(` or `:`, the arguments in parentheses (the body, scanned
     * for hidden names) and the direction. Backticks are dropped, since the engine quotes a name with them. `undefined` for an
     * entry that has none of this shape, which the caller refuses.
     */
    static readSortEntry(opts: {
        entry: string;
    }): {
        name: string;
        body: string;
    } | undefined;
    /** The top-level entries of an engine sort string: commas inside parentheses and brackets do not split. */
    static splitSortBy(opts: {
        value: string;
    }): string[];
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
}) => ValueOrPromise<TWhere | typeof ScopeFilters.UNRESTRICTED | null | undefined>;
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
