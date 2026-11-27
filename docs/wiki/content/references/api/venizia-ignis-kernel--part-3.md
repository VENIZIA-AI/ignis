---
title: "@venizia/ignis-kernel (3 of 9)"
description: "Every export of @venizia/ignis-kernel, from the built declarations (generated)."
---

# `@venizia/ignis-kernel (3 of 9)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 3 of 9 of [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel).

## `CrudControllerFactory`

*class*

Factory for generating typed CRUD controllers from entity definitions.

```ts
export declare class CrudControllerFactory extends BaseHelper {
    /** The generated routes that change data: the ones that must never be answered by a `read` permission. */
    private static readonly WRITE_VERBS;
    constructor();
    /**
     * Injects `repositories.<repositoryName>` into constructor parameter 0 of a factory-generated
     * controller, so a subclass needs no constructor. Recorded as metadata rather than a parameter
     * decorator, which Bun drops in some configurations. A subclass that declares its own `@inject` at
     * index 0 wins, and a sibling subclass keeps the factory's key.
     */
    static registerRepositoryInjection(opts: {
        target: TClass<unknown>;
        factoryName: string;
        repositoryName: string;
    }): void;
    static build<Repository extends TCrudRepositoryClass, RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ConfigurableOptions extends object = {}, TDataObject extends object = TRepositoryDataObject<InstanceType<Repository>>, TPersistObject extends object = TRepositoryPersistObject<InstanceType<Repository>>>(opts: ICrudControllerOptions<Repository>): {
        new (repositoryInstance: AbstractRepository<TDataObject, TPersistObject>): {
            /** The routes of a generated controller come from `routes`; a subclass adds its own here. */
            binding(): ValueOrPromise<void>;
            /** Registers each listed CRUD route, after `binding()`: a custom static path is never taken by `/{id}`. */
            bindDefaultRoutes(): ValueOrPromise<void>;
            create(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
            }): Promise<import("../index.js").TJsonResponse<unknown, 201>>;
            assertNonEmptyUpdate(opts: {
                scope: string;
                data: object;
            }): void;
            updateById(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
            }): Promise<import("../index.js").TJsonResponse<unknown, 200>>;
            updateBy(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
            }): Promise<Response>;
            deleteById(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
            }): Promise<import("../index.js").TJsonResponse<unknown, 200>>;
            deleteBy(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
            }): Promise<Response>;
            restoreById(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
            }): Promise<import("../index.js").TJsonResponse<unknown, 200>>;
            restoreBy(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
            }): Promise<Response>;
            getBaseWhere(_opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
            }): Promise<import("@venizia/ignis-filter").TWhere<TDataObject> | undefined>;
            count(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
            }): Promise<import("../index.js").TJsonResponse<unknown, 200>>;
            find(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
            }): Promise<import("../index.js").TJsonResponse<unknown, 200>>;
            findById(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
            }): Promise<import("../index.js").TJsonResponse<unknown, 200>>;
            findOne(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
            }): Promise<import("../index.js").TJsonResponse<unknown, 200>>;
            repository: AbstractRepository<TDataObject, TPersistObject, import("../../repositories/index.js").IExtraOptions>;
            assertRequestFilter(opts: {
                filter?: {
                    where?: unknown;
                    order?: unknown;
                    include?: unknown;
                };
            }): void;
            bulkWhereError(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
                where?: object;
            }): import("../index.js").TJsonResponse<unknown, 400> | undefined;
            resolveBulkWhere<WhereType extends object>(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
                where?: {
                    fromQuery?: WhereType | undefined;
                    fromBody?: WhereType | undefined;
                } | undefined;
            }): {
                where?: undefined;
                error: Response;
            } | {
                where: WhereType;
                error?: undefined;
            };
            measure<R>(opts: {
                scope: string;
                args: unknown;
                task: () => Promise<R>;
            }): Promise<R>;
            normalizeCountData<ResponseSchema, RequestContext extends import("../index.js").TRouteContext<RouteEnv> = import("../index.js").TRouteContext<RouteEnv>, ResponseData extends {
                count: number;
                data?: import("@venizia/ignis-inversion").TNullable<ResponseSchema>;
            } = {
                count: number;
                data?: import("@venizia/ignis-inversion").TNullable<ResponseSchema>;
            }>(opts: {
                context: RequestContext;
                payload: ResponseData;
            }): ResponseData | import("@venizia/ignis-inversion").TNullable<ResponseSchema>;
            getRequestedExtras(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
            }): Array<import("../index.js").IRequestedExtra>;
            respond<R>(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
                format: import("../index.js").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-inversion").TNullable<R>;
                };
                range?: import("../../repositories/index.js").TDataRange;
                extra?: never;
            }): import("@venizia/ignis-inversion").TNullable<R | {
                count: number;
                data?: import("@venizia/ignis-inversion").TNullable<R>;
            }>;
            respond<R, Extra extends Record<string, import("../index.js").TResponseExtra>>(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
                format: import("../index.js").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-inversion").TNullable<R>;
                };
                range?: import("../../repositories/index.js").TDataRange;
                extra: Extra;
            }): Promise<import("@venizia/ignis-inversion").TNullable<R | {
                count: number;
                data?: import("@venizia/ignis-inversion").TNullable<R>;
            } | {
                count?: number;
                data?: import("@venizia/ignis-inversion").TNullable<R>;
                extra: Partial<Record<keyof Extra, unknown>>;
            }>>;
            respond<R>(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
                format: import("../index.js").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-inversion").TNullable<R>;
                };
                range?: import("../../repositories/index.js").TDataRange;
                extra?: Record<string, import("../index.js").TResponseExtra>;
            }): ValueOrPromise<import("@venizia/ignis-inversion").TNullable<R | {
                count?: number;
                data?: import("@venizia/ignis-inversion").TNullable<R>;
                extra?: Record<string, unknown>;
            }>>;
            respondWithExtra<R>(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-inversion").TNullable<R>;
                };
                extra: Record<string, import("../index.js").TResponseExtra>;
            }): Promise<R | {
                count: number;
                data?: import("@venizia/ignis-inversion").TNullable<R>;
            } | {
                count: number;
                data: import("@venizia/ignis-inversion").TNullable<R>;
                extra: Record<string, unknown>;
            } | {
                data: import("@venizia/ignis-inversion").TNullable<R>;
                extra: Record<string, unknown>;
                count?: undefined;
            } | null | undefined>;
            setListHeaders(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
                count: number;
            } & ({
                range: import("../../repositories/index.js").TDataRange;
            } | {
                offset: number;
                total: number;
            })): void;
            toHonoHandler<RouteConfig extends import("../index.js").IAuthRouteConfig = import("../index.js").IAuthRouteConfig>(opts: {
                handler: (context: import("../index.js").TContextOf<RouteConfig, RouteEnv>) => ValueOrPromise<Response | import("hono").TypedResponse<unknown>>;
            }): import("hono").Handler<RouteEnv, string, import("hono").Input, (Response | Promise<Response>) | (import("@hono/zod-openapi").RouteConfigToTypedResponse<import("@hono/zod-openapi").RouteConfig> | Promise<import("@hono/zod-openapi").RouteConfigToTypedResponse<import("@hono/zod-openapi").RouteConfig>>)>;
            bindRoute<RouteConfig extends import("../index.js").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): import("../index.js").IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
            defineRoute<RouteConfig extends import("../index.js").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
                handler: (context: import("../index.js").TContextOf<RouteConfig, RouteEnv>) => ValueOrPromise<Response | import("hono").TypedResponse<unknown>>;
                hook?: import("@hono/zod-openapi").Hook<any, RouteEnv, string, any> | undefined;
            }): import("../index.js").IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
            defineJSXRoute<RouteConfig extends import("../index.js").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
                handler: (context: import("../index.js").TContextOf<RouteConfig, RouteEnv>) => ValueOrPromise<Response | import("hono").TypedResponse<unknown>>;
                hook?: import("@hono/zod-openapi").Hook<any, RouteEnv, string, any> | undefined;
            }): import("../index.js").IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
            isConfigured: boolean;
            router: import("@hono/zod-openapi").OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
            path: string;
            definitions: Record<string, import("../index.js").IAuthRouteConfig>;
            getRouter(): import("@hono/zod-openapi").OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
            registerRoutesFromRegistry(opts?: {
                paths?: import("../index.js").TRoutePathScope;
            }): void;
            configure(opts?: ConfigurableOptions | undefined): Promise<import("@hono/zod-openapi").OpenAPIHono<RouteEnv, RouteSchema, BasePath>>;
            buildRouteMiddlewares<RouteConfig extends import("../index.js").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): {
                restConfig: Omit<RouteConfig, "authenticate" | "authorize">;
                security: {
                    [x: string]: never[];
                }[];
                mws: import("hono").MiddlewareHandler<Env>[];
            };
            getRouteConfigs<RouteConfig extends import("../index.js").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): RouteConfig & import("@hono/zod-openapi").RouteConfig & {
                getRoutingPath(): string;
            };
            getJSXRouteConfigs<RouteConfig extends import("../index.js").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): RouteConfig & import("@hono/zod-openapi").RouteConfig & {
                getRoutingPath(): string;
            };
            scope: string;
            identifier: string;
            get logger(): import("@venizia/ignis-helpers/core").ILogger;
            set logger(value: import("@venizia/ignis-helpers/core").ILogger);
            getIdentifier(): string;
            getLogger(): import("@venizia/ignis-helpers/core").ILogger;
        };
    };
    /** A restore route needs a repository that has the restore methods; the types already refuse one, this is the backstop for an untyped caller. */
    private static assertRestoreRoutesSupported;
    private static describeSpec;
    /**
     * Refuses a CRUD controller that lists a write verb which would inherit a controller-level `authorize`
     * that is only a `read` permission: the verb would then answer to anyone who may read.
     *
     * A listed write verb is fine when it declares its own `authorize` (a spec, an array, or `{ skip: true }`) or
     * skips authentication. Only the literal action `read` is detected; a custom action name is the application's own
     * vocabulary. An array counts when every spec in it is `read`, since the specs of one route must all pass.
     */
    static assertWriteVerbsDeclareAuthorize(opts: {
        repositoryName: string;
        authorize: IAuthorizationSpec | IAuthorizationSpec[] | undefined;
        routes: TCrudRoutes | undefined;
    }): void;
}
```

