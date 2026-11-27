---
title: "@venizia/ignis-kernel (4 of 9)"
description: "Every export of @venizia/ignis-kernel, from the built declarations (generated)."
---

# `@venizia/ignis-kernel (4 of 9)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 4 of 9 of [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel).

## `IAuthorizationEnforcer`

*interface*

Builds rules and evaluates requests. Cache management (`invalidateUserCache`/`rebuildUserCache`) is OPTIONAL - only on per-user-caching enforcers; the registry feature-detects it at runtime.

```ts
export interface IAuthorizationEnforcer<E extends Env = Env, TAction = string, TResource = string, TRules = unknown, TBuildRulesReturn = ValueOrPromise<TRules>, TEvaluateReturn = ValueOrPromise<TAuthorizationDecision>> {
    name: string;
    configure(): ValueOrPromise<void>;
    buildRules(opts: {
        user: IAuthorizationUser;
        context: TContext<E, string>;
    }): TBuildRulesReturn;
    evaluate(opts: {
        rules: TRules;
        request: IAuthorizationRequest<TAction, TResource>;
        context: TContext<E, string>;
    }): TEvaluateReturn;
    /** Drop a user's cached policies. Implemented only by caching enforcers. */
    invalidateUserCache?(opts: {
        user: IAuthorizationUser;
    }): Promise<{
        invalidatedKeys: number;
    }>;
    /** Drop + rebuild a user's cached policies. Implemented only by caching enforcers. */
    rebuildUserCache?(opts: {
        user: IAuthorizationUser;
    }): Promise<{
        cacheKey: string;
        lineCount: number;
    }>;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/types/enforcer.ts`

## `IAuthorizationRequest`

*interface*

What an enforcer evaluates: an action on a resource, with optional attribute conditions and domain.

```ts
export interface IAuthorizationRequest<TAction = string, TResource = string> {
    action: TAction;
    resource: TResource;
    conditions?: TAuthorizationConditions;
    /** Resolved domain scope for this request as a casbin domain string `"<DomainType>_<id>"` (e.g. `"Merchant_7"`), or the `"SYSTEM_WIDE"` sentinel to enforce across all domains. */
    domain?: string;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/types/request.ts`

## `IAuthorizationRole`

*interface*

A role with a numeric `priority` (higher outranks lower) and a string `identifier`.

```ts
export interface IAuthorizationRole {
    readonly name: string;
    readonly priority: number;
    readonly identifier: string;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/types/request.ts`

## `IAuthorizationSpec`

*interface*

Per-route authorization requirement passed to `authorize()`. `allowedRoles` grants access to matching roles before voters and the enforcer run.

```ts
export interface IAuthorizationSpec<E extends Env = Env, TAction = string, TResource = string> {
    action: TAction;
    resource: TResource;
    conditions?: TAuthorizationConditions;
    allowedRoles?: string[];
    voters?: TAuthorizationVoter<E, TAction, TResource>[];
    /** Optional per-route domain: declarative source OR a resolver method. Omitted → global resolver. */
    domain?: IAuthorizationDomainSource | TAuthorizationDomainResolver<E>;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/types/enforcer.ts`

## `IAuthorizationUser`

*interface*

An authenticated user whose `principalType` is set; enforcer-based authorization requires it.

```ts
export interface IAuthorizationUser extends IAuthUser {
    principalType: string;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/types/request.ts`

## `IAuthorizeOptions`

*interface*

Application-wide authorize options. `defaultDecision` applies when an enforcer abstains and when no enforcer is registered (a `deny` default then fails the request).

```ts
export interface IAuthorizeOptions {
    defaultDecision: TAuthorizationDecision;
    alwaysAllowRoles?: string[];
    /** Fallback domain resolver used when a route's spec has no `domain`. */
    domainResolver?: TAuthorizationDomainResolver;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/types/enforcer.ts`

## `IAuthRouteConfig`

*interface*

A route of an IGNIS controller: the OpenAPI operation, its request and responses, and the framework's
`authenticate` and `authorize`. It is IGNIS's own type, not Hono's `RouteConfig`, so that checking a config never
compares zod types structurally; the framework converts it where it registers the route.

