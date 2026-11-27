---
title: "@venizia/ignis-kernel (1 of 9)"
description: "Every export of @venizia/ignis-kernel, from the built declarations (generated)."
---

# `@venizia/ignis-kernel (1 of 9)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 1 of 9 of [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel).

## `AbstractApplication`

*class*

Runtime-neutral base of every application: a DI container that holds the configs, the post-start and post-stop hooks and the core bindings. Server hosting lives in the `@venizia/ignis` subclass.

```ts
export declare abstract class AbstractApplication extends Container {
    protected configs: IApplicationConfigs;
    protected projectRoot: string;
    private postStartHooks;
    private postStopHooks;
    constructor(opts: {
        scope: string;
        config: IApplicationConfigs;
    });
    abstract getAppInfo(): ValueOrPromise<IApplicationInfo>;
    abstract preConfigure(): ValueOrPromise<void>;
    /**
     * Runs after every registration sweep (datasources, components, controllers) has already
     * completed. Registering a new one here is not auto-registered and silently does nothing -
     * call `configure()` manually instead.
     */
    abstract postConfigure(): ValueOrPromise<void>;
    abstract staticConfigure(): void;
    abstract setupMiddlewares(opts?: {
        middlewares?: Record<string | symbol, unknown>;
    }): ValueOrPromise<void>;
    abstract initialize(): Promise<void>;
    protected getDefaultAsyncContextEnabled(): boolean;
    getProjectConfigs(): IApplicationConfigs;
    getProjectRoot(): string;
    registerPostStartHook(opts: {
        identifier: string;
        hook: () => ValueOrPromise<void>;
    }): void;
    /** Runs every post-start hook in isolation - the server is already listening, so a throwing hook must not cancel the ones behind it; failures are collected and reported as one error at the end. */
    protected executePostStartHooks(): Promise<void>;
    registerPostStopHook(opts: {
        identifier: string;
        hook: () => ValueOrPromise<void>;
    }): void;
    protected executePostStopHooks(): Promise<void>;
    protected registerCoreBindings(): void;
    init(): void;
}
```

Source: `packages/kernel/src/base/applications/abstract.ts`

## `AbstractAuthRegistry`

*class*

Base of the auth registries. Registers classes under a name as singletons in a container and resolves them by name. Subclasses supply the binding key prefix.

```ts
export declare abstract class AbstractAuthRegistry<TItem> extends BaseHelper {
    protected descriptors: Map<string, TRegistryDescriptor<TItem>>;
    constructor(opts: {
        scope: string;
    });
    protected abstract getBindingPrefix(): string;
    getKey(opts: {
        name: string;
    }): TBindingKey;
    /**
     * Whether a name resolves. The registry is the only source of truth for that: the strategy type is
     * open (`TAuthStrategy` accepts any string), so nothing upstream can tell a registered name from a
     * typo. `AuthenticateStrategy.isValid` knows the two built-ins only and must not be used here.
     */
    has(opts: {
        name: string;
    }): boolean;
    /** Every registered name, for a caller building its own startup check or an error message. */
    getNames(): string[];
    getDefaultName(): string;
    protected registerDescriptor(opts: {
        container: Container;
        target: TClass<TItem>;
        name: string;
    }): void;
    reset(): void;
    protected resolveDescriptor(opts: {
        name: string;
    }): TItem;
}
```

Source: `packages/kernel/src/base/auth/base/abstract-auth-registry.ts`

## `AbstractCrudController`

*class*

Base tier of a generated CRUD controller - the repository handle; the response helpers (`respond`, `setListHeaders`) live on BaseRestController so hand-written controllers share them. Read and write verbs are layered on by ReadableCrudController / PersistableCrudController.

```ts
export declare abstract class AbstractCrudController<TEntity extends AbstractEntity<TAnyObjectSchema> = AbstractEntity<TAnyObjectSchema>, RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ConfigurableOptions extends object = {}, TDataObject extends object = TEntityDataObject<TEntity>, TPersistObject extends object = TEntityPersistObject<TEntity>> extends BaseRestController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions> {
    repository: AbstractRepository<TDataObject, TPersistObject>;
    constructor(opts: {
        scope: string;
        isStrict?: boolean;
        repository: AbstractRepository<TDataObject, TPersistObject>;
        definitions: Record<string, IAuthRouteConfig>;
    });
    /**
     * Refuses (400) a filter the client sent when it names a field the model hides (`where`, `order`, an include scope).
     * The repository answers it; a stand-in that does not extend `AbstractRepository` has no hidden fields to hold the filter to.
     */
    assertRequestFilter(opts: {
        filter?: {
            where?: unknown;
            order?: unknown;
            include?: unknown;
        };
    }): void;
    /** 400 when a bulk operation is missing its `where` filter; undefined when it is present. */
    bulkWhereError(opts: {
        context: TRouteContext<RouteEnv>;
        where?: object;
    }): import("../../index.js").TJsonResponse<unknown, 400> | undefined;
    /** Bulk `where` from the query or the JSON body (long id lists outgrow a URL). Both, or none, is a 400. */
    resolveBulkWhere<WhereType extends object>(opts: {
        context: TRouteContext<RouteEnv>;
        where?: {
            fromQuery?: WhereType;
            fromBody?: WhereType;
        };
    }): TBulkWhereResolution<WhereType>;
}

type TBulkWhereResolution<WhereType> = {
    where: WhereType;
    error?: undefined;
} | {
    where?: undefined;
    error: Response;
};
```

