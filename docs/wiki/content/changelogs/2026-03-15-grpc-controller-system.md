---
title: gRPC Controller System & Controller Architecture Refactor
description: New gRPC controller system with ConnectRPC integration, controller architecture split into REST and gRPC base classes, AsyncLocalStorage for request context isolation, and unified IRpcRegistration type.
---

# Changelog - 2026-03-15

## gRPC Controller System & Controller Architecture Refactor

Introduces a full gRPC controller system built on ConnectRPC, alongside a structural refactor that splits the controller hierarchy into dedicated REST and gRPC base classes. The current version supports **unary RPCs only** (streaming decorators exist but throw at boot time - HTTP/1.1 Connect protocol limitation). The system uses AsyncLocalStorage for production-safe request context isolation, enforces authentication/authorization on gRPC endpoints, and integrates into the existing application lifecycle through a component-based registration pattern.

## Overview

- **gRPC Controller System**: New `BaseGrpcController` with ConnectRPC integration (unary RPCs only in current version)
- **Controller Architecture Split**: REST and gRPC controllers now have dedicated base classes under `base/controllers/rest/` and `base/controllers/grpc/`
- **AsyncLocalStorage Isolation**: `GrpcRequestAdapter` uses AsyncLocalStorage for production-safe per-request context, replacing the previous `createHonoConnectAdapter` function
- **gRPC Auth Enforcement**: Authentication and authorization middleware applied to gRPC endpoints via pre-built middleware chain (symmetric with REST)
- **gRPC Error Code Preservation**: ConnectRPC error codes preserved instead of always mapping to INTERNAL(13)
- **Unified IRpcRegistration Type**: Single type merging handler, metadata, and pre-built auth middleware
- **RPC Decorators**: `@unary` for declarative RPC method registration. `@serverStream`, `@clientStream`, `@bidiStream` decorators exist but throw at boot time (reserved for future HTTP/2 support)
- **Optional ConnectRPC Dependency**: `@connectrpc/connect` added as an optional peer dependency -- REST-only users are unaffected
- **GRPC Protocol Constants**: Headers, methods, status codes, and content types added to the helpers package
- **Component-Based Registration**: `GrpcComponent` and `RestComponent` for transport-specific controller registration

## Breaking Changes

> [!WARNING]
> This section contains changes that require migration or manual updates to existing code.

### 1. Controller Base Classes Renamed and Relocated

The controller base classes have been split into transport-specific directories. The old files (`base/controllers/abstract.ts` and `base/controllers/base.ts`) are removed.

**Before:**
```typescript
import { AbstractController, BaseController } from '@venizia/ignis';
// or
import { AbstractController } from '../base/controllers/abstract';
import { BaseController } from '../base/controllers/base';
```

**After:**
```typescript
import { AbstractRestController, BaseRestController } from '@venizia/ignis';
// or
import { AbstractRestController } from '../base/controllers/rest/abstract';
import { BaseRestController } from '../base/controllers/rest/base';
```

> REST-only users: `BaseController` continues to work via re-exports from the barrel index. No migration required unless you import directly from the deleted file paths.

### 2. gRPC Controller Internals Refactored

If you were building custom gRPC controllers against the previous internal API, the following changes apply:

**Before:**
```typescript
class MyGrpcController extends AbstractGrpcController {
  implementation = { /* handler map */ };
  definitions: Record<string, IRpcMetadata> = { /* separate metadata map */ };

  getImplementation() { return this.implementation; }
}

// Adapter creation
const adapter = createHonoConnectAdapter(options);
```

**After:**
```typescript
class MyGrpcController extends AbstractGrpcController {
  // Unified map - single write per RPC:
  // this.definitions[configs.name] = { configs, handler };

  // Structure: IRpcRegistration<RouteEnv>
  // {
  //   configs: IRpcMetadata;    // { name, method, authenticate?, authorize? }
  //   handler: TRpcHandler;     // (opts: { request, context }) => response
  // }
}

// Adapter creation
const adapter = await GrpcRequestAdapter.build({
  controller: myController,
  interceptors: [], // optional
});
```

