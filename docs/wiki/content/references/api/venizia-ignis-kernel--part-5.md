---
title: "@venizia/ignis-kernel (5 of 9)"
description: "Every export of @venizia/ignis-kernel, from the built declarations (generated)."
---

# `@venizia/ignis-kernel (5 of 9)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 5 of 9 of [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel).

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
    [extra: string | symbol]: unknown;
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

## `IModelProperties`

*interface*

Property groups of `@model` settings.

```ts
export interface IModelProperties {
    /** Properties excluded from all query results at SQL level. */
    hidden?: string[];
    /**
     * Properties the server fills on every write, which a generated create or update body leaves out.
     *
     * @default AuditFields.values()
     */
    stamped?: ReadonlyArray<string> | ReadonlySet<string>;
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
    /** Another model class was registered under the same table name; the registry holds only the last one. */
    isShared?: true;
    /** `isShared`, and at least one of the model classes on the table declares an `access`. */
    sharesAccess?: true;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/model.ts`

## `IModelSettings`

*interface*

Per-model settings passed to `@model` as `settings`.

```ts
export interface IModelSettings {
    properties?: IModelProperties;
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
    scope: z.ZodOptional<z.ZodLazy<z.ZodType<import("@venizia/ignis-filter").TFilter | undefined, unknown, z.core.$ZodTypeInternals<import("@venizia/ignis-filter").TFilter | undefined, unknown>>>>;
}, z.core.$strip>>>;
```

Source: `packages/kernel/src/base/repositories/query-schemas/index.ts`

## `Injection`

*class*

Dependencies of a factory's callbacks. A factory takes `inject: { products: ProductRepository }`, records each class
as a constructor parameter of the controller it generates, and hands the resolved instances to every callback as
`injected`. The container resolves them once, when it builds the controller at boot, so a class that is not
registered fails the boot and not a request. A callback never looks anything up in the container.

```ts
export declare class Injection {
    /**
     * Records each declared class as constructor parameter `offset + n` of `target`: the metadata `@inject({ target })`
     * writes, and the metadata `CrudControllerFactory.registerRepositoryInjection` writes for parameter 0. Recorded as
     * metadata rather than a parameter decorator, which Bun drops in some configurations.
     */
    static register(opts: {
        target: TClass<unknown>;
        inject: TInjectMap;
        offset: number;
    }): void;
    /** The one trust boundary: the container hands instances positionally and untyped; this checks that every name got one. */
    private static isComplete;
    /**
     * Zips the declared names with the instances the container passed to the constructor, in declaration order. A subclass
     * with a constructor of its own must pass every argument on to `super`; one that does not is refused here, at boot.
     */
    static collect<Inject extends TInjectMap>(opts: {
        scope: string;
        /** `undefined` when the options declare none: nothing is collected. */
        inject: Inject | undefined;
        instances: unknown[];
    }): TInjected<Inject>;
}
```

Source: `packages/kernel/src/base/controllers/factory/injection.ts`

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
    key: TBindingKey;
    /** @default BindingScopes.SINGLETON */
    scope?: TBindingScope;
}
```

Source: `packages/kernel/src/helpers/inversion/common/types/artifact.ts`

## `IQueryHandlerOptions`

*interface*

Options passed to query operator handler functions. `column` is a `Column` or, on the JSON-path branch, a raw `#>>` extraction expression: both are `SQLWrapper`.