Source: `packages/kernel/src/base/controllers/factory/controller.ts`

## `CrudRoutes`

*class*

Route groups to spread into the `routes` of a CRUD controller.

```ts
export declare class CrudRoutes {
    /** The four read routes: `count`, `find`, `findById` and `findOne`. */
    static readonly READ: {
        count: true;
        find: true;
        findById: true;
        findOne: true;
    };
}
```

Source: `packages/kernel/src/base/controllers/common/constants.ts`

## `DATA_SOURCE_BRAND`

*const*

The key keeps its old name, `abstract-data-source`, so a copy of the package from before `DataSourceRoot` still recognises the
classes of a newer one, and the other way round.

```ts
export declare const DATA_SOURCE_BRAND: unique symbol;
```

Source: `packages/kernel/src/base/datasources/root.ts`

## `DatabaseErrorCodes`

*class*

The `normalized.code` of a database error the request caused (HTTP 400): one per common SQLSTATE, then one per class.

```ts
export declare class DatabaseErrorCodes {
    static readonly STRING_TOO_LONG: string;
    static readonly NUMERIC_OUT_OF_RANGE: string;
    static readonly INVALID_TEXT_REPRESENTATION: string;
    static readonly NOT_NULL_VIOLATION: string;
    static readonly FOREIGN_KEY_VIOLATION: string;
    static readonly UNIQUE_VIOLATION: string;
    static readonly CHECK_VIOLATION: string;
    /** Any other class `22` (data exception). */
    static readonly INVALID_INPUT: string;
    /** Any other class `23` (integrity constraint) or `44` (view check option). */
    static readonly CONSTRAINT_VIOLATION: string;
}
```

