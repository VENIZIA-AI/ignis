---
title: "@venizia/ignis-connectors/typesense/controllers"
description: "Every export of @venizia/ignis-connectors/typesense/controllers, from the built declarations (generated)."
---

# `@venizia/ignis-connectors/typesense/controllers`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

7 exports, 7 with TSDoc.

## `AbstractSearchController`

*class*

Base tier of a generated search controller: the repository handle plus the search / multi-search verbs; SearchControllerFactory returns a thin subclass that only builds route configs and wires them.

```ts
export declare abstract class AbstractSearchController<TEntity extends AbstractEntity<TAnyObjectSchema> = AbstractEntity<TAnyObjectSchema>, RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ConfigurableOptions extends object = {}, TDataObject extends object = TEntityDataObject<TEntity>, TExtra extends object = {}> extends BaseRestController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions> {
    repository: ReadableSearchRepository<TDataObject>;
    searchScope?: TSearchScopeResolver<RouteEnv, TExtra>;
    /** The `engineParams` names a caller may send, normalised (see {@link SearchEngineParams}). Empty: any `engineParams` is refused. */
    allowedEngineParams: ReadonlySet<string>;
    /** Whether the controller serves `mode: 'raw'` and multi-search over HTTP (`modes.raw.allow`). Closed by default: see {@link SearchRawAccess}. */
    isRawAllowed: boolean;
    constructor(opts: {
        scope: string;
        isStrict?: boolean;
        repository: ReadableSearchRepository<TDataObject>;
        definitions: AnyType;
        /** Per-request search scope; see {@link TSearchScopeResolver}. */
        searchScope?: TSearchScopeResolver<RouteEnv, TExtra>;
        /** Names from `engineParams.allow`, as `SearchEngineParams.resolveAllowlist` answers them. */
        allowedEngineParams?: ReadonlySet<string>;
        /** `modes.raw.allow`, as `SearchRawAccess.resolve` answers it. */
        isRawAllowed?: boolean;
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
export interface ISearchControllerOptions<Repository extends TCrudRepositoryClass = TCrudRepositoryClass, Shape extends z.ZodRawShape = {}> {
    /** The repository class; its name is the binding the container injects, and its `@repository({ model })` supplies the entity whose SELECT schema drives the `hits[].document` shape in the response. */
    repository: Repository;
    /** When true, /search and /search/ are different routes. @default true */
    isStrict?: boolean;
    /** Authentication config applied to both generated routes. */
    authenticate?: {
        strategies?: TAuthStrategy[];
        mode?: TAuthMode;
    };
    /** Authorization config applied to both generated routes. */
    authorize?: IAuthorizationSpec | IAuthorizationSpec[];
    /** The routes to generate. */
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
     * `engineParams` is refused on every controller unless `engineParams.allow` lists it.
     */
    scope?: TSearchScopeResolver<Env, z.infer<z.ZodObject<Shape>>>;
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
     * Which engine parameters a caller may send in a request's `engineParams`. Unset or empty, a request that carries
     * `engineParams` is refused with 400, on a scoped and an unscoped controller alike: raw engine parameters can replace
     * the controller's own filter and name fields the model hides. A parameter that selects rows or fields, or orders
     * them (`filter_by`, `include_fields`, `query_by`, `facet_by`, `group_by`, `highlight_fields`, `sort_by`, a
     * `preset`, ...) can never be listed: the definition throws. Server code still passes `engineParams` on the
     * repository call.
     */
    engineParams?: {
        allow?: string[];
    };
    /**
     * `modes.raw.allow: true` serves `mode: 'raw'` and multi-search over HTTP. Left out, both answer 400: they hand the
     * engine their parameters as they are, so the model's default filter and its hidden fields do not apply to them, and
     * opting in exposes the whole collection to every caller the route admits. A scoped controller cannot opt in. Server
     * code keeps `search({ mode: 'raw' })` and `multiSearch()` on the repository.
     */
    modes?: {
        raw?: {
            allow?: boolean;
        };
    };
}
```