```ts
export interface IQueryHandlerOptions<T = unknown> {
    column: SQLWrapper;
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

## `IRestorableRepository`

*interface*

Interface for a repository that can undo a soft delete.

```ts
export interface IRestorableRepository<TDataObject extends object = object, ExtraOptions extends IExtraOptions = IExtraOptions> extends IRepository {
    restoreById<R = TDataObject>(opts: {
        id: IdType;
        options?: ExtraOptions & {
            shouldReturn?: boolean;
        };
    }): Promise<TCount & {
        data: TNullable<R>;
    }>;
    restoreBy<R = TDataObject>(opts: {
        where: TWhere<TDataObject>;
        options?: ExtraOptions & {
            shouldReturn?: boolean;
            force?: boolean;
        };
    }): Promise<TCount & {
        data: TNullable<Array<R>>;
    }>;
}
```

Source: `packages/kernel/src/base/repositories/common/types/contracts.ts`

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

True for `DataSourceRoot` itself and for any class extending it (`AbstractDataSource` among them), across package copies.

```ts
export declare const isDataSourceClass: (value: unknown) => value is TClass<unknown>;
```

Source: `packages/kernel/src/base/datasources/root.ts`

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
        /** Exact origins (`http://identity-service`, `http://10.0.0.5:8080`) that may serve a caller's key set over `http:`. Unset means `https:` or loopback only. */
        trusted?: TTrustedOrigin[];
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
export declare class JOSEStandards extends ConstClass {
    static readonly JWS = "JWS";
    static readonly JWKS = "JWKS";
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `JWKSAlgorithms`

*class*

The signing algorithms a JWKS issuer supports.

```ts
export declare class JWKSAlgorithms extends ConstClass {
    static readonly ES256 = "ES256";
    static readonly RS256 = "RS256";
    static readonly EDDSA = "EdDSA";
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `JWKSKeyDrivers`

*class*

Where JWKS key material comes from: inline `text` content or a `file` path.

```ts
export declare class JWKSKeyDrivers extends ConstClass {
    static readonly TEXT = "text";
    static readonly FILE = "file";
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `JWKSKeyFormats`

*class*

Encoding of JWKS key material: `pem` or `jwk`.

```ts
export declare class JWKSKeyFormats extends ConstClass {
    static readonly PEM = "pem";
    static readonly JWK = "jwk";
}
```

Source: `packages/kernel/src/base/auth/authenticate/common/constants/jose.ts`

## `JWKSModes`

*class*

The role a JWKS setup plays: `issuer` signs tokens, `verifier` checks them against a remote key set.

```ts
export declare class JWKSModes extends ConstClass {
    static readonly ISSUER = "issuer";
    static readonly VERIFIER = "verifier";
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
export declare class LockStrengths extends ConstClass {
    static readonly UPDATE = "update";
    static readonly NO_KEY_UPDATE = "no key update";
    static readonly SHARE = "share";
    static readonly KEY_SHARE = "key share";
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
export declare class ModelTypes extends ConstClass {
    static readonly ENTITY = "entity";
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
    }): z.ZodPipe<z.ZodPipe<z.ZodObject<{ -readonly [P in keyof T]: T[P]; }, z.core.$strip>, z.ZodTransform<Record<string, unknown>, z.core.$InferObjectOutput<{ -readonly [P in keyof T]: T[P]; }, {}>>>, z.ZodObject<TCamelCaseKeys<T> extends infer T_1 ? { -readonly [P_1 in keyof T_1]: T_1[P_1]; } : never, z.core.$strip>>;
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
            "application/json": {
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
    };
    static jsonResponse<ContentSchema extends z.ZodType, HeaderSchema extends TResponseHeaders | undefined = undefined>(opts: TJsonResponseOpts<ContentSchema, HeaderSchema>): {
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
                "application/json": {
                    schema: ContentSchema;
                };
            };
            required: boolean | undefined;
        } | {
            headers: NonNullable<HeaderSchema>;
            description: string;
            content: {
                "application/json": {
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
}) => (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rest.ts`

## `PersistableCrudController`

*class*

Write tier: create / updateById / updateBy / deleteById / deleteBy, and the restore verbs for a repository that has them. Inherits the read verbs.

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
    /** POST /:id/restore */
    restoreById(opts: {
        context: TRouteContext<RouteEnv>;
    }): Promise<import("../../index.js").TJsonResponse<unknown, 200>>;
    /** POST /restore */
    restoreBy(opts: {
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
}) => (target: object, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => void;
```

Source: `packages/kernel/src/base/metadata/routes/rest.ts`
