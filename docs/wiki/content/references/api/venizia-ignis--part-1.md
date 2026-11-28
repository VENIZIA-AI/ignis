---
title: "@venizia/ignis (1 of 3)"
description: "Every export of @venizia/ignis, from the built declarations (generated)."
---

# `@venizia/ignis (1 of 3)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 1 of 3 of [`@venizia/ignis`](/references/api/venizia-ignis).

## `AbstractBearerTokenService`

*class*

Abstract base for Bearer-token services (JWS, JWKS) with optional AES payload encryption.

```ts
export declare abstract class AbstractBearerTokenService<E extends Env = Env> extends BaseService {
    /** Standard JWT fields that are never encrypted. */
    static readonly JWT_COMMON_FIELDS: Set<keyof JWTPayload>;
    protected aes: AES | null;
    protected applicationSecret: string | null;
    protected fieldCodecs: Map<string, IPayloadFieldCodec>;
    /** Configured `iss` / `aud`: stamped on every issued token, authoritative over anything the payload carries, and required on every verified one. */
    protected claimOptions: IJWTClaimsOptions | null;
    /** What jose verifies against: the claims, the algorithm pin and the `verify` checks. */
    protected verifyOptions: JWTVerifyOptions | null;
    /** The keys a `claims` object may hold. */
    static readonly CLAIM_KEYS: ReadonlyArray<string>;
    /**
     * Validates the claims configuration of a token service and answers what the service uses. It throws, naming the
     * key, when `claims.issuer` is missing or empty, when `claims.audience` is present but not a non-empty string or a
     * non-empty list of them, when `claims` holds another key, when the removed `sign` or `verify.issuer` /
     * `verify.audience` is still passed, and when no algorithm is pinned. `claims.audience` is optional: without it
     * no `aud` is stamped and none is checked.
     * `pinnedAlgorithms` is what the service signs with; a verifier has none and requires `verify.algorithms`.
     * The component calls it at boot, and a service calls it when it is built, so neither can start without them.
     */
    static resolveClaimsConfig(opts: {
        scope: string;
        options: IClaimsConfigSource;
        pinnedAlgorithms?: string[];
    }): IResolvedClaimsConfig;
    /** Validates the claims configuration (see {@link AbstractBearerTokenService.resolveClaimsConfig}) and keeps the result. */
    protected configureClaims(opts: {
        options: IClaimsConfigSource;
        pinnedAlgorithms?: string[];
    }): void;
    /** Configures AES payload encryption and field codecs. Both aesAlgorithm and applicationSecret required to activate encryption. */
    protected configurePayloadEncryption(opts: {
        aesAlgorithm?: AESAlgorithmType;
        applicationSecret?: string;
        fieldCodecs?: IPayloadFieldCodec[];
    }): void;
    extractCredentials(context: TContext<E, string>): {
        type: string;
        token: string;
    };
    verify(opts: {
        type: string;
        token: string;
    }): Promise<IJWTTokenPayload>;
    /**
     * A service assertion (`typ: svc+jwt`) is not a user token. When a JWKS issuer shares the key of the service
     * assertions and the names collide, an assertion would otherwise verify here, so the user-token path refuses it.
     */
    protected assertNotServiceAssertion(opts: {
        token: string;
    }): Promise<void>;
    generate(opts: {
        payload: IJWTTokenPayload;
        getTokenExpiresFn?: TGetTokenExpiresFn;
        /** Per-token registered claims. The supported way to vary `aud` / `sub`; the payload is not. */
        claims?: IJWTIssueClaims;
    }): Promise<string>;
    /** A `null` is written as `null` whatever the field's codec is: a codec converts a value, and `null` is none. */
    protected serializeField(opts: {
        key: string;
        value: unknown;
    }): string;
    /**
     * With `applicationSecret` set, AES-encrypts the key and the value of every claim outside `JWT_COMMON_FIELDS`;
     * without it, returns the payload as is. A `null` claim is encrypted like any other value and decodes as `null`,
     * so the token decodes to the same payload with encryption on or off and `null` stays distinct from absent. An
     * `undefined` claim is skipped, as JSON drops it.
     */
    encryptPayload(payload: IJWTTokenPayload): Promise<Record<string, unknown>>;
    /** The text `null` reads as `null` before any codec sees it, the other half of {@link serializeField}. */
    protected deserializeField(opts: {
        key: string;
        value: string;
    }): any;
    /**
     * Stamps the configured `iss` / `aud` onto a signer, plus any per-token claims the caller passed.
     *
     * The configured value is AUTHORITATIVE. `iss` and `aud` are in `JWT_COMMON_FIELDS`, so they ride
     * through the AES envelope in the clear and an application-shaped payload can carry them - an
     * issuer identity any payload could overwrite would not be an identity. A conflicting payload
     * claim is overwritten and reported.
     *
     * Per-token audience is an explicit argument rather than a smuggled payload key, so the caller
     * that legitimately needs one says so.
     */
    protected applySignClaims(opts: {
        signer: SignJWT;
        payload: Record<string, unknown>;
        claims?: IJWTIssueClaims;
    }): SignJWT;
    decryptPayload(opts: {
        result: JWTVerifyResult<IJWTTokenPayload>;
    }): Promise<IJWTTokenPayload>;
    /** A decrypted claim set is a payload only if it names its user. */
    private static isTokenPayload;
    protected abstract doVerify(token: string): Promise<IJWTTokenPayload>;
    abstract getSigner(opts: {
        payload: IJWTTokenPayload;
        getTokenExpiresFn: TGetTokenExpiresFn;
        claims?: IJWTIssueClaims;
    }): Promise<SignJWT>;
    protected abstract getSigningKey(): ValueOrPromise<Uint8Array | CryptoKey>;
    protected abstract getDefaultTokenExpiresFn(): TGetTokenExpiresFn;
}
```