Source: `packages/kernel/src/base/controllers/factory/crud/abstract.ts`

## `AbstractRestController`

*class*

Abstract base class for all REST controllers, providing route registration and auth middleware integration.

```ts
export declare abstract class AbstractRestController<RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ConfigurableOptions extends object = {}, Definitions extends Record<string, IAuthRouteConfig> = Record<string, IAuthRouteConfig>> extends BaseHelper implements IController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions> {
    isConfigured: boolean;
    router: OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
    path: string;
    definitions: Definitions;
    constructor(opts: IControllerOptions);
    /** Returns the OpenAPIHono router instance for this controller. */
    getRouter(): OpenAPIHono<RouteEnv, RouteSchema, BasePath>;
    /** Registers decorator-defined routes from the metadata registry; `paths` selects them by shape - see the two-phase call in {@link configure}. */
    registerRoutesFromRegistry(opts?: {
        paths?: TRoutePathScope;
    }): void;
    /** Configures the controller by binding all routes and registering decorator-based routes. Idempotent. */
    configure(opts?: ConfigurableOptions): Promise<OpenAPIHono<RouteEnv, RouteSchema, BasePath>>;
    /** @internal Builds auth + custom middlewares and security specs from route config. */
    buildRouteMiddlewares<RouteConfig extends IAuthRouteConfig>(opts: {
        configs: RouteConfig;
    }): {
        restConfig: Omit<RouteConfig, "authenticate" | "authorize">;
        security: {
            [x: string]: never[];
        }[];
        mws: import("hono").MiddlewareHandler<Env>[];
    };
    /** Processes route config, injecting auth middleware and OpenAPI security specs. */
    getRouteConfigs<RouteConfig extends IAuthRouteConfig>(opts: {
        configs: RouteConfig;
    }): RouteConfig & HonoRouteConfig & {
        getRoutingPath(): string;
    };
    /** Like getRouteConfigs but adds HTML response schema for JSX rendering. */
    getJSXRouteConfigs<RouteConfig extends IAuthRouteConfig>(opts: {
        configs: RouteConfig;
    }): RouteConfig & HonoRouteConfig & {
        getRoutingPath(): string;
    };
    /** Override to register routes using bindRoute or defineRoute. */
    abstract binding(): ValueOrPromise<void>;
    /** Registers the routes a generated controller brings; runs after `binding()`, so a route declared there wins a path the defaults also match. */
    bindDefaultRoutes(): ValueOrPromise<void>;
    /** Creates a fluent binding for registering a route (call .to() to attach handler). */
    abstract bindRoute<RouteConfig extends IAuthRouteConfig>(opts: {
        configs: RouteConfig;
    }): IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
    /** Defines and registers a route with its handler in a single call. */
    abstract defineRoute<RouteConfig extends IAuthRouteConfig>(opts: {
        configs: RouteConfig;
        handler: (context: TContextOf<RouteConfig, RouteEnv>) => ValueOrPromise<Response | TypedResponse<unknown>>;
        hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
    }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
}
```

Source: `packages/kernel/src/base/controllers/rest/abstract.ts`

## `AnyObjectSchema`

*const*

Zod schema of an object with any keys; the fallback response schema when a route sets none.

```ts
export declare const AnyObjectSchema: z.ZodObject<{}, z.core.$catchall<z.ZodAny>>;
```

Source: `packages/kernel/src/base/controllers/common/schema-builders.ts`

## `api`

*const*

Generic route decorator. Registers route config in metadata registry.

```ts
export declare const api: <RestRouteConfigType extends IAuthRouteConfig>(opts: {
    configs: RestRouteConfigType;
}) => (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rest.ts`

## `ArtifactIndexFields`

*class*

The `IArtifactIndex` field names, in registration order. `@venizia/ignis-boot` mirrors these values in its own `ArtifactIndexFields` - boot cannot depend on kernel.

```ts
export declare class ArtifactIndexFields extends ConstClass {
    static readonly CONFIGURATIONS = "configurations";
    static readonly DATA_SOURCES = "dataSources";
    static readonly COMPONENTS = "components";
    static readonly REPOSITORIES = "repositories";
    static readonly SERVICES = "services";
    static readonly CONTROLLERS = "controllers";
}
```

Source: `packages/kernel/src/base/applications/common/constants.ts`