Source: `packages/connectors/src/search/core/controllers/factory.ts`

## `ISearchRoutes`

*interface*

The routes of a search controller: only a listed route exists.

```ts
export interface ISearchRoutes {
    search?: true;
    multiSearch?: true;
}
```

Source: `packages/connectors/src/search/core/controllers/factory.ts`

## `SearchControllerFactory`

*class*

Factory for generating turnkey search controllers (single-collection + cross-collection) from entity definitions.

```ts
export declare class SearchControllerFactory extends BaseHelper {
    constructor();
    /** `SearchInputSchema` with `shape` added to each of its four modes (a discriminated union has no `extend` of its own). */
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
                                [x: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                            }, z.core.$strip>, z.ZodObject<{
                                [x: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                            }, z.core.$strip>, z.ZodObject<{
                                [x: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                            }, z.core.$strip>, z.ZodObject<{
                                [x: string]: z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
                            }, z.core.$strip>], "mode">;
                        };
                    };
                    required: boolean | undefined;
                };
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
    static build<Repository extends TCrudRepositoryClass, RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ConfigurableOptions extends object = {}, TDataObject extends object = TRepositoryDataObject<InstanceType<Repository>>, Shape extends z.ZodRawShape = {}>(opts: ISearchControllerOptions<Repository, Shape>): {
        new (repositoryInstance: ReadableSearchRepository<TDataObject>): {
            /** The routes of a generated controller come from `routes`; a subclass adds its own here. */
            binding(): ValueOrPromise<void>;
            /** Registers each listed route, after the subclass's `binding()`. */
            bindDefaultRoutes(): ValueOrPromise<void>;
            repository: ReadableSearchRepository<TDataObject, import("../index.js").AbstractSearchDataSource<{}>>;
            searchScope?: TSearchScopeResolver<RouteEnv, z.core.$InferObjectOutput<Shape, {}>> | undefined;
            allowedEngineParams: ReadonlySet<string>;
            isRawAllowed: boolean;
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
            }): Promise<any>;
            normalizeCountData<ResponseSchema extends unknown, RequestContext extends import("@venizia/ignis-kernel").TRouteContext<RouteEnv> = import("@venizia/ignis-kernel").TRouteContext<RouteEnv>, ResponseData extends {
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
                data?: import("@venizia/ignis-helpers").TNullable<R>;
                extra: Partial<Record<keyof Extra, unknown>>;
            } | null | undefined>;
            respond<R>(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<RouteEnv>;
                format: import("@venizia/ignis-kernel").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-helpers").TNullable<R>;
                };
                range?: import("@venizia/ignis-kernel").TDataRange;
                extra?: Record<string, import("@venizia/ignis-kernel").TResponseExtra>;
            }): ValueOrPromise<R | {
                count?: number;
                data?: import("@venizia/ignis-helpers").TNullable<R>;
                extra?: Record<string, unknown>;
            } | null | undefined>;
            respondWithExtra<R>(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<RouteEnv>;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-helpers").TNullable<R>;
                };
                extra: Record<string, import("@venizia/ignis-kernel").TResponseExtra>;
            }): Promise<R | {
                count: number;
                data?: import("@venizia/ignis-helpers").TNullable<R>;
            } | {
                count: number;
                data: import("@venizia/ignis-helpers").TNullable<R>;
                extra: Record<string, unknown>;
            } | {
                data: import("@venizia/ignis-helpers").TNullable<R>;
                extra: Record<string, unknown>;
                count?: undefined;
            } | null | undefined>;
            setListHeaders(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<RouteEnv>;
                count: number;
            } & ({
                range: import("@venizia/ignis-kernel").TDataRange;
            } | {
                offset: number;
                total: number;
            })): void;
            toHonoHandler<ResponseType = unknown>(opts: {
                handler: import("@venizia/ignis-kernel").TRouteHandler<ResponseType, RouteEnv>;
            }): import("hono").Handler<RouteEnv, string, import("hono").Input, (Response | Promise<Response>) | (import("@hono/zod-openapi").RouteConfigToTypedResponse<import("@hono/zod-openapi").RouteConfig> | Promise<import("@hono/zod-openapi").RouteConfigToTypedResponse<import("@hono/zod-openapi").RouteConfig>>)>;
            bindRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): import("@venizia/ignis-kernel").IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
            defineRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig, ResponseType = unknown>(opts: {
                configs: RouteConfig;
                handler: import("@venizia/ignis-kernel").TRouteHandler<ResponseType, RouteEnv>;
                hook?: import("@hono/zod-openapi").Hook<any, RouteEnv, string, any> | undefined;
            }): import("@venizia/ignis-kernel").IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
            defineJSXRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig, ResponseType = unknown>(opts: {
                configs: RouteConfig;
                handler: import("@venizia/ignis-kernel").TRouteHandler<ResponseType, RouteEnv>;
                hook?: import("@hono/zod-openapi").Hook<any, RouteEnv, string, any> | undefined;
            }): import("@venizia/ignis-kernel").IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
            isConfigured: boolean;
            router: import("@hono/zod-openapi").OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
            path: string;
            definitions: Record<string, import("@venizia/ignis-kernel").IAuthRouteConfig>;
            getRouter(): import("@hono/zod-openapi").OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
            registerRoutesFromRegistry(opts?: {
                paths?: import("@venizia/ignis-kernel").TRoutePathScope;
            }): void;
            configure(opts?: ConfigurableOptions | undefined): Promise<import("@hono/zod-openapi").OpenAPIHono<RouteEnv, RouteSchema, BasePath>>;
            buildRouteMiddlewares<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): {
                restConfig: Omit<RouteConfig, "authenticate" | "authorize">;
                security: {
                    [x: string]: never[];
                }[];
                mws: import("hono").MiddlewareHandler<Env>[];
            };
            getRouteConfigs<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): RouteConfig & {
                getRoutingPath(): RouteConfig["path"] extends infer T ? T extends RouteConfig["path"] ? T extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start_1}/{${infer Param_1}}${infer Rest_1}` ? `${Start_1}/:${Param_1}${Rest_1 extends `${infer Start_2}/{${infer Param_2}}${infer Rest_2}` ? `${Start_2}/:${Param_2}${Rest_2 extends `${infer Start_3}/{${infer Param_3}}${infer Rest_3}` ? `${Start_3}/:${Param_3}${Rest_3 extends `${infer Start_4}/{${infer Param_4}}${infer Rest_4}` ? `${Start_4}/:${Param_4}${Rest_4 extends `${infer Start_5}/{${infer Param_5}}${infer Rest_5}` ? `${Start_5}/:${Param_5}${Rest_5 extends `${infer Start_6}/{${infer Param_6}}${infer Rest_6}` ? `${Start_6}/:${Param_6}${Rest_6 extends `${infer Start_7}/{${infer Param_7}}${infer Rest_7}` ? `${Start_7}/:${Param_7}${Rest_7 extends `${infer Start_8}/{${infer Param_8}}${infer Rest_8}` ? `${Start_8}/:${Param_8}${Rest_8 extends `${infer Start_9}/{${infer Param_9}}${infer Rest_9}` ? `${Start_9}/:${Param_9}${Rest_9 extends `${infer Start_10}/{${infer Param_10}}${infer Rest_10}` ? `${Start_10}/:${Param_10}${any}` : Rest_9}` : Rest_8}` : Rest_7}` : Rest_6}` : Rest_5}` : Rest_4}` : Rest_3}` : Rest_2}` : Rest_1}` : Rest}` : T : never : never;
            };
            getJSXRouteConfigs<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): RouteConfig & {
                getRoutingPath(): RouteConfig["path"] extends infer T ? T extends RouteConfig["path"] ? T extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start_1}/{${infer Param_1}}${infer Rest_1}` ? `${Start_1}/:${Param_1}${Rest_1 extends `${infer Start_2}/{${infer Param_2}}${infer Rest_2}` ? `${Start_2}/:${Param_2}${Rest_2 extends `${infer Start_3}/{${infer Param_3}}${infer Rest_3}` ? `${Start_3}/:${Param_3}${Rest_3 extends `${infer Start_4}/{${infer Param_4}}${infer Rest_4}` ? `${Start_4}/:${Param_4}${Rest_4 extends `${infer Start_5}/{${infer Param_5}}${infer Rest_5}` ? `${Start_5}/:${Param_5}${Rest_5 extends `${infer Start_6}/{${infer Param_6}}${infer Rest_6}` ? `${Start_6}/:${Param_6}${Rest_6 extends `${infer Start_7}/{${infer Param_7}}${infer Rest_7}` ? `${Start_7}/:${Param_7}${Rest_7 extends `${infer Start_8}/{${infer Param_8}}${infer Rest_8}` ? `${Start_8}/:${Param_8}${Rest_8 extends `${infer Start_9}/{${infer Param_9}}${infer Rest_9}` ? `${Start_9}/:${Param_9}${Rest_9 extends `${infer Start_10}/{${infer Param_10}}${infer Rest_10}` ? `${Start_10}/:${Param_10}${any}` : Rest_9}` : Rest_8}` : Rest_7}` : Rest_6}` : Rest_5}` : Rest_4}` : Rest_3}` : Rest_2}` : Rest_1}` : Rest}` : T : never : never;
            };
            scope: string;
            identifier: string;
            get logger(): import("@venizia/ignis-helpers").ILogger;
            set logger(value: import("@venizia/ignis-helpers").ILogger);
            getIdentifier(): string;
            getLogger(): import("@venizia/ignis-helpers").ILogger;
        };
    };
}
```