Source: `packages/core-server/src/components/auth/authenticate/services/bearer/abstract.service.ts`

## `AbstractGrpcController`

*class*

Abstract base class for gRPC controllers, providing RPC registration and ConnectRPC integration.

```ts
export declare abstract class AbstractGrpcController<RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ServiceType = Parameters<ConnectRouter['service']>[0], ConfigurableOptions extends object = {}> extends BaseHelper implements IGrpcController<RouteEnv, RouteSchema, BasePath, ServiceType, ConfigurableOptions> {
    isConfigured: boolean;
    definitions: Record<string, IRpcRegistration<RouteEnv>>;
    /** ConnectRPC service definition from @controller metadata. */
    service: ServiceType;
    path: string;
    /** Assigned by GrpcComponent from its options, before configure(). Absent means the adapter resolves the peer itself. */
    connectRpcModule?: IConnectRpcModule;
    /** ConnectRPC interceptors, assigned by GrpcComponent from its options before configure(). Applied to every RPC this controller registers. */
    interceptors?: unknown[];
    /** Size limits, assigned by GrpcComponent from its options before configure(). */
    limits?: IGrpcLimits;
    router: Hono<RouteEnv, RouteSchema, BasePath>;
    constructor(opts: IGrpcControllerOptions);
    /** Returns the per-controller sub-router. */
    getRouter(): Hono<RouteEnv, RouteSchema, BasePath>;
    /** Builds pre-built auth middleware from RPC config (symmetric with REST's buildRouteMiddlewares). */
    buildRpcMiddlewares(opts: {
        configs: IRpcMetadata;
    }): TRpcMiddleware<RouteEnv>[];
    /** Processes RPC config (symmetric with REST's getRouteConfigs). Returns configs as-is. */
    getRouteConfigs(opts: {
        configs: IRpcMetadata;
    }): IRpcMetadata;
    /** Registers RPC methods defined via @rpc/@unary/@serverStream/etc. decorators from the metadata registry. */
    registerRpcsFromRegistry(): void;
    /** Configures the controller by binding all RPCs, registering decorator-based RPCs, and mounting the adapter. Idempotent. */
    configure(opts?: ConfigurableOptions): Promise<void>;
    /** Override to register RPCs using bindRoute or defineRoute. */
    abstract binding(): ValueOrPromise<void>;
    /** Creates a fluent binding for registering an RPC (call .to() to attach handler). */
    abstract bindRoute(opts: {
        configs: IRpcMetadata;
    }): IGrpcBindRouteOptions<RouteEnv>;
    /** Defines and registers an RPC with its handler in a single call. */
    abstract defineRoute(opts: {
        configs: IRpcMetadata;
        handler: TRpcHandler<unknown, unknown, RouteEnv>;
    }): IGrpcDefineRouteOptions;
}
```

Source: `packages/core-server/src/base/controllers/grpc/abstract.ts`

## `AbstractJWKSTokenService`

*class*

Base for JWKS token services (Issuer + Verifier): lazy init where a rejected `initialize()` resets `initPromise`, so the next call retries instead of caching the failure.

```ts
export declare abstract class AbstractJWKSTokenService<E extends Env = Env> extends AbstractBearerTokenService<E> {
    protected initialized: boolean;
    protected initPromise: Promise<void> | null;
    protected ensureInitialized(): Promise<void>;
    protected abstract initialize(): Promise<void>;
}
```

Source: `packages/core-server/src/components/auth/authenticate/services/bearer/jwks/abstract.service.ts`

## `ApiReferenceBindingKeys`

*class*

Container keys of the API reference component.

```ts
export declare class ApiReferenceBindingKeys {
    static readonly API_REFERENCE_OPTIONS: import("@venizia/ignis-inversion").TBindingKey<IApiReferenceOptions>;
}
```

Source: `packages/core-server/src/components/api-reference/common/keys.ts`

## `ApiReferenceComponent`

*class*

Serves the OpenAPI document and an interactive UI for it. Paths and UI type come from `IApiReferenceOptions` bound at `ApiReferenceBindingKeys.API_REFERENCE_OPTIONS`; `info` is always taken from the application info.

**Example**
```typescript
import { ApiReferenceComponent, BaseApplication } from '@venizia/ignis';

abstract class App extends BaseApplication {
  preConfigure(): void {
    this.component(ApiReferenceComponent);
  }
}
```

