---
title: "@venizia/ignis (2 of 4)"
description: "Every export of @venizia/ignis, from the built declarations (generated)."
---

# `@venizia/ignis (2 of 4)`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

Part 2 of 4 of [`@venizia/ignis`](/references/api/venizia-ignis).

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

## `ExecutionRunner`

*class*

Holds the current execution frame in an `AsyncLocalStorage`. An application installs it when it is built; a script
or a test that has no application calls `ExecutionRunner.install()`. A promise left running after its `run`
returned keeps the frame it was started in.

```ts
export declare class ExecutionRunner extends BaseHelper implements IExecutionRunner {
    private readonly store;
    private readonly warnedReasons;
    private readonly warnedRoots;
    constructor();
    /** Installs the runner. The first install of the process wins; a later one changes nothing. */
    static install(): void;
    /**
     * The identity a hand-off carries: the user and values of the current frame, the user of its request when the frame
     * names none.
     */
    static capture(): Pick<IExecutionFrame, 'userId' | 'values'>;
    private static identityOf;
    private static requestUserOf;
    read(): IExecutionFrame | undefined;
    capture(): Pick<IExecutionFrame, 'userId' | 'values'>;
    run<Result>(opts: TExecutionRunOptions<Result>): Promise<Result>;
    runFrame<Result>(opts: {
        frame: IExecutionFrame;
        task: () => Result;
    }): Result;
    private buildFrame;
    /** A frame from plain JavaScript, or from the framework's own entry, is held to the same rules as a typed call. */
    private assertFrame;
    /**
     * A frozen copy: the arrays and plain objects at any depth, so no task changes the values of the frame around it or
     * the caller's. A function or a class instance is kept as it is.
     */
    private freezeValues;
    /** `seen` maps what was already copied to its copy, so a value that holds itself ends. */
    private copyFrozen;
    /**
     * Once per route: a root frame drops the request, so the narrowing a request's user brings with it. The key is the
     * route of that request, never a stack.
     */
    private warnRoot;
    /** Every system run is logged with its reason, and the request when there is one; no caller is recorded. */
    private logSystemRun;
    private isFirstWarning;
}
```

Source: `packages/core-server/src/base/execution/runner.ts`

## `GrpcHeaderUtility`

*class*

The headers of a native gRPC call: from the node request to Hono, and from Hono into the answer.

```ts
export declare class GrpcHeaderUtility {
    /** The headers of a node request, without the `:` pseudo headers of HTTP/2. */
    static fromNode(opts: {
        headers: IncomingHttpHeaders;
    }): Headers;
    /**
     * The headers of an HTTP answer a trailers-only refusal keeps (a request id, `retry-after`): not the ones that
     * describe its body or its HTTP/1.1 connection, which HTTP/2 refuses.
     */
    static toRefusal(opts: {
        headers: Headers;
    }): Record<string, string | string[]>;
    /** Adds to an answer the headers it does not set itself. The content type is the protocol's own. */
    static merge(opts: {
        from: Headers;
        into: Headers;
    }): void;
}
```

Source: `packages/core-server/src/base/controllers/grpc/native/header.utility.ts`

## `GrpcListenerHelper`

*class*

The native gRPC port: a `node:http2` server that passes each call through the application with its headers only, and
lets the RPC's route write the answer, trailers included, on the stream. Only RPC paths are served, with POST.

```ts
export declare class GrpcListenerHelper extends BaseHelper {
    private readonly listener;
    /** What `shutdownTimeout` is when it is not set, in milliseconds. */
    static readonly DEFAULT_SHUTDOWN_TIMEOUT_MS = 10000;
    private server?;
    private readonly sessions;
    /** Every TCP connection, one that never finished its TLS handshake included: no session ever stands for it. */
    private readonly sockets;
    /** The shutdown in progress, which a second `stop()` waits for. */
    private stopping?;
    /** Called when the last session closed, while stopping. */
    private onDrained?;
    constructor(listener: IGrpcListenerOptions);
    /** The address the listener is bound to; `undefined` until `start()`. */
    getAddress(): {
        host: string;
        port: number;
    } | undefined;
    /** Binds the port. A port in use rejects. */
    start(): Promise<void>;
    /**
     * Stops accepting, asks every connection to finish, waits `shutdownTimeout`, then aborts what still runs and
     * destroys the connections. A second call waits for the same shutdown.
     */
    stop(): Promise<void>;
    private shutDown;
    /** Waits for `task`, at most `ms`; the caller reads whether it finished. */
    private settle;
    private onRequest;
    private serve;
    private assertOptions;
}
```