Source: `packages/connectors/src/search/core/controllers/factory.ts`

## `SearchEngineParams`

*class*

What a search request's `engineParams` may carry. `engineParams` hands the engine its own wire parameters, and some of
them choose the rows (`filter_by`), the fields (`include_fields`, `query_by`, `facet_by`, `highlight_fields`) or both
(a preset). Over the wire it is refused on every search controller, scoped or not, unless the controller names the
parameters a caller may send (`engineParams.allow`). A parameter that selects rows or fields, or reorders them, can
never be named. Server code passes `engineParams` on the repository call as before.

```ts
export declare class SearchEngineParams {
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
So every generated search controller refuses both (400) unless `modes.raw.allow` is `true`. Server code is not
affected: the repository's `search({ mode: 'raw' })` and `multiSearch()` work as before.

```ts
export declare class SearchRawAccess {
    /** Reads `modes.raw.allow` of a controller definition: only a literal `true` opens it. A scoped controller cannot open it, and the definition throws. */
    static resolve(opts: {
        scope: string;
        modes?: unknown;
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

## `TSearchScopeResolver`

*type*

A per-request search scope: the filter the caller is allowed to search within (a merchant, a
sharing rule). Return a `where`, `ScopeFilters.UNRESTRICTED` to apply none for this call, or
null/undefined when the caller's scope is unknown - which refuses the request.

```ts
export type TSearchScopeResolver<RouteEnv extends Env = Env, TExtra extends object = {}> = (opts: {
    context: TRouteContext<RouteEnv>;
    /** The validated request body: the search input, and the keys the controller's `request.body.extend` adds. */
    input: TSearchInput & TExtra;
}) => ValueOrPromise<TWhere | typeof ScopeFilters.UNRESTRICTED | null | undefined>;
```

Source: `packages/connectors/src/search/core/controllers/scope.ts`