## `authenticate`

*const*

Route middleware factory: `authenticate({ strategies, mode })` authenticates a request with the named strategies, `mode` defaulting to `any`.

```ts
export declare const authenticate: (opts: {
    strategies: string[];
    mode?: TAuthMode;
}) => import("hono").MiddlewareHandler<Env>;
```

Source: `packages/kernel/src/base/auth/authenticate/middlewares/authenticate.middleware.ts`

## `AuthenticateBindingKeys`

*class*

Container binding keys under which the authenticate component stores each strategy's options and the service-certs
controller path. Each key names ONE value type. `JWT_OPTIONS` is the one an application binds; the keys marked
internal are bound by the component from it, and a service injects them.

```ts
export declare class AuthenticateBindingKeys {
    static readonly REST_OPTIONS: import("@venizia/ignis-inversion").TBindingKey<TAuthenticationRestOptions>;
    /** What an application binds for JWT or JWKS: the options with their `standard` (JWS or JWKS). */
    static readonly JWT_OPTIONS: import("@venizia/ignis-inversion").TBindingKey<TJWTTokenServiceOptions>;
    /** Internal. The inner options of a JWS setup, bound by the component from `JWT_OPTIONS` and injected by `JWSTokenService`. */
    static readonly JWS_OPTIONS: import("@venizia/ignis-inversion").TBindingKey<IJWSTokenServiceOptions>;
    /** Internal. The options of a JWKS issuer, bound by the component from `JWT_OPTIONS` and injected by `JWKSIssuerTokenService`. */
    static readonly JWKS_ISSUER_OPTIONS: import("@venizia/ignis-inversion").TBindingKey<IJWKSIssuerOptions>;
    /** Internal. The options of a JWKS verifier, bound by the component from `JWT_OPTIONS` and injected by `JWKSVerifierTokenService`. */
    static readonly JWKS_VERIFIER_OPTIONS: import("@venizia/ignis-inversion").TBindingKey<IJWKSVerifierOptions>;
    static readonly BASIC_OPTIONS: import("@venizia/ignis-inversion").TBindingKey<TBasicTokenServiceOptions>;
    static readonly SERVICE_OPTIONS: import("@venizia/ignis-inversion").TBindingKey<IServiceAuthOptions<import("hono").Env>>;
    static readonly SERVICE_CERTS_PATH: import("@venizia/ignis-inversion").TBindingKey<string>;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/keys.ts`

## `AuthenticateStrategy`

*class*

Names of the strategies the framework ships: `basic`, `jwt` and `service`.

```ts
export declare class AuthenticateStrategy extends ConstClass {
    static readonly BASIC = "basic";
    static readonly JWT = "jwt";
    static readonly SERVICE = "service";
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/authentication.ts`

## `Authentication`

*class*

Shared auth string constants: strategy names, `Authorization` header token types, and the request-context keys the authentication middleware reads and writes.

```ts
export declare class Authentication {
    static readonly STRATEGY_BASIC = "basic";
    static readonly STRATEGY_JWT = "jwt";
    static readonly STRATEGY_SERVICE = "service";
    static readonly TYPE_BASIC = "Basic";
    static readonly TYPE_BEARER = "Bearer";
    static readonly AUTHENTICATION_STRATEGY = "authentication.strategy";
    static readonly SKIP_AUTHENTICATION = "authentication.skip";
    static readonly CURRENT_USER = "auth.current.user";
    static readonly AUDIT_USER_ID = "audit.user.id";
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/authentication.ts`

## `AuthenticationErrors`

*const*

Codes a client branches on for a failed authentication. A throw site may override `message` for detail; the code and status come from here.

