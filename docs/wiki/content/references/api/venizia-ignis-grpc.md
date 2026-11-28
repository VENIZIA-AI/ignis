---
title: "@venizia/ignis/grpc"
description: "Every export of @venizia/ignis/grpc, from the built declarations (generated)."
---

# `@venizia/ignis/grpc`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

6 exports, 6 with TSDoc.

## `GrpcBindingKeys`

*class*

Container keys of the gRPC component.

```ts
export declare class GrpcBindingKeys {
    static readonly GRPC_COMPONENT_OPTIONS: import("@venizia/ignis-inversion").TBindingKey<IGrpcComponentConfig>;
    /** The listener of the native gRPC port, bound when it is on: `getAddress()` answers where it listens. */
    static readonly GRPC_NATIVE_LISTENER: import("@venizia/ignis-inversion").TBindingKey<GrpcListenerHelper>;
}
```

Source: `packages/core-server/src/components/controller/grpc/common/types.ts`

## `GrpcComponent`

*class*

Mounts every controller declared with the gRPC transport onto the root router at its metadata `path`, and hands each the `IGrpcComponentConfig` interceptors and ConnectRPC module. A gRPC controller without a service definition is skipped with a warning.

```ts
export declare class GrpcComponent extends BaseComponent {
    private application;
    constructor(application: BaseApplication);
    binding(): Promise<void>;
    /**
     * `stop()` waits for the requests in flight on the application port, so an RPC still running after `timeoutMs` is
     * aborted. The hook only starts the clock; the timer alone keeps no process running.
     */
    private registerApplicationPortShutdown;
    /** gRPC clients call `/package.Service/Method` with no prefix, so each such path has one owner. */
    private collectRoutes;
    /** The port starts after the HTTP server and stops before it, and before the datasources close. */
    private registerNativeListener;
}
```

Source: `packages/core-server/src/components/controller/grpc/grpc.component.ts`

## `IConnectRpcModule`

*interface*

The ConnectRPC peer itself, handed over by an application that already holds it. A
`bun build --compile` binary carries no `node_modules`, so the lookup {@link GrpcRequestAdapter} makes with
`ModuleUtility.load` has nothing to resolve against - passing the modules through the gRPC
component options (or `ModuleUtility.register`) is what a compiled application does instead. Both entry points are needed: the
adapter builds its router and context values from `@connectrpc/connect` and converts requests with
`@connectrpc/connect/protocol`. Typed as the shape the adapter actually calls, so a wrong module
is a compile error rather than a boot crash.

```ts
export interface IConnectRpcModule {
    connect: {
        createConnectRouter: (opts?: Record<string, unknown>) => ConnectRouter;
        createContextKey: typeof createContextKey;
        createContextValues: typeof createContextValues;
    };
    /** `@connectrpc/connect-node`: only the native gRPC port needs it. */
    node?: IConnectNodeModule;
    protocol: {
        universalServerRequestFromFetch: (request: Request, context: object) => UniversalServerRequest;
        universalServerResponseToFetch: (response: UniversalServerResponse) => Response;
    };
}
```

Source: `packages/core-server/src/base/controllers/grpc/common/types.ts`

## `IGrpcComponentConfig`

*interface*

Options of `GrpcComponent`, bound at `GrpcBindingKeys.GRPC_COMPONENT_OPTIONS`.

```ts
export interface IGrpcComponentConfig {
    /** ConnectRPC `Interceptor`s of every RPC. They run before `authenticate` and `authorize`. */
    interceptors?: Interceptor[];
    /** Limits of both ports. */
    limits?: IGrpcLimits;
    /** The ConnectRPC peer, for a compiled binary that has no `node_modules` to resolve it from. */
    module?: IConnectRpcModule;
    /** The native gRPC port. Absent or `{ use: false }`: no second socket, and `node:http2` is not loaded. */
    native?: TToggle<IGrpcNativeOptions>;
}
```

Source: `packages/core-server/src/components/controller/grpc/common/types.ts`

## `IGrpcLimits`

*interface*

Size limits of the RPCs of a controller.

```ts
export interface IGrpcLimits {
    /** The largest message a client may send, decoded, in bytes. Default 5 MiB (`BodyLimits.DEFAULT_MAX_SIZE`). */
    messageSize?: number;
}
```

Source: `packages/core-server/src/base/controllers/grpc/common/types.ts`

## `IGrpcNativeOptions`

*interface*

The native gRPC port: a `node:http2` listener beside the HTTP server, off unless `use` is true.

```ts
export interface IGrpcNativeOptions {
    /** `0` takes a free port, read back from the listener's `getAddress()`. */
    port: number;
    /** Default `127.0.0.1`: a clear-text port is not public unless you say so. */
    host?: string;
    /** Default `{ use: false }`. */
    tls?: TGrpcNativeTls;
    /** How long `stop()` waits for calls in flight before it aborts them, in milliseconds. Default 10 000. */
    shutdownTimeout?: number;
    /** Limits of the native port alone; `limits.messageSize` of the component applies to it too. */
    limits?: {
        /** Streams one connection may have open at once. A positive integer, default 100. */
        concurrentStreams?: number;
    };
}
```

Source: `packages/core-server/src/base/controllers/grpc/native/common/types.ts`