```ts
export declare class ApiReferenceComponent extends BaseComponent {
    private application;
    constructor(application: BaseApplication);
    binding(): Promise<void>;
}
```

Source: `packages/core-server/src/components/api-reference/component.ts`

## `AuthControllerFactory`

*class*

Builds the decorated REST controller of the authentication routes (sign-in, sign-up, change-password, who-am-i).

```ts
export declare class AuthControllerFactory {
    static build(opts: TDefineAuthControllerOpts): {
        new (authService: IAuthService): {
            service: IAuthService;
            binding(): ValueOrPromise<void>;
            measure<R>(opts: {
                scope: string;
                args: unknown;
                task: () => Promise<R>;
            }): Promise<R>;
            normalizeCountData<ResponseSchema, RequestContext extends import("@venizia/ignis-kernel").TRouteContext<import("hono").Env> = import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>, ResponseData extends {
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
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
            }): Array<import("@venizia/ignis-kernel").IRequestedExtra>;
            respond<R>(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
                format: import("@venizia/ignis-kernel").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-inversion").TNullable<R>;
                };
                range?: import("@venizia/ignis-kernel").TDataRange;
                extra?: never;
            }): import("@venizia/ignis-inversion").TNullable<R | {
                count: number;
                data?: import("@venizia/ignis-inversion").TNullable<R>;
            }>;
            respond<R, Extra extends Record<string, import("@venizia/ignis-kernel").TResponseExtra>>(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
                format: import("@venizia/ignis-kernel").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-inversion").TNullable<R>;
                };
                range?: import("@venizia/ignis-kernel").TDataRange;
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
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
                format: import("@venizia/ignis-kernel").TResponseFormat;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-inversion").TNullable<R>;
                };
                range?: import("@venizia/ignis-kernel").TDataRange;
                extra?: Record<string, import("@venizia/ignis-kernel").TResponseExtra>;
            }): ValueOrPromise<import("@venizia/ignis-inversion").TNullable<R | {
                count?: number;
                data?: import("@venizia/ignis-inversion").TNullable<R>;
                extra?: Record<string, unknown>;
            }>>;
            respondWithExtra<R>(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
                payload: {
                    count: number;
                    data?: import("@venizia/ignis-inversion").TNullable<R>;
                };
                extra: Record<string, import("@venizia/ignis-kernel").TResponseExtra>;
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
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
                count: number;
            } & ({
                range: import("@venizia/ignis-kernel").TDataRange;
            } | {
                offset: number;
                total: number;
            })): void;
            toHonoHandler<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig = import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                handler: (context: import("@venizia/ignis-kernel").TContextOf<RouteConfig, import("hono").Env>) => ValueOrPromise<Response | import("hono").TypedResponse<unknown>>;
            }): import("hono").Handler<import("hono").Env, string, import("hono").Input, (Response | Promise<Response>) | (import("@hono/zod-openapi").RouteConfigToTypedResponse<import("@hono/zod-openapi").RouteConfig> | Promise<import("@hono/zod-openapi").RouteConfigToTypedResponse<import("@hono/zod-openapi").RouteConfig>>)>;
            bindRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): import("@venizia/ignis-kernel").IBindRouteOptions<RouteConfig, import("hono").Env, {}, "/">;
            defineRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
                handler: (context: import("@venizia/ignis-kernel").TContextOf<RouteConfig, import("hono").Env>) => ValueOrPromise<Response | import("hono").TypedResponse<unknown>>;
                hook?: import("@hono/zod-openapi").Hook<any, import("hono").Env, string, any> | undefined;
            }): import("@venizia/ignis-kernel").IDefineRouteOptions<RouteConfig, import("hono").Env, {}, "/">;
            defineJSXRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
                handler: (context: import("@venizia/ignis-kernel").TContextOf<RouteConfig, import("hono").Env>) => ValueOrPromise<Response | import("hono").TypedResponse<unknown>>;
                hook?: import("@hono/zod-openapi").Hook<any, import("hono").Env, string, any> | undefined;
            }): import("@venizia/ignis-kernel").IDefineRouteOptions<RouteConfig, import("hono").Env, {}, "/">;
            isConfigured: boolean;
            router: import("@hono/zod-openapi").OpenAPIHono<import("hono").Env, {}, "/">;
            path: string;
            definitions: Record<string, import("@venizia/ignis-kernel").IAuthRouteConfig>;
            getRouter(): import("@hono/zod-openapi").OpenAPIHono<import("hono").Env, {}, "/">;
            registerRoutesFromRegistry(opts?: {
                paths?: import("@venizia/ignis-kernel").TRoutePathScope;
            }): void;
            configure(opts?: {} | undefined): Promise<import("@hono/zod-openapi").OpenAPIHono<import("hono").Env, {}, "/">>;
            buildRouteMiddlewares<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): {
                restConfig: Omit<RouteConfig, "authenticate" | "authorize">;
                security: {
                    [x: string]: never[];
                }[];
                mws: import("hono").MiddlewareHandler<import("hono").Env>[];
            };
            getRouteConfigs<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): RouteConfig & import("@hono/zod-openapi").RouteConfig & {
                getRoutingPath(): string;
            };
            getJSXRouteConfigs<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): RouteConfig & import("@hono/zod-openapi").RouteConfig & {
                getRoutingPath(): string;
            };
            bindDefaultRoutes(): ValueOrPromise<void>;
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

Source: `packages/core-server/src/components/auth/authenticate/controllers/factory.ts`

## `AuthenticateComponent`

*class*

Registers the authentication services and strategies from the options bound under `AuthenticateBindingKeys`. Throws at binding time unless JWT, basic or service options are provided.

```ts
export declare class AuthenticateComponent extends BaseComponent {
    private application;
    constructor(application: BaseApplication);
    binding(): ValueOrPromise<void>;
    /**
     * Loads `jose` at boot when a configured service signs or verifies with it, so a missing or broken
     * install fails the boot instead of answering every token check with a 401.
     */
    private preloadJose;
    private defineJWSAuth;
    private defineJWKSAuth;
    /**
     * Service-to-service authentication. Absent options mean no strategy is registered and no route is
     * mounted, so an application that never sets them is byte-identical to today.
     *
     * The certs route is mounted only when SIGNING keys are present. Most services are called and
     * never call; publishing a key set for a service that signs nothing advertises a capability it
     * does not have.
     */
    private defineServiceAuth;
    private defineBasicAuth;
    private defineControllers;
    defineOAuth2(): void;
}
```

Source: `packages/core-server/src/components/auth/authenticate/component.ts`

## `AuthModelColumns`

*class*

The Drizzle column sets of the auth tables, spread into a table the application declares (`...AuthModelColumns.buildUser()`).

```ts
export declare class AuthModelColumns {
    static buildUser(opts?: {
        idType: TIdSchemaType;
    }): {
        realm: import("drizzle-orm").HasDefault<PgTextBuilderInitial<"realm", [string, ...string[]]>>;
        status: import("drizzle-orm").HasDefault<import("drizzle-orm").NotNull<import("drizzle-orm").$Type<PgTextBuilderInitial<"status", [string, ...string[]]>, TConstValue<typeof UserStatuses>>>>;
        type: import("drizzle-orm").HasDefault<import("drizzle-orm").NotNull<import("drizzle-orm").$Type<PgTextBuilderInitial<"type", [string, ...string[]]>, TConstValue<typeof UserTypes>>>>;
        activatedAt: import("drizzle-orm/pg-core").PgCustomColumnBuilder<{
            name: string;
            dataType: "custom";
            columnType: "PgCustomColumn";
            data: string | import("@venizia/ignis-filter").TIsoTimestamp;
            driverParam: string;
            enumValues: undefined;
        }>;
        lastLoginAt: import("drizzle-orm/pg-core").PgCustomColumnBuilder<{
            name: string;
            dataType: "custom";
            columnType: "PgCustomColumn";
            data: string | import("@venizia/ignis-filter").TIsoTimestamp;
            driverParam: string;
            enumValues: undefined;
        }>;
        parentId: PgTextBuilderInitial<"parent_id", [string, ...string[]]> | PgIntegerBuilderInitial<"parent_id">;
    };
    static buildRole(): {
        identifier: import("drizzle-orm").NotNull<PgTextBuilderInitial<"identifier", [string, ...string[]]>>;
        name: import("drizzle-orm").NotNull<PgTextBuilderInitial<"name", [string, ...string[]]>>;
        description: PgTextBuilderInitial<"description", [string, ...string[]]>;
        priority: import("drizzle-orm").NotNull<PgIntegerBuilderInitial<"priority">>;
        status: import("drizzle-orm").HasDefault<import("drizzle-orm").NotNull<import("drizzle-orm").$Type<PgTextBuilderInitial<"status", [string, ...string[]]>, TConstValue<typeof RoleStatuses>>>>;
    };
    static buildPermission<Opts extends TPermissionOptions | undefined>(opts?: Opts): TPermissionColumnDef<Opts>;
    /**
     * `Metadata` is a type parameter, not an `opts` field: unlike `extraVariants` there is no runtime
     * value to infer from, so supplying it means spelling `Opts` too (no partial inference):
     * `AuthModelColumns.buildPolicyDefinition<{ idType: 'string' }, IMyMetadata>({ idType: 'string' })`.
     * Keep `ops` in a custom shape if the app also issues subset grants - `customGrant` writes it.
     */
    static buildPolicyDefinition<const Opts extends TPolicyDefinitionOptions<string> | undefined = undefined, Metadata extends object = TSubsetGrantMetadata>(opts?: Opts): TPolicyDefinitionColumnDef<Opts, Metadata>;
    /**
     * The three legal `(domain_type, domain_id)` pairs, as CHECK predicate TEXT for a migration - text,
     * not a Drizzle `SQL`, because a column ref in a `sql` template renders schema-qualified, which a
     * table-level CHECK rejects.
     *
     * The `IS NOT NULL` guard on the last branch looks redundant next to `NOT IN` and is not: a NULL
     * `domain_type` makes `NOT IN` evaluate to NULL, and a CHECK rejects only on FALSE - without it an id
     * with no type passes.
     */
    static buildPolicyDefinitionDomainShapeCheck(opts?: {
        domainTypeColumn?: string;
        domainIdColumn?: string;
    }): string;
}

