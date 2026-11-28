---
title: "@venizia/ignis (2 of 3)"
description: "Every export of @venizia/ignis, from the built declarations (generated)."
---

# `@venizia/ignis (2 of 3)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 2 of 3 of [`@venizia/ignis`](/references/api/venizia-ignis).

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
`AppEnvs` never holds them - a read through `AppEnvs.get()` would answer `undefined`
forever. `APPLICATION_ENV_PREFIX` could not go through it in any case: it is what builds the
filter. Both are bootstrap variables and are read straight off `process.env`, which is the one
legitimate exception to "do not read process.env directly". Neither has to be declared or set:
the prefix defaults to `APP_ENV`, and empty values are allowed unless you set
`ALLOW_EMPTY_ENV_VALUE` to a false word (see `ParseUtility.toBoolean`).

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
    private connect;
    /** The server's default error handler: it decides the status and the message a client may read, and logs the error. */
    private readonly handleError;
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
    static readonly HEALTH_CHECK_OPTIONS: import("@venizia/ignis-inversion").TBindingKey<IHealthCheckOptions>;
    /** The component resolves `getAppInfo()` once (it is async) and binds the result for the controller. */
    static readonly APPLICATION_INFO: import("@venizia/ignis-inversion").TBindingKey<IApplicationInfo>;
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
    .bind({ key: ApiReferenceBindingKeys.API_REFERENCE_OPTIONS })
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
    uiConfig?: Record<string, unknown>;
    securitySchemes?: Record<string, TApiReferenceSecurityScheme>;
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
    /** Checked to be a plain object at construction. */
    verify?: IJWTVerifyOptions;
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
    .bind({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS })
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
    .bind({ key: ServerInfoBindingKeys.SERVER_INFO_OPTIONS })
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
