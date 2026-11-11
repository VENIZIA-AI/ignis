---
title: "@venizia/ignis"
description: "Every export of @venizia/ignis, from the built declarations (generated)."
---

# `@venizia/ignis`

> Generated from the built declarations by `vulcan x atlas api gen` - do not edit.

107 exports, 107 with TSDoc. 956 more are re-exported from other entries (listed at the end).

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
        value: any;
    }): string;
    /**
     * With `applicationSecret` set, AES-encrypts the key and the value of every claim outside `JWT_COMMON_FIELDS`;
     * without it, returns the payload as is. A `null` claim is encrypted like any other value and decodes as `null`,
     * so the token decodes to the same payload with encryption on or off and `null` stays distinct from absent. An
     * `undefined` claim is skipped, as JSON drops it.
     */
    encryptPayload(payload: IJWTTokenPayload): Promise<Record<string, any>>;
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
        payload: Record<string, any>;
        claims?: IJWTIssueClaims;
    }): SignJWT;
    decryptPayload(opts: {
        result: JWTVerifyResult<IJWTTokenPayload>;
    }): Promise<IJWTTokenPayload>;
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
    basePath: string;
    /** Assigned by GrpcComponent from its options, before configure(). Absent means the adapter resolves the peer itself. */
    connectRpcModule?: IConnectRpcModule;
    /** ConnectRPC interceptors, assigned by GrpcComponent from its options before configure(). Applied to every RPC this controller registers. */
    interceptors?: unknown[];
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
    static readonly API_REFERENCE_OPTIONS = "@app/api-reference/options";
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
            }): Promise<any>;
            normalizeCountData<ResponseSchema extends unknown, RequestContext extends import("@venizia/ignis-kernel").TRouteContext<import("hono").Env> = import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>, ResponseData extends {
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
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
            }): Array<import("@venizia/ignis-kernel").IRequestedExtra>;
            respond<R>(opts: {
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
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
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
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
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
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
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
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
                context: import("@venizia/ignis-kernel").TRouteContext<import("hono").Env>;
                count: number;
            } & ({
                range: import("@venizia/ignis-kernel").TDataRange;
            } | {
                offset: number;
                total: number;
            })): void;
            toHonoHandler<ResponseType = unknown>(opts: {
                handler: import("@venizia/ignis-kernel").TRouteHandler<ResponseType, import("hono").Env>;
            }): import("hono").Handler<import("hono").Env, string, import("hono").Input, (Response | Promise<Response>) | (import("@hono/zod-openapi").RouteConfigToTypedResponse<import("@hono/zod-openapi").RouteConfig> | Promise<import("@hono/zod-openapi").RouteConfigToTypedResponse<import("@hono/zod-openapi").RouteConfig>>)>;
            bindRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): import("@venizia/ignis-kernel").IBindRouteOptions<RouteConfig, import("hono").Env, {}, "/">;
            defineRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig, ResponseType = unknown>(opts: {
                configs: RouteConfig;
                handler: import("@venizia/ignis-kernel").TRouteHandler<ResponseType, import("hono").Env>;
                hook?: import("@hono/zod-openapi").Hook<any, import("hono").Env, string, any> | undefined;
            }): import("@venizia/ignis-kernel").IDefineRouteOptions<RouteConfig, import("hono").Env, {}, "/">;
            defineJSXRoute<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig, ResponseType = unknown>(opts: {
                configs: RouteConfig;
                handler: import("@venizia/ignis-kernel").TRouteHandler<ResponseType, import("hono").Env>;
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
            }): RouteConfig & {
                getRoutingPath(): RouteConfig["path"] extends infer T ? T extends RouteConfig["path"] ? T extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start_1}/{${infer Param_1}}${infer Rest_1}` ? `${Start_1}/:${Param_1}${Rest_1 extends `${infer Start_2}/{${infer Param_2}}${infer Rest_2}` ? `${Start_2}/:${Param_2}${Rest_2 extends `${infer Start_3}/{${infer Param_3}}${infer Rest_3}` ? `${Start_3}/:${Param_3}${Rest_3 extends `${infer Start_4}/{${infer Param_4}}${infer Rest_4}` ? `${Start_4}/:${Param_4}${Rest_4 extends `${infer Start_5}/{${infer Param_5}}${infer Rest_5}` ? `${Start_5}/:${Param_5}${Rest_5 extends `${infer Start_6}/{${infer Param_6}}${infer Rest_6}` ? `${Start_6}/:${Param_6}${Rest_6 extends `${infer Start_7}/{${infer Param_7}}${infer Rest_7}` ? `${Start_7}/:${Param_7}${Rest_7 extends `${infer Start_8}/{${infer Param_8}}${infer Rest_8}` ? `${Start_8}/:${Param_8}${Rest_8 extends `${infer Start_9}/{${infer Param_9}}${infer Rest_9}` ? `${Start_9}/:${Param_9}${Rest_9 extends `${infer Start_10}/{${infer Param_10}}${infer Rest_10}` ? `${Start_10}/:${Param_10}${any}` : Rest_9}` : Rest_8}` : Rest_7}` : Rest_6}` : Rest_5}` : Rest_4}` : Rest_3}` : Rest_2}` : Rest_1}` : Rest}` : T : never : never;
            };
            getJSXRouteConfigs<RouteConfig extends import("@venizia/ignis-kernel").IAuthRouteConfig>(opts: {
                configs: RouteConfig;
            }): RouteConfig & {
                getRoutingPath(): RouteConfig["path"] extends infer T ? T extends RouteConfig["path"] ? T extends `${infer Start}/{${infer Param}}${infer Rest}` ? `${Start}/:${Param}${Rest extends `${infer Start_1}/{${infer Param_1}}${infer Rest_1}` ? `${Start_1}/:${Param_1}${Rest_1 extends `${infer Start_2}/{${infer Param_2}}${infer Rest_2}` ? `${Start_2}/:${Param_2}${Rest_2 extends `${infer Start_3}/{${infer Param_3}}${infer Rest_3}` ? `${Start_3}/:${Param_3}${Rest_3 extends `${infer Start_4}/{${infer Param_4}}${infer Rest_4}` ? `${Start_4}/:${Param_4}${Rest_4 extends `${infer Start_5}/{${infer Param_5}}${infer Rest_5}` ? `${Start_5}/:${Param_5}${Rest_5 extends `${infer Start_6}/{${infer Param_6}}${infer Rest_6}` ? `${Start_6}/:${Param_6}${Rest_6 extends `${infer Start_7}/{${infer Param_7}}${infer Rest_7}` ? `${Start_7}/:${Param_7}${Rest_7 extends `${infer Start_8}/{${infer Param_8}}${infer Rest_8}` ? `${Start_8}/:${Param_8}${Rest_8 extends `${infer Start_9}/{${infer Param_9}}${infer Rest_9}` ? `${Start_9}/:${Param_9}${Rest_9 extends `${infer Start_10}/{${infer Param_10}}${infer Rest_10}` ? `${Start_10}/:${Param_10}${any}` : Rest_9}` : Rest_8}` : Rest_7}` : Rest_6}` : Rest_5}` : Rest_4}` : Rest_3}` : Rest_2}` : Rest_1}` : Rest}` : T : never : never;
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
    protected secretsRegistration?: ISecretsRegistration;
    protected normalizePath(...segments: string[]): string;
    /** Adds the gRPC branch the kernel cannot own: `GrpcComponent` needs `AbstractGrpcController`, core-only code that reaches `node:module`. */
    registerControllers(): Promise<void>;
    registerSecrets(): ValueOrPromise<ISecretsRegistration>;
    hydrateSecrets(): Promise<void>;
    /** Applies each hydrate entry in declaration order; paths that resolve empty while declaring an expectation are collected in `emptyHydrations` rather than failing here. */
    protected hydrateSecretEntries(opts: {
        provider: ISecretsHelper;
        registration: ISecretsRegistration;
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
    /** Lives here rather than on `AbstractApplication` - `applicationEnvironment` reads `process.env` at module load, so a kernel-pure ancestor cannot carry it; this is the layer that already depends on it. */
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
export declare class DocumentUITypes {
    static readonly SWAGGER = "swagger";
    static readonly SCALAR = "scalar";
    static readonly SCHEME_SET: Set<string>;
    static isValid(value: string): boolean;
}
```

Source: `packages/core-server/src/components/api-reference/common/constants.ts`

## `DomainHierarchyRoleManager`

*class*

Serves the `g3` axis (`g3(r.dom, p.dom)`) and, with `reversed`, casbin's
`DefaultRoleManager.addDomainHierarchy()` on `g`, which asks in the opposite argument order.
`clear()` wipes only the overlay, never shared across requests: `buildRoleLinksInternal` clears
every registered role manager each request. Pass both instances one `overlay` so per-request `g3`
edges reach the `g` axis, which casbin never puts in `rmMap` and so never feeds `addLink`.

```ts
export declare class DomainHierarchyRoleManager extends BaseRoleManager implements RoleManager {
    private readonly reversed;
    private readonly overlay;
    constructor(opts: {
        reversed?: boolean;
        overlay?: Map<string, Set<string>>;
    });
    /** Mutates the map in place - never reassigns `this.overlay` - so a caller sharing this map with another instance (see `opts.overlay`) sees the clear too. */
    clear(): Promise<void>;
    addLink(child: string, parent: string): Promise<void>;
    deleteLink(child: string, parent: string): Promise<void>;
    syncedHasLink(name1: string, name2: string): boolean;
    /** Local overlay only, not the shared graph - correct for hasLink, incomplete for casbin's management API. */
    getRoles(name: string): Promise<string[]>;
    getUsers(name: string): Promise<string[]>;
    /** True when `start` is `target`, or reaches it through the overlay. */
    private reaches;
}
```

Source: `packages/core-server/src/components/auth/authorize/role-managers/domain-hierarchy.ts`

## `DrizzleResultUtility`

*class*

Normalizes the result of a raw Drizzle `execute()` call across the postgres-js and node-postgres drivers.

```ts
export declare class DrizzleResultUtility {
    /** Rows returned by `connector.execute(...)`. */
    static readResultRows<TRow>(opts: {
        result: unknown;
    }): TRow[];
}
```

Source: `packages/core-server/src/utilities/drizzle-result.utility.ts`

## `EnvironmentKeys`

*class*

Environment variable names.

The two groups mean different things and the split is load-bearing: a name in the second group
is a CONVENTION an application reads for itself, and setting it changes nothing in IGNIS. Every
name here was once presented as framework configuration, which is how a deployment came to set
`APP_ENV_APPLICATION_DS_MIGRATION` against a framework that read `APP_ENV_DS_MIGRATION` - and
neither name selected anything, so both are gone.

A name earns its place by having a reader. `APP_ENV_OAUTH2_VIEW_FOLDER` and
`APP_ENV_DATASOURCE_NAME` had none in either IGNIS or its consumers, only entries in `.env` files
nobody consulted, so they went the same way. Before adding one here, know who reads it.

Two framework variables are deliberately ABSENT from this class, and adding them would be a trap:
`APPLICATION_ENV_PREFIX` and `ALLOW_EMPTY_ENV_VALUE`. Neither carries the `APP_ENV` prefix, so
`applicationEnvironment` never holds them - a read through `AppEnvs.get()` would answer `undefined`
forever. `APPLICATION_ENV_PREFIX` could not go through it in any case: it is what builds the
filter. Both are bootstrap variables and are read straight off `process.env`, which is the one
legitimate exception to "do not read process.env directly". Neither has to be declared or set:
the prefix defaults to `APP_ENV`, and empty values are allowed unless you set
`ALLOW_EMPTY_ENV_VALUE` to `false` or `0`.

```ts
export declare class EnvironmentKeys {
    /** The startup banner. */
    static readonly APP_ENV_APPLICATION_NAME = "APP_ENV_APPLICATION_NAME";
    /** `DateUtility`'s default zone and the startup banner. */
    static readonly APP_ENV_APPLICATION_TIMEZONE = "APP_ENV_APPLICATION_TIMEZONE";
    /** Set it to enable rotating file logs; unset means console. Also the startup banner. */
    static readonly APP_ENV_LOGGER_FOLDER_PATH = "APP_ENV_LOGGER_FOLDER_PATH";
    /** Fallback host when `IApplicationConfigs.host` is absent. */
    static readonly APP_ENV_SERVER_HOST = "APP_ENV_SERVER_HOST";
    /** Fallback port when `IApplicationConfigs.port` is absent. */
    static readonly APP_ENV_SERVER_PORT = "APP_ENV_SERVER_PORT";
    static readonly APP_ENV_APPLICATION_SECRET = "APP_ENV_APPLICATION_SECRET";
    static readonly APP_ENV_APPLICATION_ROLES = "APP_ENV_APPLICATION_ROLES";
    static readonly APP_ENV_JWT_SECRET = "APP_ENV_JWT_SECRET";
    static readonly APP_ENV_JWT_EXPIRES_IN = "APP_ENV_JWT_EXPIRES_IN";
    static readonly APP_ENV_SERVER_BASE_PATH = "APP_ENV_SERVER_BASE_PATH";
    static readonly APP_ENV_POSTGRES_HOST = "APP_ENV_POSTGRES_HOST";
    static readonly APP_ENV_POSTGRES_PORT = "APP_ENV_POSTGRES_PORT";
    static readonly APP_ENV_POSTGRES_USERNAME = "APP_ENV_POSTGRES_USERNAME";
    static readonly APP_ENV_POSTGRES_PASSWORD = "APP_ENV_POSTGRES_PASSWORD";
    static readonly APP_ENV_POSTGRES_DATABASE = "APP_ENV_POSTGRES_DATABASE";
}
```

Source: `packages/core-server/src/common/environments.ts`

## `GrpcRequestAdapter`

*class*

Bridges IGNIS gRPC controllers with ConnectRPC: loads the peer deps with `ModuleUtility.load` (the ES module copy an application's own import gets), wraps handlers into ConnectRPC's signature, dispatches through a Hono middleware, and isolates request-scoped context with AsyncLocalStorage.

```ts
export declare class GrpcRequestAdapter<RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ServiceType = Parameters<ConnectRouter['service']>[0], ConfigurableOptions extends object = {}> extends BaseHelper {
    private createConnectRouter;
    private protocol;
    private controller;
    private interceptors?;
    private constructor();
    /**
     * The ConnectRPC peers, loaded as ES modules from the project root (or taken from `ModuleUtility.register`,
     * which is what a compiled binary has). A missing peer rejects with the error that names what to install.
     */
    private static loadModule;
    /** Wraps IGNIS RPC registrations into ConnectRPC's (request, context) => response signature. */
    private buildConnectHandlers;
    /** Loose signature on purpose - the IGNIS `ServiceType` is opaque (`unknown`) while ConnectRPC expects `DescService`. */
    private registerService;
    /** Creates the Hono middleware that dispatches to ConnectRPC universal handlers. */
    private buildMiddleware;
    /** Validates peer deps, creates adapter, and returns paths + middleware. */
    static build<RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ServiceType = Parameters<ConnectRouter['service']>[0], ConfigurableOptions extends object = {}>(opts: {
        controller: AbstractGrpcController<RouteEnv, RouteSchema, BasePath, ServiceType, ConfigurableOptions>;
        interceptors?: unknown[];
        module?: IConnectRpcModule;
    }): Promise<IConnectAdapterResult<RouteEnv, BasePath>>;
}
```

Source: `packages/core-server/src/base/controllers/grpc/adapter.ts`

## `HealthCheckBindingKeys`

*class*

Container keys of the health check component.

```ts
export declare class HealthCheckBindingKeys {
    static readonly HEALTH_CHECK_OPTIONS = "@app/health-check/options";
    /** The component resolves `getAppInfo()` once (it is async) and binds the result for the controller. */
    static readonly APPLICATION_INFO = "@app/health-check/application-info";
}
```

Source: `packages/core-server/src/components/health-check/common/keys.ts`

## `HealthCheckComponent`

*class*

Mounts the health check controller (liveness root, `/ping`, and the gated `/stats`).

**Example**
```typescript
import { BaseApplication, HealthCheckComponent, type IHealthCheckOptions } from '@venizia/ignis';

abstract class App extends BaseApplication {
  preConfigure(): void {
    const options: IHealthCheckOptions = { restOptions: { path: '/status' } };
    this.component(HealthCheckComponent, { options });
  }
}
```

```ts
export declare class HealthCheckComponent extends BaseComponent<IHealthCheckOptions> {
    private application;
    constructor(application: BaseApplication);
    /**
     * `application.component(HealthCheckComponent, { options })` lands here. Options given at the
     * call site are the most explicit statement of intent, so they take the binding over anything
     * bound earlier; `initDefaultBindings` then finds the key taken and leaves the default aside.
     */
    configure(opts?: IHealthCheckOptions): Promise<void>;
    binding(): Promise<void>;
}
```

Source: `packages/core-server/src/components/health-check/component.ts`

## `HealthCheckController`

*class*

Serves the health routes: the root summary and `/ping` always, `/stats` only when `IHealthCheckOptions.stats` allows it and the request is authorized.

```ts
export declare class HealthCheckController extends BaseRestController {
    private readonly healthOptions;
    private readonly appInfo?;
    /**
     * Both dependencies arrive through the container, so two applications in one process each get
     * their own gate - a static field would let the last one to boot decide for every other.
     */
    constructor(healthOptions?: IHealthCheckOptions, appInfo?: IApplicationInfo | undefined);
    binding(): ValueOrPromise<void>;
    pingPong(context: TRouteContext): import("@venizia/ignis-kernel").TJsonResponse<unknown, 200>;
}
```

Source: `packages/core-server/src/components/health-check/controller.ts`

## `HealthCheckHeaders`

*class*

Request headers the health check controller reads.

```ts
export declare class HealthCheckHeaders {
    /** Where a gated stats request carries its key; lowercase because Hono normalises header names. */
    static readonly SECRET_KEY = "x-health-key";
}
```

Source: `packages/core-server/src/components/health-check/common/constants.ts`

## `HealthCheckReporter`

*class*

Assembles what `GET /health` and `GET /health/stats` answer.

Never reads the filesystem and never spawns `git`: the build stamp is PUSHED in at the
entrypoint through {@link BuildInfoRegistry} (or the component's own options), so a
`bun build --compile` binary and a Distroless image - neither of which has `node_modules`,
`.git` or a readable `package.json` - report exactly what a dev machine does.

```ts
export declare class HealthCheckReporter {
    private static readonly BYTES_PER_MB;
    /** Public liveness answer: liveness and the server clock, nothing a probe cannot already see. */
    static buildSummary(): {
        status: string;
        timestamp: string;
    };
    /**
     * Fail-closed, copying `AppErrorMiddleware.isProduction`: the default is MEMBERSHIP in
     * `DEVELOPMENT_ENVS`, never inequality against `production`. `staging`, `uat`, `alpha` and a
     * typo all keep this route shut, because the runtime and release it names are what picks an
     * exploit. `ambient`, not `current`: an unset `NODE_ENV` is a host that cannot prove it is a dev
     * machine, and `current` would mask it as `development`.
     *
     * `enable` is compared to `true`/`false` rather than read through `??`: this binding is
     * env/config driven, and a JSON-derived `"false"` is truthy - an operator who wrote false would
     * otherwise get the route mounted.
     */
    static isStatsEnabled(opts: {
        options: IHealthCheckOptions;
        /** Reads the ambient environment; injected by tests so nothing has to write `process.env`. */
        environment?: () => string | undefined;
    }): boolean;
    /**
     * No `secretKey` configured leaves the route open to whatever can reach the port - stated, not
     * implied. Anything that is not a non-blank string fails CLOSED: a blank or config-derived
     * non-string key is a pipeline that lost the variable, and reading it as "no key" would publish
     * the route the operator meant to lock.
     *
     * The comparison is a plain `===`: a remote timing attack on a header compare is not practical
     * through an HTTP stack, and a constant-time digest compare would buy nothing here.
     */
    /**
     * Whether the stats route is mounted, unauthenticated, and on a host that cannot be shown to be a
     * development one. That combination stays LEGAL - on a cluster-internal port it is often the right
     * call - so this reports rather than refuses, and the component turns it into one warning at boot.
     *
     * It exists because `enable: true` bypasses the environment gate entirely: an operator who sets it
     * for a local run and ships the same code publishes the runtime version, the release and the
     * memory profile to whatever can reach the port. A blank `secretKey` is NOT unguarded - that fails
     * closed in {@link isStatsAuthorized}.
     */
    static isStatsUnguarded(opts: {
        options: IHealthCheckOptions;
        environment?: () => string | undefined;
    }): boolean;
    static isStatsAuthorized(opts: {
        options: IHealthCheckOptions;
        header?: string;
    }): boolean;
    /** The slot is a process-wide `globalThis` entry any dependency can write, and `IBuildInfo` types it without checking - so a non-string never reaches the response schema, which declares `z.string()`. */
    private static extractText;
    /**
     * Explicit options win over the registry, and the application's own `getAppInfo()` fills what
     * neither carries - so a host that ran no generator still reports its real name and version.
     */
    static resolveBuildInfo(opts: {
        options: IHealthCheckOptions;
        appInfo?: IApplicationInfo;
    }): TBuildInfoRecord;
    /** `3661` -> `1h 1m 1s`: an operator reads a restart out of this faster than out of a float. */
    static toHumanUptime(opts: {
        seconds: number;
    }): string;
    private static toMegabytes;
    static buildStats(opts: {
        options: IHealthCheckOptions;
        appInfo?: IApplicationInfo;
    }): {
        build: Required<import("@venizia/ignis-helpers").IBuildInfo>;
        process: {
            pid: number;
            uptime: number;
            uptimeHuman: string;
            runtime: string;
            environment: string;
        };
        memory: {
            rss: string;
            heapUsed: string;
            heapTotal: string;
        };
        status: string;
        timestamp: string;
    };
}
```

Source: `packages/core-server/src/components/health-check/reporter.ts`

## `HealthCheckRestPaths`

*class*

Routes of the health check controller, relative to the configured base path.

```ts
export declare class HealthCheckRestPaths {
    static readonly ROOT = "/";
    static readonly PING = "/ping";
    static readonly STATS = "/stats";
}
```

Source: `packages/core-server/src/components/health-check/common/rest-paths.ts`

## `IApiReferenceOptions`

*interface*

Every field is optional: a partially-filled binding falls back to the component defaults.

**Example**
```typescript
import { ApiReferenceBindingKeys, type BaseApplication, type IApiReferenceOptions } from '@venizia/ignis';

export const bindApiReference = (application: BaseApplication) => {
  application
    .bind<IApiReferenceOptions>({ key: ApiReferenceBindingKeys.API_REFERENCE_OPTIONS })
    .toValue({ restOptions: { base: { path: '/docs' }, ui: { type: 'swagger' } } });
};
```

```ts
export interface IApiReferenceOptions {
    restOptions?: {
        base?: {
            path?: string;
        };
        doc?: {
            path?: string;
        };
        ui?: {
            path?: string;
            type?: TDocumentUIType;
        };
    };
    explorer?: {
        openapi?: string;
        info?: {
            title: string;
            version: string;
            description: string;
            contact?: {
                name: string;
                email: string;
            };
        };
        servers?: Array<{
            url: string;
            description?: string;
        }>;
    };
    uiConfig?: Record<string, any>;
    securitySchemes?: Record<string, Record<string, any>>;
}
```

Source: `packages/core-server/src/components/api-reference/common/types.ts`

## `IApplicationConfigs`

*interface*

What a host with a real socket configures on top of the kernel's shape. `host` and `port` are
meaningless to a browser Worker, which is why they are not on the kernel's own interface - see
{@link IServerApplication}.

```ts
export interface IServerApplicationConfigs extends IKernelApplicationConfigs {
    host?: string;
    port?: number;
    /**
     * Bound as `CoreBindings.APPLICATION_PROJECT_ROOT` at construction and handed to `ModuleUtility`. Must be the directory holding `node_modules` at run time - never `__dirname` inside a compiled binary.
     *
     * @default process.cwd()
     */
    projectRoot?: string;
    /** Bun-only socket options passed straight to `Bun.serve`. Unset keys keep Bun's own defaults. */
    server?: IServerRuntimeConfigs;
}
```

Source: `packages/core-server/src/base/applications/common/types.ts`

## `ICasbinPolicyFilter`

*interface*

Filter passed to loadFilteredPolicy: which principal's policies to load.

```ts
export interface ICasbinPolicyFilter {
    principal: {
        type: string;
        id: IdType;
    };
}
```

Source: `packages/core-server/src/components/auth/authorize/adapters/common/types.ts`

## `ICasbinPolicySource`

*interface*

Minimal source the adapters depend on - any drizzle-backed datasource satisfies it.

```ts
export interface ICasbinPolicySource {
    /** A datasource that opens on first use opens here; one that opens at start resolves at once. */
    ensureOpen?(): Promise<void>;
    /** Preferred: lazily wires the driver on first read and survives pool rotation, mirroring repositories. */
    getConnector?(): TCasbinPolicyConnector;
    /** Back-compat: a pre-wired connector. Prefer getConnector on a real datasource. */
    connector?: TCasbinPolicyConnector;
}
```

Source: `packages/core-server/src/components/auth/authorize/adapters/common/types.ts`

## `IClaimsConfigSource`

*interface*

What a token service is configured with for claims: the required `claims`, the `verify` checks, and the removed `sign` it refuses.

```ts
export interface IClaimsConfigSource {
    claims?: unknown;
    verify?: unknown;
    /** Removed: refused with a message that points to `claims`. */
    sign?: unknown;
}
```

Source: `packages/core-server/src/components/auth/authenticate/services/bearer/abstract.service.ts`

## `IConnectAdapterResult`

*interface*

Result from GrpcRequestAdapter.build().

```ts
export interface IConnectAdapterResult<RouteEnv extends Env = Env, BasePath extends string = '/', RouteInput extends Input = {}> {
    paths: string[];
    middleware: MiddlewareHandler<RouteEnv, BasePath, RouteInput>;
}
```

Source: `packages/core-server/src/base/controllers/grpc/common/types.ts`

## `IGetProviderParams`

*interface*

Selects a registered UI provider by its type name.

```ts
export interface IGetProviderParams {
    type: string;
}
```

Source: `packages/core-server/src/components/api-reference/common/types.ts`

## `IGrpcBindRouteOptions`

*interface*

Fluent binding for two-step RPC registration: bindRoute({ configs }).to({ handler }).

```ts
export interface IGrpcBindRouteOptions<RouteEnv extends Env = Env> {
    configs: IRpcMetadata;
    to: (opts: {
        handler: TRpcHandler<unknown, unknown, RouteEnv>;
    }) => IGrpcDefineRouteOptions;
}
```

Source: `packages/core-server/src/base/controllers/grpc/common/types.ts`

## `IGrpcController`

*interface*

gRPC controller interface defining RPC registration and configuration contract.

```ts
export interface IGrpcController<RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ServiceType = unknown, ConfigurableOptions extends object = {}> extends IConfigurable<ConfigurableOptions> {
    service: ServiceType;
    router: Hono<RouteEnv, RouteSchema, BasePath>;
    definitions: Record<string, IRpcRegistration<RouteEnv>>;
    getRouter(): Hono<RouteEnv, RouteSchema, BasePath>;
    bindRoute(opts: {
        configs: IRpcMetadata;
    }): IGrpcBindRouteOptions<RouteEnv>;
    defineRoute(opts: {
        configs: IRpcMetadata;
        handler: TRpcHandler<unknown, unknown, RouteEnv>;
    }): IGrpcDefineRouteOptions;
}
```

Source: `packages/core-server/src/base/controllers/grpc/common/types.ts`

## `IGrpcControllerOptions`

*interface*

Configuration options for gRPC controller instantiation.

```ts
export interface IGrpcControllerOptions {
    scope: string;
    /** Falls back to @controller decorator path if not provided. */
    path?: string;
}
```

Source: `packages/core-server/src/base/controllers/grpc/common/types.ts`

## `IGrpcDefineRouteOptions`

*interface*

Return type from defineRoute - contains processed configs.

```ts
export interface IGrpcDefineRouteOptions {
    configs: IRpcMetadata;
}
```

Source: `packages/core-server/src/base/controllers/grpc/common/types.ts`

## `IHealthCheckOptions`

*interface*

Options of `HealthCheckComponent`, bound at `HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS`.

**Example**
```typescript
import { HealthCheckBindingKeys, type BaseApplication, type IHealthCheckOptions } from '@venizia/ignis';

export const bindHealth = (application: BaseApplication) => {
  application
    .bind<IHealthCheckOptions>({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS })
    .toValue({ restOptions: { path: '/status' }, stats: { secretKey: 'change-me' } });
};
```

```ts
export interface IHealthCheckOptions {
    /** Partially-filled bindings are accepted; every missing field falls back to its default. */
    restOptions?: {
        /**
         * Base path the health routes mount under.
         *
         * @default '/health'
         */
        path?: string;
    };
    /**
     * `GET <path>/stats`: build stamp, process and memory. The runtime and version it reports are
     * exactly what an attacker needs to pick an exploit, so the default is CLOSED on every host that
     * is not provably a development one.
     */
    stats?: {
        /**
         * Whether the route is mounted. Left out, it is open only when `NODE_ENV` names a development
         * environment (`Environment.DEVELOPMENT_ENVS`); `staging`, `uat`, `production`, an unrecognised
         * name and an unset `NODE_ENV` all keep it closed.
         *
         * @default true in a development environment, false otherwise
         */
        enable?: boolean;
        /**
         * When set, the route answers only for a request carrying this value in `X-Health-Key`, and a
         * refusal is indistinguishable from an unmounted route. A blank value fails closed.
         * Without the field the route is open to anything that can reach the port.
         */
        secretKey?: string;
        /** Wins over {@link BuildInfoRegistry}; a host that stamps its own build passes it here. */
        buildInfo?: IBuildInfo;
    };
}
```

Source: `packages/core-server/src/components/health-check/common/types.ts`

## `IResolvedClaimsConfig`

*interface*

What {@link AbstractBearerTokenService.resolveClaimsConfig} answers: the validated claims and the verify options jose receives.

```ts
export interface IResolvedClaimsConfig {
    claims: IJWTClaimsOptions;
    verify: JWTVerifyOptions & {
        algorithms: string[];
    };
}
```

Source: `packages/core-server/src/components/auth/authenticate/services/bearer/abstract.service.ts`

## `IRpcRegistration`

*interface*

Unified registration entry: metadata + handler + pre-built middlewares stored together.

```ts
export interface IRpcRegistration<RouteEnv extends Env = Env> {
    configs: IRpcMetadata;
    handler: TRpcHandler<unknown, unknown, RouteEnv>;
    middlewares: TRpcMiddleware<RouteEnv>[];
}
```

Source: `packages/core-server/src/base/controllers/grpc/common/types.ts`

## `IRuntimeSnapshot`

*interface*

What the process runs on. `Bun` is the one global that tells the runtimes apart, and it cannot be hidden in a test, so the guard reads this snapshot instead.

```ts
export interface IRuntimeSnapshot {
    /** `Bun.version`, set only under Bun. */
    bunVersion?: string;
    /** `process.release.name` and `process.version` of a runtime that is not Bun (`node`, `v24.14.0`). */
    otherName?: string;
    otherVersion?: string;
}
```

Source: `packages/core-server/src/base/applications/server.ts`

## `IScopedCasbinEntities`

*interface*

All physical mapping the ScopedCasbinAdapter needs. App provides this; framework stays decoupled.

```ts
export interface IScopedCasbinEntities {
    policyDefinition: IScopedCasbinTable & {
        metadata?: {
            columnName: string;
        };
    };
    /** Permission catalog (id, code, ...). */
    permission: IScopedCasbinTable;
    /** Principal type labels used as casbin name prefixes. */
    principals: {
        user: string;
        role: string;
    };
    /** Domain type labels (e.g. ['Merchant', 'Organizer']). */
    domainTypes: string[];
    /** Soft-delete handling for both tables. */
    softDelete?: {
        use: false;
    } | {
        use: true;
        columnName: string;
    };
}
```

Source: `packages/core-server/src/components/auth/authorize/adapters/common/types.ts`

## `IScopedCasbinPolicyFilter`

*interface*

Filter passed to `ScopedCasbinAdapter.loadFilteredPolicy`: the one principal whose policy lines are loaded.

```ts
export interface IScopedCasbinPolicyFilter {
    principal: {
        type: string;
        id: IdType;
    };
}
```

Source: `packages/core-server/src/components/auth/authorize/adapters/scoped-casbin/common/types.ts`

## `IScopedCasbinTable`

*interface*

Maps a logical table onto its physical name + schema.

```ts
export interface IScopedCasbinTable {
    tableName: string;
    schemaName?: string;
}
```

Source: `packages/core-server/src/components/auth/authorize/adapters/common/types.ts`

## `IServerApplication`

*interface*

Contract of an application that listens on a socket: host, port and address accessors plus `start` and `stop`.

```ts
export interface IServerApplication<AppEnv extends Env = Env, AppSchema extends Schema = Schema, BasePath extends string = '/'> extends IApplication<AppEnv, AppSchema, BasePath> {
    getServerHost(): string;
    getServerPort(): number;
    getServerAddress(): string;
    start(): Promise<void> | void;
    stop(): Promise<void> | void;
}
```

Source: `packages/core-server/src/base/applications/common/types.ts`

## `IServerApplicationConfigs`

*interface*

What a host with a real socket configures on top of the kernel's shape. `host` and `port` are
meaningless to a browser Worker, which is why they are not on the kernel's own interface - see
{@link IServerApplication}.

```ts
export interface IServerApplicationConfigs extends IKernelApplicationConfigs {
    host?: string;
    port?: number;
    /**
     * Bound as `CoreBindings.APPLICATION_PROJECT_ROOT` at construction and handed to `ModuleUtility`. Must be the directory holding `node_modules` at run time - never `__dirname` inside a compiled binary.
     *
     * @default process.cwd()
     */
    projectRoot?: string;
    /** Bun-only socket options passed straight to `Bun.serve`. Unset keys keep Bun's own defaults. */
    server?: IServerRuntimeConfigs;
}
```

Source: `packages/core-server/src/base/applications/common/types.ts`

## `IServerInfoOptions`

*interface*

Options of `ServerInfoComponent`, bound at `ServerInfoBindingKeys.SERVER_INFO_OPTIONS`.

**Example**
```typescript
import { ServerInfoBindingKeys, type BaseApplication, type IServerInfoOptions } from '@venizia/ignis';

export const bindServerInfo = (application: BaseApplication) => {
  application
    .bind<IServerInfoOptions>({ key: ServerInfoBindingKeys.SERVER_INFO_OPTIONS })
    .toValue({ restOptions: { path: '/clock' } });
};
```

```ts
export interface IServerInfoOptions {
    /** Partially-filled bindings are accepted; every missing field falls back to its default. */
    restOptions?: {
        /**
         * Base path the server info routes mount under. The routes are public by design.
         *
         * @default '/server/info'
         */
        path?: string;
    };
}
```

Source: `packages/core-server/src/components/server-info/common/types.ts`

## `IServerRuntimeConfigs`

*interface*

The `Bun.serve` options an application has a reason to change without re-implementing `startBunModule`.

```ts
export interface IServerRuntimeConfigs {
    /** Seconds a connection may sit idle before Bun closes it; Bun caps it at 255. */
    idleTimeout?: number;
    /** Largest request body in bytes. */
    maxRequestBodySize?: number;
}
```

Source: `packages/core-server/src/base/applications/common/types.ts`

## `IServerTime`

*interface*

Body of `GET <path>/time`. Every field comes from ONE captured instant, so they never disagree.

**Example**
```json
{
  "server": {
    "date": "2026-11-10",
    "time": "15:00:00.123",
    "epoch": 1794297600123,
    "iso": "2026-11-10T15:00:00.123+07:00"
  },
  "tz": "Asia/Ho_Chi_Minh",
  "utc": { "offset": "+07:00", "minutes": 420, "iso": "2026-11-10T08:00:00.123Z" }
}
```

```ts
export interface IServerTime {
    server: {
        /** Calendar date in the server time zone, `YYYY-MM-DD`. */
        date: string;
        /** Wall-clock time in the server time zone, `HH:mm:ss.SSS`. */
        time: string;
        /** Milliseconds since 1970-01-01T00:00:00Z (`Date.now()`). Compute clock skew from this field. */
        epoch: number;
        /** `date`, `time` and `utc.offset` joined as ISO-8601, e.g. `2026-11-10T15:00:00.123+07:00`. */
        iso: string;
    };
    /** IANA time zone the server process resolved, e.g. `Asia/Ho_Chi_Minh`. */
    tz: string;
    utc: {
        /** Offset of `tz` from UTC at response time, `+07:00` style. */
        offset: string;
        /**
         * The same offset in minutes, POSITIVE east of UTC (`420` for `+07:00`). This is the opposite
         * sign of JavaScript's `Date.prototype.getTimezoneOffset()`.
         */
        minutes: number;
        /** The same instant in UTC, ISO-8601 with milliseconds (`toISOString()`). */
        iso: string;
    };
}
```

Source: `packages/core-server/src/components/server-info/common/types.ts`

## `IShutdownSignalsOptions`

*interface*

Options of `ServerApplication.installShutdownSignals`.

```ts
export interface IShutdownSignalsOptions {
    /**
     * The signals that stop the application.
     *
     * @default ['SIGTERM', 'SIGINT']
     */
    signals?: NodeJS.Signals[];
    /**
     * How long a shutdown may take before the process is force-exited with code 1, in milliseconds.
     *
     * @default 15_000
     */
    timeoutMs?: number;
    /**
     * What ends the process. A seam for tests and for hosts that exit differently.
     *
     * @default (code) => process.exit(code)
     */
    exit?: (code: number) => void;
}
```

Source: `packages/core-server/src/base/applications/common/types.ts`

## `IUIConfig`

*interface*

Input of `IUIProvider.render`. Fields beyond `title` and `url` are passed through to the underlying UI library.

```ts
export interface IUIConfig {
    title: string;
    url: string;
    [key: string]: any;
}
```

Source: `packages/core-server/src/components/api-reference/common/types.ts`

## `IUIProvider`

*interface*

Renders the interactive API documentation page for the OpenAPI document. Register an implementation on `UIProviderFactory` to serve a custom UI.

```ts
export interface IUIProvider {
    render(context: Context, config: IUIConfig, next: Next): Promise<Response | void>;
}
```

Source: `packages/core-server/src/components/api-reference/common/types.ts`

## `JWKSController`

*class*

Serves the public JWKS from `JWKSIssuerTokenService` for external verifiers, with a one-hour `Cache-Control` max-age. Mounted at `/certs` unless the issuer options set `rest.path`.

```ts
export declare class JWKSController extends BaseRestController {
    private jwksService;
    constructor(jwksService: JWKSIssuerTokenService);
    binding(): ValueOrPromise<void>;
}
```

Source: `packages/core-server/src/components/auth/authenticate/controllers/jwks/controller.ts`

## `JWKSIssuerAuthenticationStrategy`

*class*

JWT authentication strategy that verifies the bearer token with `JWKSIssuerTokenService`, for an application that issues its own tokens.

```ts
export declare class JWKSIssuerAuthenticationStrategy<E extends Env = Env> extends BaseHelper implements IAuthenticationStrategy<E> {
    private service;
    name: string;
    standard: string;
    constructor(service: JWKSIssuerTokenService<E>);
    authenticate(context: TContext<E, string>): Promise<IAuthUser>;
}
```

Source: `packages/core-server/src/components/auth/authenticate/strategies/jwks/issuer.ts`

## `JWKSIssuerTokenService`

*class*

Signs tokens with a private key loaded from `IJWKSIssuerOptions` and exposes the matching public keys as a JWKS via `getJWKSAsync()`.

```ts
export declare class JWKSIssuerTokenService<E extends Env = Env> extends AbstractJWKSTokenService<E> {
    protected options: IJWKSIssuerOptions;
    protected privateKey: TNullable<CryptoKey | Uint8Array>;
    protected publicKey: TNullable<CryptoKey | Uint8Array>;
    protected jwks: {
        keys: JWK[];
    } | null;
    constructor(options: IJWKSIssuerOptions);
    protected initialize(): Promise<void>;
    protected resolveKeyContent(opts: {
        keys: IJWKSIssuerOptions['keys'];
    }): Promise<{
        priv: string;
        pub: string;
    }>;
    /**
     * Refuses a JWK carrying private material where a PUBLIC key is expected.
     *
     * The `pem` format cannot reach this state - `importSPKI` rejects a private PEM outright. The
     * `jwk` format can: `importJWK` imports whatever it is handed, and a private JWK marked
     * `"ext": true` yields an EXTRACTABLE key, so `exportJWK` then carries `d` straight into the
     * document `/certs` serves without authentication. Measured on jose 6.2.3: with `ext: true` the
     * round trip returns `d`; without it, export throws. So the only thing standing between a
     * mis-pasted key and a published signing key was an optional flag on attacker-irrelevant input.
     *
     * Named members, not a blanket scan: `d` covers EC/OKP and RSA's private exponent, and the CRT
     * members are the rest of an RSA private key.
     */
    protected assertPublicJWK(opts: {
        jwk: JWK;
    }): void;
    protected parseKeyMaterial(opts: {
        raw: {
            priv: string;
            pub: string;
        };
        algorithm: IJWKSIssuerOptions['algorithm'];
        keys: IJWKSIssuerOptions['keys'];
    }): Promise<{
        priv: import("node:crypto").webcrypto.CryptoKey | Uint8Array<ArrayBufferLike>;
        pub: import("node:crypto").webcrypto.CryptoKey | Uint8Array<ArrayBufferLike>;
    }>;
    protected doVerify(token: string): Promise<IJWTTokenPayload>;
    getSigner(opts: {
        payload: IJWTTokenPayload;
        getTokenExpiresFn: TGetTokenExpiresFn;
        claims?: IJWTIssueClaims;
    }): Promise<import("jose").SignJWT>;
    protected getSigningKey(): ValueOrPromise<Uint8Array | CryptoKey>;
    protected getDefaultTokenExpiresFn(): TGetTokenExpiresFn;
    getJWKS(): {
        keys: JWK[];
    };
    getJWKSAsync(): Promise<{
        keys: JWK[];
    }>;
}
```

Source: `packages/core-server/src/components/auth/authenticate/services/bearer/jwks/issuer.service.ts`

## `JWKSUrlPolicy`

*class*

Where a JWKS may be fetched from. A key set read over plain `http:` can be replaced on the way, and
whoever replaces it signs tokens that verify, so a JWKS URL is `https:` unless its host is loopback or
is listed in `jwks.hosts.http`. The one policy serves the JWKS verifier and the service-assertion
callers: both fetch a key set to decide who may call.

The opt-in is an EXACT entry, never a pattern or a range: a host name, an IPv4 address, or an IPv6 address in
brackets, each optionally with a port (`identity-service`, `10.0.0.5:8080`, `[fd00::1]:8443`). An entry without a
port covers every port of that host; an entry with one covers that port only. An entry and a URL are both read by
the URL parser, so the two sides are compared in the form the parser gives them: `http://2130706433` is
`127.0.0.1`, and `http://[::ffff:10.0.0.5]` is `[::ffff:a00:5]`, which is not `10.0.0.5`.

```ts
export declare class JWKSUrlPolicy {
    /**
     * Refuses an entry of `jwks.hosts.http` that is not exactly a host with an optional port, and answers the entries
     * in the form a URL is matched in: the host as the URL parser writes it (lower case), then `:port` when there is one.
     * An entry is valid only when `new URL('http://' + entry)` gives the same host back, and the same port.
     */
    static resolveHttpHosts(opts: {
        scope: string;
        hosts?: unknown;
    }): ReadonlySet<string>;
    /** The canonical form of one entry, or `undefined` when it is not exactly a host with an optional port. */
    private static canonicalEntry;
    /** Whether a name is within the DNS limits: 253 characters, and 63 for each label. */
    private static isWithinLimits;
    /** `http://<authority>` through the URL parser, or `undefined` when it refuses it. */
    private static parseHttp;
    /** Whether the URL parser's hostname is a loopback one: `localhost`, `127.0.0.0/8` or `::1`. */
    static isLoopback(hostname: string): boolean;
    /**
     * Parses a JWKS URL and refuses it unless it is `https:`, or `http:` to a loopback host or a host listed in
     * `jwks.hosts.http`. Only the host name goes into the message: a URL may carry credentials.
     */
    static assertUrl(opts: {
        scope: string;
        label: string;
        url: string;
        hosts?: unknown;
    }): URL;
}
```

Source: `packages/core-server/src/components/auth/authenticate/services/jwks-url-policy.ts`

## `JWKSVerifierAuthenticationStrategy`

*class*

JWT authentication strategy that verifies the bearer token with `JWKSVerifierTokenService`, for an application that trusts a remote JWKS.

```ts
export declare class JWKSVerifierAuthenticationStrategy<E extends Env = Env> extends BaseHelper implements IAuthenticationStrategy<E> {
    private service;
    name: string;
    standard: string;
    constructor(service: JWKSVerifierTokenService<E>);
    authenticate(context: TContext<E, string>): Promise<IAuthUser>;
}
```

Source: `packages/core-server/src/components/auth/authenticate/strategies/jwks/verifier.ts`

## `JWKSVerifierTokenService`

*class*

Verifies tokens against a remote JWKS fetched from `jwksUrl`. The key set is cached for `cacheTtlMs` (default 43_200_000 ms) with a `cooldownMs` refetch cooldown (default 30_000 ms).

```ts
export declare class JWKSVerifierTokenService<E extends Env = Env> extends AbstractJWKSTokenService<E> {
    protected options: IJWKSVerifierOptions;
    protected jwksVerifier: ReturnType<typeof createRemoteJWKSet> | null;
    constructor(options: IJWKSVerifierOptions);
    protected initialize(): Promise<void>;
    protected doVerify(token: string): Promise<IJWTTokenPayload>;
    getSigner(_opts: {
        payload: IJWTTokenPayload;
        getTokenExpiresFn: TGetTokenExpiresFn;
    }): Promise<SignJWT>;
    protected getSigningKey(): never;
    protected getDefaultTokenExpiresFn(): never;
}
```

Source: `packages/core-server/src/components/auth/authenticate/services/bearer/jwks/verifier.service.ts`

## `JWSAuthenticationStrategy`

*class*

JWT authentication strategy that verifies the bearer token with `JWSTokenService` (JWS, HS256 by default).

```ts
export declare class JWSAuthenticationStrategy<E extends Env = Env> extends BaseHelper implements IAuthenticationStrategy<E> {
    private service;
    name: string;
    standard: string;
    constructor(service: JWSTokenService<E>);
    authenticate(context: TContext<E, string>): Promise<IAuthUser>;
}
```

Source: `packages/core-server/src/components/auth/authenticate/strategies/jws.strategy.ts`

## `JWSTokenService`

*class*

Symmetric JWT (JWS) token service with optional AES-encrypted payloads.

```ts
export declare class JWSTokenService<E extends Env = Env> extends AbstractBearerTokenService<E> {
    protected options: IJWSTokenServiceOptions;
    /** The shortest `jwtSecret` accepted, in bytes: an HMAC key is as strong as it is long, and 32 bytes is the size of a SHA-256 output. */
    static readonly MIN_SECRET_BYTES = 32;
    protected jwtSecret: Uint8Array;
    /**
     * Refuses a `jwtSecret` shorter than {@link JWSTokenService.MIN_SECRET_BYTES} (counted in UTF-8 bytes, not
     * characters), saying how to make one. The secret is never echoed. The component calls it at boot and the
     * service when it is built.
     */
    static assertSecretStrength(opts: {
        scope: string;
        secret: string;
    }): void;
    constructor(options: IJWSTokenServiceOptions);
    protected doVerify(token: string): Promise<IJWTTokenPayload>;
    getSigner(opts: {
        payload: IJWTTokenPayload;
        getTokenExpiresFn: TGetTokenExpiresFn;
        claims?: IJWTIssueClaims;
    }): Promise<import("jose").SignJWT>;
    protected getSigningKey(): ValueOrPromise<Uint8Array>;
    protected getDefaultTokenExpiresFn(): TGetTokenExpiresFn;
}
```

Source: `packages/core-server/src/components/auth/authenticate/services/bearer/jws.service.ts`

## `JWTTokenPayloadSchema`

*const*

Zod schema of the JWT payload: `userId`, the `roles` (id, identifier, integer priority) and optional `clientId`, `provider` and `email`.

```ts
export declare const JWTTokenPayloadSchema: z.ZodObject<{
    userId: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    roles: z.ZodArray<z.ZodObject<{
        id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
        identifier: z.ZodString;
        priority: z.ZodNumber;
    }, z.core.$strip>>;
    clientId: z.ZodOptional<z.ZodString>;
    provider: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodEmail>;
}, z.core.$strip>;
```

Source: `packages/core-server/src/components/auth/authenticate/controllers/factory.ts`

## `MembershipRoleManager`

*class*

`g2` axis (`g2(r.sub, r.dom)`): membership holds when the user joined the request domain or any
ancestor of it, walking the shared per-request domain-hierarchy overlay. Memberships are
per-principal and rebuilt every request, so `clear()` wipes all.

```ts
export declare class MembershipRoleManager extends BaseRoleManager implements RoleManager {
    private readonly overlay?;
    private memberships;
    constructor(opts: {
        overlay?: Map<string, Set<string>>;
    });
    clear(): Promise<void>;
    addLink(user: string, domain: string): Promise<void>;
    deleteLink(user: string, domain: string): Promise<void>;
    /** True when `name1` (user) joined `name2` (request domain) itself, or any ancestor of it. Walks UP from the request domain only - walking down from every joined domain would fan out over the whole subtree. */
    syncedHasLink(name1: string, name2: string): boolean;
    /** Local membership state only, not the shared graph - correct for hasLink, incomplete for casbin's management API. */
    getRoles(name: string): Promise<string[]>;
    getUsers(name: string): Promise<string[]>;
}
```

Source: `packages/core-server/src/components/auth/authorize/role-managers/membership.ts`

## `PolicyConnectorResolver`

*class*

Connector-resolution logic shared by every adapter/loader reading the casbin policy store.

```ts
export declare class PolicyConnectorResolver {
    /** Resolve the wired connector off a policy datasource, once the datasource is open (one that opens on first use opens here). */
    static resolve(opts: {
        source: ICasbinPolicySource;
        caller: string;
    }): Promise<TCasbinPolicyConnector>;
}
```

Source: `packages/core-server/src/components/auth/authorize/adapters/connector.ts`

## `PolicyLineCodec`

*class*

Serializes casbin policy state to/from plain string lines. Pure - no pool, no cache, no
lifecycle; every method takes exactly what it needs from the caller instead of holding state.

```ts
export declare class PolicyLineCodec {
    /** Extract a user's lines from an ISOLATED throwaway enforcer (own model + adapter), never a pooled serving one, so concurrent requests cannot change what we cache. */
    static extractUserLines(opts: {
        casbin: typeof import('casbin');
        model: CasbinModelType;
        adapter: ICasbinEnforcerOptions['adapter'];
        user: IAuthorizationUser;
    }): Promise<string[]>;
    /** Serialize ALL p-types and g-types (not just `p`/`g`) back into casbin lines so the cached payload is complete for the scoped model; it reads stored rules, so the loader needs no matching funcs registered. */
    static extractLinesFrom(opts: {
        enforcer: CasbinEnforcerType;
    }): Promise<string[]>;
    /** Atomically reset a borrowed enforcer's model to exactly `lines` + rebuild role links. */
    static loadLinesIntoModel(opts: {
        enforcer: CasbinEnforcerType;
        lines: string[];
        helper: typeof CasbinHelperType;
    }): Promise<void>;
}
```

Source: `packages/core-server/src/components/auth/authorize/enforcers/policy-line-codec.ts`

## `PrincipalPolicyEdges`

*class*

The `kind` values of a `TPrincipalPolicyRow`: which branch of the principal-policy statement produced the row.

```ts
export declare class PrincipalPolicyEdges {
    static readonly DIRECT = "direct";
    static readonly ROLE_EDGE = "roleEdge";
    static readonly ROLE_GRANT = "roleGrant";
    static readonly DOMAIN_EDGE = "domainEdge";
}
```

Source: `packages/core-server/src/components/auth/authorize/adapters/scoped-casbin/policy-edges.ts`

## `RequestTrackerComponent`

*class*

Installs the request spy middleware on the application server, which tracks each request.

```ts
export declare class RequestTrackerComponent extends BaseComponent {
    private application;
    static readonly REQUEST_TRACKER_MW_BINDING_KEY: string;
    constructor(application: BaseApplication);
    /** No `requestId()` here: the id is installed by `RestApplication.registerDefaultMiddlewares()`, which runs first and uses `RequestIdGenerator`. Same UUID v4 shape hono's own default produces, but hono calls `crypto.randomUUID` unguarded, and a browser leaves that one `undefined` outside a secure context. */
    binding(): ValueOrPromise<void>;
}
```

Source: `packages/core-server/src/components/request-tracker/component.ts`

## `ResourceRoleManager`

*class*

Resource-axis (`g4`) role manager: `addMatchingFunc` would set `hasPattern` and disable DefaultRoleManager's O(1) fast path, so prefix ancestors are walked manually; `addLink` must stay idempotent because `buildRoleLinks` re-adds every edge once per request.

```ts
export declare class ResourceRoleManager extends BaseRoleManager implements RoleManager {
    private parents;
    constructor();
    clear(): Promise<void>;
    addLink(child: string, parent: string): Promise<void>;
    deleteLink(child: string, parent: string): Promise<void>;
    syncedHasLink(name1: string, name2: string): boolean;
    getRoles(name: string): Promise<string[]>;
    getUsers(name: string): Promise<string[]>;
    /** All stored prefix ancestors of a dotted code (`a.b.c` -> `a.b` -> `a`), not only the deepest, plus a literal stored `'*'` node - `objectMatch(anything, '*')` is always true, so a `g4` edge whose child is `'*'` must stay reachable from every request object. */
    private collectStoredAncestors;
}
```

Source: `packages/core-server/src/components/auth/authorize/role-managers/resource.ts`

## `ScalarUIProvider`

*class*

Renders the Scalar UI. Needs the optional `@scalar/hono-api-reference` package, and throws on render when it is not installed.

```ts
export declare class ScalarUIProvider extends BaseHelper implements IUIProvider {
    constructor();
    render(context: Context, config: IUIConfig, next: Next): Promise<Response | void>;
}
```

Source: `packages/core-server/src/components/api-reference/ui/scalar.ts`

## `ScopedCasbinAdapter`

*class*

Filtered casbin adapter for the scoped RBAC model: loads ONE principal's edges (role assignments,
memberships, grants) plus the shared structural hierarchy trees as casbin lines. Read-only.

EVERY branch below must select by `variant = <known value>` or `variant IN (<known values>)`.
Never `variant NOT IN (...)`, and never a bare select that classifies afterwards. Applications
store their own edge kinds in this same table (declared via `extraVariants`), and an exclusion
filter would sweep those unknown rows into a branch that has no idea what they mean. The current
shape makes an undeclared variant inert, which is what makes sharing the table safe.

```ts
export declare class ScopedCasbinAdapter extends BaseFilteredAdapter<IScopedCasbinPolicyFilter> {
    protected readonly entities: IScopedCasbinEntities;
    protected readonly customGrantExpander: CustomGrantExpander;
    protected readonly resolveDomainEdges?: TResolveDomainEdgesFn;
    constructor(opts: {
        dataSource: ICasbinPolicySource;
        entities: IScopedCasbinEntities;
        resolveDomainEdges?: TResolveDomainEdgesFn;
    });
    /**
     * One wave: the principal-scoped CTE and the merged structural-edges query are issued together -
     * the role closure resolves in SQL, so neither waits on the other. `resolveDomainEdges` cannot
     * join that wave - it needs the domain closure the principal-scoped CTE produces - but it does
     * not wait for the structural-edges query either: both run concurrently once the closure is known.
     */
    loadFilteredPolicy(model: Model, filter: IScopedCasbinPolicyFilter): Promise<void>;
    /** Route one `direct` row to its casbin line, or to the grant batch. */
    protected collectDirectRow(opts: {
        row: TPrincipalPolicyRow;
        principal: {
            type: string;
            id: IdType;
        };
        lines: string[];
        directGrants: TGrantRow[];
    }): void;
    /**
     * Calls the `resolveDomainEdges` hook, if supplied, and turns its edges into `g3` lines using
     * the same shape the DOMAIN_EDGE branch emits. A throwing hook is logged and treated as no
     * edges - the rows already gathered for this principal still load. This is the safe direction:
     * a missing hierarchy edge can only narrow what `g`/`g2`/`g3` reach, never widen it, so the
     * failure degrades to less access rather than either an outage or excess access.
     */
    protected resolveDomainEdgeLines(opts: {
        principal: {
            type: string;
            id: IdType;
        };
        domains: string[];
    }): Promise<string[]>;
    /** Schema for a table, defaulting to `public`. */
    protected schemaOf(table: {
        schemaName?: string;
    }): string;
    /** The casbin domain token, built from the stored pair - one expression for every SELECT so they cannot drift. NULL reaches `buildGrantLines` as `ANY_MEMBER`. The alias is emitted raw for the same reason as in `softDeleteClause`: quoting folds it to a different case than the unquoted FROM alias. */
    protected domainTokenSelection(opts: {
        alias: string;
    }): SQL;
    /** Schema-qualified table reference (`"<schema>"."<table>"`) for use after FROM/JOIN with an alias. */
    protected qualifiedTable(opts: {
        table: {
            schemaName?: string;
            tableName: string;
        };
    }): SQL;
    /** `AND <alias>.<col> IS NULL` when soft-delete is on, else empty. The alias is emitted raw to match the unquoted FROM alias - quoting folds it to a different case and breaks the join. */
    protected softDeleteClause(opts: {
        alias: string;
    }): SQL;
    /** One statement for everything scoped to a principal: its own edges, the role_inherits edges reachable from its roles, and the grants of that closure. `UNION` in the recursive term is what terminates a cyclic role graph. */
    protected queryPrincipalPolicies(opts: {
        principal: {
            type: string;
            id: IdType;
        };
    }): Promise<TPrincipalPolicyRow[]>;
    /** Turn fetched grant rows into casbin lines. Shared by the direct and role-closure branches. */
    protected buildGrantLines(opts: {
        subjectType: string;
        rows: TGrantRow[];
    }): Promise<string[]>;
    /** The two code-fixed structural trees only (`g4` resource, `g5` action) - constant regardless of tenant count. Domain edges (`g3`) grow with the domain count, so they are principal-scoped in {@link queryPrincipalPolicies} instead. */
    protected queryEdgePolicies(): Promise<string[]>;
}
```

Source: `packages/core-server/src/components/auth/authorize/adapters/scoped-casbin/adapter.ts`

## `ServerApplication`

*class*

Adds the listening server (`Bun.serve`) on top of `RestApplication` - the only layer that touches a socket, so it is the layer that stays out of the browser-pure kernel.

```ts
export declare abstract class ServerApplication<AppEnv extends Env = Env, AppSchema extends Schema = {}, BasePath extends string = '/'> extends RestApplication<AppEnv, AppSchema, BasePath> implements IServerApplication<AppEnv, AppSchema, BasePath> {
    /** Which runtime is underneath, and the socket once one is bound. Both live here, not on `RestApplication`: a browser Worker has neither. `start()` refuses to run unless this is Bun. */
    protected runtime: "bun" | undefined;
    protected serverInstance?: TBunServerInstance;
    /** Widened by this layer, which is the only one that binds a socket. Assigned by the base constructor - `declare` so no field initializer runs here and overwrites it with `undefined`. */
    protected configs: IServerApplicationConfigs;
    /**
     * The address resolution the kernel deliberately does not do: `host` and `port` mean nothing to a
     * host with no socket, and resolving them there silently configured every browser Worker with
     * `localhost:3000`. Env is the fallback, explicit config always wins.
     */
    constructor(opts: {
        scope: string;
        config: IServerApplicationConfigs;
    });
    /** Both routers are `OpenAPIHono` (see `createRouter`). */
    protected server: {
        hono: OpenAPIHono<AppEnv, AppSchema, BasePath>;
    };
    protected rootRouter: OpenAPIHono<AppEnv, AppSchema, BasePath>;
    /** Always an `OpenAPIHono`, whatever else is loaded: the API reference reads `rootRouter.openAPIRegistry`. */
    protected createRouter(opts: {
        strict: boolean;
    }): OpenAPIHono<AppEnv, AppSchema, BasePath>;
    getServer(): OpenAPIHono<AppEnv, AppSchema, BasePath>;
    getRootRouter(): OpenAPIHono<AppEnv, AppSchema, BasePath>;
    /** Restores the pre-split default: a server-capable application installs `hono/context-storage` unless the caller opts out explicitly. */
    protected getDefaultAsyncContextEnabled(): boolean;
    /** `configs.projectRoot` wins, else the process cwd. The value is bound AND handed to `ModuleUtility`, so every peer lookup (optional modules, the gRPC adapter) resolves under it - a compiled binary sets it to where its `node_modules` really is. */
    getProjectRoot(): string;
    getServerHost(): string;
    getServerPort(): number;
    getServerAddress(): string;
    /** `configs.server` with unset keys dropped, so a missing option keeps Bun's default instead of passing `undefined`. */
    protected getServerRuntimeOptions(): IServerRuntimeConfigs;
    /** What `start()` checks. A seam for the guard's test: the `Bun` global cannot be hidden from inside Bun. */
    protected getRuntimeSnapshot(): IRuntimeSnapshot;
    getServerInstance<T extends TBunServerInstance = TBunServerInstance>(): T | undefined;
    protected startBunModule(): Promise<unknown>;
    start(): Promise<void>;
    /** Post-stop hooks, then the server, then the datasources - closed even when the server fails to, so a stopped application holds no connection. */
    stop(): Promise<void>;
    /** Set once `installShutdownSignals` ran; holds the way back, so a second call is a no-op. */
    protected shutdownSignals?: {
        uninstall: () => void;
    };
    /**
     * Stops the application on a signal (SIGTERM and SIGINT by default), then exits the process.
     * Opt-in: nothing is installed until you call it, usually right after `start()`.
     *
     * - Calls `stop()` once. A second signal while it runs is ignored.
     * - Exits 0 when `stop()` finishes, 1 when it throws or does not finish within `timeoutMs`.
     * - Idempotent: calling it again returns the same uninstall function and adds no listener.
     * - Returns an uninstall function that removes the listeners and the pending timeout.
     */
    installShutdownSignals(opts?: IShutdownSignalsOptions): () => void;
    protected stopServer(): Promise<void>;
}
```

Source: `packages/core-server/src/base/applications/server.ts`

## `ServerBootSteps`

*class*

The kernel's step names plus the ones only a server runs - the full vocabulary `BaseApplication.getBootSequence()` publishes for `BootSequence.insertAfter`.

```ts
export declare class ServerBootSteps extends BootSteps {
    static readonly PRINT_START_UP_INFO = "printStartUpInfo";
    static readonly VALIDATE_ENVS = "validateEnvs";
    static readonly HYDRATE_SECRETS = "hydrateSecrets";
    static readonly WIRE_SECRET_ROTATABLES = "wireSecretRotatables";
    static readonly VALIDATE_SCOPE_FILTER_SUPPORT = "validateScopeFilterSupport";
    static readonly SCHEME_SET: Set<string>;
}
```

Source: `packages/core-server/src/base/applications/boot-steps.ts`

## `ServerInfoBindingKeys`

*class*

Container keys of the server info component.

```ts
export declare class ServerInfoBindingKeys {
    static readonly SERVER_INFO_OPTIONS = "@app/server-info/options";
}
```

Source: `packages/core-server/src/components/server-info/common/keys.ts`

## `ServerInfoCacheControls`

*class*

`Cache-Control` values the server info controller sends.

```ts
export declare class ServerInfoCacheControls {
    /** A cached server time is a wrong server time: no cache and no service worker may store the answer. */
    static readonly NO_STORE = "no-store";
}
```

Source: `packages/core-server/src/components/server-info/common/constants.ts`

## `ServerInfoComponent`

*class*

Mounts the server info controller: `GET <path>/time`, public, no authentication.

The rule of this component: it carries only data that is safe to publish and does not help an
attacker. No version, runtime, pid, memory or environment - those stay in the gated
`/health/stats`. It is separate from `HealthCheckComponent` on purpose: operators may lock
`/health/*` away, and client features must not depend on it. `/server/info/*` is public by design.

**Example**
```typescript
import { BaseApplication, ServerInfoComponent, type IServerInfoOptions } from '@venizia/ignis';

abstract class App extends BaseApplication {
  preConfigure(): void {
    const options: IServerInfoOptions = { restOptions: { path: '/clock' } };
    this.component(ServerInfoComponent, { options });
  }
}
```

```ts
export declare class ServerInfoComponent extends BaseComponent<IServerInfoOptions> {
    private application;
    constructor(application: BaseApplication);
    /** Options given at the call site win over anything bound earlier, as in `HealthCheckComponent`. */
    configure(opts?: IServerInfoOptions): Promise<void>;
    binding(): void;
}
```

Source: `packages/core-server/src/components/server-info/component.ts`

## `ServerInfoController`

*class*

Serves `GET <path>/time`, a PUBLIC route with no authentication.

Everything this controller answers must be safe to publish and must not help an attacker: a
clock and a time zone, nothing else. No version, runtime, pid, memory or environment - those
belong to the gated `/health/stats`. A new route here needs that same test.

```ts
export declare class ServerInfoController extends BaseRestController {
    constructor();
    binding(): ValueOrPromise<void>;
}
```

Source: `packages/core-server/src/components/server-info/controller.ts`

## `ServerInfoReporter`

*class*

Assembles what `GET <path>/time` answers. Reads the clock and the process time zone, nothing else.

```ts
export declare class ServerInfoReporter {
    private static readonly MINUTES_PER_HOUR;
    private static readonly MS_PER_SECOND;
    private static readonly MS_PER_MINUTE;
    private static readonly formatters;
    private static getFormatter;
    /** `+07:00` style text for an offset in minutes, positive east of UTC; `+00:00` for UTC itself. */
    static formatUtcOffset(opts: {
        minutes: number;
    }): string;
    /** The process time zone as the runtime resolved it (`TZ`, or the host setting). */
    static resolveTimeZone(): string;
    /**
     * Every field comes from the one `now`, so `server.iso`, `server.epoch` and `utc.iso` name the
     * same instant. The offset is read from the zone AT that instant (a DST change moves it), not
     * from the zone's standard offset.
     */
    static buildTime(opts?: {
        now?: Date;
        timeZone?: string;
    }): IServerTime;
}
```

Source: `packages/core-server/src/components/server-info/reporter.ts`

## `ServerInfoRestPaths`

*class*

Routes of the server info controller, relative to the configured base path.

```ts
export declare class ServerInfoRestPaths {
    static readonly TIME = "/time";
}
```

Source: `packages/core-server/src/components/server-info/common/rest-paths.ts`

## `ServerLoggerStartup`

*class*

What the server does about logging at startup: an application that chose a provider (`LoggerFactory.use`) keeps it;
one that did not gets Winston, the server's logger, when it is installed. Without Winston (an optional peer of the
helpers) the console stays, which is the default provider everywhere. Any other failure to load Winston (a broken
install, a version mismatch) is reported once on the console: the application must not log to the console in
production without a word.

```ts
export declare class ServerLoggerStartup {
    static selectDefault(): Promise<void>;
}
```

Source: `packages/core-server/src/base/applications/common/logger-startup.ts`

## `ServiceAssertionSignerService`

*class*

Mints the outgoing assertion, and publishes the public half for callees to verify against.

Only a service that CALLS OUT needs this. `isEnabled()` is false when the application configured
no keys, and the component then mounts no certs route.

```ts
export declare class ServiceAssertionSignerService extends BaseService {
    private readonly options;
    private readonly requestIdGenerator;
    private privateKey?;
    private jwks?;
    constructor(options: IServiceAuthOptions);
    isEnabled(): boolean;
    /** `<name>_<rest path without its slash>`, so a rotated mount changes the kid rather than colliding. */
    getKeyId(): string;
    /**
     * One assertion, bound to this exact call.
     *
     * `path` must be the percent-ENCODED pathname - `new URL(target).pathname`. The verifier compares
     * against the same shape, and a decoded path here would fail every route carrying a space or a
     * non-ASCII slug.
     */
    sign(opts: {
        method: string;
        path: string;
        audience: string;
    }): Promise<string>;
    /**
     * The document `/svc-certs` serves, built from the PUBLIC key only.
     *
     * `importSPKI` refuses a private PEM outright, which is what makes the private half unreachable
     * from here by construction rather than by care. The JWK format is deliberately NOT accepted for
     * this path: `importJWK` imports whatever it is handed, and a private JWK marked `"ext": true`
     * round-trips its `d` straight into this document. See `JWKSIssuerTokenService.assertPublicJWK`.
     */
    getPublicJWKS(): Promise<{
        keys: JWK[];
    }>;
    private resolvePrivateKey;
    private readKey;
    private assertEnabled;
}
```

Source: `packages/core-server/src/components/auth/authenticate/services/service/signer.service.ts`

## `ServiceAssertionVerifierService`

*class*

Verifies an incoming service assertion against the CALLER's own JWKS.

What the assertion covers, and nothing else: the HTTP method and the percent-encoded path. It does
NOT cover the query string, any header, or the body. Tenant selectors in particular are usually a
header or a query parameter, so an assertion alone does not authenticate which tenant a call acts
on - the caller allowlist and the application's own scoping have to do that. Stated because the
gap is invisible from the call site.

```ts
export declare class ServiceAssertionVerifierService extends BaseService {
    private readonly options;
    /** One remote key set per caller, kept because `createRemoteJWKSet` owns its own cache. */
    private readonly keySets;
    /** Per-caller accepted age, resolved once alongside its key set. */
    private readonly acceptMaxAges;
    constructor(options: IServiceAuthOptions);
    /**
     * @param path The percent-ENCODED pathname, from `new URL(context.req.url).pathname`. Never
     * `context.req.path` - Hono decodes that one, and the caller signed the encoded form.
     */
    verify(opts: {
        token: string;
        method: string;
        path: string;
    }): Promise<{
        issuer: string;
    }>;
    /**
     * Reads `iss` WITHOUT verifying, only to choose which key set checks the signature. The same value
     * is then enforced as the expected issuer, so a forged `iss` buys nothing beyond selecting the key
     * set that will reject it.
     */
    private readIssuer;
    private resolveKeySet;
    private runVerify;
    private assertRequestBinding;
}
```

Source: `packages/core-server/src/components/auth/authenticate/services/service/verifier.service.ts`

## `ServiceAuthenticationStrategy`

*class*

Proves the CALLING SERVICE, from a per-request Ed25519 assertion verified against that caller's
own JWKS. No identity round trip and no shared password.

It proves which service called, never which user. `resolvePrincipal` is where the application
turns a caller name into one of its own principals.

```ts
export declare class ServiceAuthenticationStrategy<E extends Env = Env> extends BaseHelper implements IAuthenticationStrategy<E> {
    private readonly verifier;
    private readonly options;
    name: string;
    constructor(verifier: ServiceAssertionVerifierService, options: IServiceAuthOptions<E>);
    authenticate(context: TContext<E, string>): Promise<IAuthUser>;
}
```

Source: `packages/core-server/src/components/auth/authenticate/strategies/service.strategy.ts`

## `ServiceCertsController`

*class*

Publishes this service's assertion-signing public key. Mounted only when signing keys are configured.

```ts
export declare class ServiceCertsController extends BaseRestController {
    private readonly signer;
    constructor(signer: ServiceAssertionSignerService, path: string);
    binding(): ValueOrPromise<void>;
}
```

Source: `packages/core-server/src/components/auth/authenticate/controllers/service-certs/controller.ts`

## `ServiceCertsRouteConfigs`

*const*

Unauthenticated by design: it serves the PUBLIC key a callee needs to verify this service's
assertions. Whoever can reach it learns only which key signs, which is what verification requires.

The schema names public members only. That is documentation, not a filter - a zod response schema
does not strip anything - so the guard that private material never gets here lives in the signer.

```ts
export declare const ServiceCertsRouteConfigs: {
    readonly GET_SERVICE_CERTS: {
        readonly path: "/";
        readonly method: "get";
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
                            keys: z.ZodArray<z.ZodObject<{
                                kty: z.ZodString;
                                kid: z.ZodOptional<z.ZodString>;
                                use: z.ZodOptional<z.ZodString>;
                                alg: z.ZodOptional<z.ZodString>;
                                crv: z.ZodOptional<z.ZodString>;
                                x: z.ZodOptional<z.ZodString>;
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
                            keys: z.ZodArray<z.ZodObject<{
                                kty: z.ZodString;
                                kid: z.ZodOptional<z.ZodString>;
                                use: z.ZodOptional<z.ZodString>;
                                alg: z.ZodOptional<z.ZodString>;
                                crv: z.ZodOptional<z.ZodString>;
                                x: z.ZodOptional<z.ZodString>;
                            }, z.core.$strip>>;
                        }, z.core.$strip>;
                    };
                };
                required: boolean | undefined;
            };
        };
    };
};
```

Source: `packages/core-server/src/components/auth/authenticate/controllers/service-certs/definitions.ts`

## `SwaggerUIProvider`

*class*

Renders the Swagger UI. Needs the optional `@hono/swagger-ui` package, and throws on render when it is not installed.

```ts
export declare class SwaggerUIProvider extends BaseHelper implements IUIProvider {
    constructor();
    render(context: Context, config: IUIConfig, next: Next): Promise<Response | void>;
}
```

Source: `packages/core-server/src/components/api-reference/ui/swagger.ts`

## `TBunServerInstance`

*type*

Lives here, not in the kernel: `Bun.serve` resolves only through `@types/bun`, and emitting `Bun` into the kernel's published `.d.ts` would force that dependency on every browser consumer of `@venizia/ignis-kernel`. This package legitimately has Bun types - it is the layer that calls `Bun.serve`.

```ts
export type TBunServerInstance = ReturnType<typeof Bun.serve>;
```

Source: `packages/core-server/src/base/applications/server.ts`

## `TCasbinPolicyConnector`

*type*

Drizzle connector for policy queries, typed on the shared `PgDatabase` base so postgres-js fits too. Declared here rather than imported from `@/connectors/postgres`: components depend on a minimal local contract, never a connector class.

```ts
export type TCasbinPolicyConnector = PgDatabase<PgQueryResultHKT, Record<string, AnyType>>;
```

Source: `packages/core-server/src/components/auth/authorize/adapters/common/types.ts`

## `TCustomGrantRow`

*type*

A custom row that survived {@link CustomGrantExpander.rejectCustomRow}, ready for op-to-catalog resolution.

```ts
export type TCustomGrantRow = {
    subjectId: IdType;
    objectSubject: string;
    ops: string[];
    domain: string;
    effect: string;
};
```

Source: `packages/core-server/src/components/auth/authorize/adapters/custom-grant-expander.ts`

## `TDocumentUIType`

*type*

One of the `DocumentUITypes` values.

```ts
export type TDocumentUIType = TConstValue<typeof DocumentUITypes>;
```

Source: `packages/core-server/src/components/api-reference/common/types.ts`

## `TDomainHierarchyEdge`

*type*

A parent-child edge between two domain tokens, in the `<Type>_<id>` form, as returned by `TResolveDomainEdgesFn`.

```ts
export type TDomainHierarchyEdge = {
    child: string;
    parent: string;
};
```

Source: `packages/core-server/src/components/auth/authorize/adapters/scoped-casbin/common/types.ts`

## `TGrantRow`

*type*

A grant row as fetched, before it becomes casbin lines. Permission columns are null when the join misses.

```ts
export type TGrantRow = {
    subjectId: IdType;
    objectCode: TNullable<string>;
    objectSubject: TNullable<string>;
    objectMethod: TNullable<string>;
    action: TNullable<string>;
    effect: TNullable<string>;
    domain: TNullable<string>;
    metadata?: unknown;
};
```

Source: `packages/core-server/src/components/auth/authorize/adapters/scoped-casbin/common/types.ts`

## `TPermissionCommonColumns`

*type*

Drizzle column set of the permission table: text `code`, `name`, `method`, `subject`, `action`, `scope` (all not null) and a nullable `description`.

```ts
export type TPermissionCommonColumns = {
    code: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
    name: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
    method: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
    subject: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
    action: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
    scope: NotNull<PgTextBuilderInitial<string, [string, ...string[]]>>;
    description: PgTextBuilderInitial<string, [string, ...string[]]>;
};
```

Source: `packages/core-server/src/components/auth/models/entities/permission.model.ts`

## `TPermissionOptions`

*type*

Options of the permission table builder; `idType` selects the primary key type.

```ts
export type TPermissionOptions = {
    idType?: TIdSchemaType;
};
```

Source: `packages/core-server/src/components/auth/models/entities/permission.model.ts`

## `TPolicyDefinitionCommonColumns`

*type*

Drizzle column set shared by every policy-definition table; `ExtraVariant` widens the allowed `variant` values and `Metadata` types the `metadata` column.

```ts
export type TPolicyDefinitionCommonColumns<ExtraVariant extends string = never, Metadata extends object = TSubsetGrantMetadata> = ReturnType<typeof buildCommonPolicyDefinitionColumns<ExtraVariant, Metadata>>;