type TPermissionColumnDef<Opts extends TPermissionOptions | undefined = undefined> = Opts extends {
    idType: infer IdType;
} ? IdType extends 'string' ? TPermissionCommonColumns & {
    parentId: PgTextBuilderInitial<string, [string, ...string[]]>;
} : TPermissionCommonColumns & {
    parentId: PgIntegerBuilderInitial<string>;
} : TPermissionCommonColumns & {
    parentId: PgIntegerBuilderInitial<string>;
};

type TPolicyDefinitionColumnDef<Opts extends TPolicyDefinitionOptions<string> | undefined = undefined, Metadata extends object = TSubsetGrantMetadata> = Opts extends {
    idType: 'string';
} ? TPolicyDefinitionCommonColumns<TExtraPolicyVariantOf<Opts>, Metadata> & {
    subjectId: ReturnType<typeof text>;
    targetId: ReturnType<typeof text>;
    domainId: ReturnType<typeof text>;
} : TPolicyDefinitionCommonColumns<TExtraPolicyVariantOf<Opts>, Metadata> & {
    subjectId: ReturnType<typeof integer>;
    targetId: ReturnType<typeof integer>;
    domainId: ReturnType<typeof integer>;
};

/** Extracts the app-declared extra variants from `Opts`, or `never` when none were declared. */
type TExtraPolicyVariantOf<Opts> = Opts extends {
    extraVariants?: ReadonlyArray<infer ExtraVariant extends string>;
} ? ExtraVariant : never;
```

Source: `packages/core-server/src/components/auth/models/entities/columns.ts`

## `AuthorizeComponent`

*class*

Registers authorization from the options bound under `AuthorizeBindingKeys.OPTIONS`. Throws at binding time when no options are bound.

```ts
export declare class AuthorizeComponent extends BaseComponent {
    private application;
    constructor(application: BaseApplication);
    binding(): ValueOrPromise<void>;
    private bindAlwaysAllowRoles;
}
```

Source: `packages/core-server/src/components/auth/authorize/component.ts`

## `BaseApplication`

*class*

The IGNIS server application: a `ServerApplication` that adds secrets hydration, env validation, start-up info and the gRPC controller branch. Extend it to build an application.

**Example**
```typescript
import { BaseApplication, type IApplicationInfo } from '@venizia/ignis';