| Removed | Replacement |
|---------|-------------|
| `implementation` property | Merged into `definitions` via `IRpcRegistration` |
| `getImplementation()` method | No longer needed -- definitions are accessed directly |
| `createHonoConnectAdapter()` function | `GrpcRequestAdapter.build()` |
| `IConnectAdapterOptions` type | Removed (unused) |

## New Features

### BaseGrpcController -- Full gRPC Controller with Decorator Support

**File:** `packages/core-server/src/base/controllers/grpc/base.ts`

**Problem:** No first-class support for gRPC services within the IGNIS controller architecture.

**Solution:** `BaseGrpcController` provides a concrete gRPC controller implementation with decorator-driven RPC method registration, matching the ergonomics of REST controllers.

```typescript
@controller({ path: '/grpc', transport: ControllerTransports.GRPC, service: GreeterServiceDef })
export class GreeterController extends BaseGrpcController {
  @unary({ configs: { name: 'sayHello' } })
  async sayHello(opts: { request: SayHelloRequest }) {
    return create(SayHelloResponseSchema, { message: `Hello, ${opts.request.name}!` });
  }
}
```

### RPC Decorators

**File:** `packages/core-server/src/base/metadata/routes/rpc.ts`

Declarative decorators for all four gRPC patterns:

| Decorator | Pattern | Status |
|-----------|---------|--------|
| `@unary` | Unary | Supported |
| `@serverStream` | Server Streaming | Throws at boot (reserved for future HTTP/2 support) |
| `@clientStream` | Client Streaming | Throws at boot (reserved for future HTTP/2 support) |
| `@bidiStream` | Bidirectional Streaming | Throws at boot (reserved for future HTTP/2 support) |

### GrpcRequestAdapter -- ConnectRPC Bridge with AsyncLocalStorage

**File:** `packages/core-server/src/base/controllers/grpc/adapter.ts`

**Problem:** The previous `createHonoConnectAdapter` function lacked request context isolation, making it unsafe for concurrent requests in production.

**Solution:** `GrpcRequestAdapter` uses `AsyncLocalStorage` to provide per-request context isolation, ensuring each gRPC request has its own isolated context throughout the handler chain.

```typescript
const adapter = await GrpcRequestAdapter.build({
  controller: myController,
  interceptors: [], // optional
});
```

**Benefits:**
- Production-safe concurrent request handling via AsyncLocalStorage
- Clean separation between ConnectRPC transport and Hono routing
- Automatic context propagation through the handler chain

### IRpcRegistration -- Unified Handler + Metadata Type

**File:** `packages/core-server/src/base/controllers/grpc/common/types.ts`

**Problem:** gRPC method handlers and their metadata were stored in separate maps (`implementation` and `definitions`), requiring manual synchronization.

**Solution:** `IRpcRegistration` merges handler function and metadata into a single type, eliminating the possibility of handler/metadata mismatch.

### GRPC Protocol Constants

**File:** `packages/helpers/src/common/constants/grpc.ts`

New constants for gRPC protocol details:

- **Headers**: Content-type headers for gRPC, gRPC-Web, and Connect protocols
- **Methods**: Standard gRPC method types
- **Status Codes**: Full set of gRPC status codes (OK, CANCELLED, UNKNOWN, etc.)
- **Content Types**: MIME types for gRPC protocol variants

### Dual Transport Support

**File:** `packages/core-server/src/base/controllers/common/constants.ts`

Applications can now serve both REST and gRPC from the same process using `ControllerTransports`:

```typescript
@controller({ path: '/api/users', transport: ControllerTransports.REST })
export class UserRestController extends BaseRestController { /* ... */ }

@controller({ path: '/grpc', transport: ControllerTransports.GRPC })
export class UserGrpcController extends BaseGrpcController { /* ... */ }
```

### Component-Based gRPC Registration

**File:** `packages/core-server/src/components/controller/grpc/grpc.component.ts`

The `GrpcComponent` handles gRPC controller discovery and route mounting, following the same component pattern used by other IGNIS components:

```typescript
export class Application extends BaseApplication {
  async registerComponents() {
    this.component(GrpcComponent);
  }
}
```

## Files Changed

### Core Package (`packages/core-server`)