/** Column shape is inferred, never hand-declared, so it can never drift from the `$type<>()` narrowing below. */
declare const buildCommonPolicyDefinitionColumns: <ExtraVariant extends string = never, Metadata extends object = TSubsetGrantMetadata>() => {
    metadata: import("drizzle-orm").$Type<import("drizzle-orm/pg-core").PgJsonbBuilderInitial<"metadata">, Metadata>;
    variant: import("drizzle-orm").NotNull<import("drizzle-orm").$Type<PgTextBuilderInitial<"variant", [string, ...string[]]>, "join_domain" | "assign_role" | "grant" | "role_inherits" | "domain_inherits" | "resource_inherits" | "action_inherits" | ExtraVariant>>;
    subjectType: import("drizzle-orm").NotNull<PgTextBuilderInitial<"subject_type", [string, ...string[]]>>;
    targetType: import("drizzle-orm").NotNull<PgTextBuilderInitial<"target_type", [string, ...string[]]>>;
    domainType: PgTextBuilderInitial<"domain_type", [string, ...string[]]>;
    action: PgTextBuilderInitial<"action", [string, ...string[]]>;
    effect: import("drizzle-orm").$Type<PgTextBuilderInitial<"effect", [string, ...string[]]>, TAuthorizationDecision>;
};
```

Source: `packages/core-server/src/components/auth/models/entities/columns.ts`

## `TPolicyDefinitionOptions`

*type*

Options of the policy-definition table builder; `idType` selects the key type and `extraVariants` declares app-defined variants.

```ts
export type TPolicyDefinitionOptions<ExtraVariant extends string = never> = {
    idType?: TIdSchemaType;
    /**
     * App-only edge kinds stored in this same table alongside IGNIS's seven (e.g. `merchant_role`).
     * `ScopedCasbinAdapter` never selects an undeclared variant - it is purely the consumer's data.
     * Pass as an inline array literal; the `const` type parameter below infers the literal union
     * from it without needing `as const`.
     */
    extraVariants?: ReadonlyArray<ExtraVariant>;
};
```

Source: `packages/core-server/src/components/auth/models/entities/policy-definition.model.ts`

## `TPolicyLineLoader`

*type*

Computes a user's policy lines on a cache miss - CasbinAuthorizationEnforcer wires this to its isolated-enforcer extraction (PolicyLineCodec.extractUserLines).

```ts
export type TPolicyLineLoader = (opts: {
    user: IAuthorizationUser;
}) => Promise<string[]>;
```

Source: `packages/core-server/src/components/auth/authorize/enforcers/user-policy-line-cache.ts`

## `TPrincipalPolicyRow`

*type*

A row from the single principal-policy statement; `kind` says which branch produced it.

```ts
export type TPrincipalPolicyRow = TGrantRow & {
    kind: TConstValue<typeof PrincipalPolicyEdges>;
    variant: string;
    targetType: TNullable<string>;
    targetId: IdType;
};
```

Source: `packages/core-server/src/components/auth/authorize/adapters/scoped-casbin/policy-edges.ts`

## `TResolveDomainEdgesFn`

*type*

Per-principal domain edges sourced from business data the app already owns (e.g. a tenant
foreign key) - read live on every cache miss, never duplicated into `domain_inherits`. An app
whose hierarchy genuinely lives in `domain_inherits` rows does not need this hook at all: the
DOMAIN_EDGE branch above already emits those as `g3` lines. `domains` is the principal's own
domain closure, already `<Type>_<id>` tokens; the returned edges must be too - neither side
re-formats them.

`domains` is the principal's **membership closure** - built from `join_domain` rows plus both
ends of every `domainEdge` row. It is NOT the set of domains the principal holds a role in via
`assign_role`: a principal can carry `assign_role` at a domain it never joined. A hook ported
from a mechanism that derived its domains from `assign_role` will silently lose access for
exactly those principals - no error, no log, just fewer edges reaching `g`/`g2`/`g3` than before.

More than one hierarchy axis (e.g. an organizer tree and a separate region tree)? Write one
function per axis and concatenate their results here - this hook deliberately takes a single
function, so composition stays visible in the application, not hidden inside the framework:
`resolveDomainEdges: async opts => [...(await organizerEdges(opts)), ...(await regionEdges(opts))]`.

```ts
export type TResolveDomainEdgesFn = (opts: {
    principal: {
        type: string;
        id: IdType;
    };
    domains: string[];
}) => Promise<TDomainHierarchyEdge[]>;
```

Source: `packages/core-server/src/components/auth/authorize/adapters/scoped-casbin/common/types.ts`

## `TRpcHandler`

*type*

Typed handler signature for gRPC RPC methods.

```ts
export type TRpcHandler<RequestType = unknown, ResponseType = unknown, RouteEnv extends Env = Env> = (opts: {
    request: RequestType;
    context: TRouteContext<RouteEnv>;
}) => ValueOrPromise<ResponseType>;
```

Source: `packages/core-server/src/base/controllers/grpc/common/types.ts`

## `TRpcMiddleware`

*type*

Pre-built middleware function for gRPC auth enforcement.

```ts
export type TRpcMiddleware<RouteEnv extends Env = Env> = (context: TRouteContext<RouteEnv>, next: Next) => ValueOrPromise<void | Response>;
```

Source: `packages/core-server/src/base/controllers/grpc/common/types.ts`

## `TServerBootStep`

*type*

Union of the step names in `ServerBootSteps`, accepted by `BootSequence.insertAfter` and `skipSteps`.

```ts
export type TServerBootStep = TConstValue<typeof ServerBootSteps>;
```

Source: `packages/core-server/src/base/applications/boot-steps.ts`

## `UIProviderFactory`

*class*

Process-wide registry of UI providers by type; obtain it with `getInstance()`. `register` creates the built-in `swagger` and `scalar` providers and throws for any other type.

```ts
export declare class UIProviderFactory extends MemoryStorageHelper<{
    [key: string | symbol]: IUIProvider;
}> {
    private static instance;
    static getInstance(): UIProviderFactory;
    getProvider({ type }: IGetProviderParams): IUIProvider;
    register(opts: {
        type: string;
    }): void;
    getRegisteredProviders(): (string | number | symbol)[];
}
```

Source: `packages/core-server/src/components/api-reference/ui/factory.ts`

## `useRequestContext`

*const*

Returns the Hono context of the request being handled, or `undefined` outside a request (uses `tryGetContext`, so it never throws).

```ts
export declare const useRequestContext: <AppEnv extends Env = Env>() => import("hono").Context<AppEnv, any, {}> | undefined;
```

Source: `packages/core-server/src/base/metadata/request-context.ts`

## `UserPolicyLineCache`

*class*

Per-user redis cache of casbin policy lines. Owns the cache key, the TTL, and concurrent-miss
de-duplication so N simultaneous misses for the same user collapse onto one extraction.

```ts
export declare class UserPolicyLineCache extends BaseHelper {
    private readonly cached;
    private readonly loadLines;
    private readonly pendingLineFetches;
    constructor(opts: {
        cached: ICasbinEnforcerCachedRedis & {
            use: true;
        };
        loadLines: TPolicyLineLoader;
    });
    /** Fetch the user's lines, collapsing concurrent misses per key onto one extraction. Best-effort: two misses may race past the cache read and both extract (benign - per-user lines are identical). */
    fetch(opts: {
        user: IAuthorizationUser;
    }): Promise<string[]>;
    /** Drop the user's cached entry. */
    invalidate(opts: {
        user: IAuthorizationUser;
    }): Promise<{
        cacheKey: string;
        invalidatedKeys: number;
    }>;
    /** Drop then recompute the user's cached entry via `loadLines` - an isolated extraction (never a pooled serving enforcer), so a concurrent request cannot make the cache hold another user's lines. */
    rebuild(opts: {
        user: IAuthorizationUser;
    }): Promise<{
        cacheKey: string;
        lines: string[];
    }>;
    /** Compute the user's cache key and reject an empty result - consistent with the read path. */
    private resolveCacheKey;
    /** Single source of truth for the cache encoding. Used by the miss path and rebuild(). */
    private writeLines;
    /** Decode cached policy lines; on any corruption, log and return null so the caller refetches. */
    private parseLines;
}
```

Source: `packages/core-server/src/components/auth/authorize/enforcers/user-policy-line-cache.ts`

## Re-exported

- `AbstractApplication` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AbstractAuthRegistry` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AbstractCrudController` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AbstractCryptoAlgorithm` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `AbstractDataSource` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `AbstractEntity` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `AbstractLogger` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `AbstractNetworkFetchableHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `AbstractPoolHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `AbstractPostgresDataSource` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `AbstractRedisHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `AbstractRepository` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `AbstractRestController` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AbstractSecretsHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `AbstractTemporalHelper` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `AbstractWorkerBusHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `AbstractWorkerHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `AbstractWorkerMessageBusHandlerHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `AbstractWorkerThreadHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `AES` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `AESAlgorithms` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `AESAlgorithmType` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `AnyObject` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `AnyObjectSchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AnyType` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `api` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AppEnvs` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `applicationEnvironment` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ApplicationEnvironment` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ApplicationError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `ArtifactGroup` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `ArtifactIndexFields` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ArtifactNamespaces` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `ArtifactTypes` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `AuditFields` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `authenticate` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthenticateBindingKeys` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthenticateStrategy` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `Authentication` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthenticationErrors` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthenticationFieldCodecs` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthenticationModes` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthenticationProvider` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthenticationStrategyRegistry` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthenticationTokenTypes` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `Authorization` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthorizationActions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthorizationDecisions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthorizationDomainScopes` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthorizationDomainSources` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthorizationEnforcerRegistry` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthorizationEnforcerTypes` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthorizationErrors` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthorizationPermissionBuilder` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthorizationPolicyBuilder` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthorizationPolicyVariants` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthorizationProvider` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthorizationRole` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthorizationRoles` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `authorize` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthorizeBindingKeys` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `AuthorizeModelFormats` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `BaseAppErrorMiddleware` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `BaseComponent` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `BaseConfiguration` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `BaseCryptoAlgorithm` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `BaseDataSource` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `BaseEntity` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `BaseHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `BaseLogger` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `BaseNetworkRequest` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `BaseNetworkTcpClient` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `BaseNetworkTcpServer` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `BasePoolHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `BasePostgresDataSource` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `BasePostgresEntity` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `BaseProvider` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `BaseRelationalEntity` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `BaseRestController` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `BaseService` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `BaseStorageHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `BaseWorkerBusHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `BaseWorkerHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `BaseWorkerMessageBusHandlerHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `BaseWorkerThreadHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `bidiStream` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `BigIntIdType` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `BigIntModes` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `Binding` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `BindingKeys` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `BindingNamespaces` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `BindingScopes` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `BindingValueTypes` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `BodyLimits` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `BootSequence` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `BootSteps` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `BuildInfoRegistry` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `BullQueueRoles` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `CasbinDomainMatchingFunctions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `CasbinEnforcerCachedDrivers` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `CasbinEnforcerModelDrivers` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `CasbinRuleVariants` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ChangePasswordRequestSchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `Child` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ClassResolver` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `clientStream` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `COMBINING_MARKS_PATTERN` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `commonResponseHeaders` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `CommonStatuses` from [`@venizia/ignis-kernel/statuses`](/references/api/venizia-ignis-kernel-statuses)
- `component` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `CompressEncodings` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `configuration` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `ConsoleLogger` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `Container` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `CONTENT_TYPE_BY_EXTENSION` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `ContentDispositionTypes` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ContentTypes` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `ContentTypeTable` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `ContextUtility` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `controller` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ControllerTransports` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `CoreBindings` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `CoreErrorCodes` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `countableHeaders` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `CountSchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `CredentialAlgorithms` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `CredentialHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `CrudControllerFactory` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `CrudRoutes` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `D_STROKE_REPLACEMENTS` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `DATA_SOURCE_BRAND` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `DataRangeUtility` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `datasource` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `DataSourceDrivers` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `DataSourceOpenDefaults` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `DataSourceOpenModes` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `DataTypes` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `DayjsTemporalAdapter` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `DEFAULT_CIPHER_BITS` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `DEFAULT_CREDENTIAL_ALGORITHM` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `DEFAULT_HASH_OUTPUT_ENCODING` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `DEFAULT_KDF_DIGEST` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `DEFAULT_KDF_ITERATIONS` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `DEFAULT_KDF_SALT` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `DEFAULT_LIMIT` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `DEFAULT_MAX_LIMIT` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `DEFAULT_NUMERIC_LENGTH` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `DEFAULT_TEMPORAL_LOCALE` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `DEFAULT_TEMPORAL_PATTERN` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `DEFAULT_TEMPORAL_TZ` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `DEFAULT_TOKEN_BYTES` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `DEFAULT_UID_DELIMITER` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `DEFAULT_UID_LENGTH` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `DEFAULT_UID_MAX_ATTEMPTS` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `DefaultCRUDRepository` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `defaultRequestHeaders` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `Defaults` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `del` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `DiskHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `DurationAliases` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `DurationMultipliers` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `DurationUnits` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `ECDH` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ECDHAlgorithmType` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `EchoUtility` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `EmojiFaviconMiddleware` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `Environment` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `EnvironmentNames` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ErrorLogLevels` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `ErrorPrettier` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ErrorSchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ErrorScopes` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `ErrorUtility` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `EventBus` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `EventDispatchRetry` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `EventHandlerTypes` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `FC` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `FieldMappingDataTypes` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `FieldsSchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `FileExtensions` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `FilterKeys` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `FilterQuerySchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `FilterSchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `findResponseHeaders` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `FormBodyUtility` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `fromError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `get` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `getError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `GrantBuilder` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `GRPC` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `Hash` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `HashAlgorithms` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `HashOutputEncodings` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `HF_MESSAGE_MAX_BYTES` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `HF_SCOPE_MAX_BYTES` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `HfLogFlusher` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `HfLogger` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `HfQueueHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `HookUtility` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `HrTimeUtility` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `HTTP` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `IAESKeyringEntry` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IApplication` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IApplicationEnvironment` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IApplicationInfo` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IArtifactGroup` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `IArtifactIndex` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `IArtifactMetadata` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `IArtifactRegistrationMixin` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IArtifactRegistrationOptions` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `IAuthenticateOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IAuthenticationStrategy` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IAuthorizationDomainSource` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IAuthorizationEnforcer` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IAuthorizationRequest` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IAuthorizationRole` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IAuthorizationSpec` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IAuthorizationUser` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IAuthorizeOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IAuthRouteConfig` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IAuthService` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IAuthUser` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IBaseMiddlewareOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IBindingTag` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `IBindRouteOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IBodyLimitOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IBootSequenceStep` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IBucketInfo` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IBucketRef` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IBuildInfo` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IBuildOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IBunServer` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IBunWebSocketConfig` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IBunWebSocketHandler` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ICasbinEnforcerCachedRedis` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ICasbinEnforcerOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ICasbinRules` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IClock` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IComponentMixin` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ICompressOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IConditionalArtifactIndex` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IConfigurable` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `IConfiguration` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IConfigurationMixin` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IConnectRpcModule` from [`@venizia/ignis/grpc`](/references/api/venizia-ignis-grpc)
- `IController` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IControllerMixin` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IControllerOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ICORSOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ICreatableRepository` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `ICrudControllerOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ICrudRepository` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `ICryptoAlgorithm` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ICSRFOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ICustomizableRoutes` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IDatabaseExtraOptions` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `IDatabaseTransaction` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `IDatabaseTransactionOptions` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `IDataSource` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `IDataSourceCapabilities` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IDataSourceMetadata` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IDataSourceOpening` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IDataSourceOpenOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IDayjsFactory` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `IDayjsInstance` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `IDefinedEntity` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IDefineRouteOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IDeletableRepository` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `IDiskHelperOptions` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IDomainEvent` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IdSchemaTypes` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IdType` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IDuration` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `IECDHEncryptedPayload` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IECDHExtraOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IEntity` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `IEntityStatics` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IErrorKeyRegistry` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `IErrorSummary` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IEventHandler` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IEventHandlerBindingKeyReference` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IEventHandlerFunctionReference` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IEventHandlerRetryOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IExtraOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IFetchable` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IFieldMapping` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `IFileStat` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IGetSecretOptions` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IGrpcControllerMetadata` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IHeightWhereOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IHfLogFlusherOptions` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IHfQueueNode` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IIdGeneratorOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IJWKSHosts` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IJWKSIssuerOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IJWKSVerifierOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IJWKSVerifierVerifyOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IJWSTokenServiceOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IJWTClaimsOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IJWTIssueClaims` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IJWTTokenPayload` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IJWTVerifyOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ILeavesOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IListObjectsOptions` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ILogger` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ILoggerProvider` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ILuxonDateTime` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ILuxonDateTimeFactory` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `IManyRelation` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IMiddlewareConfigs` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IModelAccessSettings` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IModelAccessThroughSettings` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IModelAccessWriteSettings` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IModelAuthorizeSettings` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IModelMetadata` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IModelMigrationSettings` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IModelProperties` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IModelQuerySettings` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IModelRegistryEntry` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IModelSettings` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `InclusionSchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `INetworkTcpClientProps` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `INextOpaqueUidOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `INextTokenUidOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `inject` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `injectable` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `InjectableUtility` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `INodeFetchNetworkRequestOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `INodeFetchRequestOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `INodeWithPath` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IntlTemporalAdapter` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `INumericUidOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IObjectInfo` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IObjectLocation` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IObjectMetadata` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IObjectRef` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IOneRelation` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IOpaqueUidOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IParsedMultipartBody` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IPayloadFieldCodec` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IPersistableRepository` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `IPool` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IPoolControlOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IPoolOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IPoolStats` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IPoolWaiter` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IPostgresDataSource` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `IPostgresError` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IPostPolicy` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IPrintOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IProvideMetadata` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IProvider` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `IQueryHandlerOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IQueryStringOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IQueueCallback` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IReadableRepository` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `IReadRetryOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IRecursiveTreeOptions` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IRedisClusterHelperOptions` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRedisClusterHelperProps` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRedisCommand` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRedisConnection` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRedisHash` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRedisHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IRedisHelperCallbacks` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRedisJson` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRedisKey` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRedisKeyValue` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRedisList` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRedisModuleOption` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRedisPubSub` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRedisSentinelHelperOptions` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRedisSentinelHelperProps` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRedisSet` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRedisSingleHelperOptions` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRedisSingleHelperProps` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRedisSocketMessage` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRelationalQueryDialect` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IRemoteRepositoryMetadata` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IRepository` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `IRepositoryBinding` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IRepositoryMetadata` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IRepositoryMetadataBase` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IRepositoryMixin` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IRequestedExtra` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IRequestedRemark` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IRequestFilterJudge` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `IRequestFilterShape` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `IRequestIdOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IRequestOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IResolvedRepositoryMetadata` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IRestApplication` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IRestComponentConfig` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IRestControllerMetadata` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IRestorableRepository` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IRetryBackoffOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IRetryContext` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IRpcMetadata` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `isApplicationError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `isClass` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `isClassProvider` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `isDatabaseTransaction` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `isDataSourceClass` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ISearchableDataSourceCapabilities` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ISecretHydrateEntry` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ISecretLease` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ISecretLeaseEntry` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ISecretRotatable` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ISecretRotationEvent` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ISecretsHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ISecretsHelperOptions` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ISecretsRegistration` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IServerConfigMixin` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IService` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IServiceAssertionClaims` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IServiceAuthOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IServiceMixin` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ISnowflakeParsedId` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IsolationLevels` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `isoTimestamp` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `isPromiseLike` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `isRedisHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IStatementResult` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `IStaticServeMixin` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IStorageHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IStorageHelperOptions` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IStorageReadCondition` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ITcpSocketClient` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ITcpSocketServerOptions` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ITemporalAdapter` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalDurationParts` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalHelper` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalLocaleNames` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalNamespace` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalParts` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITemporalZonedDateTime` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `ITimerAdapter` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ITokenUidOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ITransaction` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ITransactionOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ITransformedUpdateData` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `ITreeNode` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IUidSegment` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IUpdatableRepository` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `IUploadFile` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IUploadResult` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IUrlSafetyPolicy` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IUuidInspection` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IValidRequestProps` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IWalkAsyncOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IWalkOptions` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `IWebSocket` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IWebSocketClient` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IWebSocketData` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IWebSocketEmitterOptions` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IWebSocketMessage` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IWebSocketServerOptions` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IWithReadRetry` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IWithTransaction` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `IWorker` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IWorkerBus` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IWorkerMessageBusHandler` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IWorkerThread` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `IZonedTemporalParts` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `JOSEStandards` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `JWKSAlgorithms` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `JWKSKeyDrivers` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `JWKSKeyFormats` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `JWKSModes` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `LEADING_OR_TRAILING_HYPHENS_PATTERN` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `LimitSchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `LockStrengths` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `LogFormatUtility` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `LoggerConfigUtility` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `LoggerDebugGate` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `LoggerFactory` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `LoggerFormats` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `LogLevels` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `LuxonTemporalAdapter` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `many` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `MemoryStorageHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `MessageCode` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `MessageTemplate` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `MetadataKeys` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `MetadataRegistry` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `MigrationStatuses` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `MimeTypes` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `MIN_TOKEN_BYTES` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `MIN_UID_ALPHABET_SIZE` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `MINIMUM_KDF_SALT_BYTES` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `MINIMUM_RSA_MODULUS_BITS` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `model` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `ModelFactory` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `ModelTypes` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ModelUtility` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ModuleUtility` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `MultipartStorages` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `NativeTemporalAdapter` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `NetworkTcpClient` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `NetworkTcpServer` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `NetworkTlsTcpClient` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `NetworkTlsTcpServer` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `NetworkUdpClient` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `NodeFetcher` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `NodeFetchNetworkRequest` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `NON_SLUG_CHARACTERS_PATTERN` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `notFoundHandler` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `NotSupportedUtility` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `NumberIdType` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `NumericUidHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ObjectUtility` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `OffsetSchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `one` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `OpaqueUidHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `OpenApiResponses` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `OpenApiSchemas` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `OrderBySchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ParseUtility` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `patch` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `PerformanceUtility` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `PersistableCrudController` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `PersistableRepository` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `PGliteCRUDRepository` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `post` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `PostgresBaseRepository` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `PostgresDataTypeEnricher` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `PostgresErrorCodes` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `PostgresErrors` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `PostgresFilterBuilder` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `PostgresIdEnricher` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `PostgresPrincipalEnricher` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `PostgresQueryDialect` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `PostgresQueryExecutor` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `PostgresQueryOperators` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `PostgresTzEnricher` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `PostgresUserAuditEnricher` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `PromiseUtility` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `PropsWithChildren` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `provide` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `put` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `QueryOperators` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `QueryStringNestedModes` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `QueryStringNullishModes` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `QueryStringSeparators` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `QueryStringUtility` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `QueueStatuses` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ReadableCrudController` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ReadableRepository` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `RecordUtility` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `RecursiveTreeDirections` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `RecursiveTreeSql` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `REDACTED` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `RedactUtility` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `REDIS_HELPER_BRAND` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `RedisClusterHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `RedisConcurrency` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `RedisHelperFactory` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `RedisModes` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `RedisSentinelHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `RedisSentinelRoles` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `RedisSingleHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `RedisUtility` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `RelationalEntityUtility` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `RelationBuilderRegistry` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `RelationDeclarations` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `RelationsFactory` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `RelationTypes` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `repository` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `RepositoryErrorCodes` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `RepositoryErrors` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `RepositoryOperationScopes` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `RepositoryTypes` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `REQUEST_ID_KEY` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `RequestContextRegistry` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `RequestDomainResolver` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `RequestErrors` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `RequestFilterGuard` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `RequestFilterParts` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `RequestIdGenerator` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `RequestUtility` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `ResolverUtility` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `ResponseExtras` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ResponseFormats` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `RestApplication` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `RestBindingKeys` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `RestComponent` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `RestPaths` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `RetryBackoffStrategies` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `RetryHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `RetryJitterModes` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `RoleStatuses` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `RouteConfigResolver` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `RoutePathScopes` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `rpc` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `RSA` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `RSAAlgorithmType` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `RuntimeModules` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `S3Audiences` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `SchemaTypes` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `ScopeFilterMissingBehaviors` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ScopeFilters` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ScopeOperations` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ScopeThrough` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `ScopeWriteGuards` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `SearchErrorCodes` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `SecFetchSiteValues` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `SecretProviders` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `SecretsHelperFactory` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `SequentialQueueHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `serverStream` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `service` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `ServiceAssertion` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `SignInRequestSchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `SignUpRequestSchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `SkipSchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `SlugHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `SnowflakeConfig` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `SnowflakeUidHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `SoftDeletableRepository` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `Sorts` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `Statuses` from [`@venizia/ignis-kernel/statuses`](/references/api/venizia-ignis-kernel-statuses)
- `StorageConcurrency` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `StorageErrors` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `StoragePresignDefaults` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `StoragePresignLimits` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `StorageTypes` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `StorageUtility` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `StringIdType` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `SystemEnvsHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TableColumnCache` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TAbstractClass` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TAbstractConstructor` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TAbstractMixinTarget` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TAESSecret` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TAnyConnector` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TAnyDataSourceSchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TAnyObjectSchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TArtifactCondition` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TArtifactIndexField` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TArtifactIndexInput` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TArtifactType` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TAsyncResolver` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TAuthenticateFn` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TAuthenticationRestOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TAuthMode` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TAuthorizationAction` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TAuthorizationConditions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TAuthorizationDecision` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TAuthorizationDomainResolver` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TAuthorizationDomainScope` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TAuthorizationDomainSource` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TAuthorizationEnforcerType` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TAuthorizationPolicyVariant` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TAuthorizationVoter` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TAuthorizeFn` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TAuthorizeModelFormat` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TAuthStrategy` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TBasicTokenServiceOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TBigIntMode` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TBindingKey` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TBindingNamespace` from [`@venizia/ignis-kernel/metadata`](/references/api/venizia-ignis-kernel-metadata)
- `TBindingScope` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TBindingValueType` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TBootStep` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TBuildInfoRecord` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TBullQueueRole` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TByIdFilter` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TCasbinDomainMatchingFunction` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TCasbinEnforcerCachedDriver` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TCasbinEnforcerModelDriver` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TCasbinRuleVariant` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TChangePasswordRequest` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TClass` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TColumnDefinition` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TColumnDefinitions` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TCompressEncoding` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TConstructor` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TConstValue` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TContentDispositionType` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TContentType` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TContext` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TControllerMetadata` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TControllerTransport` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TCoreErrorCode` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TCount` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `TCountResponse` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TcpClientStates` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TCreateRedisHelperOptions` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TCredentialAlgorithm` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TCrudRepositoryClass` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TCrudRoutes` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TCustomGrantMetadata` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TCustomizableRouteConfig` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TDataRange` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `TDataSourceDriver` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TDataSourceDriverClass` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TDataSourceOpenMode` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TDataTypeEnricherOptions` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TDataWithRange` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `TDecoratorModelTarget` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TDecoratorTarget` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TDefineAuthControllerOpts` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TDefinedEntityClass` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TDeletedAtColumn` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TDrizzleQueryOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TDurationUnit` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TemporalDurationStyles` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TemporalHelper` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TemporalInclusivities` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TemporalNameWidths` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TemporalUnits` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TemporalWrittenDateStyles` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TEntityDataObject` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TEntityId` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TEntityObject` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TEntityPersistObject` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorByDefinition` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorByField` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorDefinition` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorDefinitionMessage` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorKey` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorLogFormatter` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TErrorLogLevel` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorMessage` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorMessageInput` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorMessageOverride` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorNormalized` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorNormalizeTransformFn` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TErrorResponse` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TErrorScope` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TEventHandlerFunction` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TEventHandlerReference` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TEventHandlerType` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TFetcherLogger` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TFieldMappingDataType` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TFieldMappingNames` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TFields` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TFileExtension` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TFilter` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TFindOneOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TFindOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TFindRangeOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TGetIdType` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TGetTokenExpiresFn` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TGrantIntent` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TGrpcMethod` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TGrpcResultCode` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `THashAlgorithm` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `THashOutputEncoding` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `THfLogLevel` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `THfSink` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `THfSinkBatch` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `THttpMethod` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `THttpProtocol` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `THttpResultCode` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TIdColumn` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TIdEnricherOptions` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TIdEnricherResult` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TIdSchemaType` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `TInclusion` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TInferSchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TInjectionGetter` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TInjectOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TInjectTarget` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TIsAllowedOriginHandler` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TIsAllowedSecFetchSiteHandler` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TIsolationLevel` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TIsoTimestamp` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TJOSEStandard` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TJsonColumnKey` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TJsonPathKey` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TJsonResponse` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TJWKSAlgorithm` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TJWKSKeyDriver` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TJWKSKeyFormat` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TJWKSMode` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TJWKSTokenServiceOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TJWTTokenRole` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TJWTTokenServiceOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TLockConfig` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TLockOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TLockStrength` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TLoggerFormat` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TLogLevel` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TMimeTypes` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TMixinOpts` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TMixinTarget` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TModelAccessSettings` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TModelClass` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TModelType` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TMultipartStorage` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TNodePredicate` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TNullable` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TNumberConstValue` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TObjectFromFieldMappings` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TokenUidHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TOneRelationNameOf` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TOnVisit` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TOnVisitAsync` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TOptions` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TOrderEntry` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TOrigin` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TParsedOrderEntry` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TPGliteDataSource` from [`@venizia/ignis-connectors/postgres/pglite`](/references/api/venizia-ignis-connectors-postgres-pglite)
- `TPlannedGrantRow` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TPolicyDomainInput` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TPrettify` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TPrimaryKey` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TPrincipalEnricherOptions` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TQueryOperatorHandlers` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TQueryStringNestedMode` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TQueryStringNullishMode` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TQueueElement` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TQueueStatus` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `trackableHeaders` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRecursiveTreeDirection` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRedisClient` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TRedisMode` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TRedisSentinelRole` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TreeBuilder` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TreeWalker` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TRegisterErrors` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TRegistryDescriptor` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRelationalConnection` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TRelationalConnector` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TRelationalDriver` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TRelationBuilder` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRelationConfig` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationDefinition` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationDefinitions` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationMetadata` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TRelationType` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRelativeUnit` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TRepositoryDataObject` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRepositoryErrorCode` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRepositoryLogOptions` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRepositoryMetadata` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRepositoryOperationScope` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRepositoryPersistObject` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRepositoryType` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `TRequestContextResolver` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRequestFilterKeyKind` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRequestFilterPart` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `TRequestFilterPiece` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `TResolver` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TResponseBodyOf` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TResponsedError` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TResponseExtra` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TResponseFormat` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TResponseHeaderObject` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TResponseHeaders` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRetryBackoffStrategy` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TRetryJitterMode` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TRouteAuthConfig` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRouteAuthenticateConfig` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRouteAuthorizeConfig` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRouteContext` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRouteHandler` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRoutePathScope` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TRow` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TRuntimeModule` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TS3Audience` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TSchemaType` from [`@venizia/ignis-kernel/repository`](/references/api/venizia-ignis-kernel-repository)
- `TScopeFilterMissingBehavior` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TScopeOperation` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TScopeOperationGroup` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TScopeWriteGuard` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TSearchErrorCode` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TSecFetchSite` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TSecretProvider` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TSecretRotationHandler` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TSelectedRow` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TServiceCallerEntry` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TSignInRequest` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TSignUpRequest` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TSoftDeletableTableSchema` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TSortDirection` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TSqlFragment` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TStorageType` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TStringConstValue` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `TSubsetGrantMetadata` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TTableColumns` from [`@venizia/ignis-connectors/relational`](/references/api/venizia-ignis-connectors-relational)
- `TTableInsert` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TTableObject` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TTableSchemaWithId` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TTask` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TTcpClientState` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TTemporalDurationStyle` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalFields` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalInclusivity` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalInput` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalMonthNameWidth` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalNameWidth` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalUnit` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTemporalWrittenDateStyle` from [`@venizia/ignis-helpers/temporal`](/references/api/venizia-ignis-helpers-temporal)
- `TTimerHandle` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TTzEnricherOptions` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TTzEnricherResult` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TUidCaseForm` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TUidTokenEncoding` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TUpdateData` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `TUploadNaming` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TUrlScheme` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `TUserAuditColumnOpts` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TUserAuditEnricherOptions` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TUserAuditEnricherResult` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `TValueOrAsyncResolver` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TValueOrResolver` from [`@venizia/ignis-inversion`](/references/api/venizia-ignis-inversion)
- `TVaultAuthMethod` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TWebSocketAuthenticateFn` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TWebSocketClientConnectedFn` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TWebSocketClientDisconnectedFn` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TWebSocketClientState` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TWebSocketEvent` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TWebSocketHandshakeFn` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TWebSocketMessageHandler` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TWebSocketMessageType` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TWebSocketOutboundTransformer` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TWebSocketValidateRoomFn` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `TWhere` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TWhereOperators` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `TWhereValue` from [`@venizia/ignis-filter`](/references/api/venizia-ignis-filter)
- `UidAlphabets` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UidCaseForms` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UidTokenEncodings` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `unary` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `UpdateBuilder` from [`@venizia/ignis-connectors/postgres`](/references/api/venizia-ignis-connectors-postgres)
- `UrlIngest` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `UrlPolicy` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UrlSafetyDefaults` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UrlSafetyErrors` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `UrlSchemes` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UserStatuses` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `UserTypes` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `UUID_PATTERN` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UuidHelper` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UuidNamespaces` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UuidV4Generator` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UuidV5Generator` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `UuidV7Generator` from [`@venizia/ignis-helpers/core`](/references/api/venizia-ignis-helpers-core)
- `ValueOf` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `ValueOptional` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `ValueOptionalExcept` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `ValueOrPromise` from [`@venizia/ignis-helpers/common`](/references/api/venizia-ignis-helpers-common)
- `VaultAuthMethods` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `WebSocketChannels` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `WebSocketClientStates` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `WebSocketDefaults` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `WebSocketEmitter` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `WebSocketEvents` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `WebSocketMessageTypes` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `WebSocketServerHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
- `WhereQuerySchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `WhereSchema` from [`@venizia/ignis-kernel`](/references/api/venizia-ignis-kernel)
- `WorkerPoolHelper` from [`@venizia/ignis-helpers`](/references/api/venizia-ignis-helpers)