class App extends BaseApplication {
  getAppInfo(): IApplicationInfo { return { name: 'app', version: '1.0.0', description: 'Demo' }; }
  staticConfigure(): void {}
  preConfigure(): void {}
  postConfigure(): void {}
  setupMiddlewares(): void {}
}
const app = new App({ scope: 'App', config: { host: '0.0.0.0', port: 3000, path: { base: '/api', isStrict: true } } });
app.init();
await app.start();
```

```ts
export declare abstract class BaseApplication extends ServerApplication implements IRestApplication {
    protected secretsProvider?: ISecretsHelper;
    protected secretsRegistration?: TSecretsRegistration;
    protected normalizePath(...segments: string[]): string;
    /** Adds the gRPC branch the kernel cannot own: `GrpcComponent` needs `AbstractGrpcController`, core-only code that reaches `node:module`. */
    registerControllers(): Promise<void>;
    registerSecrets(): ValueOrPromise<TSecretsRegistration>;
    hydrateSecrets(): Promise<void>;
    /** Applies each hydrate entry in declaration order; paths that resolve empty while declaring an expectation are collected in `emptyHydrations` rather than failing here. */
    protected hydrateSecretEntries(opts: {
        provider: ISecretsHelper;
        registration: TSecretsRegistration;
        emptyHydrations: string[];
        logger: ILogger;
    }): Promise<void>;
    protected mergeSecretsIntoEnv(opts: {
        bundle: Record<string, string>;
        entry: ISecretHydrateEntry;
    }): Record<string, string>;
    /** A hydrate entry declares an expectation only via explicit `keys` or a non-empty `prefix`; such an entry resolving to zero env values is a misconfiguration boot must not silently absorb. */
    protected hydrateEntryDeclaresExpectation(opts: {
        entry: ISecretHydrateEntry;
    }): boolean;
    wireSecretRotatables(): Promise<void>;
    static(opts: {
        restPath?: string;
        folderPath: string;
    }): this;
    /**
     * Every value is read HERE, not destructured at module load: an application that loads its
     * `.env` in its own entrypoint does so after this module is imported, and a module-load snapshot
     * would print the defaults for a host that configured everything correctly.
     */
    protected printStartUpInfo(opts: {
        scope: string;
    }): void;
    /** Swaps in the `ErrorPrettier`-backed formatter - `node:util`, so the kernel cannot build it. */
    protected buildErrorMiddleware(): AppErrorMiddleware;
    /** Adds what only a listening server has, on top of the kernel's three - which stay in `RestApplication` so a browser Worker answers with the same envelope. */
    protected registerDefaultMiddlewares(): Promise<void>;
    /** Lives here rather than on `AbstractApplication` - `AppEnvs` reads `process.env` at module load, so a kernel-pure ancestor cannot carry it; this is the layer that already depends on it. */
    protected validateEnvs(): void;
    /**
     * Version tripwire, body identical to `RestApplication.initialize()`: a stale kernel without
     * `getBootSequence()`/`runBootSequence()` throws here before any socket binds.
     */
    initialize(): Promise<void>;
    protected getBootSequence(): IBootSequenceStep[];
    /**
     * Refuses to start when a model's `settings.access` cannot take effect. Both failures are
     * silent at runtime and opposite: a search-backed model returns too many rows, a context-less one none.
     */
    protected validateScopeFilterSupport(): void;
}
```

Source: `packages/core-server/src/base/applications/base.ts`

## `BaseFilteredAdapter`

*class*

Read-only base for casbin FilteredAdapters backed by a datasource - owns connector plumbing and no-op write methods; subclasses implement {@link loadFilteredPolicy} per principal.

```ts
export declare abstract class BaseFilteredAdapter<TFilter = ICasbinPolicyFilter> extends BaseHelper implements FilteredAdapter {
    protected readonly dataSource: ICasbinPolicySource;
    constructor(opts: {
        scope: string;
        dataSource: ICasbinPolicySource;
    });
    protected resolveConnector(): Promise<TCasbinPolicyConnector>;
    /** Runs a raw statement and returns its rows. Drizzle's `execute()` shape differs per driver (node-postgres `{ rows }`, postgres-js the row list itself) - never read `.rows` directly. */
    protected query<TRow>(opts: {
        statement: SQL;
    }): Promise<TRow[]>;
    /** Load ONLY the policies matching `filter` into `model` (the store is read for one principal). */
    abstract loadFilteredPolicy(model: Model, filter: TFilter): Promise<void>;
    isFiltered(): boolean;
    loadPolicy(): Promise<void>;
    savePolicy(): Promise<boolean>;
    addPolicy(): Promise<void>;
    removePolicy(): Promise<void>;
    removeFilteredPolicy(): Promise<void>;
    /** Parse + load casbin policy lines into a model. Shared by subclasses' loadFilteredPolicy. */
    protected loadLines(opts: {
        model: Model;
        lines: string[];
    }): Promise<void>;
}
```

Source: `packages/core-server/src/components/auth/authorize/adapters/base-filtered.ts`

## `BaseGrpcController`

*class*

Recommended base class for gRPC controllers with concrete bindRoute and defineRoute implementations.

```ts
export declare abstract class BaseGrpcController<RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ServiceType = unknown, ConfigurableOptions extends object = {}> extends AbstractGrpcController<RouteEnv, RouteSchema, BasePath, ServiceType, ConfigurableOptions> {
    /** Creates a fluent binding for registering an RPC (call .to() to attach handler). */
    bindRoute(opts: {
        configs: IRpcMetadata;
    }): IGrpcBindRouteOptions<RouteEnv>;
    /** Defines and registers an RPC with its handler in a single call. */
    defineRoute(opts: {
        configs: IRpcMetadata;
        handler: TRpcHandler<unknown, unknown, RouteEnv>;
    }): IGrpcDefineRouteOptions;
    /** Internal: validates and stores handler + configs in definitions. Throws on non-unary methods. */
    private registerRoute;
}
```

Source: `packages/core-server/src/base/controllers/grpc/base.ts`

## `BaseRoleManager`

*class*

Shared casbin `RoleManager` scaffolding for the resource, domain-hierarchy, and membership
role managers: the debug-only interface members (`printRoles`, `getDomains`, `getAllDomains`),
the `hasLink` wrapper around the synchronous `syncedHasLink`, the once-per-`clear()`
overlay-initialized log line, and the shared ancestor walk both hierarchy-aware managers use.

```ts
export declare abstract class BaseRoleManager extends BaseHelper {
    protected graphReported: boolean;
    abstract syncedHasLink(name1: string, name2: string): boolean;
    hasLink(name1: string, name2: string): Promise<boolean>;
    /** casbin calls this after buildRoleLinks purely as a debug hook; none of the role managers log from here. */
    printRoles(): Promise<void>;
    getDomains(): Promise<string[]>;
    getAllDomains(): Promise<string[]>;
    /** Logs the initialized-overlay line once per `clear()` cycle; `build` is only invoked the first time so counts stay lazy. */
    protected reportGraphOnce(build: () => {
        message: string;
        args: unknown[];
    }): void;
    /** Node and edge counts of a domain-hierarchy overlay, for the once-per-`clear()` debug log. */
    protected static overlayStats(overlay?: Map<string, Set<string>>): {
        nodeCount: number;
        edgeCount: number;
    };
    /** `node` itself plus every ancestor reachable by walking the overlay's child->parent edges,
     * node first. Cycle-safe: visited Set + index cursor, never shift(). Static - `ResourceRoleManager`
     * extends this base with no overlay of this shape, so this must not force instance state onto it. */
    protected static collectAncestors(opts: {
        overlay?: Map<string, Set<string>>;
        node: string;
    }): string[];
}
```

Source: `packages/core-server/src/components/auth/authorize/role-managers/base.ts`

## `BasicAuthenticationStrategy`

*class*

HTTP Basic Authentication strategy using Authorization header credentials.

```ts
export declare class BasicAuthenticationStrategy<E extends Env = Env> extends BaseHelper implements IAuthenticationStrategy<E> {
    private service;
    name: string;
    constructor(service: BasicTokenService<E>);
    authenticate(context: TContext<E, string>): Promise<IAuthUser>;
}
```

Source: `packages/core-server/src/components/auth/authenticate/strategies/basic.strategy.ts`

## `BasicTokenService`

*class*

Extracts and verifies Basic auth credentials from the Authorization header.

```ts
export declare class BasicTokenService<E extends Env = Env> extends BaseService {
    protected options: TBasicTokenServiceOptions<E>;
    protected verifyCredentials: TBasicTokenServiceOptions<E>['verifyCredentials'];
    constructor(options: TBasicTokenServiceOptions<E>);
    /** Extracts username:password from Base64-encoded Authorization header. */
    extractCredentials(context: TContext<E, string>): {
        username: string;
        password: string;
    };
    /** Verifies credentials via the user-provided verification function. */
    verify(opts: {
        credentials: {
            username: string;
            password: string;
        };
        context: TContext<E, string>;
    }): Promise<IAuthUser>;
}
```

Source: `packages/core-server/src/components/auth/authenticate/services/basic/service.ts`

## `BunRuntimeGuard`

*class*

The Bun-only guard: what the process runs on, and the refusal when it is not Bun 1.4 or later.

```ts
export declare class BunRuntimeGuard {
    /** Reads the runtime the process is on. */
    static readSnapshot(): IRuntimeSnapshot;
    private static describeRuntime;
    /**
     * IGNIS runs on Bun 1.4 or later, and nothing else. One refusal at the top of `start()`, before any
     * hook, datasource or socket is touched, replaces a failure that would otherwise surface halfway
     * through startup.
     */
    static assert(opts?: {
        runtime?: IRuntimeSnapshot;
    }): void;
}
```

Source: `packages/core-server/src/base/applications/server.ts`

## `CASBIN_RBAC_DOMAIN_SCOPED_MODEL`

*const*

Scoped RBAC model (v2). Effect = casbin `allow-and-deny` (default-DENY: needs a matching allow AND no matching deny), NOT `deny-override` (default-ALLOW).

```ts
export declare const CASBIN_RBAC_DOMAIN_SCOPED_MODEL = "\n[request_definition]\nr = sub, dom, obj, act\n\n[policy_definition]\np = sub, dom, obj, act, eft\n\n[role_definition]\ng = _, _, _\ng2 = _, _\ng3 = _, _\ng4 = _, _\ng5 = _, _\n\n[policy_effect]\ne = some(where (p.eft == allow)) && !some(where (p.eft == deny))\n\n[matchers]\nm = g(r.sub, p.sub, r.dom) && (p.dom == \"SYSTEM_WIDE\" || (p.dom == \"ANY_MEMBER\" && g2(r.sub, r.dom)) || g3(r.dom, p.dom)) && (objectMatch(r.obj, p.obj) || g4(r.obj, p.obj)) && g5(r.act, p.act)\n";
```

Source: `packages/core-server/src/components/auth/authorize/enforcers/models/rbac-domain.model.ts`

## `CasbinAuthorizationEnforcer`

*class*

Authorization enforcer backed by casbin (an optional peer dependency); `configure()` throws when `options.model` is missing.

```ts
export declare class CasbinAuthorizationEnforcer<E extends Env = Env, TAction extends string = string, TResource extends string = string> extends BaseHelper implements IAuthorizationEnforcer<E, TAction, TResource, ICasbinRules> {
    private options;
    name: string;
    private readonly MIN_EXPIRES_IN;
    private pool;
    private helper;
    private userPolicyLineCache;
    private resolvedPayloadFn;
    constructor(options: ICasbinEnforcerOptions<E, TAction, TResource>);
    configure(): Promise<void>;
    destroy(): void;
    /** casbin compiles the matcher lazily (first enforce, not newEnforcer/buildRoleLinks); this dummy enforceSync forces the compile at warmup so syntax / unregistered-function / arity errors fail boot. */
    protected assertMatcherCompilesSync(opts: {
        enforcer: CasbinEnforcerType;
    }): void;
    buildRules(opts: {
        user: IAuthorizationUser;
        context: TContext<E, string>;
    }): Promise<ICasbinRules>;
    evaluate(opts: {
        rules: ICasbinRules;
        request: IAuthorizationRequest<TAction, TResource>;
        context: TContext<E, string>;
    }): Promise<TAuthorizationDecision>;
    /** On DENY, logs the deciding policy rule; matchedPolicy is `[]` when nothing matched (default-deny). */
    protected enforceWithExplain(opts: {
        enforcer: CasbinEnforcerType;
        vals: string[];
    }): boolean;
    invalidateUserCache(opts: {
        user: IAuthorizationUser;
    }): Promise<{
        invalidatedKeys: number;
    }>;
    rebuildUserCache(opts: {
        user: IAuthorizationUser;
    }): Promise<{
        cacheKey: string;
        lineCount: number;
    }>;
    /** Narrow `options.cached` to the redis variant and lazily create the per-user line cache - memoized so its single-flight de-dup map is shared across calls rather than reset on every access. */
    protected requireRedisCache(): UserPolicyLineCache;
    protected registerMatchers(opts: {
        enforcer: CasbinEnforcerType;
        casbin: typeof import('casbin');
    }): Promise<void>;
    /** Map a CasbinDomainMatchingFunctions value to casbin's Util.*Func matcher. */
    protected resolveDomainMatchingFn(opts: {
        casbin: typeof import('casbin');
        name: TCasbinDomainMatchingFunction;
    }): (arg1: string, arg2: string) => boolean;
    /** Default (sub,dom,obj,act) payload for the scoped model; domain comes from request.domain. */
    protected defaultScopedPayloadFn(): TNormalizePayloadFn<E, TAction, TResource> | undefined;
    protected resolveModel(opts: {
        casbin: typeof import('casbin');
        model: ICasbinEnforcerOptions['model'];
    }): import("casbin").Model;
    protected validateExpiresIn(opts: {
        expiresIn: number;
    }): void;
    /** Resolves this enforcer's model, then delegates the isolated-enforcer extraction (own model + adapter, never a pooled serving one, so concurrent requests cannot change what we cache) to PolicyLineCodec. */
    protected extractUserLines(opts: {
        user: IAuthorizationUser;
    }): Promise<string[]>;
    /** Requires configure() to have resolved the casbin Helper; the clearPolicy + loadPolicyLine + buildRoleLinks ordering lives in PolicyLineCodec. */
    protected loadPolicyLinesIntoModel(opts: {
        enforcer: CasbinEnforcerType;
        lines: string[];
    }): Promise<void>;
}

