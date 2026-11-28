---
title: "@venizia/ignis (3 of 4)"
description: "Every export of @venizia/ignis, from the built declarations (generated)."
---

# `@venizia/ignis (3 of 4)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 3 of 4 of [`@venizia/ignis`](/references/api/venizia-ignis).

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
    [key: string]: unknown;
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
    protected options: TBindingKeyValue<typeof AuthenticateBindingKeys.JWKS_ISSUER_OPTIONS>;
    protected privateKey: TNullable<CryptoKey | Uint8Array>;
    protected publicKey: TNullable<CryptoKey | Uint8Array>;
    protected jwks: {
        keys: JWK[];
    } | null;
    constructor(options: TBindingKeyValue<typeof AuthenticateBindingKeys.JWKS_ISSUER_OPTIONS>);
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
    private parseJWK;
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
its origin is listed in `jwks.trusted`. The one policy serves the JWKS verifier and the service-assertion
callers: both fetch a key set to decide who may call.

The opt-in is an EXACT origin, never a pattern or a range, in the form the URL parser writes it
(`http://identity-service`, `http://10.0.0.5:8080`, `http://[fd00::1]:8443`). The shape check is the url guard's own
(`UrlPolicy.resolveTrustedOrigins`), so a JWKS entry and a `policy.hosts.trusted` entry follow one rule.

```ts
export declare class JWKSUrlPolicy {
    /** Refuses a `jwks.trusted` list that is not exactly a list of origins, and answers the origins as a set. */
    static resolveTrustedOrigins(opts: {
        scope: string;
        trusted?: unknown;
    }): ReadonlySet<string>;
    /** Whether the URL parser's hostname is a loopback one: `localhost`, `127.0.0.0/8` or `::1`. */
    static isLoopback(hostname: string): boolean;
    /**
     * Parses a JWKS URL and refuses it unless it is `https:`, or `http:` to a loopback host or an origin listed in
     * `jwks.trusted`. Only the host name goes into the message: a URL may carry credentials.
     */
    static assertUrl(opts: {
        scope: string;
        label: string;
        url: string;
        trusted?: unknown;
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
    protected options: TBindingKeyValue<typeof AuthenticateBindingKeys.JWKS_VERIFIER_OPTIONS>;
    protected jwksVerifier: ReturnType<typeof createRemoteJWKSet> | null;
    constructor(options: TBindingKeyValue<typeof AuthenticateBindingKeys.JWKS_VERIFIER_OPTIONS>);
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
    protected options: TBindingKeyValue<typeof AuthenticateBindingKeys.JWS_OPTIONS>;
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
    constructor(options: TBindingKeyValue<typeof AuthenticateBindingKeys.JWS_OPTIONS>);
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

The `edge` values of a `TPrincipalPolicyRow`: which branch of the principal-policy statement produced the row.

```ts
export declare class PrincipalPolicyEdges {
    static readonly DIRECT = "direct";
    static readonly ROLE_EDGE = "roleEdge";
    static readonly ROLE_GRANT = "roleGrant";
    static readonly DOMAIN_EDGE = "domainEdge";
}
```

Source: `packages/core-server/src/components/auth/authorize/adapters/scoped-casbin/policy-edges.ts`

## `RequestFrameMiddleware`

*class*

Makes every request a frame of its own: scoped, with the request, and nothing taken from around it. The user is not
copied: it is read from the request when it is needed, so an authentication that runs later is seen.

```ts
export declare class RequestFrameMiddleware {
    static create(): MiddlewareHandler;
}
```

Source: `packages/core-server/src/base/execution/request-frame.middleware.ts`

## `RequestTrackerComponent`

*class*

Installs the request spy middleware on the application server, which tracks each request.

```ts
export declare class RequestTrackerComponent extends BaseComponent {
    private application;
    static readonly REQUEST_TRACKER_MW_BINDING_KEY: import("@venizia/ignis-inversion").TBindingKey<MiddlewareHandler>;
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
    /** `configs.projectRoot` wins, else the process cwd. The value is bound AND handed to `ModuleUtility`, so every peer lookup (optional modules, the gRPC adapter) resolves under it - a compiled binary sets it to where its `node_modules` really is. */
    getProjectRoot(): string;
    getProjectConfigs(): IServerApplicationConfigs;
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
}
```

Source: `packages/core-server/src/base/applications/boot-steps.ts`

## `ServerInfoBindingKeys`

*class*

Container keys of the server info component.

```ts
export declare class ServerInfoBindingKeys {
    static readonly SERVER_INFO_OPTIONS: import("@venizia/ignis-inversion").TBindingKey<IServerInfoOptions>;
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
     * The `onRequest` hook of a fetcher that calls `audience`: before EVERY send - each retry attempt included, so the
     * `jti` is fresh - it signs the method and the percent-encoded path of the request and sets the assertion header.
     * `Authorization` is left alone, so the end user's token still travels on the same request.
     *
     * `new NativeFetcher({ name, hooks: { onRequest: signer.createRequestHook({ audience: 'pricing' }) } })`
     */
    createRequestHook(opts: {
        audience: string;
    }): NonNullable<IFetcherHooks['onRequest']>;
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
                    "application/json": {
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
                    "application/json": {
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

## `TApiReferenceSecurityScheme`

*type*

An OpenAPI security scheme (`apiKey`, `http`, `oauth2`, `openIdConnect`) or a reference to one, as the document registry takes it.

```ts
export type TApiReferenceSecurityScheme = Parameters<typeof OpenAPIRegistry.prototype.registerComponent<'securitySchemes'>>[2];
```

Source: `packages/core-server/src/components/api-reference/common/types.ts`
