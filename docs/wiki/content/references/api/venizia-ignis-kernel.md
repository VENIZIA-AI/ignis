---
title: "@venizia/ignis-kernel"
description: "Every export of @venizia/ignis-kernel, from the built declarations (generated)."
---

# `@venizia/ignis-kernel`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

355 exports, 355 with TSDoc. 78 more are re-exported from other entries (listed at the end).

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
        middlewares?: Record<string | symbol, any>;
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
    }): string;
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
        path: string;
        isStrict?: boolean;
        repository: AbstractRepository<TDataObject, TPersistObject, AnyType>;
        definitions: AnyType;
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
    }): RouteConfig & {
        getRoutingPath(): RouteConfig["path"] extends infer T ? T extends RouteConfig["path"] ? T extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${/*elided*/ any}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : T : never : never;
    };
    /** Like getRouteConfigs but adds HTML response schema for JSX rendering. */
    getJSXRouteConfigs<RouteConfig extends IAuthRouteConfig>(opts: {
        configs: RouteConfig;
    }): RouteConfig & {
        getRoutingPath(): RouteConfig["path"] extends infer T ? T extends RouteConfig["path"] ? T extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${/*elided*/ any}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : T : never : never;
    };
    /** Override to register routes using bindRoute or defineRoute. */
    abstract binding(): ValueOrPromise<void>;
    /** Creates a fluent binding for registering a route (call .to() to attach handler). */
    abstract bindRoute<RouteConfig extends IAuthRouteConfig>(opts: {
        configs: RouteConfig;
    }): IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
    /** Defines and registers a route with its handler in a single call. */
    abstract defineRoute<RouteConfig extends IAuthRouteConfig, ResponseType = unknown>(opts: {
        configs: RouteConfig;
        handler: TRouteHandler<ResponseType, RouteEnv>;
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
}) => (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rest.ts`

## `ArtifactIndexFields`

*class*

The `IArtifactIndex` field names, in registration order. `@venizia/ignis-boot` mirrors these values in its own `ArtifactIndexFields` - boot cannot depend on kernel.

```ts
export declare class ArtifactIndexFields {
    static readonly CONFIGURATIONS = "configurations";
    static readonly DATA_SOURCES = "dataSources";
    static readonly COMPONENTS = "components";
    static readonly REPOSITORIES = "repositories";
    static readonly SERVICES = "services";
    static readonly CONTROLLERS = "controllers";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
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

Container binding keys under which the authenticate component stores each strategy's options and the service-certs controller path.

```ts
export declare class AuthenticateBindingKeys {
    static readonly REST_OPTIONS = "@app/authenticate/rest-options";
    static readonly JWT_OPTIONS = "@app/authenticate/jwt-options";
    static readonly JWKS_OPTIONS = "@app/authenticate/jwks-options";
    static readonly BASIC_OPTIONS = "@app/authenticate/basic-options";
    static readonly SERVICE_OPTIONS = "@app/authenticate/service-options";
    static readonly SERVICE_CERTS_PATH = "@app/authenticate/service-certs-path";
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/keys.ts`

## `AuthenticateStrategy`

*class*

Names of the strategies the framework ships: `basic`, `jwt` and `service`.

```ts
export declare class AuthenticateStrategy {
    static readonly BASIC = "basic";
    static readonly JWT = "jwt";
    static readonly SERVICE = "service";
    /** The strategies the FRAMEWORK ships. An application registers its own beyond these. */
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): boolean;
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
export declare class AuthenticationModes {
    static readonly ANY = "any";
    static readonly ALL = "all";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): boolean;
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
     * `AuthControllerFactory.define` hard-codes `'jwt'` on four of its routes, so an application that
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
export declare class AuthorizationDecisions {
    static readonly ALLOW = "allow";
    static readonly DENY = "deny";
    static readonly ABSTAIN = "abstain";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): boolean;
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
export declare class AuthorizationDomainScopes {
    /** Grant applies in EVERY domain the subject is a member of (checked via join_domain / g2). */
    static readonly ANY_MEMBER = "ANY_MEMBER";
    /** Grant applies system-wide, bypassing membership - super-admin only. */
    static readonly SYSTEM_WIDE = "SYSTEM_WIDE";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): boolean;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `AuthorizationDomainSources`

*class*

Where an `IAuthorizationDomainSource` reads the request domain from.

```ts
export declare class AuthorizationDomainSources {
    static readonly PARAM = "param";
    static readonly HEADER = "header";
    static readonly QUERY = "query";
    static readonly CONTEXT = "context";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
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
export declare class AuthorizationEnforcerTypes {
    static readonly CASBIN = "casbin";
    static readonly CUSTOM = "custom";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): boolean;
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

## `AuthorizationPolicyVariants`

*class*

Edge kinds in the `PolicyDefinition` table (each row: subject -> target, `variant` = kind), carrying `action` (DB `variant` value) + `rule` (casbin prefix emitted per edge). Per-USER edges: GRANT, ASSIGN_ROLE, JOIN_DOMAIN; shared org-structure edges: the *_INHERITS ones.

```ts
export declare class AuthorizationPolicyVariants {
    /** Give a Permission to a User/Role (row also carries action / effect / domain). casbin `p`: `p, <Role|User>_<id>, <domain>, <permissionCode>, <action>, <allow|deny>` */
    static readonly GRANT: {
        readonly action: "grant";
        readonly rule: "p";
    };
    /** Give a User a Role (optionally domain-scoped; no domain -> `*` = every domain). casbin `g`: `g, User_<id>, Role_<id>, <domain|*>` */
    static readonly ASSIGN_ROLE: {
        readonly action: "assign_role";
        readonly rule: "g";
    };
    /** A Role inherits another Role (DAG). Shares `g` with ASSIGN_ROLE so user -> role -> parent-role resolves in one lookup. Emitted with domain `*`: `g, Role_<child>, Role_<parent>, *` */
    static readonly ROLE_INHERITS: {
        readonly action: "role_inherits";
        readonly rule: "g";
    };
    /** User is a member of a Domain; powers the `ANY_MEMBER` grant scope via `g2(r.sub, r.dom)`. casbin `g2`: `g2, User_<id>, <Type>_<domainId>` */
    static readonly JOIN_DOMAIN: {
        readonly action: "join_domain";
        readonly rule: "g2";
    };
    /** DOMAIN axis (`dom`): domain nesting. Matcher: `g3(r.dom, p.dom)` + self-link so an exact domain always matches itself. casbin `g3`: `g3, <Type>_<childId>, <Type>_<parentId>` */
    static readonly DOMAIN_INHERITS: {
        readonly action: "domain_inherits";
        readonly rule: "g3";
    };
    /** RESOURCE axis (`obj`), NON-standard nesting only - dotted nesting (`Order.findById ⊂ Order`) is handled by `objectMatch` WITHOUT an edge. Matcher: `objectMatch(r.obj, p.obj) || g4(r.obj, p.obj)`, casbin `g4`: `g4, <childCode>, <parentCode>` */
    static readonly RESOURCE_INHERITS: {
        readonly action: "resource_inherits";
        readonly rule: "g4";
    };
    /** ACTION axis (`act`): a narrow action covered by a broader one; no dotted shortcut, so it needs an explicit edge. Matcher: `g5(r.act, p.act)`, casbin `g5`: `g5, <childAction>, <parentAction>`. g4 + g5 combine multiplicatively: `manage Order` covers a `read OrderItem` request. */
    static readonly ACTION_INHERITS: {
        readonly action: "action_inherits";
        readonly rule: "g5";
    };
    /** Every edge kind, in declaration order - the one place the scheme sets and the `variant` column's literal type both derive from. */
    static readonly ALL: readonly [{
        readonly action: "grant";
        readonly rule: "p";
    }, {
        readonly action: "assign_role";
        readonly rule: "g";
    }, {
        readonly action: "role_inherits";
        readonly rule: "g";
    }, {
        readonly action: "join_domain";
        readonly rule: "g2";
    }, {
        readonly action: "domain_inherits";
        readonly rule: "g3";
    }, {
        readonly action: "resource_inherits";
        readonly rule: "g4";
    }, {
        readonly action: "action_inherits";
        readonly rule: "g5";
    }];
    static readonly ACTION_SCHEME_SET: Set<string>;
    static readonly RULE_SCHEME_SET: Set<string>;
    static isValidAction(input: string): boolean;
    static isValidRule(input: string): boolean;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `AuthorizationProvider`

*class*

Provides the `TAuthorizeFn` that builds the per-route authorization middleware: skip flag, always-allow and allowed roles, voters, then the enforcer decision.

```ts
export declare class AuthorizationProvider extends BaseHelper implements IProvider<TAuthorizeFn> {
    constructor();
    value(): TAuthorizeFn;
    private createAuthorizeMiddleware;
    private extractUserRoles;
}
```

Source: `packages/kernel/src/base/auth/authorize/providers/authorization.provider.ts`

## `AuthorizationRole`

*class*

Role with a numeric priority. `identifier` is the zero-padded (3 digits) priority joined to the name by `delimiter`, e.g. `010_user`.

```ts
export declare class AuthorizationRole implements IAuthorizationRole {
    readonly name: string;
    readonly priority: number;
    /**
     * Joins the padded priority to the name in `identifier`.
     *
     * @default '_'
     */
    readonly delimiter: string;
    static build(opts: {
        name: string;
        priority: number;
        delimiter?: string;
    }): AuthorizationRole;
    constructor(opts: {
        name: string;
        priority: number;
        delimiter?: string;
    });
    get identifier(): string;
    compare(opts: {
        target: IAuthorizationRole;
    }): number;
    isHigherThan(opts: {
        target: IAuthorizationRole;
    }): boolean;
    isLowerThan(opts: {
        target: IAuthorizationRole;
    }): boolean;
    isEqualTo(opts: {
        target: IAuthorizationRole;
    }): boolean;
}
```

Source: `packages/kernel/src/base/auth/authorize/models/authorization-role.model.ts`

## `AuthorizationRoles`

*class*

Built-in roles ordered by priority (`super-admin` 999, `admin` 900, `user` 10, `guest` 1, `unknown-user` 0). `SCHEME_SET` and `isValid` work on the role `identifier` (e.g. `010_user`), not the bare name.

```ts
export declare class AuthorizationRoles {
    static readonly SUPER_ADMIN: AuthorizationRole;
    static readonly ADMIN: AuthorizationRole;
    static readonly USER: AuthorizationRole;
    static readonly GUEST: AuthorizationRole;
    static readonly UNKNOWN_USER: AuthorizationRole;
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): boolean;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `authorize`

*const*

Builds the authorization middleware for a route from an `IAuthorizationSpec`; `enforcerName` selects a registered enforcer, else the default one is used.

```ts
export declare const authorize: (opts: {
    spec: IAuthorizationSpec;
    enforcerName?: string;
}) => import("hono").MiddlewareHandler;
```

Source: `packages/kernel/src/base/auth/authorize/middlewares/authorize.middleware.ts`

## `AuthorizeBindingKeys`

*class*

Container binding keys for the authorize options, the always-allow roles, and (through `enforcerOptions`) the options of one named enforcer.

```ts
export declare class AuthorizeBindingKeys {
    static readonly OPTIONS = "@app/authorize/options";
    static readonly ALWAYS_ALLOW_ROLES = "@app/authorize/always-allow-roles";
    static enforcerOptions(name: string): string;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/binding-keys.ts`

## `AuthorizeModelFormats`

*class*

The `format` of `getAuthorizeModelPrincipals` and `getAuthorizeModelSettings`: ARRAY or RECORD.

```ts
export declare class AuthorizeModelFormats {
    static readonly ARRAY = "array";
    static readonly RECORD = "record";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/kernel/src/helpers/inversion/common/constants.ts`

## `BaseAppErrorMiddleware`

*class*

Hono `onError`: ZodError -> 422, DB client error -> 400, retryable conflict -> 409, `getError` ->
its own status, else 500. Browser-pure: the two reads that need a host - the ambient environment
name and the error formatter - are constructor OPTIONS, not methods to subclass.

They were hooks once, and three subclasses existed to answer them and nothing else. A class seam
is also unreachable from application code, so the browser example had to fake the environment with
a Hono middleware assigning `context.env`. `@venizia/ignis`'s `AppErrorMiddleware` now just
supplies `process.env.NODE_ENV` and `ErrorPrettier` as options.

```ts
export declare class BaseAppErrorMiddleware extends BaseHelper implements IProvider<ErrorHandler> {
    private rootKey;
    private intentionalStackFrames;
    private unexpectedStackFrames;
    /**
     * How this host reads its ambient environment name, and the ONE option that says whether it has
     * one at all: absent means it does not (a browser), so an unresolved name is by design; present
     * but returning `undefined` means a host that should have one is misconfigured. Either way
     * {@link isProduction} fails closed.
     *
     * A function, not a string: `process.env.NODE_ENV` has to be read per request, since a test - and
     * a `--env-file` reload - can change it after the middleware is built.
     */
    private readonly environment?;
    /** Replaces {@link renderErrorForLog} - `@venizia/ignis` passes `ErrorPrettier`, which reaches `node:util` and so cannot live here. */
    private readonly formatErrorOverride?;
    constructor(opts?: {
        logger?: ILogger;
        rootKey?: string;
        intentionalStackFrames?: number;
        unexpectedStackFrames?: number;
        environment?: () => string | undefined;
        formatError?: TErrorLogFormatter;
    });
    /** Renders a thrown error for the log, through the `formatError` option when one was given. */
    protected formatError(opts: {
        error: unknown;
        messageCode?: string;
        extra?: Record<string, unknown>;
        includeStack?: boolean;
        maxStackFrames?: number;
    }): string;
    /**
     * The default log rendering: pure and deliberately small, so the whole middleware stays
     * browser-pure.
     *
     * Must never throw, cycles included: a throw inside the error handler turns a handled failure
     * into an unhandled one.
     */
    private renderErrorForLog;
    private withRootKey;
    /** Fail-closed: an unset or unrecognized env is production. */
    private isProduction;
    private classify;
    /** Hono's `HTTPException` carries `status`, not `statusCode`. Only a 4xx is the caller's fault; a 5xx stays unexpected, so its message is sanitized. */
    private readClientErrorStatus;
    /** `getError` sets `statusCode`, and it wins when a foreign error carries both. Neither usable is a 500. */
    private readIntentionalStatus;
    /** An ApplicationError's `normalized` is authoritative - a `transform` may have reworded `text`. */
    private build;
    private resolve;
    /** A throw site may set `logLevel` via `getError`; anything unset or malformed logs at `error`. */
    private resolveLogLevel;
    /** The one place a thrown error reaches the log - called once the status is known, so it carries it. */
    private logError;
    /** Only an intentional error's message is a catalog template; every other branch writes its own text, so it passes through as is. */
    private renderMessage;
    /**
     * The `extra` a response carries. It is whatever a throw site attached, so it goes through the same redaction the log
     * line uses (always masking in production, whatever the logger switch says), and a server error (5xx) in production
     * carries none: the log has it, a client has no use for it.
     */
    private renderExtra;
    /**
     * What a production server error still carries from `extra`: the correlation ids support needs, `requestId` and
     * `upstreamRequestIds`, and nothing else. Only short strings count (a list of them for the chain), so the allowance
     * cannot carry anything but an id.
     */
    private pickCorrelationIds;
    /** The `args` a throw site passes to its message template are data the client may see; secret-shaped keys in them are masked in production, whatever the logger switch says. */
    private renderNormalized;
    value(): ErrorHandler;
}
```

Source: `packages/kernel/src/base/middlewares/app-error/app-error.middleware.ts`

## `BaseComponent`

*class*

Base of every component: `configure()` stores the options once, then runs `binding()` to register the component bindings. A second `configure()` call is a no-op.

```ts
export declare abstract class BaseComponent<ConfigurableOptions extends object = {}> extends BaseHelper implements IConfigurable<ConfigurableOptions> {
    protected bindings: Record<TBindingKey, Binding>;
    protected initDefault: TInitDefault;
    protected isConfigured: boolean;
    /** What `application.component(Ctor, { options })` handed this instance, set before `binding()` runs. Optional, not defaulted to `{}`: a component registered through `configs.artifacts` gets no options and uses `??` to fall back to its binding, which an empty object would silently defeat. */
    options?: ConfigurableOptions;
    constructor(opts: {
        scope: string;
        initDefault?: TInitDefault;
        bindings?: Record<TBindingKey, Binding>;
    });
    abstract binding(): ValueOrPromise<void>;
    /** Override this, not the field, to resolve options lazily. */
    getOptions(): ConfigurableOptions | undefined;
    protected initDefaultBindings(opts: {
        container: Container;
    }): void;
    configure(opts?: ConfigurableOptions): Promise<void>;
}

type TInitDefault = {
    enable: false;
} | {
    enable: true;
    container: Container;
};
```

Source: `packages/kernel/src/base/components/base.ts`

## `BaseConfiguration`

*class*

Base of every configuration artifact: `configure()` runs `setup()` once and ignores later calls.

```ts
export declare abstract class BaseConfiguration<ConfigurableOptions extends object = {}> extends BaseHelper implements IConfiguration, IConfigurable<ConfigurableOptions> {
    protected isConfigured: boolean;
    constructor(opts?: {
        scope?: string;
        identifier?: string;
    });
    configure(opts?: ConfigurableOptions): Promise<void>;
    /** Override to perform setup work when the configuration is booted. */
    protected setup(_opts?: ConfigurableOptions): ValueOrPromise<void>;
}
```

Source: `packages/kernel/src/base/configurations/base.ts`

## `BaseProvider`

*class*

Base class for a provider: `value(container)` computes the value the provider supplies, using the container to resolve its dependencies.

```ts
export declare abstract class BaseProvider<T> extends BaseHelper implements IProvider<T> {
    abstract value(container: Container): T;
}
```

Source: `packages/kernel/src/base/providers/base.ts`

## `BaseRestController`

*class*

Recommended base class for REST controllers with concrete bindRoute and defineRoute implementations.

```ts
export declare abstract class BaseRestController<RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ConfigurableOptions extends object = {}, Definitions extends Record<string, IAuthRouteConfig> = Record<string, IAuthRouteConfig>> extends AbstractRestController<RouteEnv, RouteSchema, BasePath, ConfigurableOptions, Definitions> {
    /** Runs a handler task under performance measurement (fixed logger/level/description). */
    measure<R>(opts: {
        scope: string;
        args: unknown;
        task: () => Promise<R>;
    }): Promise<any>;
    /** Returns the full `{ count, data }` envelope, or just `data` when the client sent `x-request-count: false`; `X-Response-Count` is set either way. */
    normalizeCountData<ResponseSchema extends AnyType, RequestContext extends TRouteContext<RouteEnv> = TRouteContext<RouteEnv>, ResponseData extends {
        count: number;
        data?: TNullable<ResponseSchema>;
    } = {
        count: number;
        data?: TNullable<ResponseSchema>;
    }>(opts: {
        context: RequestContext;
        payload: ResponseData;
    }): TNullable<ResponseSchema> | ResponseData;
    /** `x-request-extra`, parsed: `name`, `-name` (a default switched off) and `name(key,key)`. */
    getRequestedExtras(opts: {
        context: TRouteContext<RouteEnv>;
    }): Array<IRequestedExtra>;
    /**
     * The one response call. Sets `X-Response-Format`, and with `range` (a list) also `Content-Range` -
     * `payload.count` is the rows of THIS response, never the total - then normalizes count/data per
     * the request-count header.
     *
     * `extra` offers figures beside the rows (see {@link TResponseExtra}): each runs when the client
     * names it in `x-request-extra`, or always when it is a default. When any runs, the body is
     * `{ data, extra }` (with `count` when it is requested); when none does, nothing is computed and the
     * body is what it would be without `extra`. A name the route does not offer is a 400 listing the
     * ones it does.
     */
    respond<R>(opts: {
        context: TRouteContext<RouteEnv>;
        format: TResponseFormat;
        payload: {
            count: number;
            data?: TNullable<R>;
        };
        range?: TDataRange;
        extra?: never;
    }): R | {
        count: number;
        data?: TNullable<R>;
    } | null | undefined;
    respond<R, Extra extends Record<string, TResponseExtra>>(opts: {
        context: TRouteContext<RouteEnv>;
        format: TResponseFormat;
        payload: {
            count: number;
            data?: TNullable<R>;
        };
        range?: TDataRange;
        extra: Extra;
    }): Promise<R | {
        count: number;
        data?: TNullable<R>;
    } | {
        count?: number;
        data?: TNullable<R>;
        extra: Partial<Record<keyof Extra, unknown>>;
    } | null | undefined>;
    respond<R>(opts: {
        context: TRouteContext<RouteEnv>;
        format: TResponseFormat;
        payload: {
            count: number;
            data?: TNullable<R>;
        };
        range?: TDataRange;
        extra?: Record<string, TResponseExtra>;
    }): ValueOrPromise<R | {
        count?: number;
        data?: TNullable<R>;
        extra?: Record<string, unknown>;
    } | null | undefined>;
    /** The `extra` half of `respond`: resolves what was asked against what is offered, runs it in parallel. */
    respondWithExtra<R>(opts: {
        context: TRouteContext<RouteEnv>;
        payload: {
            count: number;
            data?: TNullable<R>;
        };
        extra: Record<string, TResponseExtra>;
    }): Promise<R | {
        count: number;
        data?: TNullable<R>;
    } | {
        count: number;
        data: TNullable<R>;
        extra: Record<string, unknown>;
    } | {
        data: TNullable<R>;
        extra: Record<string, unknown>;
        count?: undefined;
    } | null | undefined>;
    /** The list headers without the body, for a list whose body is not a `{ count, data }` envelope: `Content-Range`, `X-Response-Count` = rows in THIS response, `X-Response-Format: array`. Pass a `range`, or `offset` + `total` for an engine that reports those (a search page): the range is derived with the same inclusive-end rule. */
    setListHeaders(opts: {
        context: TRouteContext<RouteEnv>;
        count: number;
    } & ({
        range: TDataRange;
    } | {
        offset: number;
        total: number;
    })): void;
    /** TRouteHandler's TRouteContext is a lightweight custom shape (different `json`/`req.valid` signatures) built on Hono's real Context, not a subtype of the RouteHandler `.openapi()` expects - genuinely different handler types bridged here. */
    toHonoHandler<ResponseType = unknown>(opts: {
        handler: TRouteHandler<ResponseType, RouteEnv>;
    }): Parameters<OpenAPIHono<RouteEnv>["openapi"]>[1];
    /** Creates a fluent binding for registering a route (call .to() to attach handler). */
    bindRoute<RouteConfig extends IAuthRouteConfig>(opts: {
        configs: RouteConfig;
    }): IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
    /** Defines and registers a route with its handler in a single call. */
    defineRoute<RouteConfig extends IAuthRouteConfig, ResponseType = unknown>(opts: {
        configs: RouteConfig;
        handler: TRouteHandler<ResponseType, RouteEnv>;
        hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
    }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
    /** Defines a JSX route that renders server-side HTML via c.html(). */
    defineJSXRoute<RouteConfig extends IAuthRouteConfig, ResponseType = unknown>(opts: {
        configs: RouteConfig;
        handler: TRouteHandler<ResponseType, RouteEnv>;
        hook?: Hook<any, RouteEnv, string, ValueOrPromise<any>>;
    }): IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
}
```

Source: `packages/kernel/src/base/controllers/rest/base.ts`

## `BaseService`

*class*

Base class for services; `scope` names the logger scope.

```ts
export declare abstract class BaseService extends BaseHelper implements IService {
    constructor(opts: {
        scope: string;
        identifier?: string;
    });
}
```

Source: `packages/kernel/src/base/services/base.ts`

## `bidiStream`

*const*

Bidirectional streaming RPC decorator. Equivalent to @rpc but automatically sets method to 'bidi_streaming'.

```ts
export declare const bidiStream: <RpcRouteConfigType extends Omit<IRpcMetadata, "method">>(opts: {
    configs: RpcRouteConfigType;
}) => (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rpc.ts`

## `BigIntIdType`

*type*

Bigint entity id.

```ts
export type BigIntIdType = bigint;
```

Source: `packages/kernel/src/base/models/common/types/id.ts`

## `BodyLimits`

*class*

The request body limit: the default every route gets, and the limit one route sets for itself.

The application installs the default (`DEFAULT_MAX_SIZE`) ahead of every other middleware, so no route reads
a body over it. A route that takes larger bodies (an upload, an import) puts `BodyLimits.route({ maxSize })`
in its `middleware`: the default steps aside for that route and this limit answers instead. The limit counts
the bytes that arrive, so a chunked body with no `Content-Length` is held to it too.

```ts
export declare class BodyLimits {
    /** The default of every route: 5 MiB. */
    static readonly DEFAULT_MAX_SIZE: number;
    /** The limiter itself: a body over `maxSize` bytes is the framework's 413, or the `onError` answer. */
    static limiter(opts: {
        maxSize: number;
        onError?: (context: Context) => Response | Promise<Response>;
    }): MiddlewareHandler;
    /**
     * The limit of one route, to put in the route's `middleware`. It replaces the default for this route, larger or smaller.
     * A body larger than the host accepts at all (`configs.server.maxRequestBodySize`, Bun's own cap) is still refused there.
     */
    static route(opts: {
        maxSize: number;
        onError?: (context: Context) => Response | Promise<Response>;
    }): MiddlewareHandler;
    /** Whether the route this request matched carries its own limit, so the default stands aside. */
    static hasRouteLimit(context: Context): boolean;
}
```

Source: `packages/kernel/src/base/applications/body-limit.ts`

## `BootSequence`

*class*

Composes a boot sequence by name instead of copying the array - a subclass reads exactly what it adds by reading its own override, without diffing two files by eye.

```ts
export declare class BootSequence {
    /** A duplicated name is refused as loudly as a missing one - picking the first match would splice a step into the wrong place silently. */
    private static indexOf;
    static insertAfter(opts: {
        steps: IBootSequenceStep[];
        target: string;
        step: IBootSequenceStep;
    }): IBootSequenceStep[];
}
```

Source: `packages/kernel/src/base/applications/boot-sequence.ts`

## `BootSteps`

*class*

The step names the kernel defines - the vocabulary a subclass targets with `BootSequence.insertAfter`. A server application adds its own on top (`ServerBootSteps` in `@venizia/ignis`).

```ts
export declare class BootSteps {
    static readonly STATIC_CONFIGURE = "staticConfigure";
    static readonly REGISTER_ARTIFACTS = "registerArtifacts";
    static readonly PRE_CONFIGURE = "preConfigure";
    static readonly REGISTER_DEFAULT_MIDDLEWARES = "registerDefaultMiddlewares";
    static readonly REGISTER_CONFIGURATIONS = "registerConfigurations";
    static readonly REGISTER_DATA_SOURCES = "registerDataSources";
    static readonly REGISTER_COMPONENTS = "registerComponents";
    static readonly REGISTER_CONTRIBUTED_DATA_SOURCES = "registerContributedDataSources";
    static readonly REGISTER_CONTROLLERS = "registerControllers";
    static readonly POST_CONFIGURE = "postConfigure";
    static readonly VERIFY_BINDINGS = "verifyBindings";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/kernel/src/base/applications/boot-sequence.ts`

## `CasbinDomainMatchingFunctions`

*class*

Casbin matching functions selectable for the domain match in `ICasbinEnforcerOptions.domainMatching`.

```ts
export declare class CasbinDomainMatchingFunctions {
    /** `*` is the only wildcard; exact compare otherwise. Safest for `Merchant_<uuid>` domains. */
    static readonly KEY_MATCH = "keyMatch";
    /** Adds URL-path `:param` segment matching. */
    static readonly KEY_MATCH_2 = "keyMatch2";
    /** Adds `{param}` segment matching. */
    static readonly KEY_MATCH_3 = "keyMatch3";
    /** `{param}` matching with repeated-name equality checks. */
    static readonly KEY_MATCH_4 = "keyMatch4";
    /** Treats the stored/policy value as a full regular expression. */
    static readonly REGEX_MATCH = "regexMatch";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): boolean;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `CasbinEnforcerCachedDrivers`

*class*

Cache backends for a Casbin enforcer's per-user policy lines.

```ts
export declare class CasbinEnforcerCachedDrivers {
    static readonly REDIS = "redis";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): boolean;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `CasbinEnforcerModelDrivers`

*class*

Where a Casbin enforcer reads its model from: a `file` path or inline `text`.

```ts
export declare class CasbinEnforcerModelDrivers {
    static readonly FILE = "file";
    static readonly TEXT = "text";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): boolean;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `CasbinRuleVariants`

*class*

Relation prefixes the Casbin MODEL declares (`p` + `g`..`g5`), which {@link AuthorizationPolicyVariants} maps onto (many app edge-types -> one rule). Keep in sync with the model's `[role_definition]`.

```ts
export declare class CasbinRuleVariants {
    /** Permission policy line. */
    static readonly P = "p";
    /** Numbered in request-tuple order (sub -> dom -> obj -> act): g (sub), g2/g3 (dom), g4 (obj), g5 (act). */
    /** Grouping #1 - role membership + role inheritance (user→role, role→role). The `sub` axis. */
    static readonly G = "g";
    /** Grouping #2 - user→domain membership (join_domain). The `dom` axis (membership). */
    static readonly G2 = "g2";
    /** Grouping #3 - domain hierarchy. The `dom` axis (nesting). */
    static readonly G3 = "g3";
    /** Grouping #4 - resource hierarchy. The `obj` axis. */
    static readonly G4 = "g4";
    /** Grouping #5 - action hierarchy. The `act` axis. */
    static readonly G5 = "g5";
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `ChangePasswordRequestSchema`

*const*

Validates a change-password body: `scheme`, `oldCredential` and `newCredential` (each at least 8 characters) and the `userId`.

```ts
export declare const ChangePasswordRequestSchema: z.ZodObject<{
    scheme: z.ZodString;
    oldCredential: z.ZodString;
    newCredential: z.ZodString;
    userId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
}, z.core.$strip>;
```

Source: `packages/kernel/src/base/auth/models/requests/change-password.schema.ts`

## `clientStream`

*const*

Client streaming RPC decorator. Equivalent to @rpc but automatically sets method to 'client_streaming'.

```ts
export declare const clientStream: <RpcRouteConfigType extends Omit<IRpcMetadata, "method">>(opts: {
    configs: RpcRouteConfigType;
}) => (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rpc.ts`

## `commonResponseHeaders`

*const*

OpenAPI response headers every CRUD route documents: the request tracing id, the record count and the response format.

```ts
export declare const commonResponseHeaders: TResponseHeaders;
```

Source: `packages/kernel/src/base/controllers/common/constants.ts`

## `CommonStatuses`

*class*

Common reusable entity statuses.

```ts
export declare class CommonStatuses {
    static readonly UNKNOWN = "000_UNKNOWN";
    static readonly ACTIVATED = "201_ACTIVATED";
    static readonly DEACTIVATED = "401_DEACTIVATED";
    static readonly BLOCKED = "403_BLOCKED";
    static readonly ARCHIVED = "405_ARCHIVED";
    static readonly SCHEME_SET: Set<string>;
    static isValid(scheme: string): boolean;
}
```

Source: `packages/kernel/src/common/statuses/common.ts`

## `CompressEncodings`

*class*

The `encoding` of `ICompressOptions`.

```ts
export declare class CompressEncodings {
    static readonly GZIP = "gzip";
    static readonly DEFLATE = "deflate";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/kernel/src/base/applications/common/constants.ts`

## `Container`

*class*

Dependency injection container whose metadata registry is the IGNIS `MetadataRegistry`.

```ts
export declare class Container extends DIContainer {
    logger: ILogger;
    /** Resolved through `BaseHelper`, which asks `LoggerFactory` (browser-pure, the console by default). A server host gets the provider the application chose, or Winston when it chose none. */
    constructor(opts?: {
        scope: string;
    });
    getMetadataRegistry(): _MetadataRegistry;
}
```

Source: `packages/kernel/src/helpers/inversion/container.ts`

## `ContextUtility`

*class*

Casts of the Hono context that the types cannot prove.

```ts
export declare class ContextUtility {
    /** Casts middleware context to TContext (safe -- structurally identical to Context). */
    static asTypedContext<E extends Env>(opts: {
        context: unknown;
    }): TContext<E, string>;
}
```

Source: `packages/kernel/src/base/controllers/context.ts`

## `controller`

*const*

Class decorator that registers the class as a controller artifact and stores its `path`, tags and transport (REST by default, or gRPC with a `service`).

**Example**
```typescript
import { BaseRestController, controller } from '@venizia/ignis';

export @controller({ path: '/orders', tags: ['Order'] })
class OrderController extends BaseRestController {
  constructor() {
    super({ scope: OrderController.name, path: '/orders' });
  }

  override binding(): void {}
}
```

```ts
export declare const controller: (metadata: TControllerMetadata) => ClassDecorator;
```

Source: `packages/kernel/src/base/metadata/routes/controller.ts`

## `ControllerFactory`

*class*

Factory for generating typed CRUD controllers from entity definitions.

```ts
export declare class ControllerFactory extends BaseHelper {
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
        controllerName: string;
        repositoryName: string;
    }): void;
    static defineCrudController<TEntity extends AbstractEntity<TAnyObjectSchema> = AbstractEntity<TAnyObjectSchema>, Routes extends ICustomizableRoutes = ICustomizableRoutes, RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ConfigurableOptions extends object = {}, TDataObject extends object = TEntityDataObject<TEntity>, TPersistObject extends object = TEntityPersistObject<TEntity>>(defOpts: ICrudControllerOptions<TEntity, Routes>): {
        new (repository: AbstractRepository<TDataObject, TPersistObject, AnyType>): {
            /** Registers each CRUD route whose handler tier supplies it, honoring enabledRoutes/readonly. */
            binding(): ValueOrPromise<void>;
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
            }): Promise<any>;
            normalizeCountData<ResponseSchema extends unknown, RequestContext extends import("../index.js").TRouteContext<RouteEnv> = import("../index.js").TRouteContext<RouteEnv>, ResponseData extends {
                count: number;
                data?: import("@venizia/ignis-helpers/common").TNullable<ResponseSchema>;
            } = {
                count: number;
                data?: import("@venizia/ignis-helpers/common").TNullable<ResponseSchema>;
            }>(opts: {
                context: RequestContext;
                payload: ResponseData;
            }): ResponseData | import("@venizia/ignis-helpers/common").TNullable<ResponseSchema>;
            getRequestedExtras(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
            }): Array<import("../index.js").IRequestedExtra>;
            respond<R>(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
                format: import("../index.js").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-helpers/common").TNullable<R>;
                };
                range?: import("../../repositories/index.js").TDataRange;
                extra?: never;
            }): R | {
                count: number;
                data?: import("@venizia/ignis-helpers/common").TNullable<R>;
            } | null | undefined;
            respond<R, Extra extends Record<string, import("../index.js").TResponseExtra>>(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
                format: import("../index.js").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-helpers/common").TNullable<R>;
                };
                range?: import("../../repositories/index.js").TDataRange;
                extra: Extra;
            }): Promise<R | {
                count: number;
                data?: import("@venizia/ignis-helpers/common").TNullable<R>;
            } | {
                count?: number;
                data?: import("@venizia/ignis-helpers/common").TNullable<R>;
                extra: Partial<Record<keyof Extra, unknown>>;
            } | null | undefined>;
            respond<R>(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
                format: import("../index.js").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-helpers/common").TNullable<R>;
                };
                range?: import("../../repositories/index.js").TDataRange;
                extra?: Record<string, import("../index.js").TResponseExtra>;
            }): ValueOrPromise<R | {
                count?: number;
                data?: import("@venizia/ignis-helpers/common").TNullable<R>;
                extra?: Record<string, unknown>;
            } | null | undefined>;
            respondWithExtra<R>(opts: {
                context: import("../index.js").TRouteContext<RouteEnv>;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-helpers/common").TNullable<R>;
                };
                extra: Record<string, import("../index.js").TResponseExtra>;
            }): Promise<R | {
                count: number;
                data?: import("@venizia/ignis-helpers/common").TNullable<R>;
            } | {
                count: number;
                data: import("@venizia/ignis-helpers/common").TNullable<R>;
                extra: Record<string, unknown>;
            } | {
                data: import("@venizia/ignis-helpers/common").TNullable<R>;
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
            toHonoHandler<ResponseType = unknown>(opts: {
                handler: import("../index.js").TRouteHandler<ResponseType, RouteEnv>;
            }): import("hono").Handler<RouteEnv, string, import("hono").Input, (Response | Promise<Response>) | (import("@hono/zod-openapi").RouteConfigToTypedResponse<import("@hono/zod-openapi").RouteConfig> | Promise<import("@hono/zod-openapi").RouteConfigToTypedResponse<import("@hono/zod-openapi").RouteConfig>>)>;
            bindRoute<RouteConfig extends import("../index.js").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): import("../index.js").IBindRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
            defineRoute<RouteConfig extends import("../index.js").IAuthRouteConfig, ResponseType = unknown>(opts: {
                configs: RouteConfig;
                handler: import("../index.js").TRouteHandler<ResponseType, RouteEnv>;
                hook?: import("@hono/zod-openapi").Hook<any, RouteEnv, string, any> | undefined;
            }): import("../index.js").IDefineRouteOptions<RouteConfig, RouteEnv, RouteSchema, BasePath>;
            defineJSXRoute<RouteConfig extends import("../index.js").IAuthRouteConfig, ResponseType = unknown>(opts: {
                configs: RouteConfig;
                handler: import("../index.js").TRouteHandler<ResponseType, RouteEnv>;
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
            }): RouteConfig & {
                getRoutingPath(): RouteConfig["path"] extends infer T ? T extends RouteConfig["path"] ? T extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${/*elided*/ any}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : T : never : never;
            };
            getJSXRouteConfigs<RouteConfig extends import("../index.js").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): RouteConfig & {
                getRoutingPath(): RouteConfig["path"] extends infer T ? T extends RouteConfig["path"] ? T extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${/*elided*/ any}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : Rest}` : T : never : never;
            };
            scope: string;
            identifier: string;
            get logger(): import("@venizia/ignis-helpers/core").ILogger;
            set logger(value: import("@venizia/ignis-helpers/core").ILogger);
            getIdentifier(): string;
            getLogger(): import("@venizia/ignis-helpers/core").ILogger;
        };
    };
    private static describeSpec;
    /**
     * Refuses a CRUD controller whose enabled write verb would inherit a controller-level `authorize`
     * that is only a `read` permission: the verb would then answer to anyone who may read.
     *
     * A write verb is fine when it declares its own `authorize` (a spec, an array, or `{ skip: true }`),
     * skips authentication, is not enabled, or the controller is `readonly`. Only the literal action
     * `read` is detected; a custom action name is the application's own vocabulary. An array counts when
     * every spec in it is `read`, since the specs of one route must all pass.
     */
    static assertWriteVerbsDeclareAuthorize(opts: {
        controllerName: string;
        authorize: IAuthorizationSpec | IAuthorizationSpec[] | undefined;
        routes: ICustomizableRoutes | undefined;
        readonly: boolean | undefined;
        enabledRoutes: Array<keyof ICustomizableRoutes> | undefined;
    }): void;
}
```

Source: `packages/kernel/src/base/controllers/factory/controller.ts`

## `ControllerTransports`

*class*

Transport protocol constants for controllers.

```ts
export declare class ControllerTransports {
    static readonly REST = "rest";
    static readonly GRPC = "grpc";
}
```

Source: `packages/kernel/src/base/controllers/common/constants.ts`

## `CoreBindings`

*class*

Core binding keys for fundamental application components and configuration.

```ts
export declare class CoreBindings extends BindingKeys {
    static readonly APPLICATION_INSTANCE = "@app/instance";
    static readonly APPLICATION_SERVER = "@app/server";
    static readonly APPLICATION_CONFIG = "@app/config";
    static readonly APPLICATION_PROJECT_ROOT = "@app/project_root";
    static readonly APPLICATION_ROOT_ROUTER = "@app/router/root";
    static readonly APPLICATION_ENVIRONMENTS = "@app/environments";
    static readonly APPLICATION_MIDDLEWARE_OPTIONS = "@app/middleware_options";
}
```

Source: `packages/kernel/src/common/bindings.ts`

## `countableHeaders`

*const*

Request header schema for the `x-request-count-data` header, which switches a response between `{ count, data }` and the raw payload.

```ts
export declare const countableHeaders: z.ZodObject<{
    "x-request-count": z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
```

Source: `packages/kernel/src/base/controllers/common/schemas.ts`

## `CountSchema`

*const*

The zod-backed result schema, kept apart from `results.ts` ON PURPOSE. `z.object()` runs at module
load, so any bundle reaching this file carries the whole of zod - and `results.ts` is on
`AbstractRepository`'s path, which a consumer that never serves HTTP still needs.

```ts
export declare const CountSchema: z.ZodObject<{
    count: z.ZodDefault<z.ZodNumber>;
}, z.core.$strip>;
```

Source: `packages/kernel/src/base/repositories/common/types/result-schemas.ts`

## `DATA_SOURCE_BRAND`

*const*

Brands the datasource root so `@repository` can recognise a subclass WITHOUT `instanceof`.

Two copies of this package give two `AbstractDataSource` classes, and `instanceof` across them is
false - the same trap `isApplicationError` exists to avoid for `ApplicationError`. `Symbol.for` is
realm-keyed, so both copies produce this exact symbol, and a static is inherited by every
subclass however deep.

```ts
export declare const DATA_SOURCE_BRAND: unique symbol;
```

Source: `packages/kernel/src/base/datasources/abstract.ts`

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
export declare class DataSourceOpenModes {
    static readonly START = "start";
    static readonly FIRST_USE = "first-use";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TDataSourceOpenMode;
}
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `defaultRequestHeaders`

*const*

Default request headers of a CRUD route: the trackable headers plus the count header.

```ts
export declare const defaultRequestHeaders: z.ZodObject<{
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
}) => (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
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
     * rejection of that function's own promise - `RetryHelper.executeWithRetry`'s attempt loop never
     * sees the difference.
     *
     * `RetryHelper.executeWithRetry` is used without its own `logger` - its internal per-attempt/exhaustion
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
     * `RetryHelper`'s own default cap on a SINGLE delay: a dispatch holds a handler's resources - e.g.
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
export declare class EventHandlerTypes {
    /** `handler.key` is resolved from the container on every retry attempt - a rebind reaches an attempt already in flight. */
    static readonly BINDING_KEY = "binding-key";
    /** `handler.fn` is invoked directly as a captured closure - there is nothing to rebind, so every attempt in a retry window calls the exact function registered here. */
    static readonly FUNCTION = "function";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): value is TEventHandlerType;
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
        where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
        fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
        include: z.ZodOptional<z.ZodArray<z.ZodObject<{
            relation: z.ZodString;
            scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
        }, z.core.$strip>>>;
        order: z.ZodOptional<z.ZodArray<z.ZodString>>;
        limit: z.ZodOptional<z.ZodNumber>;
        offset: z.ZodOptional<z.ZodNumber>;
        skip: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodObject<{
        where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
        fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
        include: z.ZodOptional<z.ZodArray<z.ZodObject<{
            relation: z.ZodString;
            scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
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
    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
    include: z.ZodOptional<z.ZodArray<z.ZodObject<{
        relation: z.ZodString;
        scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
    }, z.core.$strip>>>;
    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
    limit: z.ZodOptional<z.ZodNumber>;
    offset: z.ZodOptional<z.ZodNumber>;
    skip: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodObject<{
    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
    include: z.ZodOptional<z.ZodArray<z.ZodObject<{
        relation: z.ZodString;
        scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
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
}) => (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
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
    [key: string]: any;
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
    [extra: string | symbol]: any;
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

Route configuration extended with optional authenticate and authorize fields.

```ts
export interface IAuthRouteConfig extends HonoRouteConfig {
    authenticate?: {
        strategies?: TAuthStrategy[];
        mode?: TAuthMode;
    };
    authorize?: IAuthorizationSpec | IAuthorizationSpec[];
}
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `IAuthService`

*interface*

The service behind the auth controller routes. `getUserInformation` and `refreshToken` are optional. The type parameters set each route's request and response types.

```ts
export interface IAuthService<E extends Env = Env, SIRQ extends TSignInRequest = TSignInRequest, SIRS = AnyObject, SURQ extends TSignUpRequest = TSignUpRequest, SURS = AnyObject, CPRQ extends TChangePasswordRequest = TChangePasswordRequest, CPRS = AnyObject, UIRQ = AnyObject, UIRS = AnyObject, RTRS = AnyObject> {
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
    [extra: string | symbol]: any;
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
    [extra: string | symbol]: any;
}
```

Source: `packages/kernel/src/base/applications/common/types/middlewares.ts`

## `IBindRouteOptions`

*interface*

Fluent binding for two-step route registration: bindRoute({ configs }).to({ handler }).

```ts
export interface IBindRouteOptions<RouteConfig extends HonoRouteConfig, RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/'> {
    configs: RouteConfig;
    to: <ResponseType = unknown>(opts: {
        handler: TRouteHandler<ResponseType, RouteEnv>;
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
    defineRoute<RouteConfig extends IAuthRouteConfig, ResponseType = unknown>(opts: {
        configs: RouteConfig;
        handler: TRouteHandler<ResponseType, RouteEnv>;
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

Configuration options for creating a CRUD controller via ControllerFactory.defineCrudController.

```ts
export interface ICrudControllerOptions<TEntity extends AbstractEntity = AbstractEntity, Routes extends ICustomizableRoutes = ICustomizableRoutes> {
    /** Entity class or resolver returning it - its schema drives the inferred DataObject/PersistObject types of the generated controller's `repository`. */
    entity: TClass<TEntity> | TResolver<TClass<TEntity>>;
    /** Repository binding configuration */
    repository: {
        name: string;
    };
    controller: {
        name: string;
        basePath: string;
        readonly?: boolean;
        /** Whitelist of routes to register; overrides per-route `enabled` flags in `routes` when set. */
        enabledRoutes?: Array<keyof ICustomizableRoutes>;
        isStrict?: {
            path?: boolean;
            requestSchema?: boolean;
        };
    };
    /** Authentication config applied to all routes (unless overridden per-route). */
    authenticate?: {
        strategies?: TAuthStrategy[];
        mode?: TAuthMode;
    };
    /** Authorization config applied to all routes (unless overridden per-route). */
    authorize?: IAuthorizationSpec | IAuthorizationSpec[];
    /** Per-route configuration combining schema and auth overrides. */
    routes?: Routes;
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
export interface IDefineRouteOptions<RouteConfig extends HonoRouteConfig, RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/'> {
    configs: ReturnType<typeof createRoute<string, RouteConfig>>;
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
export declare class IdSchemaTypes {
    static readonly NUMBER = "number";
    static readonly STRING = "string";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
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
    key: string;
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

## `IJWKSHosts`

*interface*

Where a JWKS may be fetched over plain `http:`. A JWKS URL is `https:` unless its host is loopback (`localhost`,
`127.0.0.0/8`, `::1`) or is listed in `http`.

```ts
export interface IJWKSHosts {
    /**
     * Exact hosts that may serve a JWKS over `http:`: a name (`identity-service`), an IPv4 address (`10.0.0.5`) or an
     * IPv6 address in brackets (`[fd00::1]`), each with an optional `:port` (`10.0.0.5:8080`, `[fd00::1]:8443`). An entry
     * without a port covers every port of that host; an entry with one covers that port only. Never a wildcard, range or
     * CIDR. An entry is valid only when `new URL('http://' + entry)` gives the same host back, so `2130706433` and
     * `[::ffff:10.0.0.5]` refuse the boot, as do a scheme, a path, credentials or an empty label.
     */
    http?: string[];
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

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
    /** Where the key set may be fetched from over `http:`. Unset means `https:` or loopback only. */
    jwks?: {
        hosts?: IJWKSHosts;
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
    [extra: string | symbol]: any;
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
    [extra: string | symbol]: any;
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

## `IModelAccessWriteSettings`

*interface*

What a restricted caller may write to the scope columns (`@model` settings.access.write).

```ts
export interface IModelAccessWriteSettings {
    /**
     * What a create, createAll or an update payload that names a scope column does when its value
     * disagrees with the resolved scope. `reject` refuses the write and writes nothing - for
     * `createAll` not even the valid rows. `assign` also fills a scope column that is ABSENT from a
     * created row, when the scope is a single equality; a value that is present and disagrees is
     * still refused.
     *
     * The scope's columns and allowed values are read from the resolved `where` (equality, `eq`, `inq`
     * and arrays, `and`, and an `or` over one column). Any other shape cannot be checked, and the write
     * is refused with its own message - never skipped. `ScopeFilters.UNRESTRICTED` bypasses the guard
     * too, which is the deliberate way to write across scopes (system scope, an admin role).
     *
     * Not checked: an update that does not name the scope column (the row was already selected through
     * the scoped `where`), and raw statements that bypass the repository.
     *
     * @default 'reject'
     */
    mode?: TScopeWriteGuard;
    /**
     * `true` lets a restricted caller write `null` to a scope column, or leave it out on create: the
     * row has no owner and is shared. Without it, `null` is refused like any other value
     * outside the scope, even when the resolved scope has a `null` branch (that branch lets the caller
     * READ shared rows, a separate permission). Reads are scoped as before.
     *
     * @default false
     */
    sharedRows?: boolean;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/model.ts`

## `IModelAuthorizeSettings`

*interface*

The `authorize` settings of a model.

```ts
export interface IModelAuthorizeSettings {
    /** The authorization principal name (resource/subject) for this model. */
    principal: string;
    /** Extensible - consumers can add any extra authorization metadata. */
    [extra: string | symbol]: any;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/model.ts`

## `IModelMetadata`

*interface*

Metadata accepted by `@model`.

```ts
export interface IModelMetadata extends IArtifactRegistrationOptions {
    /**
     * `ModelTypes.ENTITY` is the only value.
     *
     * @default ModelTypes.ENTITY
     */
    type?: TModelType;
    tableName?: string;
    /** Migration marker for consumer tooling that reads the public registry. */
    migration?: IModelMigrationSettings;
    settings?: IModelSettings;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/model.ts`

## `IModelMigrationSettings`

*interface*

Whether tooling that reads the model registry should migrate this model (`@model({ migration })`).

```ts
export interface IModelMigrationSettings {
    /**
     * `false` marks the model as one a migration tool leaves alone. IGNIS generates no migrations itself.
     *
     * @default true
     */
    use?: boolean;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/model.ts`

## `IModelQuerySettings`

*interface*

What a query runs with when it names nothing (`@model` settings.query).

```ts
export interface IModelQuerySettings {
    /** Default filter auto-applied to all repository operations. Bypassable via shouldSkipDefaultFilter. */
    filter?: TFilter;
    limit?: {
        /**
         * Row limit when a query omits `limit`. Must be a positive integer.
         *
         * @default DEFAULT_LIMIT
         */
        default?: number;
        /**
         * Largest `limit` a CALLER may ask for. Must be a positive integer.
         *
         * Policy, not capacity - the engine's own ceiling sits far above it. The number is chosen so
         * that reaching it means the caller is doing something unusual, and raising it is how a model
         * says so deliberately.
         *
         * @default DEFAULT_MAX_LIMIT
         */
        max?: number;
    };
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/model.ts`

## `IModelRegistryEntry`

*interface*

One model as stored in the metadata registry: class, metadata and schema, with lazily resolved relations.

```ts
export interface IModelRegistryEntry<Model extends AbstractEntity = AbstractEntity> {
    target: TValueOrResolver<TClass<Model>>;
    metadata: IModelMetadata;
    schema: unknown;
    /** Lazy resolver to avoid circular deps. Resolved when DataSource builds schema. */
    relationsResolver?: TValueOrResolver<Array<unknown>>;
    /** Cache populated on first buildSchema() call. */
    _builtRelations?: unknown;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/model.ts`

## `IModelSettings`

*interface*

Per-model settings passed to `@model` as `settings`.

```ts
export interface IModelSettings {
    /** Properties excluded from all query results at SQL level. */
    hiddenProperties?: string[];
    /** Default filter and limits of a query: `filter`, `limit.default`, `limit.max`. */
    query?: IModelQuerySettings;
    /**
     * Row access: the scope ANDed into every read and write whose scope is expressible as a filter
     * clause, NOT removable by `shouldSkipDefaultFilter`, and the guard that holds writes to it.
     * Ownership resolved per row or through a polymorphic reference is NOT expressible here - that
     * check is still the application's to perform.
     *
     * Relational repositories only - a search-backed model (Typesense, Meilisearch) never reads
     * this setting, so mirroring a scoped entity into a search index needs its own query-time scope.
     */
    access?: TModelAccessSettings;
    /** Authorization settings for this model (principal name, etc.). */
    authorize?: IModelAuthorizeSettings;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/model.ts`

## `InclusionSchema`

*const*

Relations to include: an array of `{ relation, scope? }` where `scope` is a nested filter.

```ts
export declare const InclusionSchema: z.ZodOptional<z.ZodArray<z.ZodObject<{
    relation: z.ZodString;
    scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
}, z.core.$strip>>>;
```

Source: `packages/kernel/src/base/repositories/query-schemas/index.ts`

## `IPayloadFieldCodec`

*interface*

Converts one payload field, found under `key`, to a string and back around the AES envelope.

```ts
export interface IPayloadFieldCodec<T = unknown> {
    key: string;
    serialize(opts: {
        value: T;
    }): string;
    deserialize(opts: {
        raw: string;
    }): T;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

## `IPostgresError`

*interface*

A Postgres error as every driver reports it, under one set of names. Only `code` is always there; the rest is what the server sent for that error.

```ts
export interface IPostgresError {
    /** The 5-character SQLSTATE (`23505`, `40P01`, ...); compare it with `PostgresErrorCodes`. */
    code: string;
    constraint?: string;
    detail?: string;
    table?: string;
    column?: string;
    schema?: string;
    message?: string;
}
```

Source: `packages/kernel/src/base/middlewares/app-error/common/types.ts`

## `IProvideMetadata`

*interface*

One `@provide` method: the key it binds, and the binding scope of the value.

```ts
export interface IProvideMetadata {
    methodName: string | symbol;
    key: string;
    /** @default BindingScopes.SINGLETON */
    scope?: TBindingScope;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/artifact.ts`

## `IQueryHandlerOptions`

*interface*

Options passed to query operator handler functions.

```ts
export interface IQueryHandlerOptions<T = any> {
    column: Column;
    value: T;
}
```

Source: `packages/kernel/src/base/repositories/common/types/query.ts`

## `IReadRetryOptions`

*interface*

Read-after-write retry for read verbs behind a replicated pool. The read re-executes while
`until(result)` returns false; on exhaustion the last result is returned as-is.

```ts
export interface IReadRetryOptions<TResult> {
    /** @default 3 */
    maxAttempts?: number;
    /** Total budget in ms across attempts AND sleeps. Unlimited when omitted. */
    maxTotalMs?: number;
    /**
     * Aborts between attempts and during backoff sleeps - pass the request signal so a cancelled
     * request stops retrying.
     */
    signal?: AbortSignal;
    /**
     * Backoff between attempts, tuned for replica lag.
     *
     * @default { strategy: RetryBackoffStrategies.EXPONENTIAL, initialDelayMs: 50, maxDelayMs: 500, jitter: RetryJitterModes.EQUAL }
     */
    backoff?: IRetryBackoffOptions;
    /**
     * Retry while false. With none given, `findOne` and `findById` retry on a null row and `find` on an empty list.
     */
    until?: (result: TResult) => boolean;
}
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `IRemoteRepositoryMetadata`

*interface*

`RepositoryTypes.REMOTE` - data behind another service's API: a datasource and no model.

```ts
export interface IRemoteRepositoryMetadata<DataSource extends IDataSource = IDataSource> extends IRepositoryMetadataBase<DataSource> {
    type: typeof RepositoryTypes.REMOTE;
    model?: never;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/persistence.ts`

## `IRepositoryBinding`

*interface*

Links a model to the repository and datasource that serve it, each given as a value or a resolver.

```ts
export interface IRepositoryBinding<Model extends AbstractEntity = AbstractEntity, DataSource extends IDataSource = IDataSource> {
    model: TValueOrResolver<TClass<Model>>;
    repository: TValueOrResolver<TDecoratorTarget<IRepository>>;
    dataSource: TValueOrResolver<string | TDecoratorTarget<DataSource>>;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/persistence.ts`

## `IRepositoryMetadata`

*interface*

`RepositoryTypes.MODEL` - a model this application declares.

```ts
export interface IRepositoryMetadata<Model extends AbstractEntity = AbstractEntity, DataSource extends IDataSource = IDataSource> extends IRepositoryMetadataBase<DataSource> {
    /** @default RepositoryTypes.MODEL */
    type?: typeof RepositoryTypes.MODEL;
    model: TValueOrResolver<TClass<Model>>;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/persistence.ts`

## `IRepositoryMetadataBase`

*interface*

Members every repository type shares.

```ts
export interface IRepositoryMetadataBase<DataSource extends IDataSource = IDataSource> extends IArtifactRegistrationOptions {
    dataSource: string | TValueOrResolver<TClass<DataSource>>;
    operationScope?: TRepositoryOperationScope;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/persistence.ts`

## `IRepositoryMixin`

*interface*

Mixin contract for registering datasources and repositories on the application.

```ts
export interface IRepositoryMixin {
    dataSource<Base extends IDataSource<Options>, Options extends object = {}>(target: TClass<Base>, opts?: TMixinOpts<Options>): Binding<Base>;
    repository<Base extends IRepository>(target: TClass<Base>, opts?: TMixinOpts): Binding<Base>;
}
```

Source: `packages/kernel/src/base/mixins/common/types.ts`

## `IRequestedExtra`

*interface*

One entry of `x-request-extra`: `name`, `-name` (a default switched off), `-*` (every default off) or `name(key,key)`.

```ts
export interface IRequestedExtra {
    name: string;
    isExcluded: boolean;
    keys?: Array<string>;
}
```

Source: `packages/kernel/src/base/controllers/rest/extras.ts`

## `IRequestFilterJudge`

*interface*

How one model judges a key of a request filter. The repository of a model supplies it, so the judgment reads a key the way
that model's own query does (a relational JSON path names its first part, a search field is a dotted name), and a refusal
is the error that query gives for a column or field that does not exist.

```ts
export interface IRequestFilterJudge {
    /** Whether the key reaches a field the model hides. */
    isHidden(opts: {
        key: string;
    }): boolean;
    /** The error to throw for a key that is hidden: the one an unknown column or field gets, so a caller cannot tell them apart. */
    refuse(opts: {
        kind: TRequestFilterKeyKind;
        key: string;
        tableName: string;
    }): Error;
    /** The judge of the model a relation of this model points to; `undefined` when the relation is unknown (the query refuses it). A nested include is judged by the relation judge's own `relation`. */
    relation?(opts: {
        relation: string;
    }): IRequestFilterJudge | undefined;
}
```

Source: `packages/kernel/src/base/repositories/common/request-filter-guard.ts`

## `IRequestFilterShape`

*interface*

What a request filter holds that names fields: `where`, `order` and the `include` scopes.

```ts
export interface IRequestFilterShape {
    where?: unknown;
    order?: unknown;
    include?: unknown;
}
```

Source: `packages/kernel/src/base/repositories/common/request-filter-guard.ts`

## `IRequestIdOptions`

*interface*

Options of the request id middleware. Only the shared options apply.

```ts
export interface IRequestIdOptions extends IBaseMiddlewareOptions {
}
```

Source: `packages/kernel/src/base/applications/common/types/middlewares.ts`

## `IResolvedRepositoryMetadata`

*interface*

Resolved repository metadata after lazy evaluation.

```ts
export interface IResolvedRepositoryMetadata<Model extends AbstractEntity = AbstractEntity, DataSource extends IDataSource = IDataSource> {
    type?: TRepositoryType;
    model?: TClass<Model>;
    dataSource?: string | TClass<DataSource>;
    operationScope?: TRepositoryOperationScope;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/persistence.ts`

## `IRestApplication`

*interface*

The REST application contract: `IApplication` plus the component, controller, repository, service and static-serve registration mixins.

```ts
export interface IRestApplication extends IApplication, IComponentMixin, IControllerMixin, IRepositoryMixin, IServiceMixin, IStaticServeMixin {
}
```

Source: `packages/kernel/src/base/applications/common/types/application.ts`

## `IRestComponentConfig`

*interface*

Options of the REST component. Currently has no keys.

```ts
export interface IRestComponentConfig {
}
```

Source: `packages/kernel/src/base/components/controller/rest/common/types.ts`

## `IRestControllerMetadata`

*interface*

Metadata of a REST controller; `transport` may be left out.

```ts
export interface IRestControllerMetadata extends IBaseControllerMetadata {
    transport?: typeof ControllerTransports.REST;
}

interface IBaseControllerMetadata extends IArtifactRegistrationOptions {
    path: string;
    tags?: string[];
    description?: string;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/controller.ts`

## `IRpcMetadata`

*interface*

Metadata of one gRPC method on a controller.

```ts
export interface IRpcMetadata {
    /** Proto method name. */
    name: string;
    /** RPC method type (unary, server_streaming, etc.). */
    method: TGrpcMethod;
    /** Authentication config for this RPC method. */
    authenticate?: {
        strategies?: TAuthStrategy[];
        mode?: TAuthMode;
    };
    /** Authorization spec(s) for this RPC method. */
    authorize?: IAuthorizationSpec | IAuthorizationSpec[];
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/controller.ts`

## `isDataSourceClass`

*const*

True for `AbstractDataSource` itself and for any class extending it, across package copies.

```ts
export declare const isDataSourceClass: (value: unknown) => value is TClass<AnyType>;
```

Source: `packages/kernel/src/base/datasources/abstract.ts`

## `ISearchableDataSourceCapabilities`

*interface*

Capabilities of a search datasource. Each `search` flag tells whether the engine supports that feature.

```ts
export interface ISearchableDataSourceCapabilities extends IDataSourceCapabilities {
    search?: {
        /** Vector / semantic / hybrid search (search engines). */
        vector?: boolean;
        /** Batched multi-query search across collections. */
        multi?: boolean;
        /** Merged (union) result set across a multi-search. */
        union?: boolean;
        /** Synonym sets (multi-way / one-way). */
        synonyms?: boolean;
    };
}
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `IServerConfigMixin`

*interface*

Mixin contract for the application lifecycle hooks of a server and its reported version.

```ts
export interface IServerConfigMixin {
    staticConfigure(): ValueOrPromise<void>;
    preConfigure(): ValueOrPromise<void>;
    postConfigure(): ValueOrPromise<void>;
    getApplicationVersion(): ValueOrPromise<string>;
}
```

Source: `packages/kernel/src/base/mixins/common/types.ts`

## `IService`

*interface*

Marker interface every service implements, so mixins can constrain registration to services.

```ts
export interface IService {
}
```

Source: `packages/kernel/src/base/services/common/types.ts`

## `IServiceAssertionClaims`

*interface*

The request binding, following RFC 9449's `htm`/`htu`. A captured assertion cannot be replayed
against a different method or path.

`htu` is the percent-ENCODED pathname on both ends. Compare it against
`new URL(context.req.url).pathname`, never `context.req.path` - Hono hands that one back DECODED,
so any route carrying a space or a non-ASCII slug would never match what the caller signed.

```ts
export interface IServiceAssertionClaims extends JWTPayload {
    htm: string;
    htu: string;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/service.ts`

## `IServiceAuthOptions`

*interface*

Service-to-service authentication: an Ed25519 assertion per request, verified against the caller's JWKS.

```ts
export interface IServiceAuthOptions<E extends Env = Env> {
    /** What this service calls itself: the `iss` it stamps, and the `aud` it demands. */
    name: string;
    /**
     * Present only on a service that CALLS OUT. Absent means verify-only, and no certs route is
     * mounted - which is the common case, since most services are called and never call.
     */
    keys?: {
        driver: TJWKSKeyDriver;
        format: TJWKSKeyFormat;
        /** PEM or JWK by `format`; content for the `text` driver, a path for `file`. */
        private: string;
        public: string;
        kid?: string;
    };
    /**
     * Caller name to its JWKS url. THIS IS ALSO THE ALLOWLIST - a name absent from the map cannot
     * call, and an empty map correctly allows nobody.
     *
     * The bare-string form is the common case. The object form exists to widen the accepted age for
     * ONE caller: a nightly batch may legitimately need more slack than an interactive service, and
     * granting it per caller keeps the concession named and visible in config.
     */
    callers?: Record<string, TServiceCallerEntry>;
    /** Where the certs route is mounted. */
    rest?: {
        /** @default '/svc-certs' */
        path: string;
    };
    /**
     * How long the assertions this service MINTS stay valid. Only meaningful where `keys` is set.
     *
     * @default 60
     */
    signLifetimeSeconds?: number;
    /**
     * The oldest assertion this service ACCEPTS, measured from `iat`.
     *
     * Deliberately separate from `signLifetimeSeconds`, and deliberately not requestable by the
     * caller. The caller already controls `exp` - it signs the token - so this is the only bound that
     * survives a compromised caller. A per-caller override belongs in {@link callers}, never in the
     * assertion.
     *
     * Composes with `clockToleranceSeconds`: the real acceptance window is the sum of the two.
     *
     * @default 60
     */
    acceptMaxAgeSeconds?: number;
    /**
     * Clock skew allowance. A SECURITY knob, not an operational one.
     *
     * Its job is the future case: two machines never agree to the second, and without it a caller one
     * second ahead is refused outright. But it also widens the REPLAY window second for second - a
     * callee accepting an `iat` 5s in its own future keeps accepting that token for the rest of the
     * window too. Measured at the defaults: 65s accepted on our clock, 70s of wall-clock life for a
     * capture minted by a caller running the full tolerance fast.
     *
     * @default 5
     */
    clockToleranceSeconds?: number;
    jwks?: {
        /** @default 600_000 */
        cacheMaxAgeMs?: number;
        /** @default 30_000 */
        cooldownMs?: number;
        /** Exact hosts (name, IP or bracketed IPv6, each with an optional `:port`) that may serve a caller's key set over `http:`. Unset means `https:` or loopback only. */
        hosts?: IJWKSHosts;
    };
    /**
     * WHO a verified assertion acts as. The framework has already proven the caller; this only maps a
     * caller name onto an application principal. Return `null` to refuse a caller the allowlist
     * admits but the application does not recognise.
     */
    resolvePrincipal: (opts: {
        issuer: string;
        context: TContext<E, string>;
    }) => ValueOrPromise<TNullable<IAuthUser>>;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/service.ts`

## `IServiceMixin`

*interface*

Mixin contract for registering services on the application.

```ts
export interface IServiceMixin {
    service<Base extends IService>(target: TClass<Base>, opts?: TMixinOpts): Binding<Base>;
}
```

Source: `packages/kernel/src/base/mixins/common/types.ts`

## `IStaticServeMixin`

*interface*

Mixin contract for serving a static folder; `restPath` is the URL path it is served under.

```ts
export interface IStaticServeMixin {
    static(opts: {
        restPath?: string;
        folderPath: string;
    }): IApplication;
}
```

Source: `packages/kernel/src/base/mixins/common/types.ts`

## `ITransaction`

*interface*

Neutral transaction handle - the minimum shape every connector's transaction satisfies.

```ts
export interface ITransaction {
    isActive: boolean;
    commit(): Promise<void>;
    rollback(): Promise<void>;
}
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `ITransactionOptions`

*interface*

Neutral transaction options - isolation levels are engine vocabulary, so `isolationLevel` stays
a loose string here and connectors narrow it in their own `ITransactionOptions` extension.

```ts
export interface ITransactionOptions {
    isolationLevel?: string;
}
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `IValidRequestProps`

*interface*

Typed validation results for route handlers.

```ts
export interface IValidRequestProps<JsonType = unknown, QueryType = unknown, ParamType = unknown, HeaderType = unknown, CookieType = unknown, FormType = unknown> {
    json?: JsonType;
    query?: QueryType;
    param?: ParamType;
    header?: HeaderType;
    cookie?: CookieType;
    form?: FormType;
}
```

Source: `packages/kernel/src/base/controllers/common/types/context.ts`

## `IWithReadRetry`

*interface*

Intersected into READ verb signatures only - a write verb's options type has no `retry`, so an
inline `{ retry }` fails to compile and a pre-built object carrying it is inert.

```ts
export interface IWithReadRetry<TResult> {
    retry?: IReadRetryOptions<TResult>;
}
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `IWithTransaction`

*interface*

Neutral transaction association - postgres narrows to its own `IDatabaseTransaction` (via `isDatabaseTransaction`) where it needs `.connector`.

```ts
export interface IWithTransaction {
    transaction?: ITransaction;
}
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `JOSEStandards`

*class*

The token standards the JWT service can use: `JWS` (shared-secret signing) or `JWKS` (key-pair signing, published or fetched as a key set).

```ts
export declare class JOSEStandards {
    static readonly JWS = "JWS";
    static readonly JWKS = "JWKS";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): boolean;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `JWKSAlgorithms`

*class*

The signing algorithms a JWKS issuer supports.

```ts
export declare class JWKSAlgorithms {
    static readonly ES256 = "ES256";
    static readonly RS256 = "RS256";
    static readonly EDDSA = "EdDSA";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `JWKSKeyDrivers`

*class*

Where JWKS key material comes from: inline `text` content or a `file` path.

```ts
export declare class JWKSKeyDrivers {
    static readonly TEXT = "text";
    static readonly FILE = "file";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): boolean;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `JWKSKeyFormats`

*class*

Encoding of JWKS key material: `pem` or `jwk`.

```ts
export declare class JWKSKeyFormats {
    static readonly PEM = "pem";
    static readonly JWK = "jwk";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): boolean;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `JWKSModes`

*class*

The role a JWKS setup plays: `issuer` signs tokens, `verifier` checks them against a remote key set.

```ts
export declare class JWKSModes {
    static readonly ISSUER = "issuer";
    static readonly VERIFIER = "verifier";
    static readonly SCHEME_SET: Set<string>;
    static isValid(input: string): boolean;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `LimitSchema`

*const*

Maximum number of rows; a non-negative integer.

```ts
export declare const LimitSchema: z.ZodOptional<z.ZodNumber>;
```

Source: `packages/kernel/src/base/repositories/query-schemas/index.ts`

## `LockStrengths`

*class*

PostgreSQL row-level lock strengths for SELECT ... FOR &lt;strength>.

```ts
export declare class LockStrengths {
    static readonly UPDATE = "update";
    static readonly NO_KEY_UPDATE = "no key update";
    static readonly SHARE = "share";
    static readonly KEY_SHARE = "key share";
    static readonly SCHEME_SET: Set<string>;
    static isValid(strength: string): boolean;
}
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `MetadataKeys`

*const*

Reflect metadata keys: the inversion package keys plus the IGNIS keys for controllers, routes, models, datasources, repositories, artifacts and `@provide` methods.

```ts
export declare const MetadataKeys: {
    PROPERTIES: symbol;
    INJECT: symbol;
    BINDING_KEY: symbol;
} & {
    CONTROLLER: symbol;
    CONTROLLER_REST_ROUTE: symbol;
    CONTROLLER_GRPC_ROUTE: symbol;
    MODEL: symbol;
    DATASOURCE: symbol;
    REPOSITORY: symbol;
    ARTIFACT: symbol;
    PROVIDES: symbol;
};
```

Source: `packages/kernel/src/helpers/inversion/common/keys.ts`

## `MigrationStatuses`

*class*

Database migration statuses.

```ts
export declare class MigrationStatuses {
    static readonly UNKNOWN = "000_UNKNOWN";
    static readonly SUCCESS = "302_SUCCESS";
    static readonly FAIL = "500_FAIL";
    static readonly SCHEME_SET: Set<string>;
    static isValid(scheme: string): boolean;
}
```

Source: `packages/kernel/src/common/statuses/migration.ts`

## `ModelTypes`

*class*

What `@model` declares. Only ENTITY (a table-backed model) exists; `type` may be left out.

```ts
export declare class ModelTypes {
    static readonly ENTITY = "entity";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/kernel/src/base/models/common/constants.ts`

## `ModelUtility`

*class*

Conversions into the model types.

```ts
export declare class ModelUtility {
    /** The only way into `TEntityId`. Rejects an empty string - an id that is `''` collapses a `where` to no condition. */
    static toEntityId(opts: {
        value: string;
    }): TEntityId;
    static snakeToCamel<T extends z.ZodRawShape>(opts: {
        shape: T;
    }): z.ZodPipe<z.ZodPipe<z.ZodObject<{ -readonly [P in keyof T]: T[P]; }, z.core.$strip>, z.ZodTransform<any, z.core.$InferObjectOutput<{ -readonly [P in keyof T]: T[P]; }, {}>>>, z.ZodObject<TCamelCaseKeys<T> extends infer T_1 ? { -readonly [P_1 in keyof T_1]: T_1[P_1]; } : never, z.core.$strip>>;
}

type TCamelCaseKeys<T extends z.ZodRawShape> = {
    [K in keyof T as K extends string ? TSnakeToCamelCase<K> : K]: T[K] extends z.ZodType<infer U> ? z.ZodType<U> : T[K];
};

type TSnakeToCamelCase<S extends string> = S extends `${infer T}_${infer U}` ? `${T}${Capitalize<TSnakeToCamelCase<U>>}` : S;
```

Source: `packages/kernel/src/base/models/common/utilities.ts`

## `notFoundHandler`

*const*

Builds the application not-found handler: logs the miss at warn level on `logger` (console when omitted) and returns a 404 JSON body carrying the request id, path and url.

```ts
export declare const notFoundHandler: (opts: {
    logger?: ILogger;
}) => NotFoundHandler;
```

Source: `packages/kernel/src/base/middlewares/not-found/not-found.middleware.ts`

## `NumberIdType`

*type*

Numeric entity id.

```ts
export type NumberIdType = number;
```

Source: `packages/kernel/src/base/models/common/types/id.ts`

## `OffsetSchema`

*const*

Number of rows to offset; a non-negative integer.

```ts
export declare const OffsetSchema: z.ZodOptional<z.ZodNumber>;
```

Source: `packages/kernel/src/base/repositories/query-schemas/index.ts`

## `OpenApiResponses`

*class*

OpenAPI response builders: the JSON and HTML bodies of a route, and the error bodies every route shares.

```ts
export declare class OpenApiResponses {
    /** Creates HTML content configuration for OpenAPI documentation. */
    static htmlContent(opts: {
        description: string;
        required?: boolean;
    }): {
        description: string;
        content: {
            'text/html': {
                schema: z.ZodString;
            };
        };
        required: boolean;
    };
    /** Creates HTML response configuration for OpenAPI documentation. */
    static htmlResponse(opts: {
        description: string;
        required?: boolean;
    }): {
        '4XX': {
            description: string;
            content: {
                'application/json': {
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
                'application/json': {
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
                'text/html': {
                    schema: z.ZodString;
                };
            };
            required: boolean;
        };
    };
    static jsonContent<T extends z.ZodType>(opts: {
        schema: T;
        description: string;
        required?: boolean;
    }): {
        description: string;
        content: {
            'application/json': {
                schema: T;
            };
        };
        required: boolean | undefined;
    };
    /** The JSON error body of a route, under `4XX` and `5XX` - the range keys OpenAPI accepts. */
    static errorResponses(): {
        '4XX': {
            description: string;
            content: {
                'application/json': {
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
                'application/json': {
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
    };
    static jsonResponse<ContentSchema extends z.ZodType, HeaderSchema extends TResponseHeaders | undefined = undefined>(opts: TJsonResponseOpts<ContentSchema, HeaderSchema>): {
        '4XX': {
            description: string;
            content: {
                'application/json': {
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
                'application/json': {
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
                    schema: ContentSchema;
                };
            };
            required: boolean | undefined;
        } | {
            headers: NonNullable<HeaderSchema>;
            description: string;
            content: {
                'application/json': {
                    schema: ContentSchema;
                };
            };
            required: boolean | undefined;
        };
    };
}

/** Map of header names to Header Objects */
type TResponseHeaders = Record<string, THeaderObject>;

/** OpenAPI Header Object format */
type THeaderObject = {
    description?: string;
    schema: {
        type: string;
        examples?: Array<string>;
    };
};

type TJsonResponseOpts<T extends z.ZodType, H extends TResponseHeaders | undefined> = {
    schema: T;
    description?: string;
    required?: boolean;
    headers?: H;
};
```

Source: `packages/kernel/src/base/models/common/schemas.ts`

## `OpenApiSchemas`

*class*

OpenAPI schema builders for the parts of a route that every controller repeats.

```ts
export declare class OpenApiSchemas {
    static idParams(opts?: {
        idType: TIdSchemaType;
    }): z.ZodObject<{
        id: z.ZodNumber;
    }, z.core.$strip> | z.ZodObject<{
        id: z.ZodString;
    }, z.core.$strip>;
    static requiredString(opts?: {
        min?: number;
        max?: number;
        fixed?: number;
    }): z.ZodString;
}
```

Source: `packages/kernel/src/base/models/common/schemas.ts`

## `OrderBySchema`

*const*

Sort order: an array of strings such as `'createdAt ASC'`.

```ts
export declare const OrderBySchema: z.ZodOptional<z.ZodArray<z.ZodString>>;
```

Source: `packages/kernel/src/base/repositories/query-schemas/index.ts`

## `patch`

*const*

PATCH route decorator. Equivalent to @api but automatically sets method to 'patch'.

```ts
export declare const patch: <RestRouteConfigType extends Omit<IAuthRouteConfig, "method">>(opts: {
    configs: RestRouteConfigType;
}) => (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rest.ts`

## `PersistableCrudController`

*class*

Write tier: create / updateById / updateBy / deleteById / deleteBy. Inherits the read verbs.

```ts
export declare abstract class PersistableCrudController<TEntity extends AbstractEntity<TAnyObjectSchema> = AbstractEntity<TAnyObjectSchema>, RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ConfigurableOptions extends object = {}, TDataObject extends object = TEntityDataObject<TEntity>, TPersistObject extends object = TEntityPersistObject<TEntity>> extends ReadableCrudController<TEntity, RouteEnv, RouteSchema, BasePath, ConfigurableOptions, TDataObject, TPersistObject> {
    /** POST / */
    create(opts: {
        context: TRouteContext<RouteEnv>;
    }): Promise<import("../../index.js").TJsonResponse<unknown, 201>>;
    /**
     * 400 when the validated body leaves no field to write - `{}`, or only keys the body schema drops.
     * The repository would otherwise fail with a 500.
     */
    assertNonEmptyUpdate(opts: {
        scope: string;
        data: object;
    }): void;
    /** PATCH /:id */
    updateById(opts: {
        context: TRouteContext<RouteEnv>;
    }): Promise<import("../../index.js").TJsonResponse<unknown, 200>>;
    /** PATCH / */
    updateBy(opts: {
        context: TRouteContext<RouteEnv>;
    }): Promise<Response>;
    /** DELETE /:id */
    deleteById(opts: {
        context: TRouteContext<RouteEnv>;
    }): Promise<import("../../index.js").TJsonResponse<unknown, 200>>;
    /** DELETE / */
    deleteBy(opts: {
        context: TRouteContext<RouteEnv>;
    }): Promise<Response>;
}
```

Source: `packages/kernel/src/base/controllers/factory/crud/persistable.ts`

## `post`

*const*

POST route decorator. Equivalent to @api but automatically sets method to 'post'.

```ts
export declare const post: <RestRouteConfigType extends Omit<IAuthRouteConfig, "method">>(opts: {
    configs: RestRouteConfigType;
}) => (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rest.ts`

## `PostgresErrorCodes`

*const*

PostgreSQL SQLSTATE codes representing a CLIENT error (HTTP 400) - caused by the request/data, not a server fault. @see https://www.postgresql.org/docs/current/errcodes-appendix.html

```ts
export declare const PostgresErrorCodes: {
    readonly DATA_EXCEPTION: "22000";
    readonly STRING_DATA_TOO_LONG: "22001";
    readonly NUMERIC_VALUE_OUT_OF_RANGE: "22003";
    readonly NULL_VALUE_NOT_ALLOWED: "22004";
    readonly INVALID_DATETIME_FORMAT: "22007";
    readonly DATETIME_FIELD_OVERFLOW: "22008";
    readonly INVALID_TIME_ZONE_DISPLACEMENT_VALUE: "22009";
    readonly SUBSTRING_ERROR: "22011";
    readonly DIVISION_BY_ZERO: "22012";
    readonly INVALID_PARAMETER_VALUE: "22023";
    readonly INVALID_ESCAPE_SEQUENCE: "22025";
    readonly STRING_DATA_LENGTH_MISMATCH: "22026";
    readonly DUPLICATE_JSON_OBJECT_KEY_VALUE: "22030";
    readonly INVALID_JSON_TEXT: "22032";
    readonly FLOATING_POINT_EXCEPTION: "22P01";
    readonly INVALID_TEXT_REPRESENTATION: "22P02";
    readonly INVALID_BINARY_REPRESENTATION: "22P03";
    readonly UNTRANSLATABLE_CHARACTER: "22P05";
    readonly INTEGRITY_CONSTRAINT_VIOLATION: "23000";
    readonly RESTRICT_VIOLATION: "23001";
    readonly NOT_NULL_VIOLATION: "23502";
    readonly FOREIGN_KEY_VIOLATION: "23503";
    readonly UNIQUE_VIOLATION: "23505";
    readonly CHECK_VIOLATION: "23514";
    readonly EXCLUSION_VIOLATION: "23P01";
    readonly WITH_CHECK_OPTION_VIOLATION: "44000";
};
```

Source: `packages/kernel/src/base/middlewares/app-error/definition.ts`

## `PostgresErrors`

*class*

Finds the Postgres error in a thrown value, through the `cause` chain an ORM builds around a driver error. The error handler uses it; so can your code.

```ts
export declare class PostgresErrors {
    /** How many `cause` hops the walk follows: the thrown error is hop 0, so an error 10 hops down is found and one 11 hops down is not. */
    static readonly MAX_DEPTH = 10;
    /** Reads one property and never throws: a getter that throws, or a Proxy trap that does, reads as `undefined`. */
    private static read;
    /** The first spelling of a field that holds a string, or `undefined`. */
    private static readString;
    /** Normalizes one driver error into the result type, or `undefined` when its `code` is not a SQLSTATE. */
    private static normalize;
    /**
     * Finds the Postgres error in a thrown value, looking through `cause` (an ORM wraps the driver error, sometimes more than once). The outermost error with a SQLSTATE `code` wins.
     * Never throws: a value that is not an object, a cycle, a getter that throws and a Proxy all end in `undefined`.
     */
    static find(opts: {
        error: unknown;
    }): IPostgresError | undefined;
}
```

Source: `packages/kernel/src/base/middlewares/app-error/postgres-errors.ts`

## `put`

*const*

PUT route decorator. Equivalent to @api but automatically sets method to 'put'.

```ts
export declare const put: <RestRouteConfigType extends Omit<IAuthRouteConfig, "method">>(opts: {
    configs: RestRouteConfigType;
}) => (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rest.ts`

## `ReadableCrudController`

*class*

Read tier: count / find / findById / findOne. Read-only controllers can extend this directly.

```ts
export declare abstract class ReadableCrudController<TEntity extends AbstractEntity<TAnyObjectSchema> = AbstractEntity<TAnyObjectSchema>, RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ConfigurableOptions extends object = {}, TDataObject extends object = TEntityDataObject<TEntity>, TPersistObject extends object = TEntityPersistObject<TEntity>> extends AbstractCrudController<TEntity, RouteEnv, RouteSchema, BasePath, ConfigurableOptions, TDataObject, TPersistObject> {
    /** Narrows EVERY read of this controller - override it to scope rows to a tenant, an owner or a status. Public because a generated controller's declaration cannot carry a protected member (TS4094). */
    getBaseWhere(_opts: {
        context: TRouteContext<RouteEnv>;
    }): Promise<TWhere<TDataObject> | undefined>;
    /** GET /count */
    count(opts: {
        context: TRouteContext<RouteEnv>;
    }): Promise<import("../../index.js").TJsonResponse<unknown, 200>>;
    /** GET / - paginated list with a Content-Range header. */
    find(opts: {
        context: TRouteContext<RouteEnv>;
    }): Promise<import("../../index.js").TJsonResponse<unknown, 200>>;
    /** GET /:id */
    findById(opts: {
        context: TRouteContext<RouteEnv>;
    }): Promise<import("../../index.js").TJsonResponse<unknown, 200>>;
    /** GET /find-one */
    findOne(opts: {
        context: TRouteContext<RouteEnv>;
    }): Promise<import("../../index.js").TJsonResponse<unknown, 200>>;
}
```

Source: `packages/kernel/src/base/controllers/factory/crud/readable.ts`

## `RelationBuilderRegistry`

*class*

Process-wide slot where the relational connector installs its relation builder; `resolve()` is `undefined` until one is set.

```ts
export declare class RelationBuilderRegistry {
    static readonly SINGLETON_REAL_KEY = "relation-builder";
    /** Realm-anchored like the other cross-package registries: connectors installs into one copy of this package and the `@repository` mixin resolves from the other, which throws "no relation builder is registered". */
    private static slot;
    static set(opts: {
        builder: TRelationBuilder;
    }): void;
    static resolve(): TRelationBuilder | undefined;
}
```

Source: `packages/kernel/src/helpers/inversion/common/relation-builder.ts`

## `RelationTypes`

*class*

Entity relation types (one-to-one/many-to-one, one-to-many).

```ts
export declare class RelationTypes {
    static readonly ONE = "one";
    static readonly MANY = "many";
    static readonly SCHEME_SET: Set<string>;
    static isValid(orgType: string): boolean;
}
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `RepositoryErrorCodes`

*class*

Machine-readable codes for repository-level failures, in the dotted namespace core already uses (`core.not_supported`, `core.search_engine.*`) - a client maps the code, never the message.

```ts
export declare class RepositoryErrorCodes {
    /** A verb the repository's `operationScope` does not permit (e.g. `create()` on a READ_ONLY one). */
    static readonly OPERATION_NOT_ALLOWED: string;
    /** A write whose scope column disagrees with the resolved scope, or whose scope cannot be verified (`access` write guard). */
    static readonly SCOPE_WRITE_DENIED: string;
}
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `RepositoryErrors`

*const*

Codes a client branches on for a repository-level failure that is the caller's fault, not the server's.

```ts
export declare const RepositoryErrors: {
    readonly ENTITY_NOT_FOUND: {
        readonly message: {
            readonly text: "Entity not found";
            readonly code: "core.repository.entity_not_found";
        };
        readonly statusCode: 404;
        readonly category: "business";
    };
};
```

Source: `packages/kernel/src/base/repositories/common/errors.ts`

## `REQUEST_ID_KEY`

*const*

Hono context key the request id is stamped under; not-found and app-error read the same key so all three agree on one identifier.

```ts
export declare const REQUEST_ID_KEY = "requestId";
```

Source: `packages/kernel/src/base/middlewares/common/constants.ts`

## `RequestContextRegistry`

*class*

Process-wide holder of the function that returns the current request context. `resolve()` is `undefined` when no resolver is installed or no request is active.

```ts
export declare class RequestContextRegistry {
    static readonly SINGLETON_REAL_KEY = "request-context-resolver";
    /** Realm-anchored, so a second copy of this package installs the resolver the first copy reads. */
    private static slot;
    static setResolver(opts: {
        resolver: TRequestContextResolver;
    }): void;
    static clearResolver(): void;
    static resolve(): Context | undefined;
}
```

Source: `packages/kernel/src/base/request-context/registry.ts`

## `RequestDomainResolver`

*class*

Reads the domain of an authorization check off the request.

```ts
export declare class RequestDomainResolver {
    /** Read a domain value from a declarative source on the Hono context. */
    static readDeclarative(opts: {
        source: IAuthorizationDomainSource;
        context: TContext<Env, string>;
    }): TNullable<string>;
    /** Resolve the request domain, precedence spec.domain (method | declarative) -> options.domainResolver -> SYSTEM_WIDE, as a casbin domain string ("<type>_<id>") or the SYSTEM_WIDE sentinel. */
    static resolveRequestDomain(opts: {
        spec: IAuthorizationSpec;
        context: TContext<Env, string>;
        options: TNullable<IAuthorizeOptions>;
    }): Promise<string>;
}
```

Source: `packages/kernel/src/base/auth/authorize/providers/request-domain.ts`

## `RequestErrors`

*const*

Codes a client branches on for a request refused before any repository ran - by the middleware layer, or by a handler reading the validated body.

```ts
export declare const RequestErrors: {
    readonly BODY_MALFORMED: {
        readonly message: {
            readonly text: "Malformed body payload";
            readonly code: "core.request.body_malformed";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
    readonly BODY_TOO_LARGE: {
        readonly message: {
            readonly text: "Request body is too large";
            readonly code: "core.request.body_too_large";
        };
        readonly statusCode: 413;
        readonly category: "validation";
    };
    readonly NOTHING_TO_UPDATE: {
        readonly message: {
            readonly text: "Nothing to update";
            readonly code: "core.request.nothing_to_update";
        };
        readonly statusCode: 400;
        readonly category: "validation";
    };
};
```

Source: `packages/kernel/src/base/middlewares/common/errors.ts`

## `RequestFilterGuard`

*class*

A filter that comes from a request is not allowed to name a field the model hides. Hidden fields are never returned, but a
`where` or an `order` on one reveals its value one question at a time. The check runs where a request enters
(the generated controllers), never in the repository's own verbs, so server code can still filter and sort on a hidden field.

```ts
export declare class RequestFilterGuard {
    /** The names of `hidden` a dotted key reaches: the key is one, a dotted prefix of one, or has one as its dotted prefix (`meta` and `meta.pin.x` both reach `meta.pin`). */
    static isHiddenByName(opts: {
        key: string;
        hidden: ReadonlySet<string>;
    }): boolean;
    /** The refusal when a model has no query error of its own to borrow: a 400 `Column NOT FOUND`. */
    static columnNotFound(opts: {
        scope: string;
        key: string;
    }): Error;
    /** Refuses a `where` that names a hidden field, at any depth of `and` and `or`. */
    static assertWhere(opts: {
        where?: unknown;
        judge: IRequestFilterJudge;
        tableName: string;
    }): void;
    /** Refuses an `order` that names a hidden field (a string or a list of `'field DIRECTION'` entries), reading each entry as the query does. */
    static assertOrder(opts: {
        order?: unknown;
        judge: IRequestFilterJudge;
        tableName: string;
    }): void;
    /**
     * Refuses a filter that names a hidden field in its `where`, its `order`, or the `scope` of any `include`, each level
     * judged by the model it reads (`judge.relation` answers it).
     */
    static assertFilter(opts: {
        filter?: IRequestFilterShape;
        judge: IRequestFilterJudge;
        tableName: string;
    }): void;
}
```

Source: `packages/kernel/src/base/repositories/common/request-filter-guard.ts`

## `ResponseExtras`

*class*

Parses `x-request-extra` and resolves it against what a route offers.

```ts
export declare class ResponseExtras {
    /** The entries of the header, in the order written. Malformed input is a 400 naming it. */
    static parse(opts: {
        header?: string | null;
    }): Array<IRequestedExtra>;
    /**
     * What to compute: the asked-for extras and the defaults, minus the ones switched off - each with the
     * keys asked for, de-duplicated in the order asked. Every name and key is checked against `offered`.
     */
    static resolve(opts: {
        requested: Array<IRequestedExtra>;
        offered: Record<string, TResponseExtra>;
    }): Map<string, Array<string> | undefined>;
    /** Runs the plan in parallel; each value under its name. */
    static compute(opts: {
        plan: Map<string, Array<string> | undefined>;
        offered: Record<string, TResponseExtra>;
    }): Promise<Record<string, unknown>>;
    /** Commas inside `( )` belong to the keys, not to the list of extras. */
    private static splitTopLevel;
    private static badRequest;
}
```

Source: `packages/kernel/src/base/controllers/rest/extras.ts`

## `ResponseFormats`

*class*

Shape of `data` in a `{ count, data }` response, echoed in the `X-Response-Format` header.

```ts
export declare class ResponseFormats {
    static readonly OBJECT = "object";
    static readonly ARRAY = "array";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/kernel/src/base/controllers/common/constants.ts`

## `RestApplication`

*class*

Adds the Hono router surface on top of `AbstractApplication` - no listening server, so this is the layer a browser Worker or gRPC-only host can extend without pulling in `Bun.serve`.

```ts
export declare abstract class RestApplication<AppEnv extends Env = Env, AppSchema extends Schema = {}, BasePath extends string = '/'> extends AbstractApplication {
    private registeredBindings;
    private artifactOptions;
    /** The router, and nothing else. What runtime is underneath and what socket is bound are `ServerApplication`'s to know - a browser Worker has neither, and carrying the union here made `RuntimeModules.detect()` answer `'node'` inside a Worker. */
    protected server: {
        hono: Hono<AppEnv, AppSchema, BasePath>;
    };
    protected rootRouter: Hono<AppEnv, AppSchema, BasePath>;
    protected readonly requestIdGenerator: RequestIdGenerator;
    /** A copy of the `bodyLimit` the default stack installed, absent until `registerDefaultMiddlewares()` ran. */
    private installedBodyLimit?;
    constructor(opts: {
        scope: string;
        config: IApplicationConfigs;
    });
    /**
     * Builds one of the two routers: a plain `Hono`, or an `OpenAPIHono` once the REST controller layer is
     * loaded. Called from the constructor, so an override must not read its own instance fields.
     */
    protected createRouter(opts: {
        strict: boolean;
    }): Hono<AppEnv, AppSchema, BasePath>;
    getRootRouter(): Hono<AppEnv, AppSchema, BasePath>;
    getServer(): Hono<AppEnv, AppSchema, BasePath>;
    protected registerCoreBindings(): void;
    /** The correlation id every host stamps - see {@link RequestIdGenerator} for why `crypto.randomUUID` is refused. */
    protected generateRequestId(): string;
    /** The error handler the default stack installs. `@venizia/ignis` overrides it to swap in the `ErrorPrettier`-backed formatter, which reaches `node:util` and so cannot live here. */
    protected buildErrorMiddleware(): BaseAppErrorMiddleware;
    /**
     * The three registrations every host needs: request id, error envelope, JSON 404 - without them a
     * thrown `ApplicationError` is a generic 500, a 404 is `text/plain`, and no response carries a request id.
     * Registered before `initialize()`, so an application's own handlers still win.
     */
    protected registerDefaultMiddlewares(): ValueOrPromise<void>;
    /** The configured `bodyLimit`, or the default one when none is configured. */
    private resolveBodyLimit;
    /** What a `bodyLimit` config installs: nothing when absent or disabled, else a copy, so a later in-place edit shows. */
    private toInstalledBodyLimit;
    private isSameBodyLimit;
    /**
     * `configs.middlewares` is read by `registerDefaultMiddlewares()`, which runs before `staticConfigure()`.
     * A limit assigned in a boot hook would read back as configured while every request ran unlimited.
     */
    private assertBodyLimitUnchanged;
    /**
     * The artifact order, stated once: datasources before the repositories that auto-resolve them,
     * components before the controllers they may contribute. `BaseApplication` splices its server-only
     * steps around these by name instead of rewriting the list.
     */
    protected getBootSequence(): IBootSequenceStep[];
    initialize(): Promise<void>;
    /** The application hook currently running, so `registerArtifact` can tell a hand registration inside `preConfigure`/`postConfigure` from one the index step made. */
    private runningApplicationHook;
    private runApplicationHook;
    /**
     * Bound keys carrying one of `tags` that nothing has resolved since the counts were last reset.
     * The counter answers "who was read", never "who is dead" - an unread binding may be an
     * allow-list entry or a technical floor, and only the application can tell those apart.
     *
     * Counting is off by default. Call `startResolutionCounting()` after `initialize()` and run the
     * traffic that exercises the application, then read this.
     */
    getUnresolvedBindings(opts?: {
        tags?: string[];
    }): string[];
    /** `bootChecks.binding.doVerify`: resolve every service and repository once, collect every failure, throw once with the whole list - a made-up `@inject` key or a dependency a `when` excluded then fails the boot, not the first request. */
    protected verifyBindings(): void;
    /** One measured log line per step, and a failure names its step before rethrowing, so a hung or failed boot is attributable without reading the sequence. */
    protected runBootSequence(opts: {
        steps: IBootSequenceStep[];
    }): Promise<void>;
    protected inspectRoutes(): void;
    /**
     * `configured` is the drain's state, mutated in place: a fresh `Set` gives a one-shot complete
     * drain (`RestComponent`); `registerDynamicBindings` passes its persistent per-namespace `Set`,
     * which is why a second sweep touches only what the first one missed.
     */
    drainByTag<T>(opts: {
        tag: string;
        configured: Set<string>;
        onEach: (opts: {
            binding: Binding<T>;
        }) => Promise<void>;
    }): Promise<void>;
    protected registerDynamicBindings<T extends IConfigurable = IConfigurable>(opts: IRegisterDynamicBindingsOptions<T>): Promise<void>;
    /** The same-key guard behind every artifact registration (`component`/`controller`/`service`/`repository`/`dataSource`). `allowOverride` defaults true to match `bind()`'s overwrite behavior; `allowOverride: false` on one registration, or `bootChecks.binding.allowOverride: false` for the whole application, opts into strict mode. */
    protected assertNoBindingCollision(opts: {
        key: string;
        allowOverride?: boolean;
        caller: string;
    }): void;
    /** Resolution order for every registration: explicit `opts` > the class's `@injectable` defaults > the derived key and the kind's default scope. `order` and `when` are `registerArtifacts`' concern, not this one. */
    private registerArtifact;
    configuration<Base extends BaseConfiguration<Options>, Options extends object = {}>(target: TClass<Base>, opts?: TMixinOpts<Options>): Binding<Base>;
    registerConfigurations(): Promise<void>;
    component<Base extends BaseComponent<Options>, Options extends object = {}>(target: TClass<Base>, opts?: TMixinOpts<Options>): Binding<Base>;
    registerComponents(): Promise<void>;
    /**
     * Second DATASOURCE sweep, for datasources components contributed at any depth. Calls
     * `registerDynamicBindings` directly: `this.registerDataSources()` is polymorphic and an override
     * would run twice. Runs after every component, so a component a datasource registers is never configured.
     */
    registerContributedDataSources(): Promise<void>;
    /** REST only - the kernel has no gRPC (it reaches `node:module`). `BaseApplication` adds the gRPC branch on top. */
    registerControllers(): Promise<void>;
    /** SINGLETON like `component()`: `RestComponent` mounts the one instance it resolves, so a second resolution must be that instance, not an unmounted twin. */
    controller<Base>(target: TClass<Base>, opts?: TMixinOpts): Binding<Base>;
    service<Base extends IService>(target: TClass<Base>, opts?: TMixinOpts): Binding<Base>;
    repository<Base extends IRepository>(target: TClass<Base>, opts?: TMixinOpts): Binding<Base>;
    dataSource<Base extends IDataSource<Options>, Options extends object = {}>(target: TClass<Base>, opts?: TMixinOpts<Options>): Binding<Base>;
    /** The boot step body behind `configs.artifacts`, also callable by hand: registers every kind in dependency order across the given indexes. */
    registerArtifacts(index: TArtifactIndexInput): Promise<void>;
    /** Registers every class a stereotype decorated, with no `configs.artifacts` entry anywhere. `when` and `order` apply exactly as they do to a declared index - which is how one process running several applications keeps them apart. */
    registerDiscoveredArtifacts(): Promise<void>;
    /**
     * The artifact boot step. `configs.discoverArtifacts` adds every decorated class in the import
     * graph; `configs.artifacts` adds exactly what it lists. Both together register the union.
     *
     * An absent `artifacts` still registers nothing. Reading it as "register everything" would change
     * what an existing application boots with, silently, and the failure would surface as ten times
     * the bindings rather than as an error.
     */
    protected registerConfiguredArtifacts(): Promise<void>;
    /** Each `@provide` method becomes a lazy provider: the component is resolved (SINGLETON) and the method called on first `get`, so a provided value may depend on datasources or secrets that do not exist yet at registration time. */
    private bindProvidedKeys;
    registerDataSources(): Promise<void>;
    /**
     * Closes every datasource the boot configured, so a stopped application holds no pool, socket or
     * WASM instance. A failure, or a `close()` still pending after `dataSourceCloseTimeoutMs`, is logged
     * and never stops the rest. A datasource configured by hand is closed by whoever configured it.
     */
    protected closeDataSources(): Promise<void>;
}

interface IRegisterDynamicBindingsOptions<T extends IConfigurable = IConfigurable> {
    namespace: TBindingNamespace;
    onBeforeConfigure?: (opts: {
        binding: Binding<T>;
    }) => Promise<void>;
    onAfterConfigure?: (opts: {
        binding: Binding<T>;
        instance: T;
    }) => Promise<void>;
}
```

Source: `packages/kernel/src/base/applications/rest.ts`

## `RestBindingKeys`

*class*

Binding keys of the REST component.

```ts
export declare class RestBindingKeys {
    static readonly REST_COMPONENT_OPTIONS = "@app/rest/options";
}
```

Source: `packages/kernel/src/base/components/controller/rest/common/types.ts`

## `RestComponent`

*class*

Generic over the same Hono env/schema/base-path `RestApplication` is: a bare `RestApplication`
parameter (defaulting to `RestApplication<Env, {}, '/'>`) fails to typecheck when passed `this`
from inside a differently-instantiated generic `RestApplication` subclass - `defaultHook`'s
contravariance makes the defaulted instantiation incompatible with an arbitrary one. Matching the
caller's own instantiation here removes the mismatch instead of widening to `any`.

```ts
export declare class RestComponent<AppEnv extends Env = Env, AppSchema extends Schema = {}, BasePath extends string = '/'> extends BaseComponent {
    private application;
    constructor(application: RestApplication<AppEnv, AppSchema, BasePath>);
    binding(): Promise<void>;
}
```

Source: `packages/kernel/src/base/components/controller/rest/rest.component.ts`

## `RestPaths`

*class*

Standard REST API path constants for CRUD controllers.

```ts
export declare class RestPaths {
    static readonly ROOT = "/";
    static readonly COUNT = "/count";
    static readonly FIND_ONE = "/find-one";
}
```

Source: `packages/kernel/src/base/controllers/common/constants.ts`

## `RoleStatuses`

*class*

Role statuses.

```ts
export declare class RoleStatuses extends CommonStatuses {
}
```

Source: `packages/kernel/src/common/statuses/role.ts`

## `RouteConfigResolver`

*class*

Every method here is an unbound static, called from the exported aliases below without a
receiver - a method must call another via `RouteConfigResolver.other(...)`, never
`this.other(...)`, or `this` is `undefined` at the call site.

```ts
export declare class RouteConfigResolver {
    /** Path params always reach the validator as strings, so a number-typed id must be coerced before `z.number()` sees it - `OpenApiSchemas.idParams` alone rejects `/accounts/7`. */
    private static idPathParamsSchema;
    /**
     * The default body of a write route: the entity schema without the keys the entity stamps, and on
     * an update without `id` - the path or `where` names the rows. Zod strips a left-out key a client
     * sends. With nothing to leave out the schema itself is the body, refinements and OpenAPI name kept.
     */
    private static toWriteBodySchema;
    /** Picks the caller's per-route `request.params` override, else the entity's id path-param schema. */
    private static resolveIdParams;
    /** Creates conditional count response schema. */
    static conditionalCountResponse<T extends z.ZodType>(dataSchema: T): z.ZodUnion<readonly [z.ZodObject<{
        count: z.ZodDefault<z.ZodNumber>;
        data: T;
    }, z.core.$strip>, T]>;
    /** Resolves a route's response schema - user override or default. Holds the one cast every `resolve*Config` needs: generic `C` is only known by its wider structural constraint, so it cannot be proven at the value level to collapse to `TResolvedResponseSchema`. */
    private static resolveResponseSchema;
    static resolveCountConfig<C extends ICustomizableRoutes['count']>(opts: {
        config: C;
        isStrict: boolean;
    }): {
        request: {
            query: TAnyObjectSchema | z.ZodObject<{
                where: z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]> | z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
            }, z.core.$strip>;
            headers: TAnyObjectSchema | z.ZodObject<{
                "x-request-id": z.ZodOptional<z.ZodString>;
                "x-request-channel": z.ZodOptional<z.ZodString>;
                "x-device-info": z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        response: {
            description: string;
            schema: TResolvedResponseSchema<C, z.ZodObject<{
                count: z.ZodDefault<z.ZodNumber>;
            }, z.core.$strip>>;
            headers: import("../index.js").TResponseHeaders;
        };
    };
    static resolveFindConfig<C extends ICustomizableRoutes['find'], FindSchema extends TAnyObjectSchema>(opts: {
        config: C;
        selectSchema: FindSchema;
    }): {
        request: {
            query: TAnyObjectSchema | z.ZodObject<{
                filter: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                    include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        relation: z.ZodString;
                        scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
                    }, z.core.$strip>>>;
                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    limit: z.ZodOptional<z.ZodNumber>;
                    offset: z.ZodOptional<z.ZodNumber>;
                    skip: z.ZodOptional<z.ZodNumber>;
                }, z.core.$strip>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodObject<{
                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                    include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        relation: z.ZodString;
                        scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
                    }, z.core.$strip>>>;
                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    limit: z.ZodOptional<z.ZodNumber>;
                    offset: z.ZodOptional<z.ZodNumber>;
                    skip: z.ZodOptional<z.ZodNumber>;
                }, z.core.$strip>>]>>;
            }, z.core.$strip>;
            headers: TAnyObjectSchema | z.ZodObject<{
                "x-request-id": z.ZodOptional<z.ZodString>;
                "x-request-channel": z.ZodOptional<z.ZodString>;
                "x-device-info": z.ZodOptional<z.ZodString>;
                "x-request-count": z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        response: {
            description: string;
            schema: TResolvedResponseSchema<C, z.ZodUnion<readonly [z.ZodObject<{
                count: z.ZodDefault<z.ZodNumber>;
                data: z.ZodArray<FindSchema>;
            }, z.core.$strip>, z.ZodArray<FindSchema>]>>;
            headers: import("../index.js").TResponseHeaders;
        };
    };
    static resolveFindByIdConfig<C extends ICustomizableRoutes['findById'], FindByIdSchema extends TAnyObjectSchema>(opts: {
        idType: TIdSchemaType;
        config: C;
        selectSchema: FindByIdSchema;
    }): {
        request: {
            params: z.ZodObject<{
                id: z.ZodString;
            }, z.core.$strip> | TAnyObjectSchema | z.ZodObject<{
                id: z.ZodCoercedNumber<unknown>;
            }, z.core.$strip>;
            query: TAnyObjectSchema | z.ZodObject<{
                filter: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                    include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        relation: z.ZodString;
                        scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
                    }, z.core.$strip>>>;
                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    limit: z.ZodOptional<z.ZodNumber>;
                    offset: z.ZodOptional<z.ZodNumber>;
                    skip: z.ZodOptional<z.ZodNumber>;
                }, z.core.$strip>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodObject<{
                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                    include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        relation: z.ZodString;
                        scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
                    }, z.core.$strip>>>;
                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    limit: z.ZodOptional<z.ZodNumber>;
                    offset: z.ZodOptional<z.ZodNumber>;
                    skip: z.ZodOptional<z.ZodNumber>;
                }, z.core.$strip>>]>>;
            }, z.core.$strip>;
            headers: TAnyObjectSchema | z.ZodObject<{
                "x-request-id": z.ZodOptional<z.ZodString>;
                "x-request-channel": z.ZodOptional<z.ZodString>;
                "x-device-info": z.ZodOptional<z.ZodString>;
                "x-request-count": z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        response: {
            description: string;
            schema: TResolvedResponseSchema<C, z.ZodUnion<readonly [z.ZodObject<{
                count: z.ZodDefault<z.ZodNumber>;
                data: FindByIdSchema;
            }, z.core.$strip>, FindByIdSchema]>>;
            headers: import("../index.js").TResponseHeaders;
        };
    };
    static resolveFindOneConfig<C extends ICustomizableRoutes['findOne'], FindOneSchema extends TAnyObjectSchema>(opts: {
        config: C;
        selectSchema: FindOneSchema;
    }): {
        request: {
            query: TAnyObjectSchema | z.ZodObject<{
                filter: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                    include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        relation: z.ZodString;
                        scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
                    }, z.core.$strip>>>;
                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    limit: z.ZodOptional<z.ZodNumber>;
                    offset: z.ZodOptional<z.ZodNumber>;
                    skip: z.ZodOptional<z.ZodNumber>;
                }, z.core.$strip>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodObject<{
                    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
                    fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                    include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                        relation: z.ZodString;
                        scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
                    }, z.core.$strip>>>;
                    order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                    limit: z.ZodOptional<z.ZodNumber>;
                    offset: z.ZodOptional<z.ZodNumber>;
                    skip: z.ZodOptional<z.ZodNumber>;
                }, z.core.$strip>>]>>;
            }, z.core.$strip>;
            headers: TAnyObjectSchema | z.ZodObject<{
                "x-request-id": z.ZodOptional<z.ZodString>;
                "x-request-channel": z.ZodOptional<z.ZodString>;
                "x-device-info": z.ZodOptional<z.ZodString>;
                "x-request-count": z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        response: {
            description: string;
            schema: TResolvedResponseSchema<C, z.ZodUnion<readonly [z.ZodObject<{
                count: z.ZodDefault<z.ZodNumber>;
                data: FindOneSchema;
            }, z.core.$strip>, FindOneSchema]>>;
            headers: import("../index.js").TResponseHeaders;
        };
    };
    /** `serverStampedKeys` - what the entity reports from `getServerStampedKeys()`; the default body leaves them out. */
    static resolveCreateConfig<C extends ICustomizableRoutes['create'], SelectSchema extends TAnyObjectSchema, CreateSchema extends TAnyObjectSchema>(opts: {
        config: C;
        selectSchema: SelectSchema;
        createSchema: CreateSchema;
        serverStampedKeys?: string[];
    }): {
        request: {
            body: TAnyObjectSchema;
            headers: TAnyObjectSchema | z.ZodObject<{
                "x-request-id": z.ZodOptional<z.ZodString>;
                "x-request-channel": z.ZodOptional<z.ZodString>;
                "x-device-info": z.ZodOptional<z.ZodString>;
                "x-request-count": z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
        };
        response: {
            description: string;
            schema: TResolvedResponseSchema<C, z.ZodUnion<readonly [z.ZodObject<{
                count: z.ZodDefault<z.ZodNumber>;
                data: SelectSchema;
            }, z.core.$strip>, SelectSchema]>>;
            headers: import("../index.js").TResponseHeaders;
        };
    };
    private static resolveUpdateByIdConfig;
    private static resolveUpdateByConfig;
    private static resolveDeleteByIdConfig;
    private static resolveDeleteByConfig;
    /**
     * Generates complete route configurations for a CRUD controller. `serverStampedKeys` - what the
     * entity reports from `getServerStampedKeys()`; the default write bodies leave them out.
     */
    static defineControllerRouteConfigs<Routes extends ICustomizableRoutes, SelectSchema extends TAnyObjectSchema, CreateSchema extends TAnyObjectSchema, UpdateSchema extends TAnyObjectSchema>(opts: {
        isStrict: boolean;
        idType: TIdSchemaType;
        authenticate?: {
            strategies?: TAuthStrategy[];
            mode?: TAuthMode;
        };
        authorize?: IAuthorizationSpec | IAuthorizationSpec[];
        schema: {
            select: SelectSchema;
            create: CreateSchema;
            update: UpdateSchema;
        };
        serverStampedKeys?: string[];
        routes?: Routes;
    }): {
        readonly COUNT: {
            readonly method: "get";
            readonly path: "/count";
            readonly description: "Count records matching where condition";
            readonly authenticate: {
                strategies?: TAuthStrategy[];
                mode?: TAuthMode;
            };
            readonly authorize: IAuthorizationSpec<import("hono").Env, string, string> | IAuthorizationSpec<import("hono").Env, string, string>[] | undefined;
            readonly request: {
                query: TAnyObjectSchema | z.ZodObject<{
                    where: z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]> | z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
                }, z.core.$strip>;
                headers: TAnyObjectSchema | z.ZodObject<{
                    "x-request-id": z.ZodOptional<z.ZodString>;
                    "x-request-channel": z.ZodOptional<z.ZodString>;
                    "x-device-info": z.ZodOptional<z.ZodString>;
                }, z.core.$strip>;
            };
            readonly responses: {
                '4XX': {
                    description: string;
                    content: {
                        'application/json': {
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
                        'application/json': {
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
                                count: z.ZodDefault<z.ZodNumber>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                } | {
                    headers: import("../index.js").TResponseHeaders;
                    description: string;
                    content: {
                        'application/json': {
                            schema: z.ZodObject<{
                                count: z.ZodDefault<z.ZodNumber>;
                            }, z.core.$strip>;
                        };
                    };
                    required: boolean | undefined;
                };
            };
        };
        readonly FIND: {
            readonly method: "get";
            readonly path: "/";
            readonly description: "Find records with filter, pagination, sorting, and relations";
            readonly authenticate: {
                strategies?: TAuthStrategy[];
                mode?: TAuthMode;
            };
            readonly authorize: IAuthorizationSpec<import("hono").Env, string, string> | IAuthorizationSpec<import("hono").Env, string, string>[] | undefined;
            readonly request: {
                query: TAnyObjectSchema | z.ZodObject<{
                    filter: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                        where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
                        fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                        include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                            relation: z.ZodString;
                            scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
                        }, z.core.$strip>>>;
                        order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        limit: z.ZodOptional<z.ZodNumber>;
                        offset: z.ZodOptional<z.ZodNumber>;
                        skip: z.ZodOptional<z.ZodNumber>;
                    }, z.core.$strip>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodObject<{
                        where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
                        fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                        include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                            relation: z.ZodString;
                            scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
                        }, z.core.$strip>>>;
                        order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        limit: z.ZodOptional<z.ZodNumber>;
                        offset: z.ZodOptional<z.ZodNumber>;
                        skip: z.ZodOptional<z.ZodNumber>;
                    }, z.core.$strip>>]>>;
                }, z.core.$strip>;
                headers: TAnyObjectSchema | z.ZodObject<{
                    "x-request-id": z.ZodOptional<z.ZodString>;
                    "x-request-channel": z.ZodOptional<z.ZodString>;
                    "x-device-info": z.ZodOptional<z.ZodString>;
                    "x-request-count": z.ZodOptional<z.ZodString>;
                }, z.core.$strip>;
            };
            readonly responses: {
                '4XX': {
                    description: string;
                    content: {
                        'application/json': {
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
                        'application/json': {
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
                            schema: z.ZodUnion<readonly [z.ZodObject<{
                                count: z.ZodDefault<z.ZodNumber>;
                                data: z.ZodArray<SelectSchema>;
                            }, z.core.$strip>, z.ZodArray<SelectSchema>]>;
                        };
                    };
                    required: boolean | undefined;
                } | {
                    headers: import("../index.js").TResponseHeaders;
                    description: string;
                    content: {
                        'application/json': {
                            schema: z.ZodUnion<readonly [z.ZodObject<{
                                count: z.ZodDefault<z.ZodNumber>;
                                data: z.ZodArray<SelectSchema>;
                            }, z.core.$strip>, z.ZodArray<SelectSchema>]>;
                        };
                    };
                    required: boolean | undefined;
                };
            };
        };
        readonly FIND_BY_ID: {
            readonly method: "get";
            readonly path: "/{id}";
            readonly description: "Find single record by ID";
            readonly authenticate: {
                strategies?: TAuthStrategy[];
                mode?: TAuthMode;
            };
            readonly authorize: IAuthorizationSpec<import("hono").Env, string, string> | IAuthorizationSpec<import("hono").Env, string, string>[] | undefined;
            readonly request: {
                params: z.ZodObject<{
                    id: z.ZodString;
                }, z.core.$strip> | TAnyObjectSchema | z.ZodObject<{
                    id: z.ZodCoercedNumber<unknown>;
                }, z.core.$strip>;
                query: TAnyObjectSchema | z.ZodObject<{
                    filter: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                        where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
                        fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                        include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                            relation: z.ZodString;
                            scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
                        }, z.core.$strip>>>;
                        order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        limit: z.ZodOptional<z.ZodNumber>;
                        offset: z.ZodOptional<z.ZodNumber>;
                        skip: z.ZodOptional<z.ZodNumber>;
                    }, z.core.$strip>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodObject<{
                        where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
                        fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                        include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                            relation: z.ZodString;
                            scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
                        }, z.core.$strip>>>;
                        order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        limit: z.ZodOptional<z.ZodNumber>;
                        offset: z.ZodOptional<z.ZodNumber>;
                        skip: z.ZodOptional<z.ZodNumber>;
                    }, z.core.$strip>>]>>;
                }, z.core.$strip>;
                headers: TAnyObjectSchema | z.ZodObject<{
                    "x-request-id": z.ZodOptional<z.ZodString>;
                    "x-request-channel": z.ZodOptional<z.ZodString>;
                    "x-device-info": z.ZodOptional<z.ZodString>;
                    "x-request-count": z.ZodOptional<z.ZodString>;
                }, z.core.$strip>;
            };
            readonly responses: {
                '4XX': {
                    description: string;
                    content: {
                        'application/json': {
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
                        'application/json': {
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
                            schema: z.ZodUnion<readonly [z.ZodObject<{
                                count: z.ZodDefault<z.ZodNumber>;
                                data: SelectSchema;
                            }, z.core.$strip>, SelectSchema]>;
                        };
                    };
                    required: boolean | undefined;
                } | {
                    headers: import("../index.js").TResponseHeaders;
                    description: string;
                    content: {
                        'application/json': {
                            schema: z.ZodUnion<readonly [z.ZodObject<{
                                count: z.ZodDefault<z.ZodNumber>;
                                data: SelectSchema;
                            }, z.core.$strip>, SelectSchema]>;
                        };
                    };
                    required: boolean | undefined;
                };
            };
        };
        readonly FIND_ONE: {
            readonly method: "get";
            readonly path: "/find-one";
            readonly description: "Find first record matching filter";
            readonly authenticate: {
                strategies?: TAuthStrategy[];
                mode?: TAuthMode;
            };
            readonly authorize: IAuthorizationSpec<import("hono").Env, string, string> | IAuthorizationSpec<import("hono").Env, string, string>[] | undefined;
            readonly request: {
                query: TAnyObjectSchema | z.ZodObject<{
                    filter: z.ZodOptional<z.ZodUnion<readonly [z.ZodObject<{
                        where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
                        fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                        include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                            relation: z.ZodString;
                            scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
                        }, z.core.$strip>>>;
                        order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        limit: z.ZodOptional<z.ZodNumber>;
                        offset: z.ZodOptional<z.ZodNumber>;
                        skip: z.ZodOptional<z.ZodNumber>;
                    }, z.core.$strip>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodObject<{
                        where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
                        fields: z.ZodOptional<z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodBoolean>, z.ZodArray<z.ZodString>]>>;
                        include: z.ZodOptional<z.ZodArray<z.ZodObject<{
                            relation: z.ZodString;
                            scope: z.ZodOptional<z.ZodLazy<z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>;
                        }, z.core.$strip>>>;
                        order: z.ZodOptional<z.ZodArray<z.ZodString>>;
                        limit: z.ZodOptional<z.ZodNumber>;
                        offset: z.ZodOptional<z.ZodNumber>;
                        skip: z.ZodOptional<z.ZodNumber>;
                    }, z.core.$strip>>]>>;
                }, z.core.$strip>;
                headers: TAnyObjectSchema | z.ZodObject<{
                    "x-request-id": z.ZodOptional<z.ZodString>;
                    "x-request-channel": z.ZodOptional<z.ZodString>;
                    "x-device-info": z.ZodOptional<z.ZodString>;
                    "x-request-count": z.ZodOptional<z.ZodString>;
                }, z.core.$strip>;
            };
            readonly responses: {
                '4XX': {
                    description: string;
                    content: {
                        'application/json': {
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
                        'application/json': {
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
                            schema: z.ZodUnion<readonly [z.ZodObject<{
                                count: z.ZodDefault<z.ZodNumber>;
                                data: SelectSchema;
                            }, z.core.$strip>, SelectSchema]>;
                        };
                    };
                    required: boolean | undefined;
                } | {
                    headers: import("../index.js").TResponseHeaders;
                    description: string;
                    content: {
                        'application/json': {
                            schema: z.ZodUnion<readonly [z.ZodObject<{
                                count: z.ZodDefault<z.ZodNumber>;
                                data: SelectSchema;
                            }, z.core.$strip>, SelectSchema]>;
                        };
                    };
                    required: boolean | undefined;
                };
            };
        };
        readonly CREATE: {
            readonly method: "post";
            readonly path: "/";
            readonly description: "Create new record";
            readonly authenticate: {
                strategies?: TAuthStrategy[];
// ... cut
```

Source: `packages/kernel/src/base/controllers/factory/definition.ts`

## `RoutePathScopes`

*class*

Which decorator-defined routes `registerRoutesFromRegistry` registers: STATIC (no path parameter), PARAM (a path parameter) or ALL.

```ts
export declare class RoutePathScopes {
    static readonly STATIC = "static";
    static readonly PARAM = "param";
    static readonly ALL = "all";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/kernel/src/base/controllers/common/constants.ts`

## `rpc`

*const*

Generic RPC decorator. Registers RPC config in metadata registry.

```ts
export declare const rpc: <RpcRouteConfigType extends IRpcMetadata>(opts: {
    configs: RpcRouteConfigType;
}) => (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rpc.ts`

## `ScopeFilterMissingBehaviors`

*class*

What a row-scope filter (`@model` settings.access) does when `resolve()` returns null/undefined.

```ts
export declare class ScopeFilterMissingBehaviors {
    /** An unresolved scope matches ZERO rows - the safe reading of "caller's scope is unknown". */
    static readonly DENY = "deny";
    /** Explicit opt-out: no scope is applied. For migrations and background jobs, never inferred from a request. */
    static readonly ALLOW = "allow";
    static readonly SCHEME_SET: Set<string>;
    static isValid(behavior: string): boolean;
}
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `ScopeFilters`

*class*

The third `resolve()` state, beside a `where` and `deny`-by-default null/undefined: unrestricted
for THIS call. `onMissing: 'allow'` cannot express it - `onMissing` lives on the model's static
settings, so using it for a per-user bypass (an internal operator) would also unscope every
ordinary user whose `resolve()` happens to return nothing.

```ts
export declare class ScopeFilters {
    /**
     * Return from `resolve()` to apply NO scope for this request - a caller the application has
     * decided sees everything. Deliberately a symbol: forgetting to return must land in deny, and no
     * JSON body, query string, or header can ever produce this value. `Symbol.for` so two installed
     * copies of this package agree on identity, same as `DATA_SOURCE_BRAND`.
     */
    static readonly UNRESTRICTED: unique symbol;
}
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `ScopeOperations`

*class*

What a repository call does to rows, as the row scope (`@model` settings.access) sees it.
`access.resolve` receives one CONCRETE operation (READ, CREATE, UPDATE or DELETE), never a group,
so one function can answer a wide scope for a read and a narrow one for a write. WRITE and ALL
are groups of concrete operations, for application code that asks "is this a write?".

```ts
export declare class ScopeOperations {
    static readonly READ = "read";
    static readonly CREATE = "create";
    static readonly UPDATE = "update";
    static readonly DELETE = "delete";
    /** CREATE, UPDATE and DELETE. */
    static readonly WRITE = "write";
    /** Every concrete operation. */
    static readonly ALL = "all";
    /** All six values: the four concrete operations and the two groups. */
    static readonly SCHEME_SET: Set<string>;
    /** The concrete operations: what `access.resolve` can receive. */
    static readonly OPERATION_SET: Set<string>;
    /** Which concrete operations each group holds. */
    static readonly GROUP_MAP: ReadonlyMap<string, ReadonlySet<string>>;
    static isValid(value: string): boolean;
    /**
     * Whether `operation` belongs to `group`. A concrete operation includes itself and nothing else;
     * WRITE includes CREATE, UPDATE and DELETE; ALL includes all four.
     */
    static includes(opts: {
        group: TScopeOperationGroup;
        operation: TScopeOperation;
    }): boolean;
}
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `ScopeThrough`

*class*

The value of `settings.access.through`: scope this model through the parent a `one` relation points at. `of` is the
only way to make one: the constructor is private and the class has a member no plain object has, so a hand-written
`{ relation: 'x' }` does not compile and the name is always checked against the entity.

````ts
export declare class ScopeThrough<RelationName extends string = string> {
    readonly relation: RelationName;
    protected readonly kind = "scope-through";
    private constructor();
    /**
     * `entity` is read for its type only: a misspelled relation, a to-many one or a name held in a plain `string` does not compile.
     *
     * @example
     * ```typescript
     * import { ScopeThrough } from '@venizia/ignis';
     * import { ModelFactory, one } from '@venizia/ignis-connectors/postgres';
     * import { integer, pgTable, serial } from 'drizzle-orm/pg-core';
     *
     * const productTable = pgTable('Product', { id: serial('id').primaryKey() });
     * const variantTable = pgTable('Variant', {
     *   id: serial('id').primaryKey(),
     *   productId: integer('product_id').references(() => productTable.id),
     * });
     * const Variant = ModelFactory.defineEntity({ table: variantTable, relations: () => ({ product: one(productTable) }) });
     * const through = ScopeThrough.of({ entity: Variant, relation: 'product' });
     * ```
     */
    static of<Entity extends IEntityWithRelations, Name extends TOneRelationNameOf<Entity>>(opts: {
        entity: Entity;
        relation: Name;
    }): ScopeThrough<Name>;
}

/** An entity class that declares its relations by name, as `ModelFactory.defineEntity` builds one. */
interface IEntityWithRelations {
    relationDefinitions: Record<string, {
        type: string;
    }> | undefined;
}
````

Source: `packages/kernel/src/base/repositories/common/scope-through.ts`

## `ScopeWriteGuards`

*class*

What a scoped write does with a row whose scope column disagrees with the resolved scope
(`@model` settings.access.write.mode). A scope that returns `ScopeFilters.UNRESTRICTED`
passes either way.

```ts
export declare class ScopeWriteGuards {
    /** A row whose scope column disagrees, or is absent on create, is refused and nothing is written. */
    static readonly REJECT = "reject";
    /** An ABSENT scope column is filled from an equality scope; a value that disagrees is still refused. */
    static readonly ASSIGN = "assign";
    static readonly SCHEME_SET: Set<string>;
    static isValid(guard: string): boolean;
}
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `SecFetchSiteValues`

*const*

The values of the `Sec-Fetch-Site` request header, the vocabulary of `TSecFetchSite`.

```ts
export declare const SecFetchSiteValues: readonly ["same-origin", "same-site", "none", "cross-site"];
```

Source: `packages/kernel/src/base/applications/common/constants.ts`

## `serverStream`

*const*

Server streaming RPC decorator. Equivalent to @rpc but automatically sets method to 'server_streaming'.

```ts
export declare const serverStream: <RpcRouteConfigType extends Omit<IRpcMetadata, "method">>(opts: {
    configs: RpcRouteConfigType;
}) => (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rpc.ts`

## `ServiceAssertion`

*class*

Wire-level constants of the service assertion. Fixed rather than configurable: both ends of a
call must agree on them, and a knob here would let two services disagree silently.

```ts
export declare class ServiceAssertion {
    /** Its own header, so the end user's token keeps `Authorization` on the same request. */
    static readonly HEADER = "x-service-assertion";
    /** The JWS `typ`. What stops a user token being replayed as an assertion when one JWKS serves both. */
    static readonly TYP = "svc+jwt";
    static readonly ALGORITHM = "EdDSA";
    static readonly DEFAULT_REST_PATH = "/svc-certs";
    /** How long a minted assertion stays valid. */
    static readonly DEFAULT_SIGN_LIFETIME_SECONDS = 60;
    /** The oldest assertion a callee accepts, measured from `iat`. Its own decision, not the caller's. */
    static readonly DEFAULT_ACCEPT_MAX_AGE_SECONDS = 60;
    static readonly DEFAULT_CLOCK_TOLERANCE_SECONDS = 5;
    /** Resolves the accepted age for one caller: its own override, then the service default. */
    static resolveAcceptMaxAge(opts: {
        callerOverride?: number;
        serviceDefault?: number;
    }): number;
    static readonly DEFAULT_JWKS_CACHE_MAX_AGE_MS: number;
    static readonly DEFAULT_JWKS_COOLDOWN_MS: number;
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/service-assertion.ts`

## `SignInRequestSchema`

*const*

Validates a sign-in body: an `identifier` and a `credential`, each a `scheme` plus `value`, and an optional `clientId`.

```ts
export declare const SignInRequestSchema: z.ZodObject<{
    identifier: z.ZodObject<{
        scheme: z.ZodString;
        value: z.ZodString;
    }, z.core.$strip>;
    credential: z.ZodObject<{
        scheme: z.ZodString;
        value: z.ZodString;
    }, z.core.$strip>;
    clientId: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
```

Source: `packages/kernel/src/base/auth/models/requests/sign-in.schema.ts`

## `SignUpRequestSchema`

*const*

Validates a sign-up body: `username` and `credential`, each a non-empty string of at least 8 characters.

```ts
export declare const SignUpRequestSchema: z.ZodObject<{
    username: z.ZodString;
    credential: z.ZodString;
}, z.core.$strip>;
```

Source: `packages/kernel/src/base/auth/models/requests/sign-up.schema.ts`

## `SkipSchema`

*const*

Number of rows to skip; a non-negative integer.

```ts
export declare const SkipSchema: z.ZodOptional<z.ZodNumber>;
```

Source: `packages/kernel/src/base/repositories/query-schemas/index.ts`

## `Statuses`

*class*

Application statuses categorized by lifecycle phase (initial, pending, active, completed, inactive, failed).

```ts
export declare class Statuses {
    static readonly UNKNOWN = "000_UNKNOWN";
    static readonly DRAFT = "001_DRAFT";
    static readonly NEW = "100_NEW";
    static readonly QUEUED = "101_QUEUED";
    static readonly SCHEDULED = "102_SCHEDULED";
    static readonly PENDING = "103_PENDING";
    static readonly IN_REVIEW = "104_IN_REVIEW";
    static readonly ENABLED = "200_ENABLED";
    static readonly ACTIVATED = "201_ACTIVATED";
    static readonly RUNNING = "202_RUNNING";
    static readonly PROCESSING = "203_PROCESSING";
    static readonly SENT = "204_SENT";
    static readonly RECEIVED = "205_RECEIVED";
    static readonly PARTIAL = "300_PARTIAL";
    static readonly APPROVED = "301_APPROVED";
    static readonly SUCCESS = "302_SUCCESS";
    static readonly COMPLETED = "303_COMPLETED";
    static readonly SETTLED = "304_SETTLED";
    static readonly CONFIRMED = "305_CONFIRMED";
    static readonly DISABLED = "400_DISABLED";
    static readonly DEACTIVATED = "401_DEACTIVATED";
    static readonly SUSPENDED = "402_SUSPENDED";
    static readonly BLOCKED = "403_BLOCKED";
    static readonly CLOSED = "404_CLOSED";
    static readonly ARCHIVED = "405_ARCHIVED";
    static readonly PAUSED = "406_PAUSED";
    static readonly REVOKED = "407_REVOKED";
    static readonly REFUNDED = "408_REFUNDED";
    static readonly FAIL = "500_FAIL";
    static readonly EXPIRED = "501_EXPIRED";
    static readonly TIMEOUT = "502_TIMEOUT";
    static readonly SKIPPED = "503_SKIPPED";
    static readonly ABORTED = "504_ABORTED";
    static readonly CANCELLED = "505_CANCELLED";
    static readonly DELETED = "506_DELETED";
    static readonly REJECTED = "507_REJECTED";
    static readonly INITIAL_SCHEME_SET: Set<string>;
    static readonly PENDING_SCHEME_SET: Set<string>;
    static readonly ACTIVE_SCHEME_SET: Set<string>;
    static readonly COMPLETED_SCHEME_SET: Set<string>;
    static readonly INACTIVE_SCHEME_SET: Set<string>;
    static readonly FAILED_SCHEME_SET: Set<string>;
    static readonly SCHEME_SET: Set<string>;
    static isInitial(status: string): boolean;
    static isPending(status: string): boolean;
    static isActive(status: string): boolean;
    static isCompleted(status: string): boolean;
    static isInactive(status: string): boolean;
    static isFailed(status: string): boolean;
    static isValid(status: string): boolean;
}
```

Source: `packages/kernel/src/common/statuses/common.ts`

## `StringIdType`

*type*

String entity id.

```ts
export type StringIdType = string;
```

Source: `packages/kernel/src/base/models/common/types/id.ts`

## `TAnyDataSourceSchema`

*type*

Loose schema record of a datasource; the default `Schema` type argument of `IDataSource`.

```ts
export type TAnyDataSourceSchema = Record<string, any>;
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `TAnyObjectSchema`

*type*

Zod object type of a plain raw shape, used to type request and response schemas.

```ts
export type TAnyObjectSchema = z.ZodObject<z.ZodRawShape>;
```

Source: `packages/kernel/src/base/controllers/common/schema-builders.ts`

## `TArtifactCondition`

*type*

Decides at registration time whether the class is registered at all. Sync or async; runs before `preConfigure`, so it may read config and env, never another artifact's binding.

```ts
export type TArtifactCondition<ApplicationType = unknown> = (opts: {
    application: ApplicationType;
}) => ValueOrPromise<boolean>;
```

Source: `packages/kernel/src/helpers/inversion/common/types/artifact.ts`

## `TArtifactIndexField`

*type*

Union of the `ArtifactIndexFields` values.

```ts
export type TArtifactIndexField = TConstValue<typeof ArtifactIndexFields>;
```

Source: `packages/kernel/src/base/applications/common/constants.ts`

## `TArtifactIndexInput`

*type*

One index, a conditional entry, a group, or any nesting of arrays of them - a library exports one, an application composes several.

```ts
export type TArtifactIndexInput = IArtifactIndex | IConditionalArtifactIndex | IArtifactGroup | TArtifactIndexInput[];
```

Source: `packages/kernel/src/base/applications/common/types/artifacts.ts`

## `TArtifactType`

*type*

Valid `ArtifactTypes` values.

```ts
export type TArtifactType = TConstValue<typeof ArtifactTypes>;
```

Source: `packages/kernel/src/helpers/inversion/common/types/artifact.ts`

## `TAuthenticateFn`

*type*

Builds the authentication middleware for the listed strategy names.

```ts
export type TAuthenticateFn<RouteEnv extends Env = Env> = (opts: {
    strategies: string[];
    /** @default 'any' */
    mode?: TAuthMode;
}) => MiddlewareHandler<RouteEnv>;
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/strategy.ts`

## `TAuthenticationRestOptions`

*type*

REST options of the authenticate component: `controllerOpts` is required when `useAuthController` is `true`.

```ts
export type TAuthenticationRestOptions = {} & ({
    useAuthController?: false | undefined;
} | {
    useAuthController: true;
    controllerOpts: TDefineAuthControllerOpts;
});
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/rest.ts`

## `TAuthMode`

*type*

A valid value of `AuthenticationModes`.

```ts
export type TAuthMode = TConstValue<typeof AuthenticationModes>;
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/authentication.ts`

## `TAuthorizationAction`

*type*

Union of the `AuthorizationActions` values.

```ts
export type TAuthorizationAction = TConstValue<typeof AuthorizationActions>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `TAuthorizationConditions`

*type*

Key-value conditions for attribute-based access control. Values compared with strict equality.

```ts
export type TAuthorizationConditions<KeyType extends string | symbol = string | symbol, ValueType = string | number | boolean | null> = Record<KeyType, ValueType>;
```

Source: `packages/kernel/src/base/auth/authorize/common/types/request.ts`

## `TAuthorizationDecision`

*type*

Union of the `AuthorizationDecisions` values.

```ts
export type TAuthorizationDecision = TConstValue<typeof AuthorizationDecisions>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `TAuthorizationDomainResolver`

*type*

Returns the current request domain; null = no domain (→ SYSTEM_WIDE).

```ts
export type TAuthorizationDomainResolver<E extends Env = Env> = (opts: {
    context: TContext<E, string>;
}) => ValueOrPromise<TNullable<{
    type: string;
    id: IdType;
}>>;
```

Source: `packages/kernel/src/base/auth/authorize/common/types/request.ts`

## `TAuthorizationDomainScope`

*type*

Union of the `AuthorizationDomainScopes` values.

```ts
export type TAuthorizationDomainScope = TConstValue<typeof AuthorizationDomainScopes>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `TAuthorizationDomainSource`

*type*

Valid authorization domain source values.

```ts
export type TAuthorizationDomainSource = TConstValue<typeof AuthorizationDomainSources>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `TAuthorizationEnforcerType`

*type*

Union of the `AuthorizationEnforcerTypes` values.

```ts
export type TAuthorizationEnforcerType = TConstValue<typeof AuthorizationEnforcerTypes>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `TAuthorizationPolicyVariant`

*type*

The `variant` column's full value set, derived from {@link AuthorizationPolicyVariants.ALL} - never hand-list the seven strings again.

```ts
export type TAuthorizationPolicyVariant = (typeof AuthorizationPolicyVariants.ALL)[number]['action'];

/** Edge kinds in the `PolicyDefinition` table (each row: subject -> target, `variant` = kind), carrying `action` (DB `variant` value) + `rule` (casbin prefix emitted per edge). Per-USER edges: GRANT, ASSIGN_ROLE, JOIN_DOMAIN; shared org-structure edges: the *_INHERITS ones. */
export declare class AuthorizationPolicyVariants {
    /** Give a Permission to a User/Role (row also carries action / effect / domain). casbin `p`: `p, <Role|User>_<id>, <domain>, <permissionCode>, <action>, <allow|deny>` */
    static readonly GRANT: {
        readonly action: "grant";
        readonly rule: "p";
    };
    /** Give a User a Role (optionally domain-scoped; no domain -> `*` = every domain). casbin `g`: `g, User_<id>, Role_<id>, <domain|*>` */
    static readonly ASSIGN_ROLE: {
        readonly action: "assign_role";
        readonly rule: "g";
    };
    /** A Role inherits another Role (DAG). Shares `g` with ASSIGN_ROLE so user -> role -> parent-role resolves in one lookup. Emitted with domain `*`: `g, Role_<child>, Role_<parent>, *` */
    static readonly ROLE_INHERITS: {
        readonly action: "role_inherits";
        readonly rule: "g";
    };
    /** User is a member of a Domain; powers the `ANY_MEMBER` grant scope via `g2(r.sub, r.dom)`. casbin `g2`: `g2, User_<id>, <Type>_<domainId>` */
    static readonly JOIN_DOMAIN: {
        readonly action: "join_domain";
        readonly rule: "g2";
    };
    /** DOMAIN axis (`dom`): domain nesting. Matcher: `g3(r.dom, p.dom)` + self-link so an exact domain always matches itself. casbin `g3`: `g3, <Type>_<childId>, <Type>_<parentId>` */
    static readonly DOMAIN_INHERITS: {
        readonly action: "domain_inherits";
        readonly rule: "g3";
    };
    /** RESOURCE axis (`obj`), NON-standard nesting only - dotted nesting (`Order.findById ⊂ Order`) is handled by `objectMatch` WITHOUT an edge. Matcher: `objectMatch(r.obj, p.obj) || g4(r.obj, p.obj)`, casbin `g4`: `g4, <childCode>, <parentCode>` */
    static readonly RESOURCE_INHERITS: {
        readonly action: "resource_inherits";
        readonly rule: "g4";
    };
    /** ACTION axis (`act`): a narrow action covered by a broader one; no dotted shortcut, so it needs an explicit edge. Matcher: `g5(r.act, p.act)`, casbin `g5`: `g5, <childAction>, <parentAction>`. g4 + g5 combine multiplicatively: `manage Order` covers a `read OrderItem` request. */
    static readonly ACTION_INHERITS: {
        readonly action: "action_inherits";
        readonly rule: "g5";
    };
    /** Every edge kind, in declaration order - the one place the scheme sets and the `variant` column's literal type both derive from. */
    static readonly ALL: readonly [{
        readonly action: "grant";
        readonly rule: "p";
    }, {
        readonly action: "assign_role";
        readonly rule: "g";
    }, {
        readonly action: "role_inherits";
        readonly rule: "g";
    }, {
        readonly action: "join_domain";
        readonly rule: "g2";
    }, {
        readonly action: "domain_inherits";
        readonly rule: "g3";
    }, {
        readonly action: "resource_inherits";
        readonly rule: "g4";
    }, {
        readonly action: "action_inherits";
        readonly rule: "g5";
    }];
    static readonly ACTION_SCHEME_SET: Set<string>;
    static readonly RULE_SCHEME_SET: Set<string>;
    static isValidAction(input: string): boolean;
    static isValidRule(input: string): boolean;
}
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/authorization.ts`

## `TAuthorizationVoter`

*type*

Per-route check run before the enforcer. `deny` rejects the request, `allow` accepts it without consulting the enforcer, `abstain` passes to the next voter and then the enforcer.

```ts
export type TAuthorizationVoter<E extends Env = Env, TAction = string, TResource = string> = (opts: {
    user: IAuthUser;
    action: TAction;
    resource: TResource;
    context: TContext<E, string>;
}) => ValueOrPromise<TAuthorizationDecision>;
```

Source: `packages/kernel/src/base/auth/authorize/common/types/enforcer.ts`

## `TAuthorizeFn`

*type*

Factory that turns an `IAuthorizationSpec` (and optional enforcer name) into a Hono middleware.

```ts
export type TAuthorizeFn<E extends Env = Env, TAction = string, TResource = string> = (opts: {
    spec: IAuthorizationSpec<E, TAction, TResource>;
    enforcerName?: string;
}) => MiddlewareHandler;
```

Source: `packages/kernel/src/base/auth/authorize/common/types/enforcer.ts`

## `TAuthorizeModelFormat`

*type*

Valid authorize model format values.

```ts
export type TAuthorizeModelFormat = TConstValue<typeof AuthorizeModelFormats>;
```

Source: `packages/kernel/src/helpers/inversion/common/constants.ts`

## `TAuthStrategy`

*type*

A strategy name: a built-in from `AuthenticateStrategy` or any name an application registers.

```ts
export type TAuthStrategy = TConstValue<typeof AuthenticateStrategy> | (string & {});
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/authentication.ts`

## `TBasicTokenServiceOptions`

*type*

Options of the `basic` strategy.

```ts
export type TBasicTokenServiceOptions<E extends Env = Env> = {
    /** Callback to verify basic auth credentials. Returns IAuthUser if valid, null otherwise. */
    verifyCredentials: (opts: {
        credentials: {
            username: string;
            password: string;
        };
        context: TContext<E, string>;
    }) => Promise<IAuthUser | null>;
};
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/basic.ts`

## `TBootStep`

*type*

Union of the step names in `BootSteps`.

```ts
export type TBootStep = TConstValue<typeof BootSteps>;
```

Source: `packages/kernel/src/base/applications/boot-sequence.ts`

## `TCasbinDomainMatchingFunction`

*type*

Union of the `CasbinDomainMatchingFunctions` values.

```ts
export type TCasbinDomainMatchingFunction = TConstValue<typeof CasbinDomainMatchingFunctions>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `TCasbinEnforcerCachedDriver`

*type*

Union of the `CasbinEnforcerCachedDrivers` values.

```ts
export type TCasbinEnforcerCachedDriver = TConstValue<typeof CasbinEnforcerCachedDrivers>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `TCasbinEnforcerModelDriver`

*type*

Union of the `CasbinEnforcerModelDrivers` values.

```ts
export type TCasbinEnforcerModelDriver = TConstValue<typeof CasbinEnforcerModelDrivers>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `TCasbinRuleVariant`

*type*

Union of the `CasbinRuleVariants` values.

```ts
export type TCasbinRuleVariant = TConstValue<typeof CasbinRuleVariants>;
```

Source: `packages/kernel/src/base/auth/authorize/common/constants/enforcer.ts`

## `TChangePasswordRequest`

*type*

Parsed body of `ChangePasswordRequestSchema`.

```ts
export type TChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;
```

Source: `packages/kernel/src/base/auth/models/requests/change-password.schema.ts`

## `TCompressEncoding`

*type*

Valid compress encoding values.

```ts
export type TCompressEncoding = TConstValue<typeof CompressEncodings>;
```

Source: `packages/kernel/src/base/applications/common/constants.ts`

## `TContext`

*type*

Lightweight typed context that bypasses RouteHandler inference.

```ts
export type TContext<RouteEnv extends Env = Env, ValidTargetKey extends string = string, ResponseBody = unknown> = Omit<Context<RouteEnv>, 'req' | 'json'> & {
    req: Omit<Context<RouteEnv>['req'], 'valid'> & {
        valid<T = unknown>(target: ValidTargetKey): T;
    };
    json<TStatusCode extends ContentfulStatusCode = 200>(body: ResponseBody, status?: TStatusCode): TJsonResponse<ResponseBody, TStatusCode>;
};
```

Source: `packages/kernel/src/base/controllers/common/types/context.ts`

## `TControllerMetadata`

*type*

Metadata accepted by `@controller`, discriminated on `transport`.

```ts
export type TControllerMetadata = IRestControllerMetadata | IGrpcControllerMetadata;
```

Source: `packages/kernel/src/helpers/inversion/common/types/controller.ts`

## `TControllerTransport`

*type*

Union of the `ControllerTransports` values.

```ts
export type TControllerTransport = TConstValue<typeof ControllerTransports>;
```

Source: `packages/kernel/src/base/controllers/common/constants.ts`

## `TCoreErrorCode`

*type*

Valid `CoreErrorCodes` values.

```ts
export type TCoreErrorCode = TConstValue<typeof CoreErrorCodes>;
```

Source: `packages/kernel/src/common/error-codes.ts`

## `TCountResponse`

*type*

Polymorphic response body for endpoints honoring the `x-request-count-data` header - the count-wrapped `{ count, data }` or the raw payload; pass the unwrapped payload type as `T`.

```ts
export type TCountResponse<TData = unknown> = TData | {
    count: number;
    data: TData;
};
```

Source: `packages/kernel/src/base/controllers/common/types/context.ts`

## `TCustomGrantMetadata`

*type*

Shape of `PolicyDefinition.metadata` on a subset ("custom") grant. `ops` holds bare method names (e.g. `"find"`), not full permission codes.

```ts
export type TCustomGrantMetadata = {
    ops: string[];
};
```

Source: `packages/kernel/src/base/auth/authorize/common/types/grant.ts`

## `TCustomizableRouteConfig`

*type*

What a CRUD route lets a caller override: auth, `enabled`, the request schemas (params, query, body, headers) and the response schema and headers.

```ts
export type TCustomizableRouteConfig = TRouteAuthConfig & {
    /**
     * Whether this route is registered.
     *
     * @default true
     */
    enabled?: boolean;
    request?: {
        params?: TAnyObjectSchema;
        query?: TAnyObjectSchema;
        body?: TAnyObjectSchema;
        headers?: TAnyObjectSchema;
    };
    response?: {
        schema?: z.ZodType;
        headers?: TResponseHeaders;
    };
};
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `TDataSourceDriver`

*type*

A driver name: one of `DataSourceDrivers`, or any other string for an unlisted engine.

```ts
export type TDataSourceDriver = TConstValue<typeof DataSourceDrivers> | (string & {});
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `TDataSourceDriverClass`

*type*

A driver CLASS, named by `@datasource({ driver })`. The class reference is what pulls the peer
package into a bundle - a name string pulls nothing, and a bare side-effect import may be
dropped. Untyped because `IRelationalDriver` lives under `connectors/`, off-limits to `base/`.

```ts
export type TDataSourceDriverClass = TClass<AnyType>;
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `TDataSourceOpenMode`

*type*

One of the {@link DataSourceOpenModes} values.

```ts
export type TDataSourceOpenMode = TConstValue<typeof DataSourceOpenModes>;
```

Source: `packages/kernel/src/base/datasources/common/types.ts`

## `TDecoratorModelTarget`

*type*

Decorator target for model classes (supports both strongly typed and ClassDecorator patterns).

```ts
export type TDecoratorModelTarget<Model extends AbstractEntity = AbstractEntity> = TModelClass<Model> | (Function & IEntityStatics);
```

Source: `packages/kernel/src/helpers/inversion/common/types/model.ts`

## `TDecoratorTarget`

*type*

Decorator target for any constructable class (includes Function for ClassDecorator).

```ts
export type TDecoratorTarget<T = unknown> = TClass<T> | Function;
```

Source: `packages/kernel/src/helpers/inversion/common/types/artifact.ts`

## `TDefineAuthControllerOpts`

*type*

Options for defining the auth controller. `serviceKey` is the container key of the `IAuthService` it calls; each `payload` entry overrides the request or response schema of one route.

```ts
export type TDefineAuthControllerOpts = {
    restPath?: string;
    serviceKey: string;
    requireAuthenticatedSignUp?: boolean;
    payload?: {
        signIn?: {
            request: {
                schema: TAnyObjectSchema;
            };
            response: {
                schema: TAnyObjectSchema;
            };
        };
        signUp?: {
            request: {
                schema: TAnyObjectSchema;
            };
            response: {
                schema: TAnyObjectSchema;
            };
        };
        changePassword?: {
            request: {
                schema?: TAnyObjectSchema;
            };
            response: {
                schema: TAnyObjectSchema;
            };
        };
        refreshToken?: {
            response: {
                schema: TAnyObjectSchema;
            };
        };
        getUserInformation?: {
            response: {
                schema: TAnyObjectSchema;
            };
        };
    };
};
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/rest.ts`

## `TDrizzleQueryOptions`

*type*

Options for Drizzle ORM query building, used internally by FilterBuilder.

```ts
export type TDrizzleQueryOptions = Partial<{
    limit: number;
    offset: number;
    orderBy: SQL[];
    where: SQL;
    with: Record<string, true | TDrizzleQueryOptions>;
    columns: Record<string, boolean>;
}>;
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `TEntityDataObject`

*type*

Read object inferred from an entity's engine-neutral `$inferData` phantom marker - each family fills it with its own type, so the base layer needs no connector import; falls back to `object`.

```ts
export type TEntityDataObject<TEntity> = TEntity extends {
    $inferData?: infer TData;
} ? TData extends object ? TData : object : object;
```

Source: `packages/kernel/src/base/controllers/common/types/controller.ts`

## `TEntityId`

*type*

A string id a plain `string` cannot be assigned to, so passing a name, code or email where an id
belongs is a compile error. Opt a column in with `.$type<TEntityId>()`.

IT VALIDATES NOTHING. `toEntityId` is a cast with a non-empty check; the value is making the
laundering VISIBLE at each boundary, not proving the string is a real id.

The cost is not optional: Drizzle derives `$inferInsert` and `$inferSelect` from the same field,
so a branded column rejects every literal - `create({ data: { merchantId: 'M1' } })`, seeds,
fixtures, path params - until each converts. A union with `string` would restore those but makes
a plain `string` assignable again, which erases the whole guarantee. Measured, not assumed.

```ts
export type TEntityId = string & {
    readonly [entityIdBrand]: never;
};

declare const entityIdBrand: unique symbol;
```

Source: `packages/kernel/src/base/models/common/types/id.ts`

## `TEntityPersistObject`

*type*

Persist object inferred from an entity's engine-neutral `$inferPersist` phantom marker - same contract and `object` fallback as {@link TEntityDataObject}.

```ts
export type TEntityPersistObject<TEntity> = TEntity extends {
    $inferPersist?: infer TPersist;
} ? TPersist extends object ? TPersist : object : object;
```

Source: `packages/kernel/src/base/controllers/common/types/controller.ts`

## `TErrorLogFormatter`

*type*

How a thrown error is rendered into the log line. Must never throw - a throw inside the error handler turns a handled failure into an unhandled one.

```ts
export type TErrorLogFormatter = (opts: {
    error: unknown;
    messageCode?: string;
    extra?: Record<string, unknown>;
    includeStack?: boolean;
    maxStackFrames?: number;
}) => string;
```

Source: `packages/kernel/src/base/middlewares/app-error/app-error.middleware.ts`

## `TErrorResponse`

*type*

The error response body type inferred from `ErrorSchema`.

```ts
export type TErrorResponse = z.infer<typeof ErrorSchema>;
```

Source: `packages/kernel/src/base/models/common/schemas.ts`

## `TEventHandlerFunction`

*type*

A handler callback - synchronous or asynchronous, `EventBus` awaits either the same way.

```ts
export type TEventHandlerFunction<TPayload = unknown> = (opts: {
    event: IDomainEvent<TPayload>;
}) => ValueOrPromise<void>;
```

Source: `packages/kernel/src/base/events/common/types.ts`

## `TEventHandlerReference`

*type*

The two shapes `EventBus.register`'s `handler` accepts, tagged by `type` so the caller states
which rather than the bus inferring it from whichever field is present. Only `BINDING_KEY` shares
`IEventHandler`'s rebind property; see its doc.

```ts
export type TEventHandlerReference<TPayload = unknown> = IEventHandlerBindingKeyReference | IEventHandlerFunctionReference<TPayload>;
```

Source: `packages/kernel/src/base/events/common/types.ts`

## `TEventHandlerType`

*type*

Union of the `EventHandlerTypes` values.

```ts
export type TEventHandlerType = TConstValue<typeof EventHandlerTypes>;
```

Source: `packages/kernel/src/base/events/common/constants.ts`

## `TFindOneOptions`

*type*

Options for `findOne`/`findById` - the retry predicate sees `TNullable<R>`.

```ts
export type TFindOneOptions<TOptions extends IExtraOptions, R> = TOptions & IWithReadRetry<TNullable<R>>;
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `TFindOptions`

*type*

Options for `find` returning a plain array - the retry predicate sees `Array<R>`.

```ts
export type TFindOptions<TOptions extends IExtraOptions, R> = TOptions & {
    shouldQueryRange?: false;
} & IWithReadRetry<Array<R>>;
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `TFindRangeOptions`

*type*

Options for `find` with the range envelope - the retry predicate sees `{ data, range }`.

```ts
export type TFindRangeOptions<TOptions extends IExtraOptions, R> = TOptions & {
    shouldQueryRange: true;
} & IWithReadRetry<TDataWithRange<R>>;
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `TGetTokenExpiresFn`

*type*

Returns the lifetime of a token to issue, in seconds from now.

```ts
export type TGetTokenExpiresFn = () => ValueOrPromise<number>;
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

## `TGrantIntent`

*type*

What a caller wants to grant: a whole `tier` action, or an explicit list of operation names (`ops`).

```ts
export type TGrantIntent = {
    tier: TAuthorizationAction;
} | {
    ops: string[];
};
```

Source: `packages/kernel/src/base/auth/authorize/common/types/grant.ts`

## `TInferSchema`

*type*

The output type of a Zod schema `T`.

```ts
export type TInferSchema<T extends z.ZodType> = z.infer<T>;
```

Source: `packages/kernel/src/base/controllers/common/schema-builders.ts`

## `TInjectOptions`

*type*

Either a binding key or the class bound under it - never both. The shape is inversion's; the
`registry` member is not, because this wrapper is the one that supplies it.

```ts
export type TInjectOptions = TWithoutRegistry<TCoreInjectOptions>;

/** Distributes over the union, so `key` and `target` stay mutually exclusive - a bare `Omit` collapses the two branches into one shape declaring both. */
type TWithoutRegistry<T> = T extends unknown ? Omit<T, 'registry'> : never;
```

Source: `packages/kernel/src/base/metadata/injectors.ts`

## `TIsAllowedOriginHandler`

*type*

Decides whether the request `Origin` is allowed for the CSRF check.

```ts
export type TIsAllowedOriginHandler = (origin: string, context: Context) => boolean;
```

Source: `packages/kernel/src/base/applications/common/types/middlewares.ts`

## `TIsAllowedSecFetchSiteHandler`

*type*

Decides whether the request `Sec-Fetch-Site` value is allowed for the CSRF check.

```ts
export type TIsAllowedSecFetchSiteHandler = (secFetchSite: TSecFetchSite, context: Context) => boolean;
```

Source: `packages/kernel/src/base/applications/common/types/middlewares.ts`

## `TJOSEStandard`

*type*

A valid value of `JOSEStandards`.

```ts
export type TJOSEStandard = TConstValue<typeof JOSEStandards>;
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `TJsonResponse`

*type*

A Hono JSON `Response` typed with its body and status code.

```ts
export type TJsonResponse<ResponseBody = unknown, ResponseStatusCode extends StatusCode = StatusCode> = Response & TypedResponse<ResponseBody, ResponseStatusCode, 'json'>;
```

Source: `packages/kernel/src/base/controllers/common/types/context.ts`

## `TJWKSAlgorithm`

*type*

Valid JWKS algorithm values.

```ts
export type TJWKSAlgorithm = TConstValue<typeof JWKSAlgorithms>;
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `TJWKSKeyDriver`

*type*

A valid value of `JWKSKeyDrivers`.

```ts
export type TJWKSKeyDriver = TConstValue<typeof JWKSKeyDrivers>;
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `TJWKSKeyFormat`

*type*

A valid value of `JWKSKeyFormats`.

```ts
export type TJWKSKeyFormat = TConstValue<typeof JWKSKeyFormats>;
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `TJWKSMode`

*type*

A valid value of `JWKSModes`.

```ts
export type TJWKSMode = TConstValue<typeof JWKSModes>;
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `TJWKSTokenServiceOptions`

*type*

Options of the JWKS token service, selected by `mode`.

```ts
export type TJWKSTokenServiceOptions = IJWKSIssuerOptions | IJWKSVerifierOptions;
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

## `TJWTTokenRole`

*type*

One role as a token carries it.

```ts
export type TJWTTokenRole = {
    id: IdType;
    identifier: string;
    priority: number;
};
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

## `TJWTTokenServiceOptions`

*type*

Options of the JWT token service, selected by `standard` (`JWS` or `JWKS`).

```ts
export type TJWTTokenServiceOptions = {
    standard: typeof JOSEStandards.JWS;
    options: IJWSTokenServiceOptions;
} | {
    standard: typeof JOSEStandards.JWKS;
    options: TJWKSTokenServiceOptions;
};
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/jwt.ts`

## `TLockConfig`

*type*

Configuration for row-level lock wait behavior. Mutually exclusive: use noWait OR skipLocked.

```ts
export type TLockConfig = {
    noWait: true;
    skipLocked?: undefined;
} | {
    noWait?: undefined;
    skipLocked: true;
} | {
    noWait?: undefined;
    skipLocked?: undefined;
};
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `TLockOptions`

*type*

Row-level locking options for read operations.

```ts
export type TLockOptions = {
    strength: TLockStrength;
    config?: TLockConfig;
};
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `TLockStrength`

*type*

Valid lock strength values.

```ts
export type TLockStrength = TConstValue<typeof LockStrengths>;
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `TMixinOpts`

*type*

Options of the registration itself, never of the artifact - what the artifact needs goes on its class.

```ts
export type TMixinOpts<Options extends object = {}> = {
    binding?: {
        namespace: string;
        key: string;
    };
    /**
     * Matches `bind()`'s overwrite behavior; false makes a same-key re-registration throw. Unset, it
     * follows `bootChecks.binding.allowOverride`.
     *
     * @default true
     */
    allowOverride?: boolean;
    /** Options passed directly to `instance.configure(options)` during initialization. */
    options?: Options;
};
```

Source: `packages/kernel/src/base/mixins/common/types.ts`

## `TModelAccessSettings`

*type*

The two shapes of `@model` settings.access: a resolver, or a `through`.

```ts
export type TModelAccessSettings = IModelAccessSettings | IModelAccessThroughSettings;
```

Source: `packages/kernel/src/helpers/inversion/common/types/model.ts`

## `TModelClass`

*type*

A model class together with its entity statics.

```ts
export type TModelClass<Model extends AbstractEntity = AbstractEntity> = TClass<Model> & IEntityStatics;
```

Source: `packages/kernel/src/helpers/inversion/common/types/model.ts`

## `TModelType`

*type*

Valid model type values.

```ts
export type TModelType = TConstValue<typeof ModelTypes>;
```

Source: `packages/kernel/src/base/models/common/constants.ts`

## `TOneRelationNameOf`

*type*

The names of the entity's `one` relations: the only ones a child can be scoped through. None, when it declares no relations.

```ts
export type TOneRelationNameOf<Entity extends IEntityWithRelations> = [
    TDefinitionsOf<Entity>
] extends [never] ? never : {
    [Name in keyof TDefinitionsOf<Entity> & string]: TDefinitionsOf<Entity>[Name]['type'] extends typeof RelationTypes.ONE ? Name : never;
}[keyof TDefinitionsOf<Entity> & string];

/** An entity class that declares its relations by name, as `ModelFactory.defineEntity` builds one. */
interface IEntityWithRelations {
    relationDefinitions: Record<string, {
        type: string;
    }> | undefined;
}

type TDefinitionsOf<Entity extends IEntityWithRelations> = NonNullable<Entity['relationDefinitions']>;
```

Source: `packages/kernel/src/base/repositories/common/scope-through.ts`

## `TOrigin`

*type*

Allowed origin for CORS: one origin, a list of origins, or a function that returns the origin to echo (or nothing to reject). A string or a list entry may be a subdomain wildcard such as `https://*.example.com`, or a pattern with `:*` for any port such as `http://localhost:*` or `https://*.example.com:*`: the scheme is matched exactly, so is the port unless it is `*`, the apex domain is not included by a subdomain wildcard, and the bare `'*'` still means any origin.

```ts
export type TOrigin = string | string[] | ((origin: string, c: Context) => Promise<string | undefined | null> | string | undefined | null);
```

Source: `packages/kernel/src/base/applications/common/types/middlewares.ts`

## `TPlannedGrantRow`

*type*

Per-operation rows carry `targetId` = the operation's code, not a database id; the consumer resolves codes to ids when persisting.

```ts
export type TPlannedGrantRow = ReturnType<typeof AuthorizationPolicyBuilder.grant> & {
    metadata?: {
        ops: string[];
    };
};
```

Source: `packages/kernel/src/base/auth/authorize/common/types/grant.ts`

## `TPolicyDomainInput`

*type*

A grant/assignment domain: a scope literal (`SYSTEM_WIDE`/`ANY_MEMBER`) or a typed domain entity.

```ts
export type TPolicyDomainInput = string | {
    type: string;
    id: IdType;
};
```

Source: `packages/kernel/src/base/auth/authorize/builders/policy.builder.ts`

## `TQueryOperatorHandlers`

*type*

Operator-name to SQL-handler table a relational dialect translates with, so a second SQL engine
swaps the whole table without touching the walk that reaches it. `column` is wider than
`IQueryHandlerOptions` names it: the JSON-path branch hands handlers a raw `#>>` extraction
expression, not a `Column`.

```ts
export type TQueryOperatorHandlers = Record<string, (opts: {
    column: AnyType;
    value: AnyType;
}) => SQL | undefined>;
```

Source: `packages/kernel/src/base/repositories/common/types/query.ts`

## `trackableHeaders`

*const*

The zod-backed request schemas, kept apart from `constants.ts` ON PURPOSE. `z.object()` runs at
module load, so any bundle reaching this file carries the whole of zod. While these lived beside
`ControllerTransports`, which the container's controller mixin imports, importing `Container`
alone cost 437 KB - 423 KB of it zod - for a four-line const class.

```ts
export declare const trackableHeaders: z.ZodObject<{
    "x-request-id": z.ZodOptional<z.ZodString>;
    "x-request-channel": z.ZodOptional<z.ZodString>;
    "x-device-info": z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
```

Source: `packages/kernel/src/base/controllers/common/schemas.ts`

## `TRegistryDescriptor`

*type*

A registered item: its class and the container that resolves it.

```ts
export type TRegistryDescriptor<TItem> = {
    container: Container;
    targetClass: TClass<TItem>;
};
```

Source: `packages/kernel/src/base/auth/base/abstract-auth-registry.ts`

## `TRelationBuilder`

*type*

Engine-neutral: the registry is shared across connectors, so each connector narrows at its own call site.

```ts
export type TRelationBuilder = (opts: {
    source: unknown;
    relations: unknown;
}) => {
    relations?: unknown;
} | undefined;
```

Source: `packages/kernel/src/helpers/inversion/common/relation-builder.ts`

## `TRelationType`

*type*

Valid relation type values.

```ts
export type TRelationType = TConstValue<typeof RelationTypes>;
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `TRepositoryErrorCode`

*type*

Valid repository error code values.

```ts
export type TRepositoryErrorCode = TConstValue<typeof RepositoryErrorCodes>;
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `TRepositoryLogOptions`

*type*

Configuration for repository operation logging.

```ts
export type TRepositoryLogOptions = {
    use: boolean;
    level?: TLogLevel;
};
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `TRepositoryMetadata`

*type*

What `@repository` accepts, discriminated on `type`.

```ts
export type TRepositoryMetadata<Model extends AbstractEntity = AbstractEntity, DataSource extends IDataSource = IDataSource> = IRepositoryMetadata<Model, DataSource> | IRemoteRepositoryMetadata<DataSource>;
```

Source: `packages/kernel/src/helpers/inversion/common/types/persistence.ts`

## `TRepositoryOperationScope`

*type*

Valid repository operation scope values.

```ts
export type TRepositoryOperationScope = TConstValue<typeof RepositoryOperationScopes>;
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `TRequestContextResolver`

*type*

Reads the host's ambient request context, synchronously. `undefined` means THERE IS NO REQUEST
CONTEXT - a distinct state from a context that carries no user, and callers act on the difference.

```ts
export type TRequestContextResolver = () => Context | undefined;
```

Source: `packages/kernel/src/base/request-context/common/types.ts`

## `TRequestFilterKeyKind`

*type*

Which part of a filter a key came from: the refusal reads like the query's own refusal of an unknown column of that part.

```ts
export type TRequestFilterKeyKind = 'where' | 'order';
```

Source: `packages/kernel/src/base/repositories/common/request-filter-guard.ts`

## `TResponseBodyOf`

*type*

The JSON response body type of a route config `R`: the union of the schemas under `application/json` across all its response codes.

```ts
export type TResponseBodyOf<R extends {
    responses: AnyType;
}> = TInferDistributive<R['responses'][keyof R['responses']]['content']['application/json']['schema']>;

type TInferDistributive<S> = S extends z.ZodType ? z.infer<S> : never;
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `TResponseExtra`

*type*

A figure a list route offers beside its rows:
- a function runs when the client names it;
- `{ isDefault: true, compute }` always runs, unless the client switches it off with `-name`;
- `{ keys, compute }` is a group - the client names the keys it wants (`facets(status,tag)`), and
  `compute` receives exactly those, so one aggregate pass serves them all.

```ts
export type TResponseExtra = (() => ValueOrPromise<unknown>) | {
    isDefault: boolean;
    compute: () => ValueOrPromise<unknown>;
    keys?: never;
} | {
    keys: ReadonlyArray<string>;
    compute: (opts: {
        keys: Array<string>;
    }) => ValueOrPromise<unknown>;
    isDefault?: never;
};
```

Source: `packages/kernel/src/base/controllers/rest/extras.ts`

## `TResponseFormat`

*type*

Union of the `ResponseFormats` values.

```ts
export type TResponseFormat = TConstValue<typeof ResponseFormats>;
```

Source: `packages/kernel/src/base/controllers/common/constants.ts`

## `TResponseHeaderObject`

*type*

OpenAPI response header object

```ts
export type TResponseHeaderObject = {
    description?: string;
    schema: {
        type: 'string';
        examples?: string[];
    };
};
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `TResponseHeaders`

*type*

OpenAPI response headers format

```ts
export type TResponseHeaders = Record<string, TResponseHeaderObject>;
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `TRouteAuthConfig`

*type*

Per-route auth config. Endpoint config takes precedence over controller-level config.

```ts
export type TRouteAuthConfig = {
    authenticate?: TRouteAuthenticateConfig;
    authorize?: TRouteAuthorizeConfig;
};
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `TRouteAuthenticateConfig`

*type*

Per-route authentication config: { skip: true } or { strategies, mode }.

```ts
export type TRouteAuthenticateConfig = {
    skip: true;
} | {
    skip?: false;
    strategies?: TAuthStrategy[];
    mode?: TAuthMode;
};
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `TRouteAuthorizeConfig`

*type*

Per-route authorization config: { skip: true }, single spec, or array of specs.

```ts
export type TRouteAuthorizeConfig = {
    skip: true;
} | IAuthorizationSpec | IAuthorizationSpec[];
```

Source: `packages/kernel/src/base/controllers/common/types/route.ts`

## `TRouteContext`

*type*

A `TContext` whose `req.valid()` targets are the keys of `IValidRequestProps` (`json`, `query`, `param`, `header`, `cookie`, `form`).

```ts
export type TRouteContext<RouteEnv extends Env = Env, ResponseBody = unknown> = TContext<RouteEnv, keyof IValidRequestProps, ResponseBody>;
```

Source: `packages/kernel/src/base/controllers/common/types/context.ts`

## `TRouteHandler`

*type*

Lightweight handler type using TTypedContext to avoid heavy RouteHandler inference.

```ts
export type TRouteHandler<ResponseType = unknown, RouteEnv extends Env = Env> = (context: TRouteContext<RouteEnv, ResponseType>) => ValueOrPromise<Response | TypedResponse<ResponseType>>;
```

Source: `packages/kernel/src/base/controllers/common/types/context.ts`

## `TRoutePathScope`

*type*

Valid route path scope values.

```ts
export type TRoutePathScope = TConstValue<typeof RoutePathScopes>;
```

Source: `packages/kernel/src/base/controllers/common/constants.ts`

## `TScopeFilterMissingBehavior`

*type*

Valid scope-filter missing-behavior values.

```ts
export type TScopeFilterMissingBehavior = TConstValue<typeof ScopeFilterMissingBehaviors>;
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `TScopeOperation`

*type*

The four concrete operations: what `access.resolve` receives. Never WRITE or ALL.

```ts
export type TScopeOperation = typeof ScopeOperations.READ | typeof ScopeOperations.CREATE | typeof ScopeOperations.UPDATE | typeof ScopeOperations.DELETE;

/**
 * What a repository call does to rows, as the row scope (`@model` settings.access) sees it.
 * `access.resolve` receives one CONCRETE operation (READ, CREATE, UPDATE or DELETE), never a group,
 * so one function can answer a wide scope for a read and a narrow one for a write. WRITE and ALL
 * are groups of concrete operations, for application code that asks "is this a write?".
 */
export declare class ScopeOperations {
    static readonly READ = "read";
    static readonly CREATE = "create";
    static readonly UPDATE = "update";
    static readonly DELETE = "delete";
    /** CREATE, UPDATE and DELETE. */
    static readonly WRITE = "write";
    /** Every concrete operation. */
    static readonly ALL = "all";
    /** All six values: the four concrete operations and the two groups. */
    static readonly SCHEME_SET: Set<string>;
    /** The concrete operations: what `access.resolve` can receive. */
    static readonly OPERATION_SET: Set<string>;
    /** Which concrete operations each group holds. */
    static readonly GROUP_MAP: ReadonlyMap<string, ReadonlySet<string>>;
    static isValid(value: string): boolean;
    /**
     * Whether `operation` belongs to `group`. A concrete operation includes itself and nothing else;
     * WRITE includes CREATE, UPDATE and DELETE; ALL includes all four.
     */
    static includes(opts: {
        group: TScopeOperationGroup;
        operation: TScopeOperation;
    }): boolean;
}
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `TScopeOperationGroup`

*type*

All six values: a concrete operation or a group. What `ScopeOperations.includes` takes as its group.

```ts
export type TScopeOperationGroup = TConstValue<typeof ScopeOperations>;
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `TScopeWriteGuard`

*type*

Valid scope write-guard values.

```ts
export type TScopeWriteGuard = TConstValue<typeof ScopeWriteGuards>;
```

Source: `packages/kernel/src/base/repositories/common/constants.ts`

## `TSearchErrorCode`

*type*

Valid `SearchErrorCodes` values.

```ts
export type TSearchErrorCode = TConstValue<typeof SearchErrorCodes>;
```

Source: `packages/kernel/src/common/error-codes.ts`

## `TSecFetchSite`

*type*

One value of the `Sec-Fetch-Site` header, taken from `SecFetchSiteValues`.

```ts
export type TSecFetchSite = (typeof SecFetchSiteValues)[number];
```

Source: `packages/kernel/src/base/applications/common/types/middlewares.ts`

## `TServiceCallerEntry`

*type*

One entry in the caller allowlist: the JWKS url, or that url plus settings for this caller alone.

```ts
export type TServiceCallerEntry = string | {
    jwksUrl: string;
    /** Widens the accepted age for THIS caller only. Falls back to the service-wide setting. */
    acceptMaxAgeSeconds?: number;
};
```

Source: `packages/kernel/src/base/auth/authenticate/common/types/service.ts`

## `TSignInRequest`

*type*

Parsed body of `SignInRequestSchema`.

```ts
export type TSignInRequest = z.infer<typeof SignInRequestSchema>;
```

Source: `packages/kernel/src/base/auth/models/requests/sign-in.schema.ts`

## `TSignUpRequest`

*type*

Parsed body of `SignUpRequestSchema`.

```ts
export type TSignUpRequest = z.infer<typeof SignUpRequestSchema>;
```

Source: `packages/kernel/src/base/auth/models/requests/sign-up.schema.ts`

## `TSubsetGrantMetadata`

*type*

What IGNIS itself stores in `PolicyDefinition.metadata`: the operations of a subset grant, read
back by `ScopedCasbinAdapter` through `parseCustomGrantMetadata`. An application whose own
metadata has a different shape points the adapter at a different column
(`entities.policyDefinition.metadata.columnName`) rather than widening this one.

Declared here, beside the only writer, so the column type and the row type cannot drift.

```ts
export type TSubsetGrantMetadata = {
    ops: string[];
};
```

Source: `packages/kernel/src/base/auth/authorize/builders/policy.builder.ts`

## `TUpdateData`

*type*

Update data supporting both regular fields and JSON path updates via dot notation.

```ts
export type TUpdateData<T = any> = Partial<T> & {
    [jsonPath: string]: any;
};
```

Source: `packages/kernel/src/base/repositories/common/types/options.ts`

## `unary`

*const*

Unary RPC decorator. Equivalent to @rpc but automatically sets method to 'unary'.

```ts
export declare const unary: <RpcRouteConfigType extends Omit<IRpcMetadata, "method">>(opts: {
    configs: RpcRouteConfigType;
}) => (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rpc.ts`

## `UserStatuses`

*class*

User statuses.

```ts
export declare class UserStatuses extends CommonStatuses {
}
```

Source: `packages/kernel/src/common/statuses/user.ts`

## `UserTypes`

*class*

User types within the application.

```ts
export declare class UserTypes {
    static readonly SYSTEM = "SYSTEM";
    static readonly LINKED = "LINKED";
    static readonly SCHEME_SET: Set<string>;
    static isValid(orgType: string): boolean;
}
```

Source: `packages/kernel/src/common/statuses/user.ts`

## `WhereQuerySchema`

*const*

The query shape of a route that accepts conditions and nothing else - `count` and anything shaped
like it. `where` is OPTIONAL here.

`updateBy` and `deleteBy` deliberately do not use this. Their `where` is optional in the query
because it may ride in the body instead; the handler refuses a request that carries it in neither
place - a missing one there rewrites or deletes every row in the table.

```ts
export declare const WhereQuerySchema: z.ZodObject<{
    where: z.ZodOptional<z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>>;
}, z.core.$strip>;
```

Source: `packages/kernel/src/base/repositories/query-schemas/index.ts`

## `WhereSchema`

*const*

Query conditions, with nested AND/OR.

```ts
export declare const WhereSchema: z.ZodUnion<readonly [z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>, z.ZodPipe<z.ZodPipe<z.ZodString, z.ZodTransform<any, string>>, z.ZodPipe<z.ZodPipe<z.ZodAny, z.ZodTransform<any, any>>, z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>>>]>;
```

Source: `packages/kernel/src/base/repositories/query-schemas/index.ts`

## Re-exported

- `AbstractDataSource` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `AbstractEntity` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `AbstractRepository` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `ArtifactGroup` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `ArtifactNamespaces` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `ArtifactTypes` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `Binding` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `BindingKeys` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `BindingNamespaces` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `BindingScopes` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `BindingValueTypes` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `component` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `configuration` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `CoreErrorCodes` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `DataRangeUtility` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `datasource` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `DEFAULT_LIMIT` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `DEFAULT_MAX_LIMIT` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `FilterKeys` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `IArtifactGroup` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `IArtifactIndex` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `IArtifactMetadata` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `IArtifactRegistrationOptions` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `IBindingTag` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `ICreatableRepository` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `ICrudRepository` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `IDataSource` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `IDeletableRepository` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `inject` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `injectable` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `InjectableUtility` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `IPersistableRepository` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `IProvider` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `IReadableRepository` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `IRepository` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `isClass` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `isClassProvider` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `IUpdatableRepository` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `MetadataRegistry` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `model` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `NotSupportedUtility` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `provide` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `QueryOperators` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `repository` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `RepositoryOperationScopes` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `RepositoryTypes` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `ResolverUtility` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `SchemaTypes` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `SearchErrorCodes` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `service` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `Sorts` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TBindingKey` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TBindingNamespace` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `TBindingScope` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TBindingValueType` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TByIdFilter` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TCount` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `TDataRange` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `TDataWithRange` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `TFields` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TFilter` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TIdSchemaType` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `TInclusion` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TInjectTarget` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TIsoTimestamp` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TJsonColumnKey` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TJsonPathKey` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TOrderEntry` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TParsedOrderEntry` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TRepositoryType` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `TRow` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TSchemaType` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `TSelectedRow` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TSortDirection` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TSqlFragment` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TWhere` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TWhereOperators` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TWhereValue` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