```ts
export declare const AuthenticationErrors: {
    readonly HEADER_MISSING: {
        readonly message: {
            readonly text: "Missing authorization header";
            readonly code: "core.authentication.header_missing";
        };
        readonly statusCode: 401;
        readonly category: "auth";
    };
    readonly SCHEME_INVALID: {
        readonly message: {
            readonly text: "Unsupported authorization scheme";
            readonly code: "core.authentication.scheme_invalid";
        };
        readonly statusCode: 401;
        readonly category: "auth";
    };
    readonly HEADER_MALFORMED: {
        readonly message: {
            readonly text: "Malformed authorization header";
            readonly code: "core.authentication.header_malformed";
        };
        readonly statusCode: 401;
        readonly category: "auth";
    };
    readonly TOKEN_MISSING: {
        readonly message: {
            readonly text: "Missing request token";
            readonly code: "core.authentication.token_missing";
        };
        readonly statusCode: 401;
        readonly category: "auth";
    };
    /** Covers expiry, a bad signature and a malformed token alike - the reason rides in `cause`, never in the code a client sees. */
    readonly TOKEN_INVALID: {
        readonly message: {
            readonly text: "Invalid or expired token";
            readonly code: "core.authentication.token_invalid";
        };
        readonly statusCode: 401;
        readonly category: "auth";
    };
    readonly TOKEN_PAYLOAD_INVALID: {
        readonly message: {
            readonly text: "Invalid token payload";
            readonly code: "core.authentication.token_payload_invalid";
        };
        readonly statusCode: 401;
        readonly category: "auth";
    };
    readonly CREDENTIALS_MALFORMED: {
        readonly message: {
            readonly text: "Malformed credentials";
            readonly code: "core.authentication.credentials_malformed";
        };
        readonly statusCode: 401;
        readonly category: "auth";
    };
    readonly CREDENTIALS_INVALID: {
        readonly message: {
            readonly text: "Invalid username or password";
            readonly code: "core.authentication.credentials_invalid";
        };
        readonly statusCode: 401;
        readonly category: "auth";
    };
    readonly FAILED: {
        readonly message: {
            readonly text: "Authentication failed";
            readonly code: "core.authentication.failed";
        };
        readonly statusCode: 401;
        readonly category: "auth";
    };
    readonly USER_UNRESOLVED: {
        readonly message: {
            readonly text: "Failed to identify authenticated user";
            readonly code: "core.authentication.user_unresolved";
        };
        readonly statusCode: 401;
        readonly category: "auth";
    };
    readonly ASSERTION_MISSING: {
        readonly message: {
            readonly text: "Missing service assertion";
            readonly code: "core.authentication.service.assertion_missing";
        };
        readonly statusCode: 401;
        readonly category: "auth";
    };
    readonly ASSERTION_INVALID: {
        readonly message: {
            readonly text: "Invalid service assertion";
            readonly code: "core.authentication.service.assertion_invalid";
        };
        readonly statusCode: 401;
        readonly category: "auth";
    };
    readonly CALLER_NOT_ALLOWED: {
        readonly message: {
            readonly text: "Service caller is not allowed";
            readonly code: "core.authentication.service.caller_not_allowed";
        };
        readonly statusCode: 401;
        readonly category: "auth";
    };
    readonly REQUEST_BINDING_MISMATCH: {
        readonly message: {
            readonly text: "Service assertion does not match this request";
            readonly code: "core.authentication.service.request_binding_mismatch";
        };
        readonly statusCode: 401;
        readonly category: "auth";
    };
    readonly PRINCIPAL_UNRESOLVED: {
        readonly message: {
            readonly text: "Service caller resolved to no principal";
            readonly code: "core.authentication.service.principal_unresolved";
        };
        readonly statusCode: 401;
        readonly category: "auth";
    };
};
```

Source: `packages/kernel/src/base/auth/authenticate/common/errors.ts`

## `AuthenticationFieldCodecs`

*class*

Ready-made payload field codecs, plus `build` to define one. A codec turns one JWT payload field into a string and back so it can ride through the encrypted payload envelope.

```ts
export declare class AuthenticationFieldCodecs {
    static readonly ROLES_CODEC: IPayloadFieldCodec<TJWTTokenRole[]>;
    /** Builds a single payload field codec. */
    static build<T = unknown>(opts: {
        key: string;
        serialize: IPayloadFieldCodec<T>['serialize'];
        deserialize: IPayloadFieldCodec<T>['deserialize'];
    }): IPayloadFieldCodec<T>;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/codecs.ts`

## `AuthenticationModes`

*class*

How the `authenticate` middleware combines several strategies: `any` passes when one succeeds, `all` requires every one to succeed.

```ts
export declare class AuthenticationModes extends ConstClass {
    static readonly ANY = "any";
    static readonly ALL = "all";
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/authentication.ts`

## `AuthenticationProvider`

*class*

Provides the `authenticate` middleware factory. Strategies resolve from `AuthenticationStrategyRegistry`.

The middleware skips a request flagged `Authentication.SKIP_AUTHENTICATION` or already holding a current user. On success it stores the user and its audit user id in the request context.

```ts
export declare class AuthenticationProvider<RouteEnv extends Env = Env> extends BaseHelper implements IProvider<TAuthenticateFn<RouteEnv>> {
    constructor();
    value(): TAuthenticateFn<RouteEnv>;
    private createAuthenticateMiddleware;
    private executeAnyMode;
    private executeAllMode;
    private setCurrentUser;
}
```

Source: `packages/kernel/src/base/auth/authenticate/providers/authentication.provider.ts`

## `AuthenticationStrategyRegistry`

*class*

Registry of authentication strategies by name. Use `getInstance()` for the shared one; register application strategies before controllers are bound.