```ts
export interface IAuthRouteConfig {
    method: TRouteMethod;
    path: string;
    summary?: string;
    description?: string;
    tags?: string[];
    operationId?: string;
    deprecated?: boolean;
    security?: Array<Record<string, string[]>>;
    /** Leaves the route out of the OpenAPI document. */
    hide?: boolean;
    externalDocs?: object;
    servers?: object[];
    parameters?: object[];
    callbacks?: object;
    middleware?: MiddlewareHandler | MiddlewareHandler[];
    request?: {
        params?: TRequestPartSchema;
        query?: TRequestPartSchema;
        cookies?: TRequestPartSchema;
        /** A zod object, or a list of schemas; with a list, the headers have no single type to validate into. */
        headers?: TRequestPartSchema | TRequestPartSchema[];
        body?: {
            content: Record<string, TRouteMediaType>;
            description?: string;
            required?: boolean;
            [extension: `x-${string}`]: unknown;
        };
    };
    responses: Record<string | number, TRouteResponse>;
    [extension: `x-${string}`]: unknown;
    authenticate?: {
        strategies?: TAuthStrategy[];
        mode?: TAuthMode;
    };
    authorize?: IAuthorizationSpec | IAuthorizationSpec[];
}

/** The methods a route is registered under. */
type TRouteMethod = Exclude<ValueOf<typeof HTTP.Methods>, typeof HTTP.Methods.QUERY> | 'trace';

/** A zod object schema of a request part. */
type TRequestPartSchema = {
    _zod: unknown;
};

/** One entry of a `content` map. */
type TRouteMediaType = {
    schema?: TRouteSchema;
    example?: unknown;
    examples?: unknown;
    encoding?: unknown;
    itemSchema?: unknown;
    itemEncoding?: unknown;
    prefixEncoding?: unknown;
    [extension: `x-${string}`]: unknown;
};

/** A zod schema, read by its `_zod` member and never compared structurally, or a raw OpenAPI object. */
type TRouteSchema = {
    _zod: unknown;
} | Record<string, unknown>;

/** A response of a route, or a reference to one. */
type TRouteResponse = {
    description?: string;
    summary?: string;
    headers?: object;
    links?: object;
    content?: Record<string, TRouteMediaType>;
    [extension: `x-${string}`]: unknown;
} | {
    $ref: string;
};
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `IAuthService`

*interface*

The service behind the auth controller routes. `getUserInformation` and `refreshToken` are optional. The type parameters set each route's request and response types.

```ts
export interface IAuthService<E extends Env = Env, SIRQ extends TSignInRequest = TSignInRequest, SIRS = Record<string, unknown>, SURQ extends TSignUpRequest = TSignUpRequest, SURS = Record<string, unknown>, CPRQ extends TChangePasswordRequest = TChangePasswordRequest, CPRS = Record<string, unknown>, UIRQ = Record<string, unknown>, UIRS = Record<string, unknown>, RTRS = Record<string, unknown>> {
    signIn(context: TContext<E>, opts: SIRQ): Promise<SIRS>;
    signUp(context: TContext<E>, opts: SURQ): Promise<SURS>;
    changePassword(context: TContext<E>, opts: CPRQ): Promise<CPRS>;
    getUserInformation?(context: TContext<E>, opts: UIRQ): Promise<UIRS>;
    refreshToken?(context: TContext<E>): Promise<RTRS>;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/strategy.ts`

## `IAuthUser`

*interface*

The authenticated identity a strategy returns and the request context stores. Carries at least `userId`.

```ts
export interface IAuthUser {
    userId: IdType;
    [extra: string | symbol]: unknown;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/strategy.ts`

## `IBaseMiddlewareOptions`

*interface*

Options shared by every configurable middleware. Extra keys are allowed.

```ts
export interface IBaseMiddlewareOptions {
    /**
     * Only `false` switches the middleware off.
     *
     * @default true
     */
    enable?: boolean;
    path?: string;
    [extra: string | symbol]: unknown;
}
```

Source: `packages/kernel/src/base/applications/common/types/middlewares.ts`

## `IBindRouteOptions`

*interface*

Fluent binding for two-step route registration: bindRoute({ configs }).to({ handler }).

```ts
export interface IBindRouteOptions<RouteConfig extends IAuthRouteConfig, RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/'> {
    configs: RouteConfig;
    to: (opts: {
        handler: (context: TContextOf<RouteConfig, RouteEnv>) => ValueOrPromise<Response | TypedResponse<unknown>>;
    }) => IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
}
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `IBodyLimitOptions`

*interface*

Options of the body limit middleware the framework installs right after the request id. `maxSize` is in bytes.

Unset (no `bodyLimit` key), every route gets `BodyLimits.DEFAULT_MAX_SIZE`, 5 MiB. Configured, it replaces
the default (with a `path`, only the routes under it are limited). `enable: false` removes the limit. A route
that takes larger bodies puts `BodyLimits.route({ maxSize })` in its `middleware`.

```ts
export interface IBodyLimitOptions extends IBaseMiddlewareOptions {
    maxSize: number;
    onError?: (c: Context) => Response | Promise<Response>;
}
```

Source: `packages/kernel/src/base/applications/common/types/middlewares.ts`

## `IBootSequenceStep`

*interface*

One named step of a boot sequence. `name` is what `BootSequence.insertAfter` targets; `run` is the work done when the sequence reaches the step.

```ts
export interface IBootSequenceStep {
    name: string;
    run: () => ValueOrPromise<void>;
}
```

Source: `packages/kernel/src/base/applications/boot-sequence.ts`

## `ICasbinEnforcerCachedRedis`

*interface*

Redis cache for a Casbin enforcer's per-user policy lines. `keyFn` returns the cache key for a user and must not return an empty string.

```ts
export interface ICasbinEnforcerCachedRedis {
    driver: typeof CasbinEnforcerCachedDrivers.REDIS;
    options: {
        connection: IRedisHelper;
        expiresIn: number;
        keyFn: (opts: {
            user: IAuthorizationUser;
        }) => ValueOrPromise<string>;
    };
}
```

Source: `packages/kernel/src/base/auth/authorize/common/types/enforcer.ts`

## `ICasbinEnforcerOptions`

*interface*

Options of a Casbin enforcer: model source, policy cache, optional adapter, domain matching and enforcer pool sizing.

```ts
export interface ICasbinEnforcerOptions<E extends Env = Env, TAction = string, TResource = string, TAdapter = Adapter> {
    model: {
        driver: typeof CasbinEnforcerModelDrivers.FILE;
        definition: string;
    } | {
        driver: typeof CasbinEnforcerModelDrivers.TEXT;
        definition: string;
    };
    cached: {
        use: false;
    } | (ICasbinEnforcerCachedRedis & {
        use: true;
    });
    adapter?: TAdapter;
    domainMatching?: {
        roleDefinition: string;
        fn: TCasbinDomainMatchingFunction;
    };
    normalizePayloadFn?(opts: {
        user: IAuthUser;
        action: TAction;
        resource: TResource;
        context: TContext<E, string>;
    }): {
        subject: string;
        resource: string;
        action: string;
        domain?: string;
    };
    /**
     * Domain-scoped RBAC model: requests become 4-token `(subject, domain, object, action)` and the enforcer registers the domain matcher (`keyMatch` on `g`) + resource matcher (`objectMatch`). A role assignment or grant declared at a parent domain (via a `g3` policy line, e.g. `Merchant_7 -> Organizer_3`) applies to every child domain - the adapter is what decides whether those edges exist.
     *
     * @default false
     */
    isScoped?: boolean;
    /**
     * Number of pooled enforcers (each request enforces on its own).
     *
     * @default 16
     */
    poolSize?: number;
    /**
     * Max ms to wait for a free pooled enforcer before failing closed.
     *
     * @default 5000
     */
    poolAcquireTimeoutMs?: number;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/types/enforcer.ts`

## `ICasbinRules`

*interface*

What CasbinAuthorizationEnforcer.buildRules returns and evaluate consumes.

```ts
export interface ICasbinRules {
    user: IAuthorizationUser;
    lines: string[];
}
```

Source: `packages/kernel/src/base/auth/authorize/common/types/enforcer.ts`

## `IComponentMixin`

*interface*

Mixin contract for registering components on the application.

```ts
export interface IComponentMixin {
    component<Base extends BaseComponent<Options>, Options extends object = {}>(target: TClass<Base>, opts?: TMixinOpts<Options>): Binding<Base>;
    registerComponents(): ValueOrPromise<void>;
}
```

Source: `packages/kernel/src/base/mixins/common/types.ts`

## `ICompressOptions`

*interface*

Options of the compress middleware. Typed only: the framework does not install it.

```ts
export interface ICompressOptions extends IBaseMiddlewareOptions {
    encoding: TCompressEncoding;
    threshold?: number;
}
```

Source: `packages/kernel/src/base/applications/common/types/middlewares.ts`

## `IConditionalArtifactIndex`

*interface*

An index (or nested indexes) registered only when `when` answers true - the run-mode gate: a worker keeps its controllers out of the container instead of mounting routes no security step guards. Extends the never-typed kind fields so code that destructures kinds from a non-array input still compiles against the union.

```ts
export interface IConditionalArtifactIndex extends Partial<Record<keyof IArtifactIndex, never>> {
    when: TArtifactCondition;
    index: TArtifactIndexInput;
}
```

Source: `packages/kernel/src/base/applications/common/types/artifacts.ts`

## `IConfiguration`

*interface*

Marker contract of a configuration artifact; `BaseConfiguration` implements it.

```ts
export interface IConfiguration {
}
```

Source: `packages/kernel/src/base/configurations/common/types.ts`

## `IConfigurationMixin`

*interface*

Mixin contract for registering configuration classes on the application.

```ts
export interface IConfigurationMixin {
    configuration<Base extends BaseConfiguration<Options>, Options extends object = {}>(target: TClass<Base>, opts?: TMixinOpts<Options>): Binding<Base>;
    registerConfigurations(): ValueOrPromise<void>;
}
```

Source: `packages/kernel/src/base/mixins/common/types.ts`

## `IController`

*interface*

Base controller interface defining route registration and configuration contract.

```ts
export interface IController<RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ConfigurableOptions extends object = {}> extends IConfigurable<ConfigurableOptions, OpenAPIHono<RouteEnv, RouteSchema, BasePath>> {
    router: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
    bindRoute<RouteConfig extends IAuthRouteConfig>(opts: {
        configs: RouteConfig;
    }): IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
    /** Defines and registers a route with its handler in a single call. */
    defineRoute<RouteConfig extends IAuthRouteConfig>(opts: {
        configs: RouteConfig;
        handler: (context: TContextOf<RouteConfig, RouteEnv>) => ValueOrPromise<Response | TypedResponse<unknown>>;
        hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
    }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
}
```

Source: `packages/kernel/src/base/controllers/common/types/controller.ts`

## `IControllerMixin`

*interface*

Mixin contract for registering controllers on the application.

```ts
export interface IControllerMixin {
    controller<Base>(target: TClass<Base>, opts?: TMixinOpts): Binding<Base>;
    registerControllers(): ValueOrPromise<void>;
}
```

Source: `packages/kernel/src/base/mixins/common/types.ts`

## `IControllerOptions`

*interface*

Configuration options for controller instantiation.

```ts
export interface IControllerOptions {
    scope: string;
    /** Falls back to @controller decorator path if not provided. */
    path?: string;
    /**
     * When true, /users and /users/ are different routes.
     *
     * @default true
     */
    isStrict?: boolean;
}
```

Source: `packages/kernel/src/base/controllers/common/types/controller.ts`

## `ICORSOptions`

*interface*

Options of the CORS middleware the framework installs first. `origin` is required.

```ts
export interface ICORSOptions extends IBaseMiddlewareOptions {
    origin: TOrigin;
    allowMethods?: string[] | ((origin: string, c: Context) => Promise<string[]> | string[]);
    allowHeaders?: string[];
    maxAge?: number;
    credentials?: boolean;
    exposeHeaders?: string[];
}
```

Source: `packages/kernel/src/base/applications/common/types/middlewares.ts`

## `ICrudControllerOptions`

*interface*

Configuration options for creating a CRUD controller via CrudControllerFactory.build.

```ts
export interface ICrudControllerOptions<Repository extends TCrudRepositoryClass = TCrudRepositoryClass> {
    /** The repository class; its name is the binding key and its `@repository` model drives the schemas. */
    repository: Repository;
    isStrict?: {
        path?: boolean;
        requestSchema?: boolean;
    };
    /** Authentication config applied to all routes (unless overridden per-route). */
    authenticate?: {
        strategies?: TAuthStrategy[];
        mode?: TAuthMode;
    };
    /** Authorization config applied to all routes (unless overridden per-route). */
    authorize?: IAuthorizationSpec | IAuthorizationSpec[];
    /** The routes the controller has: a route exists only when listed. */
    routes?: TCrudRoutes<InstanceType<Repository>>;
}
```

Source: `packages/kernel/src/base/controllers/common/types/controller.ts`

## `ICSRFOptions`

*interface*

Options of the CSRF middleware. Typed only: the framework does not install it.

```ts
export interface ICSRFOptions extends IBaseMiddlewareOptions {
    origin?: string | string[] | TIsAllowedOriginHandler;
    secFetchSite?: TSecFetchSite | TSecFetchSite[] | TIsAllowedSecFetchSiteHandler;
}
```

Source: `packages/kernel/src/base/applications/common/types/middlewares.ts`

## `ICustomizableRoutes`

*interface*

Per-route configuration for CRUD controller endpoints (auth, request, response).

```ts
export interface ICustomizableRoutes<RouteConfig extends TCustomizableRouteConfig = TCustomizableRouteConfig> {
    count?: RouteConfig;
    find?: RouteConfig;
    findById?: RouteConfig;
    findOne?: RouteConfig;
    create?: RouteConfig;
    updateById?: RouteConfig;
    updateBy?: RouteConfig;
    deleteById?: RouteConfig;
    deleteBy?: RouteConfig;
    restoreById?: RouteConfig;
    restoreBy?: RouteConfig;
}
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `IDataSourceCapabilities`

*interface*

What a datasource supports. `transactions` tells whether it can open transactions.

```ts
export interface IDataSourceCapabilities {
    transactions: boolean;
}
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `IDataSourceMetadata`

*interface*

Metadata accepted by `@datasource`.

```ts
export interface IDataSourceMetadata extends IArtifactRegistrationOptions {
    driver?: TDataSourceDriverClass;
    /** When the datasource opens. `{ on: 'first-use' }` leaves it closed at start and opens it at the first call that needs it. */
    open?: IDataSourceOpenOptions;
    /**
     * `false` stops model schema discovery for the datasource.
     *
     * @default true
     */
    autoDiscovery?: boolean;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/persistence.ts`

## `IDataSourceOpening`

*interface*

What `configure()` is given to do its database work while the datasource is opening: the connector, the client and a
transaction, through the datasource's own ungated internals. Only `configure()` receives it, so nothing outside can use it
and every other caller still waits for the open to finish. Generic over the datasource's connector, client and
transaction types, so `opening.getClient()` of a PGlite datasource is a `PGlite`.

Inside the open of a datasource that opens on first use, the public `getConnector()`, `getClient()` and
`beginTransaction()` are gated (they wait for the open, which waits for `configure()`), and a repository cannot be used:
use these handles instead.

```ts
export interface IDataSourceOpening<TConnector = unknown, Client = unknown, TTransaction extends ITransaction = ITransaction, TTransactionOptions extends ITransactionOptions = ITransactionOptions> {
    getConnector(): TConnector;
    getClient(): Client;
    beginTransaction(opts?: TTransactionOptions): Promise<TTransaction>;
}
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `IDataSourceOpenOptions`

*interface*

The `open` option of `@datasource`.

```ts
export interface IDataSourceOpenOptions {
    /**
     * `start`: `configure()` runs when the application starts, and `listen()` waits for it. `first-use`: the application
     * starts without opening the datasource; the first call that needs it runs `configure()` once, and every call that
     * arrives meanwhile waits for that one open. A failed open rejects every waiting call, leaves nothing half-open, and is
     * tried again by the next call.
     *
     * @default 'start'
     */
    on?: TDataSourceOpenMode;
    /**
     * `first-use` only: how long the open may take (ms) before every waiting call is rejected with a named error and the
     * attempt is abandoned. An abandoned `configure()` that finishes later is closed and never published, and the next call
     * waits until it has settled before trying again. `0` waits for ever.
     *
     * @default 60000
     */
    timeoutMs?: number;
}
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `IDefineRouteOptions`

*interface*

Registered route with its configuration and router instance.

```ts
export interface IDefineRouteOptions<RouteConfig extends IAuthRouteConfig, RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/'> {
    /**
     * The config given, typed as given; at run time it is what the framework registered: without `authenticate` and
     * `authorize`, with the middleware, tags and security it added.
     */
    configs: RouteConfig;
    route: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
}
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `IDomainEvent`

*interface*

One occurrence of a named domain event, decoupled from whatever publishes or handles it.

```ts
export interface IDomainEvent<TPayload = unknown> {
    name: string;
    payload: TPayload;
    occurredAt: string;
    traceId?: string;
}
```

Source: `packages/kernel/src/base/events/common/types.ts`

## `IdSchemaTypes`

*class*

The path-param id shape an entity family resolves to (`AbstractEntity.getIdType()`).

```ts
export declare class IdSchemaTypes extends ConstClass {
    static readonly NUMBER = "number";
    static readonly STRING = "string";
}
```

Source: `packages/kernel/src/base/models/common/constants.ts`

## `IdType`

*type*

Any id type an entity can use: number, string or bigint.

```ts
export type IdType = NumberIdType | StringIdType | BigIntIdType;
```

Source: `packages/kernel/src/base/models/common/types/id.ts`

## `IEntityStatics`

*interface*

Static members an entity class carries: its `schema` and its `relations` (value or resolver).

```ts
export interface IEntityStatics {
    schema?: unknown;
    relations?: TValueOrResolver<Array<unknown>>;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/model.ts`

## `IEventHandler`

*interface*

Handles one `IDomainEvent`. Implemented by whatever is bound into the container under
`register`'s `{ type: EventHandlerTypes.BINDING_KEY, key }` form - see `TEventHandlerReference`
for the `FUNCTION` form, which does not implement this interface and does not share its rebind
property.

MUST be idempotent. The bus retries a failed handler, so delivery is at-least-once: one that
half-succeeds then throws runs again from the top, re-applying whatever already landed. Three
shapes break, and only the first looks dangerous: a cumulative write (`count = count + 1`, or a
rolling average, which drifts toward the resampled value); several writes batched under one
`Promise.all`, where any failure re-runs the ones that succeeded; and a bare INSERT of a log or
audit row, which simply gains a duplicate - corrupting the record used to diagnose the retry.

Resolved from the container by binding key at dispatch time, never captured as a direct reference,
so rebinding the key takes effect on the next attempt - including one already in flight. A
`FUNCTION`-form handler does NOT have this property: `fn` is a captured closure, so every attempt
in a long retry window calls the exact function registered at startup.

```ts
export interface IEventHandler<TEvent extends IDomainEvent = IDomainEvent> {
    handle(opts: {
        event: TEvent;
    }): ValueOrPromise<void>;
}
```

Source: `packages/kernel/src/base/events/common/types.ts`

## `IEventHandlerBindingKeyReference`

*interface*

`register`'s binding-key handler shape: resolved from the container by `key` on every retry attempt.

```ts
export interface IEventHandlerBindingKeyReference {
    type: typeof EventHandlerTypes.BINDING_KEY;
    key: TBindingKey<IEventHandler>;
}
```

Source: `packages/kernel/src/base/events/common/types.ts`

## `IEventHandlerFunctionReference`

*interface*

`register`'s function handler shape: `fn` is invoked directly, captured as a closure - see `TEventHandlerReference`.

```ts
export interface IEventHandlerFunctionReference<TPayload = unknown> {
    type: typeof EventHandlerTypes.FUNCTION;
    fn: TEventHandlerFunction<TPayload>;
}
```

Source: `packages/kernel/src/base/events/common/types.ts`

## `IEventHandlerRetryOptions`

*interface*

Per-registration retry override for `EventBus.register`. Both fields must be positive integers,
and are bounded by `EventDispatchRetry.MAX_ATTEMPTS_CEILING` / `MAX_TOTAL_WINDOW_MS` - a value
outside either throws at `register()`, never clamps.

```ts
export interface IEventHandlerRetryOptions {
    /**
     * Attempts per dispatch.
     *
     * @default 3
     */
    maxAttempts?: number;
    /**
     * First backoff delay in ms; exponential growth is computed from it.
     *
     * @default 100
     */
    baseDelayMs?: number;
}
```

Source: `packages/kernel/src/base/events/common/types.ts`

## `IExtraOptions`

*interface*

Extended options for repository operations with transaction, logging, and default filter bypass.

```ts
export interface IExtraOptions extends IWithTransaction {
    log?: TRepositoryLogOptions;
    /** If true, bypass the default filter configured in model settings (e.g., soft delete). */
    shouldSkipDefaultFilter?: boolean;
    /** Row-level locking. Requires transaction. Incompatible with include/fields (Query API). */
    lock?: TLockOptions;
}
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `IGrpcControllerMetadata`

*interface*

Metadata of a gRPC controller; `service` is the gRPC service definition it implements.

```ts
export interface IGrpcControllerMetadata<ServiceType = unknown> extends IBaseControllerMetadata {
    transport: typeof ControllerTransports.GRPC;
    service: ServiceType;
}

interface IBaseControllerMetadata extends IArtifactRegistrationOptions {
    path: string;
    tags?: string[];
    description?: string;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/controller.ts`

## `IJWKSIssuerOptions`

*interface*

Options of a JWKS issuer, which signs tokens with its own key pair. `keys.private` and `keys.public` hold content or a file path according to `keys.driver`. `rest.path` sets where the public key set is served.

```ts
export interface IJWKSIssuerOptions {
    mode: typeof JWKSModes.ISSUER;
    algorithm: TJWKSAlgorithm;
    rest?: {
        /** @default '/certs' */
        path: string;
    };
    keys: {
        driver: TJWKSKeyDriver;
        format: TJWKSKeyFormat;
        private: string;
        public: string;
    };
    kid: string;
    getTokenExpiresFn: TGetTokenExpiresFn;
    /** The `iss` and `aud` stamped on every issued token and required on every verified one. A configured value WINS over one supplied in the payload. */
    claims: IJWTClaimsOptions;
    /**
     * The AES algorithm of payload encryption, used when `applicationSecret` is set.
     *
     * @default 'aes-256-cbc'
     */
    aesAlgorithm?: AESAlgorithmType;
    applicationSecret?: string;
    fieldCodecs?: IPayloadFieldCodec[];
    /** Further checks applied on verify, beside `claims` and the algorithm pin. */
    verify?: IJWTVerifyOptions;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

## `IJWKSVerifierOptions`

*interface*

Options of a JWKS verifier, which checks tokens against the key set served at `jwksUrl`.

```ts
export interface IJWKSVerifierOptions {
    mode: typeof JWKSModes.VERIFIER;
    jwksUrl: string;
    /** The `iss` and `aud` required on every verified token. */
    claims: IJWTClaimsOptions;
    /**
     * Where the key set may be fetched from. `trusted` lists the exact `http:` origins that may serve it, written as the
     * URL parser writes an origin (`http://identity-service`, `http://10.0.0.5:8080`, `http://[fd00::1]:8443`); each port
     * is its own entry. A JWKS URL is `https:` unless its host is loopback (`localhost`, `127.0.0.0/8`, `::1`) or its
     * origin is listed. An entry that is not exactly an origin refuses the boot. Unset means `https:` or loopback only.
     */
    jwks?: {
        trusted?: TTrustedOrigin[];
    };
    /**
     * How long the fetched key set stays cached, in ms (12 hours).
     *
     * @default 43_200_000
     */
    cacheTtlMs?: number;
    /**
     * Minimum wait between refetches of the key set, in ms (30 seconds).
     *
     * @default 30_000
     */
    cooldownMs?: number;
    /**
     * The AES algorithm of payload encryption, used when `applicationSecret` is set.
     *
     * @default 'aes-256-cbc'
     */
    aesAlgorithm?: AESAlgorithmType;
    applicationSecret?: string;
    fieldCodecs?: IPayloadFieldCodec[];
    /** Further checks applied on verify, beside `claims`. `algorithms` is required. */
    verify: IJWKSVerifierVerifyOptions;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

## `IJWKSVerifierVerifyOptions`

*interface*

The verify checks of a JWKS verifier: `algorithms` is required, because the verifier cannot know what the issuer signs with.

```ts
export interface IJWKSVerifierVerifyOptions extends IJWTVerifyOptions {
    /** The JWS `alg` values accepted, for example `['RS256']`. At least one. */
    algorithms: string[];
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

## `IJWSTokenServiceOptions`

*interface*

Options of the JWS token service, which signs with the shared `jwtSecret`.

`getTokenExpiresFn` is required. AES payload encryption is active only when `applicationSecret` is set.

```ts
export interface IJWSTokenServiceOptions {
    /**
     * The JWS `alg` header.
     *
     * @default 'HS256'
     */
    headerAlgorithm?: string;
    jwtSecret: string;
    getTokenExpiresFn: TGetTokenExpiresFn;
    /** The `iss` and `aud` stamped on every issued token and required on every verified one. A configured value WINS over one supplied in the payload. */
    claims: IJWTClaimsOptions;
    /**
     * The AES algorithm of payload encryption, used when `applicationSecret` is set.
     *
     * @default 'aes-256-cbc'
     */
    aesAlgorithm?: AESAlgorithmType;
    applicationSecret?: string;
    fieldCodecs?: IPayloadFieldCodec[];
    /** Further checks applied on verify, beside `claims` and the algorithm pin. */
    verify?: IJWTVerifyOptions;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

## `IJWTClaimsOptions`

*interface*

The `iss` and, optionally, the `aud` of a service: stamped on every token it signs and REQUIRED on every token it
verifies. `issuer` is required, `audience` is optional, and no other key is accepted.

Without them a token signed with the same key for another purpose (a password-reset or an invite
token that carries a user id) would authenticate a request, and in a fleet where every verifier
points at the same issuer JWKS a token minted for one service would be accepted by every other.
`audience` is what makes "this token was meant for me" a cryptographic statement rather than a
convention.

```ts
export interface IJWTClaimsOptions {
    /** The `iss` stamped on every issued token and required on every verified one. */
    issuer: string;
    /**
     * The `aud` stamped on every issued token and required on every verified one. Optional: without it no `aud` is
     * stamped and none is checked, so a token with or without one verifies. Set, it must be a non-empty string or a
     * non-empty list of them. Matching is jose's OVERLAP semantics, not equality: a token carrying `['a','b']`
     * satisfies `audience: 'a'`. Enforce single-valued audiences at issue time if that matters.
     */
    audience?: string | string[];
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

## `IJWTIssueClaims`

*interface*

Per-token registered claims, passed to `generate()`.

This is the supported way to vary `aud` or `sub` per token. Putting them on the payload used to
work by accident - `iss`, `aud`, `sub` and `jti` ride through the AES envelope in the clear
because they are standard JWT fields - but a claim the payload can set is a claim any caller who
shapes the payload can forge. These win over the configured {@link IJWTClaimsOptions}; the payload never does.

```ts
export interface IJWTIssueClaims {
    issuer?: string;
    audience?: string | string[];
    subject?: string;
    jwtId?: string;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

## `IJWTTokenPayload`

*interface*

What a token carries. `roles` may be absent: `generate` signs a payload without it as is, `verify`
returns it without `roles`, and authorization reads its roles as none. Check it before you read it.

```ts
export interface IJWTTokenPayload extends JWTPayload, IAuthUser {
    userId: IdType;
    roles?: TJWTTokenRole[];
    clientId?: string;
    provider?: string;
    email?: string;
    name?: string;
    [extra: string | symbol]: unknown;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

## `IJWTVerifyOptions`

*interface*

The other claim checks applied when VERIFYING a JWT. Field names and types mirror jose's
`JWTVerifyOptions`, so this is a pass-through with no translation layer. `issuer` and `audience`
are not here: they are the required {@link IJWTClaimsOptions}.

Every field is optional and unset by default: nothing is checked beyond the signature, the time
claims, the `claims` and the algorithm pin.

```ts
export interface IJWTVerifyOptions {
    /** Expected `sub`. Setting it makes the claim required. */
    subject?: string;
    /** Clock skew tolerance: seconds, or a jose duration string such as `'30 seconds'`. */
    clockTolerance?: string | number;
    /** Accepted JWS `alg` header values. Unset pins the one algorithm the service signs with: `headerAlgorithm` (`HS256` by default) of the JWS service, `algorithm` of a JWKS issuer. A JWKS verifier cannot know it, so it requires this ({@link IJWKSVerifierVerifyOptions}). */
    algorithms?: string[];
    /** Caps elapsed time since `iat`. The real replay window for a short-lived assertion, independent of whatever `exp` the caller chose to stamp. */
    maxTokenAge?: string | number;
    /** Expected JWS `typ` header. The standard defence against cross-token-type confusion when one JWKS serves more than one kind of token. */
    typ?: string;
    /** Claims that must be present, beyond those implied by the checks above. */
    requiredClaims?: string[];
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

## `IMiddlewareConfigs`

*interface*

The `configs.middlewares` shape: which framework middleware to switch off or configure. Extra keys are allowed.

```ts
export interface IMiddlewareConfigs {
    requestId?: IRequestIdOptions;
    /** Typed only: the framework installs no compress middleware. Wire it in `setupMiddlewares()`. */
    compress?: ICompressOptions;
    /** Installed first, before the request id and the body limit, so early framework responses carry its headers. */
    cors?: ICORSOptions;
    /** Typed only: the framework installs no csrf middleware. Wire it in `setupMiddlewares()`. */
    csrf?: ICSRFOptions;
    /** Installed right after the request id, ahead of every other middleware, so none of them reads a body over it. */
    bodyLimit?: IBodyLimitOptions;
    /** Typed only: the framework installs no ip restriction. Wire it in `setupMiddlewares()`. */
    ipRestriction?: IBaseMiddlewareOptions & IIPRestrictionRules;
    [extra: string | symbol]: unknown;
}
```

Source: `packages/kernel/src/base/applications/common/types/middlewares.ts`

## `IModelAccessSettings`

*interface*

Row access for `@model` settings.access - resolved per query, so it can depend on the current
request (tenant, org, membership). Framework-internal escape hatches aside, nothing short of
removing this setting from the model turns scoping off.

**Example**
```typescript
import { model, ScopeWriteGuards } from '@venizia/ignis';
import { ModelFactory } from '@venizia/ignis-connectors/postgres';
import { pgTable, serial, text } from 'drizzle-orm/pg-core';

const productTable = pgTable('Product', { id: serial('id').primaryKey(), merchantId: text('merchant_id') });

export @model({ settings: { access: {
  resolve: () => ({ merchantId: 'm-1' }),
  write: { mode: ScopeWriteGuards.ASSIGN },
} } })
class Product extends ModelFactory.defineEntity({ table: productTable }) {}
```

```ts
export interface IModelAccessSettings {
    /** A model declares a resolver or a `through`, never both. */
    through?: never;
    /**
     * Returns the scope `where`; `ScopeFilters.UNRESTRICTED` to apply no scope for THIS call (an
     * internal operator, a caller the application has decided sees everything); or null/undefined
     * when this caller's scope cannot be determined at all.
     *
     * Receives `{ operation }`: the one concrete operation the call performs (`ScopeOperations.READ`,
     * `CREATE`, `UPDATE` or `DELETE`, never a group), so one function can answer a wide scope for a
     * read and a narrow one for a write. A read, and an included relation, pass `READ`; a create passes
     * `CREATE`; an update passes `UPDATE` for the payload check and for choosing the rows to update; a
     * delete, a soft delete included, passes `DELETE` for both; a restore passes `UPDATE`. A read with a
     * row `lock` passes `READ`. A resolver that takes no argument keeps working. An `or` over different
     * columns is still refused on a write, so return the narrow scope for a write operation.
     */
    resolve: (context: {
        operation: TScopeOperation;
    }) => TNullable<TWhere> | typeof ScopeFilters.UNRESTRICTED;
    /**
     * What `applyScopeFilter` does when `resolve()` returns null/undefined - no request context, no
     * tenant, a background job. With `deny`, an unresolved scope matches zero rows, never
     * every row. `allow` is an explicit, reviewed opt-out for migrations and background jobs, declared
     * per MODEL - it cannot express a per-USER bypass; use `ScopeFilters.UNRESTRICTED` for that.
     *
     * @default 'deny'
     */
    onMissing?: TScopeFilterMissingBehavior;
    /**
     * The property names the write guard checks. Optional: with none declared the guard checks every
     * column the resolved scope constrains. When declared, each name must exist on the model (checked
     * at boot), and a resolved scope that constrains any other column is refused as unverifiable.
     */
    columns?: string[];
    /** What a restricted caller may write to the scope columns. See {@link IModelAccessWriteSettings}. */
    write?: IModelAccessWriteSettings;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/model.ts`

## `IModelAccessThroughSettings`

*interface*

Row access for a child model that has no scope columns of its own: it inherits the scope of the parent a `one`
relation points at. A parent that resolves no scope always denies the child: `onMissing` is not offered here, because
`'allow'` would show the child's rows of every tenant while the parent shows none.

**Example**
```typescript
import { model, ScopeThrough } from '@venizia/ignis';
import { ModelFactory, one } from '@venizia/ignis-connectors/postgres';
import { integer, pgTable, serial } from 'drizzle-orm/pg-core';
const productTable = pgTable('Product', { id: serial('id').primaryKey() });
const variantTable = pgTable('Variant', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => productTable.id),
});
const VariantBase = ModelFactory.defineEntity({ table: variantTable, relations: () => ({ product: one(productTable) }) });
export @model({ settings: { access: { through: ScopeThrough.of({ entity: VariantBase, relation: 'product' }) } } })
class Variant extends VariantBase {}
```

**Example**
```typescript
// A hand-written entity declares the same relation by hand.
import { ScopeThrough } from '@venizia/ignis';
import { BaseEntity, one, RelationDeclarations } from '@venizia/ignis-connectors/postgres';
import { integer, pgTable, serial } from 'drizzle-orm/pg-core';
const productTable = pgTable('Product', { id: serial('id').primaryKey() });
const variantTable = pgTable('Variant', { id: serial('id').primaryKey(), productId: integer('product_id').references(() => productTable.id) });
const relations = { product: one(productTable) };
class VariantBase extends BaseEntity<typeof variantTable> {
  static override schema = variantTable;
  static readonly relationDefinitions = relations;
  static override relations = () => RelationDeclarations.toRelationConfigs({ relations });
}
const through = ScopeThrough.of({ entity: VariantBase, relation: 'product' });
```

```ts
export interface IModelAccessThroughSettings {
    through: ScopeThrough;
    onMissing?: never;
    resolve?: never;
    columns?: never;
    write?: never;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/model.ts`