Source: `packages/kernel/src/base/middlewares/app-error/definition.ts`

## `DataSourceDrivers`

*class*

Names of the supported datasource drivers, split into relational and search sets. `isValid` checks a value against all of them.

```ts
export declare class DataSourceDrivers {
    static readonly NODE_POSTGRES = "node-postgres";
    static readonly POSTGRES_JS = "postgres-js";
    static readonly PGLITE = "pglite";
    static readonly LIBSQL = "libsql";
    static readonly TYPESENSE = "typesense";
    static readonly MEILISEARCH = "meilisearch";
    static readonly RELATIONAL_SCHEME_SET: Set<string>;
    static readonly SEARCH_SCHEME_SET: Set<string>;
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `DataSourceOpenDefaults`

*class*

Defaults of the `open` option.

```ts
export declare class DataSourceOpenDefaults {
    /** How long a first use waits for the open before it gives up (ms): a WASM boot on a slow link fits, a `configure()` that waits on itself does not hang for ever. */
    static readonly TIMEOUT_MS = 60000;
}
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `DataSourceOpenModes`

*class*

When a datasource opens: with the application (`start`, the default) or at the first call that needs it (`first-use`).

```ts
export declare class DataSourceOpenModes extends ConstClass {
    static readonly START = "start";
    static readonly FIRST_USE = "first-use";
}
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `DefaultRequestHeadersSchema`

*const*

Default request headers of a CRUD route: the trackable headers plus the count header.

```ts
export declare const DefaultRequestHeadersSchema: z.ZodObject<{
    "x-request-id": z.ZodOptional<z.ZodString>;
    "x-request-channel": z.ZodOptional<z.ZodString>;
    "x-device-info": z.ZodOptional<z.ZodString>;
    "x-request-count": z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
```

Source: `packages/kernel/src/base/controllers/common/schemas.ts`

## `del`

*const*

DELETE route decorator. Equivalent to @api but automatically sets method to 'delete'.

```ts
export declare const del: <RestRouteConfigType extends Omit<IAuthRouteConfig, "method">>(opts: {
    configs: RestRouteConfigType;
}) => (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rest.ts`

## `EmojiFaviconMiddleware`

*class*

Factory for a middleware that answers `/favicon.ico` with an emoji rendered as SVG.

```ts
export declare class EmojiFaviconMiddleware {
    /** Serves an emoji as an SVG favicon on /favicon.ico. */
    static create(opts: {
        icon: string;
    }): MiddlewareHandler;
}
```

Source: `packages/kernel/src/base/middlewares/emoji-favicon/emoji-favicon.middleware.ts`

## `ErrorSchema`

*const*

The error RESPONSE for OpenAPI docs - here, beside the REST layer that already needs `@hono/zod-openapi`.
Named, so every route's `4XX` and `5XX` reference one `ErrorResponse` component.

```ts
export declare const ErrorSchema: z.ZodObject<{
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
```

Source: `packages/kernel/src/base/models/common/schemas.ts`

## `EventBus`

*class*

In-process, fire-and-forget domain event bus. `TPayloadMap` keys the event names, so a wrong name
or payload shape is a compile error. Delivery is always async. Retry timing is a property of the
handler's own failure mode, not of the event, so `register` may tune it per registration. But
nobody awaits a fire-and-forget dispatch, so an unbounded window would let one event hold a
handler - and whatever it holds open, e.g. a database connection - for an unbounded time with no
one to report it. What the bus guarantees instead: a bounded MAXIMUM time a single dispatch can
occupy, enforced as a hard ceiling at `register()` - see `EventDispatchRetry`. Retry makes
delivery at-least-once: handlers must be idempotent, see `IEventHandler`.

```ts
export declare class EventBus<TPayloadMap extends object> extends BaseHelper {
    private readonly container;
    /** `register` appends, never replaces - two handlers may share an event name, and replacing would
     * drop the first with no way for the caller to notice. */
    private readonly registrationsByName;
    constructor(opts: {
        scope?: string;
        container: Container;
    });
    /** The pre-jitter total of every inter-attempt delay `maxAttempts`/`baseDelayMs` would produce -
     * jitter (always on, see `dispatch`) only ever shrinks a delay, so this is a true upper bound. */
    private static computeTotalWindowMs;
    /** Loud rejection, never a silent clamp: a caller who believes a number the bus does not honour is
     * worse off than one who sees the ceiling at boot. */
    private static assertValidRetry;
    /**
     * Turns `handler` into a uniform invoker plus a description for the exhaustion log line.
     * `BINDING_KEY` resolves through the container INSIDE the returned closure, so every call re-reads
     * the current binding; `FUNCTION` calls `fn` directly, so the closure IS the resolution - there is
     * nothing left to re-read on a later attempt. The tag (`handler.type`) is what this switches on,
     * not which field happens to be present - see `EventHandlerTypes`' doc.
     */
    private static buildHandlerInvoker;
    /**
     * `retry` is optional and per REGISTRATION, not per publish: the right window belongs to the
     * handler's own failure mode, and two handlers on the same event name may each pick their own.
     * Omitting it reproduces today's `EventDispatchRetry` defaults exactly. Both `maxAttempts` and the
     * total backoff window it implies are bounded - see `EventDispatchRetry` - and exceeding either
     * throws here, at boot where a human sees it, rather than being silently clamped at dispatch time.
     */
    register<K extends keyof TPayloadMap & string>(opts: {
        name: K;
        /** A `BINDING_KEY` reference re-resolves through the container on every retry attempt, so a
         * rebind reaches a dispatch already in flight. A `FUNCTION` reference is captured as-is: a
         * rebind has nothing to reach, and every attempt in a long retry window calls the exact `fn`
         * registered here. */
        handler: TEventHandlerReference<TPayloadMap[K]>;
        retry?: IEventHandlerRetryOptions;
    }): void;
    /**
     * Never blocks and never throws back to the caller: dispatch runs outside this call's flow via
     * `queueMicrotask`, and a handler failure is caught and logged where it happens (`dispatch`),
     * never here.
     */
    publish<K extends keyof TPayloadMap & string>(opts: {
        name: K;
        payload: TPayloadMap[K];
        traceId?: string;
    }): void;
    /**
     * Attempts/backoff come from the registration (`EventDispatchRetry`'s defaults when omitted),
     * always with full jitter - `RetryJitterModes.FULL` decorrelates a shared-resource pile-up hardest,
     * so many handlers retrying the same lock do not collide on the same instant a second and third
     * time. `invokeHandler` already encodes whether that re-resolves (`BINDING_KEY`) or was captured
     * once (`FUNCTION`) - see `buildHandlerInvoker` - so this method calls it uniformly. A handler that
     * throws synchronously is caught exactly like one that returns a rejected promise: `execution`
     * here is itself `async`, and JS converts a synchronous throw inside an async function body into a
     * rejection of that function's own promise - `RetryUtility.executeWithRetry`'s attempt loop never
     * sees the difference.
     *
     * `RetryUtility.executeWithRetry` is used without its own `logger` - its internal per-attempt/exhaustion
     * logging knows nothing about the event name or `traceId`, so it cannot be the trace anyone
     * relies on. The one line below, logged only on final failure, is.
     */
    private dispatch;
}
```

Source: `packages/kernel/src/base/events/event-bus.ts`

## `EventDispatchRetry`

*class*

Defaults and ceilings of event dispatch retry: the `*_CEILING` and `*_WINDOW_MS` values cap what `register` may ask for.

```ts
export declare class EventDispatchRetry {
    /** Attempts per dispatch when `register` gives no `retry.maxAttempts`. */
    static readonly MAX_ATTEMPTS = 3;
    /** First backoff delay in ms when `register` gives no `retry.baseDelayMs`. */
    static readonly BASE_DELAY_MS = 100;
    /**
     * Ceiling on `register`'s `retry.maxAttempts`. Dispatch is fire-and-forget - nobody awaits it - so
     * an attempt count high enough to matter is already high enough to hammer a struggling downstream
     * resource attempt after attempt. Twice the highest count any known consumer has asked for (5)
     * leaves room to tune without permitting an attempt storm.
     */
    static readonly MAX_ATTEMPTS_CEILING = 10;
    /**
     * Ceiling, in ms, on the total backoff window `register`'s `retry` can produce (the sum of every
     * inter-attempt delay, computed without jitter since jitter only shrinks it). Matches
     * `RetryUtility`'s own default cap on a SINGLE delay: a dispatch holds a handler's resources - e.g.
     * a database connection - for its entire retry window, so the sum across every attempt gets the
     * same "unreasonable beyond this" line the framework already draws for one attempt.
     */
    static readonly MAX_TOTAL_WINDOW_MS = 30000;
}
```

Source: `packages/kernel/src/base/events/common/constants.ts`

## `EventHandlerTypes`

*class*

Tag for `EventBus.register`'s `handler` union (`TEventHandlerReference`). The tag makes the
caller's choice explicit at the call site instead of implicit in whichever field is present, so a
mismatched `type`/field pair (`BINDING_KEY` with `fn`, or `FUNCTION` with `key`) is a compile
error there rather than a runtime surprise later, inside a `queueMicrotask` where nobody is
watching.

```ts
export declare class EventHandlerTypes extends ConstClass {
    /** `handler.key` is resolved from the container on every retry attempt - a rebind reaches an attempt already in flight. */
    static readonly BINDING_KEY = "binding-key";
    /** `handler.fn` is invoked directly as a captured closure - there is nothing to rebind, so every attempt in a retry window calls the exact function registered here. */
    static readonly FUNCTION = "function";
}
```

Source: `packages/kernel/src/base/events/common/constants.ts`

## `FieldsSchema`

*const*

Selected fields: an array of names to include, or a name-to-boolean map.

```ts
export declare const FieldsSchema: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
```

Source: `packages/kernel/src/base/repositories/query-schemas/index.ts`

## `FilterQuerySchema`

*const*

The query shape of a route that accepts a `filter`. The framework's own `find`, `findById` and
`findOne` use it, and a hand-written route gets the same contract by naming it.

`filter` needs no `.optional()` at the call site - {@link FilterSchema} already carries one, so a
second is a no-op and so is a trailing `.partial()`.

Extend it rather than rebuilding it when a route takes more than `filter`:
`FilterQuerySchema.extend({ q: z.string().optional() })`.

```ts
export declare const FilterQuerySchema: z.ZodObject<{
    filter: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
        where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
        fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
        include: z.ZodOptional<z.ZodArray<z.ZodObject<{
            relation: z.ZodString;
            scope: z.ZodOptional<z.ZodLazy<z.ZodType<import("@venizia/ignis-filter").TFilter | undefined, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TFilter | undefined, unknown>>>>;
        }, z.core.$strip>>>;
        order: z.ZodOptional<z.ZodArray<z.ZodString>>;
        limit: z.ZodOptional<z.ZodNumber>;
        offset: z.ZodOptional<z.ZodNumber>;
        skip: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodObject<{
        where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
        fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
        include: z.ZodOptional<z.ZodArray<z.ZodObject<{
            relation: z.ZodString;
            scope: z.ZodOptional<z.ZodLazy<z.ZodType<import("@venizia/ignis-filter").TFilter | undefined, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TFilter | undefined, unknown>>>>;
        }, z.core.$strip>>>;
        order: z.ZodOptional<z.ZodArray<z.ZodString>>;
        limit: z.ZodOptional<z.ZodNumber>;
        offset: z.ZodOptional<z.ZodNumber>;
        skip: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>]>>;
}, z.core.$strip>;
```

Source: `packages/kernel/src/base/repositories/query-schemas/index.ts`

## `FilterSchema`

*const*

The whole `filter` query: an object of where, fields, include, order, limit, offset and skip, or a JSON string of one.

```ts
export declare const FilterSchema: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
    include: z.ZodOptional<z.ZodArray<z.ZodObject<{
        relation: z.ZodString;
        scope: z.ZodOptional<z.ZodLazy<z.ZodType<import("@venizia/ignis-filter").TFilter | undefined, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TFilter | undefined, unknown>>>>;
    }, z.core.$strip>>>;
    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
    limit: z.ZodOptional<z.ZodNumber>;
    offset: z.ZodOptional<z.ZodNumber>;
    skip: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodObject<{
    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<import("@venizia/ignis-filter").TWhere, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TWhere, unknown>>>>]>>;
    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
    include: z.ZodOptional<z.ZodArray<z.ZodObject<{
        relation: z.ZodString;
        scope: z.ZodOptional<z.ZodLazy<z.ZodType<import("@venizia/ignis-filter").TFilter | undefined, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TFilter | undefined, unknown>>>>;
    }, z.core.$strip>>>;
    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
    limit: z.ZodOptional<z.ZodNumber>;
    offset: z.ZodOptional<z.ZodNumber>;
    skip: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>>]>>;
```

Source: `packages/kernel/src/base/repositories/query-schemas/index.ts`

## `findResponseHeaders`

*const*

OpenAPI response headers of a list route: `commonResponseHeaders` plus `Content-Range` for pagination.

```ts
export declare const findResponseHeaders: TResponseHeaders;
```

Source: `packages/kernel/src/base/controllers/common/constants.ts`

## `get`

*const*

GET route decorator. Equivalent to @api but automatically sets method to 'get'.

```ts
export declare const get: <RestRouteConfigType extends Omit<IAuthRouteConfig, "method">>(opts: {
    configs: RestRouteConfigType;
}) => (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rest.ts`

## `GrantBuilder`

*class*

Pure planner for grant rows: validates and shapes grant intents (tier or per-operation) into `PolicyDefinition` rows. Persisting and the operation catalog stay with the caller.

```ts
export declare class GrantBuilder extends BaseHelper {
    static readonly SINGLETON_REAL_KEY = "grant-builder";
    /** Tiers a caller may ask for; `custom` is an encoding marker and is never a valid intent. */
    private static readonly PLANNABLE_TIERS;
    /** Tried after `manage`; disjoint from each other, since an operation has one catalogued action. */
    private static readonly NARROW_TIERS;
    constructor();
    static getInstance(): GrantBuilder;
    decodeMetadata<MetadataType = unknown>(opts: {
        metadata: MetadataType;
    }): any;
    /** Read `{ ops }` off a grant row's metadata, or null when the shape is unusable. Callers treat null as a defect to log and skip - never as an empty grant. */
    parseCustomGrantMetadata(opts: {
        metadata: unknown;
    }): {
        ops: string[];
    } | null;
    /** Split operation names into those present in the catalog for `subject` and those that are not. Pure - the caller supplies the catalog slice; the adapter re-runs this independently at read time. */
    validateCustomGrantOps(opts: {
        ops: string[];
        subject: string;
        catalog: Array<{
            subject: string;
            method: string;
        }>;
    }): {
        valid: string[];
        unknown: string[];
    };
    /** Actions a tier confers, derived from LATTICE rather than hardcoded so the two cannot drift. */
    actionsCoveredBy(opts: {
        tier: TAuthorizationAction;
    }): Set<string>;
    /** Decide which rows express an intent: a custom row is a last resort, so as much of the selection as possible collapses into tier grants first. `exact` disables collapsing when the caller means these operations and no future ones. Pure - the caller supplies the catalog and persists. */
    planGrant(opts: {
        subject: {
            type: string;
            id: IdType;
        };
        resource: {
            type: string;
            id: IdType;
            subject: string;
        };
        intent: TGrantIntent;
        catalog: Array<{
            subject: string;
            method: string;
            code: string;
            action: string;
        }>;
        domain?: TNullable<TPolicyDomainInput>;
        effect?: TAuthorizationDecision;
        supportsCustomMetadata?: boolean;
        exact?: boolean;
    }): TPlannedGrantRow[];
    /** Collapse `remaining` into the fewest tier grants, mutating `remaining` and appending to `rows`. */
    protected collapseRemainingIntoTiers(opts: {
        subjectCatalog: Array<{
            subject: string;
            method: string;
            code: string;
            action: string;
        }>;
        remaining: Set<string>;
        rows: TPlannedGrantRow[];
        tierRow: (tier: TAuthorizationAction) => TPlannedGrantRow;
    }): void;
}
```

Source: `packages/kernel/src/base/auth/authorize/builders/grant.builder.ts`

## `IApplication`

*interface*

Exactly what EVERY host implements. `getServerHost`/`getServerPort`/`getServerAddress`/`start`/`stop` are not here on purpose - a browser Worker can implement none of them; they live on `@venizia/ignis`'s `IServerApplication`.

```ts
export interface IApplication<AppEnv extends Env = Env, AppSchema extends Schema = Schema, BasePath extends string = '/'> {
    getProjectRoot(): string;
    getProjectConfigs(): IApplicationConfigs;
    getServer(): Hono<AppEnv, AppSchema, BasePath>;
    getRootRouter(): Hono<AppEnv, AppSchema, BasePath>;
    setupMiddlewares(): ValueOrPromise<void>;
    initialize(): ValueOrPromise<void>;
}
```

Source: `packages/kernel/src/base/applications/common/types/application.ts`

## `IApplicationConfigs`

*interface*

No `host`/`port`: a browser Worker has neither, and carrying them here made one silently configured with `localhost:3000`. `@venizia/ignis` widens this shape with both - see its `IServerApplicationConfigs`.

```ts
export interface IApplicationConfigs {
    path: {
        base: string;
        /**
         * Whether `/users` and `/users/` are different routes; `false` answers both. Under `false`,
         * declare routes without a trailing slash: a route declared as `/users/` answers neither
         * `/users` nor `/users/`. The type requires it; omitting it at run time means `true`.
         *
         * @default true
         */
        isStrict: boolean;
    };
    requestId?: {
        isStrict: boolean;
    };
    favicon?: string;
    /** `environment` is the host's ambient environment name. Set it where there is none to read - a browser Worker - so the error middleware can tell "no ambient environment" from "misconfigured". Absent on a server, which reads `process.env.NODE_ENV`. */
    error?: {
        rootKey?: string;
        environment?: string;
    };
    /** Generated indexes to register before `preConfigure` - one, or an array composed from several packages. */
    artifacts?: TArtifactIndexInput;
    /**
     * Registers every class a stereotype decorated, so an application lists none of its own. An absent
     * `artifacts` keeps meaning "register nothing", never "register everything". Both together
     * register the union, de-duplicated - which is how an application discovers its own classes and
     * still composes a library index.
     *
     * @default false
     */
    discoverArtifacts?: boolean;
    /** Boot-time checks. Without `binding`, nothing is verified, and hand registration and same-key override stay allowed. */
    bootChecks?: {
        binding?: {
            doVerify: boolean;
            allowManual: boolean;
            /** @default true */
            allowOverride: boolean;
        };
        /**
         * Two different classes deriving one binding key from their class name fail registration: in a
         * minified build the second would silently replace the first. A development setup that
         * re-registers after a hot reload re-evaluates modules, which looks the same; `true` there turns
         * the failure into a warning.
         */
        allowDerivedKeyCollision?: boolean;
    };
    /**
     * Controller transports to enable.
     *
     * @default ['rest']
     */
    transports?: TControllerTransport[];
    asyncContext?: {
        enable: boolean;
    };
    debug?: {
        /** @default false */
        shouldShowRoutes?: boolean;
    };
    /** The framework installs `cors` (first) and `bodyLimit` (right after the request id). Every other key is typed only: wire it in `setupMiddlewares()`. */
    middlewares?: IMiddlewareConfigs;
    /**
     * How long `stop()` waits, in ms, for one datasource's `close()` before it logs and moves on; `0`
     * waits without limit.
     *
     * @default 10_000
     */
    dataSourceCloseTimeoutMs?: number;
    [key: string]: unknown;
}
```

Source: `packages/kernel/src/base/applications/common/types/application.ts`

## `IApplicationInfo`

*interface*

Identity of an application, returned by `getAppInfo()`. Extra keys are allowed.

```ts
export interface IApplicationInfo {
    name: string;
    version: string;
    description: string;
    author?: {
        name: string;
        email: string;
        url?: string;
    };
    [extra: string | symbol]: unknown;
}
```

Source: `packages/kernel/src/base/applications/common/types/application.ts`

## `IArtifactRegistrationMixin`

*interface*

Mixin contract for registering every discovered artifact from an artifact index in one call.

```ts
export interface IArtifactRegistrationMixin {
    registerArtifacts(index: TArtifactIndexInput): Promise<void>;
}
```

Source: `packages/kernel/src/base/mixins/common/types.ts`

## `IArtifactTypeDefinition`

*interface*

What an application declares about an artifact type of its own: the binding namespace its classes get and the scope they bind with unless a class says otherwise.

```ts
export interface IArtifactTypeDefinition {
    type: string;
    namespace: string;
    scope: TBindingScope;
}
```

Source: `packages/kernel/src/helpers/inversion/common/constants.ts`

## `IAuthenticateOptions`

*interface*

Composes the four topic option types into the framework's single authenticate config knob.
The only file in this folder allowed more than one sibling import - it is their parent.

```ts
export interface IAuthenticateOptions {
    restOptions?: TAuthenticationRestOptions;
    jwtOptions?: TJWTTokenServiceOptions;
    basicOptions?: TBasicTokenServiceOptions;
    serviceOptions?: IServiceAuthOptions;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/options.ts`

## `IAuthenticationStrategy`

*interface*

A strategy that authenticates a request. `name` is the name it is registered under; `authenticate` returns the user or throws.

```ts
export interface IAuthenticationStrategy<E extends Env = Env> {
    name: string;
    authenticate(context: TContext<E, string>): Promise<IAuthUser>;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/strategy.ts`

## `IAuthorizationDomainSource`

*interface*

Declarative description of where to read the request domain from.

```ts
export interface IAuthorizationDomainSource {
    from: TAuthorizationDomainSource;
    key: string;
    type: string;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/types/request.ts`