```ts
export declare class AuthenticationStrategyRegistry extends AbstractAuthRegistry<IAuthenticationStrategy> {
    static readonly SINGLETON_REAL_KEY = "authentication-strategy-registry";
    constructor();
    static getInstance(): AuthenticationStrategyRegistry;
    protected getBindingPrefix(): string;
    register(opts: {
        container: Container;
        strategies: {
            strategy: TClass<IAuthenticationStrategy>;
            name: string;
        }[];
    }): this;
    resolveStrategy(opts: {
        name: string;
    }): IAuthenticationStrategy;
    /**
     * The names on this list that no registered strategy answers to.
     *
     * An EMPTY list yields nothing - it is the framework's own encoding of
     * `authenticate: { skip: true }`, so treating it as a problem would flag every public route.
     *
     * Nothing is reported while the registry is empty. Route configs are built during
     * `registerControllers()`, after `preConfigure()` and `registerComponents()`, so a real
     * application has registered by then; an empty registry means this is running outside that
     * lifecycle - a unit test on a controller - where no name could resolve either way.
     */
    findUnregistered(opts: {
        names: string[];
    }): string[];
    /**
     * Refuses to continue past an unregistered name. For an APPLICATION's own startup check.
     *
     * The framework does NOT call this - it reports instead. A hard failure cannot be the default
     * here: a route listing several strategies in ANY mode tolerates one that does not resolve, and
     * `AuthControllerFactory.build` hard-codes `'jwt'` on four of its routes, so an application that
     * registers its JWT strategy under a different name works today and would stop booting.
     */
    assertRegistered(opts: {
        names: string[];
        scope?: string;
    }): void;
    /**
     * Names an unregistered strategy at boot, at a level someone sees. Never throws.
     *
     * This is what replaces the guard the open `TAuthStrategy` gave up: `resolveStrategy` throws at
     * request time, the provider's ANY mode swallows it at DEBUG, and the route 401s with nothing to
     * explain why.
     */
    reportUnregistered(opts: {
        names: string[];
        scope?: string;
    }): void;
}
```

Source: `packages/kernel/src/base/auth/authenticate/strategies/strategy-registry.ts`

## `AuthenticationTokenTypes`

*class*

Token type tags, each prefixed with a number: authorization code, access token, refresh token.

```ts
export declare class AuthenticationTokenTypes {
    static readonly TYPE_AUTHORIZATION_CODE = "000_AUTHORIZATION_CODE";
    static readonly TYPE_ACCESS_TOKEN = "100_ACCESS_TOKEN";
    static readonly TYPE_REFRESH_TOKEN = "200_REFRESH_TOKEN";
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/authentication.ts`

## `Authorization`

*class*

Keys of the authorization state on the Hono context (`RULES`, `SKIP_AUTHORIZATION`, `DOMAIN`) and the binding prefix for registered enforcers (`ENFORCER`).