Source: `packages/core-server/src/base/controllers/grpc/native/listener.helper.ts`

## `GrpcNativeCallStore`

*class*

The env of `app.fetch` for a native gRPC request: it carries the node stream to the route, and answers
`requestIP`, which `hono/bun`'s `getConnInfo` reads, so an IP rate limit or a log sees the caller's address.
An instance is only made by the listener, so no request of the HTTP server can pass for one.

```ts
export declare class GrpcNativeCallStore {
    readonly call: IGrpcNativeCall;
    constructor(call: IGrpcNativeCall);
    /** The native call of a request, or `undefined` for a request of the HTTP server. */
    static read(opts: {
        env: unknown;
    }): IGrpcNativeCall | undefined;
    /** The caller's address from the TCP connection, or `null` when the socket gives none. */
    requestIP(): {
        address: string;
        family: string | undefined;
        port: number | undefined;
    } | null;
}
```

Source: `packages/core-server/src/base/controllers/grpc/native/call.store.ts`

## `GrpcNativeWriter`

*class*

Writes the answer of a native gRPC call on its node stream.

```ts
export declare class GrpcNativeWriter {
    /** Hands the call to ConnectRPC's handler, which reads the node request and writes the answer and its trailers. */
    static answer(opts: IGrpcNativeAnswer): Promise<void>;
    /**
     * Refuses a call before ConnectRPC saw it: one HEADERS frame that also ends the stream ("trailers-only"). A gRPC
     * error travels on HTTP 200. `headers` are the ones a middleware set on its answer.
     */
    static refuse(opts: {
        response: Http2ServerResponse;
        status: number;
        message: string;
        headers?: Headers;
    }): void;
    /**
     * The percent-encoded `grpc-message`, as many whole characters as fit: a cut inside an escape or a surrogate pair
     * leaves a value no client can decode. Half a surrogate pair reads as the replacement character.
     */
    private static encodeMessage;
    /** Refuses with the answer a middleware gave: its status, and the `message` the error handler wrote. */
    static refuseFrom(opts: {
        response: Http2ServerResponse;
        answer: Response;
    }): Promise<void>;
    /** The `message` of a JSON error body, under the error root key too. */
    private static readMessage;
}
```

Source: `packages/core-server/src/base/controllers/grpc/native/native.writer.ts`

## `GrpcRequestAdapter`

*class*