| File | Changes |
|------|---------|
| `src/base/controllers/grpc/adapter.ts` | New: `GrpcRequestAdapter` class replacing `createHonoConnectAdapter` |
| `src/base/controllers/grpc/abstract.ts` | Refactored: unified `definitions` map using `IRpcRegistration` |
| `src/base/controllers/grpc/base.ts` | New: `BaseGrpcController` concrete implementation |
| `src/base/controllers/grpc/common/types.ts` | Added `IRpcRegistration`, removed `IConnectAdapterOptions` |
| `src/base/controllers/rest/abstract.ts` | Renamed from `base/controllers/abstract.ts` to `AbstractRestController` |
| `src/base/controllers/rest/base.ts` | Renamed from `base/controllers/base.ts` to `BaseRestController` |
| `src/base/controllers/common/constants.ts` | Added `ControllerTransports` enum |
| `src/base/controllers/common/types.ts` | Updated controller type definitions |
| `src/base/controllers/factory/controller.ts` | Updated controller factory for dual transport |
| `src/base/controllers/index.ts` | Updated barrel exports |
| `src/base/metadata/routes/rpc.ts` | New: `@unary`, `@serverStream`, `@clientStream`, `@bidiStream` decorators |
| `src/base/metadata/index.ts` | Updated metadata exports |
| `src/base/applications/base.ts` | Updated application base for gRPC support |
| `src/base/applications/types.ts` | Updated application types |
| `src/base/mixins/index.ts` | Updated mixin exports |
| `src/components/controller/grpc/grpc.component.ts` | New: `GrpcComponent` |
| `src/components/controller/rest/rest.component.ts` | New: `RestComponent` |
| `src/components/index.ts` | Updated component exports |
| `src/components/auth/authenticate/controllers/factory.ts` | Updated for REST controller rename |
| `src/components/auth/authenticate/controllers/jwks/controller.ts` | Updated for REST controller rename |
| `src/components/health-check/controller.ts` | Updated for REST controller rename |
| `src/components/static-asset/controller/factory.ts` | Updated for REST controller rename |
| `src/helpers/inversion/common/keys.ts` | Updated binding keys |
| `src/helpers/inversion/common/types.ts` | Updated inversion types |
| `src/helpers/inversion/mixins/controllers/grpc.ts` | New: `GrpcControllerMetadataMixin` |
| `src/helpers/inversion/mixins/index.ts` | Updated mixin exports |
| `src/helpers/inversion/registry.ts` | Updated registry for gRPC support |
| `package.json` | Added `@connectrpc/connect` as optional peer dep and dev dep |

### Helpers Package (`packages/helpers`)

| File | Changes |
|------|---------|
| `src/common/constants/grpc.ts` | New: GRPC protocol constants (headers, methods, status codes, content types) |
| `src/common/constants/index.ts` | Updated constants barrel export |

### Examples

| File | Changes |
|------|---------|
| `examples/grpc-test/` | New: gRPC example application |

## Migration Guide

> [!NOTE]
> Follow these steps if you are upgrading from a previous version.

### Step 1: Update Direct Controller Imports (if applicable)

If you import controller base classes directly from internal paths, update them:

```typescript
// Before
import { AbstractController } from '@venizia/ignis/base/controllers/abstract';
import { BaseController } from '@venizia/ignis/base/controllers/base';

// After
import { AbstractRestController } from '@venizia/ignis/base/controllers/rest/abstract';
import { BaseRestController } from '@venizia/ignis/base/controllers/rest/base';
```

### Step 2: Update Custom gRPC Controllers (if applicable)

If you built custom gRPC controllers against the previous internal API:

1. Remove the `implementation` property and `getImplementation()` method
2. Merge handler functions into the `definitions` map using `IRpcRegistration`
3. Replace `createHonoConnectAdapter()` calls with `GrpcRequestAdapter.build()`

### Step 3: Install ConnectRPC (gRPC users only)

If you are adding gRPC support, install the optional peer dependency:

```bash
bun add @connectrpc/connect
```

### REST-Only Users

No migration required. The `BaseController` name continues to work via re-exports from the barrel index. All REST controller functionality is unchanged.