```ts
export declare class Authorization {
    static readonly RULES = "authorization.rules";
    static readonly SKIP_AUTHORIZATION = "authorization.skip";
    static readonly ENFORCER = "authorization.enforcer";
    static readonly DOMAIN = "authorization.domain";
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `AuthorizationActions`

*class*

Actions a grant or request can name. `manage` covers `read`/`write`/`execute`, and `write` covers `create`/`update`/`delete` (see `LATTICE`).

```ts
export declare class AuthorizationActions {
    static readonly CREATE = "create";
    static readonly UPDATE = "update";
    static readonly DELETE = "delete";
    static readonly EXECUTE = "execute";
    static readonly READ = "read";
    static readonly WRITE = "write";
    static readonly MANAGE = "manage";
    /** Grant-mode marker for a subset grant carrying `metadata.ops`; never a member of LATTICE. */
    static readonly CUSTOM = "custom";
    static readonly SCHEME_SET: Set<string>;
    static readonly LATTICE: ReadonlyArray<{
        child: TAuthorizationAction;
        parent: TAuthorizationAction;
    }>;
    static isValid(input: string): boolean;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `AuthorizationDecisions`

*class*

Outcome of a voter or enforcer. The `isAllow`/`isDeny`/`isAbstain` helpers also accept a number: positive allows, negative denies, zero abstains.

```ts
export declare class AuthorizationDecisions extends ConstClass {
    static readonly ALLOW = "allow";
    static readonly DENY = "deny";
    static readonly ABSTAIN = "abstain";
    static isAllow(input: string | number): boolean;
    static isDeny(input: string | number): boolean;
    static isAbstain(input: string | number): boolean;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `AuthorizationDomainScopes`

*class*

Scope literals a grant can carry instead of a concrete domain.

```ts
export declare class AuthorizationDomainScopes extends ConstClass {
    /** Grant applies in EVERY domain the subject is a member of (checked via join_domain / g2). */
    static readonly ANY_MEMBER = "ANY_MEMBER";
    /** Grant applies system-wide, bypassing membership - super-admin only. */
    static readonly SYSTEM_WIDE = "SYSTEM_WIDE";
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `AuthorizationDomainSources`

*class*

Where an `IAuthorizationDomainSource` reads the request domain from.

```ts
export declare class AuthorizationDomainSources extends ConstClass {
    static readonly PARAM = "param";
    static readonly HEADER = "header";
    static readonly QUERY = "query";
    static readonly CONTEXT = "context";
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `AuthorizationEnforcerRegistry`

*class*

Singleton registry of named authorization enforcers. An enforcer is configured once, on first resolve; concurrent first resolves share one `configure()` call.

```ts
export declare class AuthorizationEnforcerRegistry extends AbstractAuthRegistry<IAuthorizationEnforcer> {
    static readonly SINGLETON_REAL_KEY = "authorization-enforcer-registry";
    private configuredEnforcers;
    /** In-flight `configure()` calls, so concurrent first requests share one warmup instead of racing. */
    private pendingConfigurations;
    /** Set by AuthorizeComponent from the application container. Held here because the descriptor scan
     * below sees only registered enforcers, and `defaultDecision` has to be readable when there are none. */
    private applicationOptions;
    constructor();
    static getInstance(): AuthorizationEnforcerRegistry;
    reset(): void;
    protected getBindingPrefix(): string;
    register(opts: {
        container: Container;
        enforcers: Array<{
            enforcer: TClass<IAuthorizationEnforcer>;
            name: string;
            type: typeof AuthorizationEnforcerTypes.CASBIN;
            options?: ICasbinEnforcerOptions;
        } | {
            enforcer: TClass<IAuthorizationEnforcer>;
            name: string;
            type: typeof AuthorizationEnforcerTypes.CUSTOM;
            options?: unknown;
        }>;
    }): this;
    hasEnforcers(): boolean;
    getDefaultEnforcerName(): string;
    /**
     * The PROMISE is memoised, not just the completed flag.
     *
     * `configure()` yields (it dynamic-imports casbin), and the flag was only set after the await -
     * so a burst of first requests each saw an unconfigured enforcer and each built a full pool.
     * Measured: 40 concurrent first requests produced 40 configure() calls and 640 enforcers.
     * The entry is dropped on rejection so a failed warmup does not poison every later request.
     */
    resolveEnforcer(opts: {
        name: string;
    }): Promise<IAuthorizationEnforcer>;
    /** Drop a user's cached policies on the resolved enforcer. Lazy - next request rebuilds. */
    invalidateUserCache(opts: {
        user: IAuthorizationUser;
        enforcerName?: string;
    }): Promise<{
        invalidatedKeys: number;
    }>;
    /** Drop then immediately rebuild + re-cache a user's policies on the resolved enforcer. */
    rebuildUserCache(opts: {
        user: {
            principalType: string;
        } & IAuthUser;
        enforcerName?: string;
    }): Promise<{
        cacheKey: string;
        lineCount: number;
    }>;
    /** Options bound on the application, independent of any enforcer. */
    setOptions(opts: {
        options: IAuthorizeOptions;
    }): void;
    resolveOptions(): IAuthorizeOptions | undefined;
}
```

Source: `packages/kernel/src/base/auth/authorize/enforcers/enforcer-registry.ts`

## `AuthorizationEnforcerTypes`

*class*

Kinds of enforcer a registration can declare; `casbin` takes `ICasbinEnforcerOptions`, `custom` takes untyped options.

```ts
export declare class AuthorizationEnforcerTypes extends ConstClass {
    static readonly CASBIN = "casbin";
    static readonly CUSTOM = "custom";
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `AuthorizationErrors`

*const*

Codes a client branches on for a refused authorization. A throw site may override `message` for detail; the code and status come from here.

```ts
export declare const AuthorizationErrors: {
    readonly UNAUTHENTICATED: {
        readonly message: {
            readonly text: "Authorization requires an authenticated user";
            readonly code: "core.authorization.unauthenticated";
        };
        readonly statusCode: 401;
        readonly category: "auth";
    };
    readonly DENIED: {
        readonly message: {
            readonly text: "Authorization denied";
            readonly code: "core.authorization.denied";
        };
        readonly statusCode: 403;
        readonly category: "auth";
    };
    /** Distinct from {@link DENIED}: a voter refused before the enforcer ever ran. */
    readonly DENIED_BY_VOTER: {
        readonly message: {
            readonly text: "Authorization denied by voter";
            readonly code: "core.authorization.denied_by_voter";
        };
        readonly statusCode: 403;
        readonly category: "auth";
    };
    /** Distinct from {@link DENIED}: no enforcer ever ran - the route declared `authorize()` but the application registered none, and `defaultDecision` did not say ALLOW. */
    readonly ENFORCER_NOT_REGISTERED: {
        readonly message: {
            readonly text: "Authorization requires an enforcer, but none is registered";
            readonly code: "core.authorization.enforcer_not_registered";
        };
        readonly statusCode: 403;
        readonly category: "auth";
    };
    readonly PRINCIPAL_TYPE_MISSING: {
        readonly message: {
            readonly text: "user.principalType is required for enforcer-based authorization";
            readonly code: "core.authorization.principal_type_missing";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    readonly CACHE_KEY_INVALID: {
        readonly message: {
            readonly text: "Authorization cache key resolver returned an empty key";
            readonly code: "core.authorization.cache_key_invalid";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
};
```

Source: `packages/kernel/src/base/auth/authorize/common/errors.ts`

## `AuthorizationPermissionBuilder`

*class*

Builders for `Permission` catalog rows (the `obj` axis the scoped matcher resolves), generic over `TName` so i18n and plain-text apps both fit; only framework-owned columns (code/subject/method/action/scope/description/parentId) are produced - app columns are added by the caller.

```ts
export declare class AuthorizationPermissionBuilder {
    /** Sentinel `method` for a coarse resource node (a grant target that is not a route). */
    static readonly RESOURCE_NODE_METHOD = "*";
    /** Standard repository method → base action. Unlisted methods (custom ops, aggregates) resolve to `execute`. */
    static readonly METHOD_ACTIONS: Readonly<Record<string, TAuthorizationAction>>;
    /** The CRUD methods {@link crud} generates by default. */
    static readonly DEFAULT_CRUD_METHODS: ReadonlyArray<string>;
    /** Base action for a method: a known CRUD method maps to read/create/update/delete; anything else → `execute`. */
    static actionForMethod(method: string): TAuthorizationAction;
    /** One operation-level permission, `code = <subject>.<method>`. `action` defaults to {@link actionForMethod}. */
    static operation<TName>(opts: {
        subject: string;
        method: string;
        scope: string;
        name: TName;
        description?: TNullable<TName>;
        action?: TAuthorizationAction;
        parentId?: TNullable<IdType>;
    }): {
        code: string;
        subject: string;
        method: string;
        action: TAuthorizationAction;
        scope: string;
        description: NonNullable<TName> | null;
        parentId: IdType | null;
        name: TName;
    };
    /** A coarse resource node used as a grant target: `code` is the bare name, `method` the {@link RESOURCE_NODE_METHOD} sentinel, `action` defaults to `manage` (grants carry their own action). */
    static resourceNode<TName>(opts: {
        code: string;
        subject?: string;
        scope: string;
        name: TName;
        description?: TNullable<TName>;
        action?: TAuthorizationAction;
        parentId?: TNullable<IdType>;
    }): {
        code: string;
        subject: string;
        method: string;
        action: TAuthorizationAction;
        scope: string;
        description: NonNullable<TName> | null;
        parentId: IdType | null;
        name: TName;
    };
    /** The CRUD permission set for a subject. `name` (and optional `description`) are per-method formatters, so the app supplies its own labels/i18n; the framework only owns the method-to-action map and the code shape. */
    static crud<TName>(opts: {
        subject: string;
        scope: string;
        name: (ctx: {
            subject: string;
            method: string;
            action: TAuthorizationAction;
        }) => TName;
        description?: (ctx: {
            subject: string;
            method: string;
            action: TAuthorizationAction;
        }) => TNullable<TName>;
        methods?: ReadonlyArray<string>;
    }): {
        code: string;
        subject: string;
        method: string;
        action: TAuthorizationAction;
        scope: string;
        description: NonNullable<TName> | null;
        parentId: IdType | null;
        name: TName;
    }[];
    /** g4 resource matcher (r.obj vs p.obj): derives standard edges (endpoint ⊂ subject ⊂ `*`) from the dotted code {@link operation} produces, while non-standard nesting stays stored g4 edges served by `ResourceRoleManager`. Registered via `enforcer.addFunction` - must stay static. */
    static objectMatch(requested: string, granted: string): boolean;
}
```

Source: `packages/kernel/src/base/auth/authorize/builders/permission.builder.ts`

## `AuthorizationPolicyBuilder`

*class*

Static factories for the `PolicyDefinition` rows behind each edge kind in `AuthorizationPolicyVariants` (grant, role assignment, domain join, inheritance). Returns plain row objects; nothing is persisted.

```ts
export declare class AuthorizationPolicyBuilder {
    static readonly ACTION_PRINCIPAL = "Action";
    /** A domain as the two columns that store it. `ANY_MEMBER` normalises to null - admitting both spellings would leave one state reachable two ways. */
    private static splitDomain;
    /** A grant (casbin `p`): role/user -> permission, carrying action + effect + domain. A null `domain` means `ANY_MEMBER` (adapter default); pass a scope literal or a typed `{ type, id }` domain. */
    static grant(opts: {
        subject: {
            type: string;
            id: IdType;
        };
        permission: {
            type: string;
            id: IdType;
        };
        action: string;
        domain?: TNullable<TPolicyDomainInput>;
        effect: TAuthorizationDecision;
    }): TBuilderGrantRow;
    /** A subset grant (casbin `p` x N): role/user -> resource node with the granted operations in metadata. `action` is fixed to the CUSTOM sentinel; the adapter expands `ops` at read time. */
    static customGrant(opts: {
        subject: {
            type: string;
            id: IdType;
        };
        permission: {
            type: string;
            id: IdType;
        };
        ops: string[];
        domain?: TNullable<TPolicyDomainInput>;
        effect: TAuthorizationDecision;
    }): TBuilderCustomGrantRow;
    /** Assign a role to a user (casbin `g`). `domain` null ⇒ `*` (every domain). */
    static assignRole(opts: {
        user: {
            type: string;
            id: IdType;
        };
        role: {
            type: string;
            id: IdType;
        };
        domain?: TNullable<TPolicyDomainInput>;
    }): {
        domainType: TNullable<string>;
        domainId: TNullable<IdType>;
        variant: "assign_role";
        subjectType: string;
        subjectId: IdType;
        targetType: string;
        targetId: IdType;
    };
    /** A user joins a domain (casbin `g2`) - backs the `ANY_MEMBER` grant scope. */
    static joinDomain(opts: {
        user: {
            type: string;
            id: IdType;
        };
        domain: {
            type: string;
            id: IdType;
        };
    }): {
        variant: "join_domain";
        subjectType: string;
        subjectId: IdType;
        targetType: string;
        targetId: IdType;
    };
    /** A role inherits another role (casbin `g`, shared relation with assign_role). */
    static roleInherits(opts: {
        child: {
            type: string;
            id: IdType;
        };
        parent: {
            type: string;
            id: IdType;
        };
    }): {
        variant: "role_inherits";
        subjectType: string;
        subjectId: IdType;
        targetType: string;
        targetId: IdType;
    };
    /** A resource inherits another (casbin `g4`): a grant on the PARENT covers the CHILD. Many-to-many - a subject may inherit several module parents, one edge each. */
    static resourceInherits(opts: {
        child: {
            type: string;
            id: IdType;
        };
        parent: {
            type: string;
            id: IdType;
        };
    }): {
        variant: "resource_inherits";
        subjectType: string;
        subjectId: IdType;
        targetType: string;
        targetId: IdType;
    };
    /** An action inherits another (casbin `g5`): the child action is implied by the parent, e.g. read ⊂ manage. */
    static actionInherits(opts: {
        child: TAuthorizationAction;
        parent: TAuthorizationAction;
    }): {
        variant: "action_inherits";
        subjectType: string;
        subjectId: TAuthorizationAction;
        targetType: string;
        targetId: TAuthorizationAction;
    };
    /** All `action_inherits` rows for the standard {@link AuthorizationActions.LATTICE}. Seed once, idempotently. */
    static actionLattice(): {
        variant: "action_inherits";
        subjectType: string;
        subjectId: TAuthorizationAction;
        targetType: string;
        targetId: TAuthorizationAction;
    }[];
    /** A domain inherits another (casbin `g3`): a grant in the parent domain cascades to the child. e.g. Merchant ⊂ Organizer. */
    static domainInherits(opts: {
        child: {
            type: string;
            id: IdType;
        };
        parent: {
            type: string;
            id: IdType;
        };
    }): {
        variant: "domain_inherits";
        subjectType: string;
        subjectId: IdType;
        targetType: string;
        targetId: IdType;
    };
    /** Build a role's coarse grant rows from resolved permission ids. The caller resolves each `resourceCode` (subject/module) to a `Permission` and supplies the lookup; unresolved codes are skipped. */
    static roleGrants(opts: {
        role: {
            type: string;
            id: IdType;
        };
        permission: {
            type: string;
            idByCode: ReadonlyMap<string, string>;
        };
        grants: ReadonlyArray<{
            resourceCode: string;
            action: string;
            domain?: TNullable<TPolicyDomainInput>;
            effect: TAuthorizationDecision;
        }>;
    }): TBuilderGrantRow[];
}

/**
 * Explicit on purpose: `TAuthorizationDecision` is `Extract<ValueOf<T>, string | number>`, and its
 * literal members widen to `string` when a method's return type is inferred rather than declared.
 * Without this annotation `grant()`'s `effect` stops satisfying `PolicyDefinition`'s narrowed column.
 * Not exported - `TGrantRow`/`TCustomGrantRow` already name unrelated adapter-side row shapes
 * downstream; consumers derive this shape via `ReturnType<typeof AuthorizationPolicyBuilder.grant>`.
 */
type TBuilderGrantRow = {
    variant: typeof AuthorizationPolicyVariants.GRANT.action;
    subjectType: string;
    subjectId: IdType;
    targetType: string;
    targetId: IdType;
    action: string;
    effect: TAuthorizationDecision;
    domainType: TNullable<string>;
    domainId: TNullable<IdType>;
};

type TBuilderCustomGrantRow = Omit<TBuilderGrantRow, 'action'> & {
    action: typeof AuthorizationActions.CUSTOM;
    metadata: TSubsetGrantMetadata;
};
```

Source: `packages/kernel/src/base/auth/authorize/builders/policy.builder.ts`
