---
title: "@venizia/ignis-kernel (6 of 9)"
description: "Every export of @venizia/ignis-kernel, from the built declarations (generated)."
---

# `@venizia/ignis-kernel (6 of 9)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 6 of 9 of [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel).

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
}) => (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
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
export declare class RelationTypes extends ConstClass {
    static readonly ONE = "one";
    static readonly MANY = "many";
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
     * judged by the model it reads (`judge.relation` answers it). The parts are read in the order the query reads them, and a
     * filter that the query refuses for another reason before it meets the hidden field gets that refusal instead, so the answer
     * is the one the same filter gets with a missing name in place of the hidden one. A filter that names no hidden field is
     * left to the query.
     */
    static assertFilter(opts: {
        filter?: IRequestFilterShape;
        judge: IRequestFilterJudge;
        tableName: string;
    }): void;
    /** Throws for a hidden key: the refusal met before it, or the hidden key's own. Otherwise keeps the query's refusal of the piece when it is the first. */
    private static visitKey;
    private static walkFilter;
    private static walkWhere;
    private static walkOrder;
    private static walkInclude;
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
export declare class ResponseFormats extends ConstClass {
    static readonly OBJECT = "object";
    static readonly ARRAY = "array";
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
        key: TBindingKey;
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
    /** Untyped on purpose: `IRestComponentConfig` has no fields, so a type would check nothing. */
    static readonly REST_COMPONENT_OPTIONS: import("@venizia/ignis-inversion").TBindingKey<unknown>;
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
    static readonly RESTORE = "/restore";
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