Bridges IGNIS gRPC controllers with ConnectRPC: loads the peer deps with `ModuleUtility.load` (the ES module copy an
application's own import gets) and registers one Hono route per RPC, which hands the request to ConnectRPC's handler
with the Hono context in its context values. That route serves Connect and gRPC-Web; with the native port on, it
also writes a native gRPC call on the node stream, which can send the response trailers `Bun.serve` cannot.

```ts
export declare class GrpcRequestAdapter<RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ServiceType = Parameters<ConnectRouter['service']>[0], ConfigurableOptions extends object = {}> extends BaseHelper {
    private readonly options;
    private readonly peers;
    /** The Hono context of the call, as ConnectRPC carries it to the RPC handler. */
    private readonly honoContext;
    /** The server's default error handler: it decides the status and the message a client may read, and logs the error. */
    private readonly handleError;
    private constructor();
    /**
     * The ConnectRPC peers, loaded as ES modules from the project root (or taken from `ModuleUtility.register`,
     * which is what a compiled binary has). A missing peer rejects with the error that names what to install.
     */
    private static loadModule;
    /**
     * One RPC in the shape ConnectRPC calls: a call that streams its answer is a generator, the others answer a promise.
     * The middlewares run first, then the handler; a throw becomes the answer a gRPC client reads.
     */
    private wrap;
    /** A call that streams its answer: the handler's messages, one by one. */
    private stream;
    private isMessageStream;
    /** The Hono context of the call. */
    private readContext;
    /** Runs the middlewares of a call and answers the context its handler reads. A call that passed one may stay quiet. */
    private open;
    /** The end of a call, before its response ends: a connection whose idle timeout was lifted gets it back. */
    private close;
    private toAnswer;
    /**
     * Runs the pre-built auth middlewares (`AbstractGrpcController.buildRpcMiddlewares`) in order. Each one must call
     * `next()` to pass the call on; one that answers, or does neither, ends it.
     */
    private passMiddlewares;
    /**
     * ConnectRPC drops a handler whose name the service does not declare, and a handler of another kind than the service's
     * fails only when called: both are refused at boot.
     */
    private assertDeclaredRpcs;
    private decoratorOf;
    /** Registers every RPC of the controller on the ConnectRPC router, each wrapped into ConnectRPC's `(request, context) => response`. */
    private registerService;
    /** The signal a router hands its handlers: it aborts with a port's, carrying what the client should read. */
    private toShutdownSignal;
    /** The request ConnectRPC reads. A body an earlier middleware consumed is in Hono's cache: the request is rebuilt with it. */
    private readRequest;
    /**
     * One request of one RPC: handed to ConnectRPC's handler, answered through `context.newResponse` so the headers
     * earlier middleware set are kept. A call of the native gRPC port is written on its node stream instead. A failure
     * outside ConnectRPC reaches the application's error handler.
     */
    private serve;
    /** Validates peer deps and builds the controller's router: one route per RPC of its service. */
    static build<RouteEnv extends Env = Env, RouteSchema extends Schema = {}, BasePath extends string = '/', ServiceType = Parameters<ConnectRouter['service']>[0], ConfigurableOptions extends object = {}>(opts: IAdapterOptions<RouteEnv, RouteSchema, BasePath, ServiceType, ConfigurableOptions>): Promise<IConnectAdapterResult<RouteEnv>>;
}

/** What an adapter is built from. */
interface IAdapterOptions<RouteEnv extends Env, RouteSchema extends Schema, BasePath extends string, ServiceType, ConfigurableOptions extends object> {
    controller: AbstractGrpcController<RouteEnv, RouteSchema, BasePath, ServiceType, ConfigurableOptions>;
    interceptors?: Interceptor[];
    module?: IConnectRpcModule;
    limits?: IGrpcLimits;
    /** Set when the native gRPC port is on: handlers of the gRPC protocol are built too. */
    native?: IGrpcNativeAdapterOptions;
    /** Aborted when `stop()` runs out of time on the application port: every handler's `rpc.signal` follows it. */
    shutdownSignal?: AbortSignal;
    /** The server's `idleTimeout` in seconds, given back to a connection when a call ends. */
    idleTimeout?: number;
}
```

Source: `packages/core-server/src/base/controllers/grpc/adapter.ts`

## `GrpcStatusUtility`

*class*

The gRPC codes of the HTTP statuses a native call can be refused with.

```ts
export declare class GrpcStatusUtility {
    /**
     * The gRPC code of an HTTP answer a call got before it reached ConnectRPC: the table of the gRPC specification, which
     * a client of the HTTP port applies too.
     */
    static fromHttp(opts: {
        status: number;
    }): TGrpcResultCode;
}
```

Source: `packages/core-server/src/base/controllers/grpc/native/status.utility.ts`

## `GrpcTimeoutGuard`

*class*

The idle timeout of the server for one call: `Bun.serve` closes a request that stays quiet for `idleTimeout`.

```ts
export declare class GrpcTimeoutGuard {
    /** `Bun.serve`'s own default `idleTimeout`, in seconds. */
    static readonly DEFAULT_IDLE_TIMEOUT_SECONDS = 10;
    /**
     * Lifts the idle timeout of this request, so a call may stay quiet for as long as its handler needs: the stream's on
     * the native gRPC port, the request's on the HTTP server. A request with no server behind it (`router.request` in a
     * test) has no timeout to lift. Call `restore` when the call ends.
     */
    static lift<RouteEnv extends Env>(opts: {
        context: Context<RouteEnv>;
    }): void;
    /**
     * Gives the connection its idle timeout back. The value stays on the socket, which a keep-alive client uses again, and
     * Bun applies it only when set before the response ends.
     */
    static restore<RouteEnv extends Env>(opts: {
        context: Context<RouteEnv>;
        seconds: number;
    }): void;
    private static set;
}
```

Source: `packages/core-server/src/base/controllers/grpc/timeout.guard.ts`

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
export interface IConnectAdapterResult<RouteEnv extends Env = Env> {
    /** The RPC paths, `/package.Service/Method`, without the controller's path. */
    paths: string[];
    /** One route per RPC, at ConnectRPC's path (`/package.Service/Method`); mount it under the controller's path. */
    router: Hono<RouteEnv>;
}
```

Source: `packages/core-server/src/base/controllers/grpc/common/types.ts`

## `IConnectNodeModule`

*interface*

The two functions of `@connectrpc/connect-node` the native port needs. Declared here, as methods, so an application
without that optional peer still type-checks and the real module can be passed in.

```ts
export interface IConnectNodeModule {
    universalRequestFromNodeRequest(request: Http2ServerRequest, response: Http2ServerResponse, parsedJsonBody: undefined, contextValues: ContextValues): UniversalServerRequest;
    universalResponseToNodeResponse(universalResponse: UniversalServerResponse, response: Http2ServerResponse): Promise<void>;
}
```

Source: `packages/core-server/src/base/controllers/grpc/native/common/types.ts`

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
    /** The generated service descriptor, from `@controller`. */
    service: ServiceType;
    /** Holds one route per RPC once `configure()` ran; mounted under the controller's path. */
    router: Hono<RouteEnv, RouteSchema, BasePath>;
    /** The registered RPCs, keyed by the method name of the service. */
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
    /** The logger scope, usually the class name. */
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

## `IGrpcListenerOptions`

*interface*

What a native gRPC listener is built from.

```ts
export interface IGrpcListenerOptions {
    options: IGrpcNativeOptions;
    /** `/package.Service/Method` to the path the RPC is mounted at in the application. */
    routes: Map<string, string>;
    /** The `fetch` the HTTP server runs, so global middleware sees every call. */
    fetch: (request: Request, env: object) => ValueOrPromise<Response>;
    /** The idle timeout of a stream, the one of the HTTP server; `0` is none. */
    idleTimeoutMs: number;
    /** Aborted when `stop()` runs out of time: every handler's `rpc.signal` follows it. */
    shutdown: AbortController;
}
```

Source: `packages/core-server/src/base/controllers/grpc/native/listener.helper.ts`

## `IGrpcNativeAdapterOptions`

*interface*

What the adapter needs to answer calls of the native gRPC port too.

```ts
export interface IGrpcNativeAdapterOptions {
    /** Aborted when the port stops: every handler's `rpc.signal` follows it. */
    shutdownSignal: AbortSignal;
}
```

Source: `packages/core-server/src/base/controllers/grpc/common/types.ts`

## `IGrpcNativeAnswer`

*interface*

What the native writer answers a call with.

```ts
export interface IGrpcNativeAnswer {
    call: IGrpcNativeCall;
    handler: UniversalHandler;
    contextValues: ContextValues;
    /** The headers earlier middleware set, merged into the answer. */
    headers: Headers;
    node: IConnectNodeModule;
}
```

Source: `packages/core-server/src/base/controllers/grpc/native/common/types.ts`

## `IGrpcNativeCall`

*interface*

One native gRPC request, as `node:http2` gives it.

```ts
export interface IGrpcNativeCall {
    request: Http2ServerRequest;
    response: Http2ServerResponse;
}
```

Source: `packages/core-server/src/base/controllers/grpc/native/common/types.ts`

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
    /** `authenticate` first, then one per `authorize` spec. An empty list is a public RPC: it keeps the idle timeout. */
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
