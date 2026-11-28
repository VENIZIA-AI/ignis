---
title: "@venizia/ignis/grpc"
description: "Every export of @venizia/ignis/grpc, from the built declarations (generated)."
---

# `@venizia/ignis/grpc`

> Generated from the built declarations by `vulcan atlas api gen` - do not edit.

5 exports, 5 with TSDoc.

## `GrpcBindingKeys`

*class*

Container keys of the gRPC component.

```ts
export declare class GrpcBindingKeys {
    static readonly GRPC_COMPONENT_OPTIONS: import("@venizia/ignis-inversion").TBindingKey<IGrpcComponentConfig>;
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
    interceptors?: unknown[];
    limits?: IGrpcLimits;
    /** The ConnectRPC peer, for a compiled binary that has no `node_modules` to resolve it from. */
    module?: IConnectRpcModule;
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