/** Payload shape for the scoped/custom path, matching defaultScopedPayloadFn(). */
type TNormalizePayloadFn<E extends Env, TAction, TResource> = (opts: {
    user: IAuthorizationUser;
    action: TAction;
    resource: TResource;
    context: TContext<E, string>;
}) => {
    subject: string;
    resource: string;
    action: string;
    domain?: string;
};
```

Source: `packages/core-server/src/components/auth/authorize/enforcers/casbin.enforcer.ts`

## `CustomGrantExpander`

*class*

Expands "custom" operation-subset grants (`metadata.ops`) into one casbin line per catalogued
operation. Isolated from the filtered-policy loader on purpose: it owns its own SQL
(`queryOperationCatalog`) and error vocabulary, and never reaches back into ScopedCasbinAdapter.

```ts
export declare class CustomGrantExpander extends BaseHelper {
    protected readonly dataSource: ICasbinPolicySource;
    protected readonly permission: IScopedCasbinEntities['permission'];
    protected readonly softDelete: IScopedCasbinEntities['softDelete'];
    constructor(opts: {
        dataSource: ICasbinPolicySource;
        entities: Pick<IScopedCasbinEntities, 'permission' | 'softDelete'>;
    });
    /** Why a custom-looking grant row cannot be honoured, or null when it is well formed. */
    rejectCustomRow(opts: {
        row: {
            subjectId: IdType;
            objectCode: string;
            objectMethod: string;
        };
        parsed: TCustomGrantMetadata | null;
        isCustomAction: boolean;
        metadataColumnName?: string;
    }): string | null;
    /** Resolve every custom row's ops in one catalog query, then emit one line per resolved operation. Unresolvable ops come back as `rejections` rather than being logged here - the caller owns the logger the tests swap. */
    expandCustomGrants(opts: {
        subjectType: string;
        customRows: TCustomGrantRow[];
    }): Promise<{
        lines: string[];
        rejections: string[];
    }>;
    /** Schema-qualified table reference (`"<schema>"."<table>"`) for use after FROM/JOIN with an alias. */
    private qualifiedTable;
    /** `AND <alias>.<col> IS NULL` when soft-delete is on, else empty. The alias is emitted raw to match the unquoted FROM alias - quoting folds it to a different case and breaks the join. */
    private softDeleteClause;
    /** Resolve `(subject, method)` pairs to catalogued operations. One query for the whole extraction. */
    private queryOperationCatalog;
}
```

Source: `packages/core-server/src/components/auth/authorize/adapters/custom-grant-expander.ts`

## `DocumentUITypes`

*class*

The document UI implementations the API reference can render. `isValid` checks a string against them.

```ts
export declare class DocumentUITypes extends ConstClass {
    static readonly SWAGGER = "swagger";
    static readonly SCALAR = "scalar";
}
```

Source: `packages/core-server/src/components/api-reference/common/constants.ts`
