# Types

Shared utility types, resolver functions, and constants exported from `@venizia/ignis-helpers`.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis-helpers` |
| **Module** | Common types and constants |
| **Source** | `packages/helpers/src/common/types.ts` (types + resolvers), `packages/helpers/src/common/constants/` (constants) |
| **Runtimes** | Both |

#### Import Paths

```typescript
// Types
import type {
  TNullable,
  AnyType,
  AnyObject,
  TOptions,
  ValueOrPromise,
  ValueOf,
  ValueOptional,
  ValueOptionalExcept,
  TPrettify,
  TConstructor,
  TAbstractConstructor,
  TClass,
  TAbstractClass,
  TMixinTarget,
  TAbstractMixinTarget,
  TResolver,
  TAsyncResolver,
  TValueOrResolver,
  TValueOrAsyncResolver,
  TStringConstValue,
  TNumberConstValue,
  TConstValue,
  TFieldMappingDataType,
  IFieldMapping,
  TFieldMappingNames,
  TObjectFromFieldMappings,
  TInjectionGetter,
  IConfigurable,
} from '@venizia/ignis-helpers';

// Resolver functions
import { resolveValue, resolveValueAsync, resolveClass } from '@venizia/ignis-helpers';

// Constants
import { Defaults, RuntimeModules, DataTypes, HTTP, GRPC, MimeTypes } from '@venizia/ignis-helpers';

// Derived constant types
import type { TRuntimeModule, TMimeTypes, THttpMethod, THttpResultCode, TGrpcMethod, TGrpcResultCode } from '@venizia/ignis-helpers';

// JSX types (re-exported from hono/jsx)
import type { Child, FC, PropsWithChildren } from '@venizia/ignis-helpers';
```

## Usage

### General Purpose Types

```typescript
type AnyType = any;
type AnyObject = Record<string | symbol | number, any>;
```

Escape hatches for general-purpose typing. `AnyObject` is a loosely-typed record for objects whose shape is not known at compile time.

```typescript
type TOptions<T extends object = {}> = T;
```

Semantic wrapper for options objects. Used across the framework to signal that a parameter follows the options-object pattern.

### Nullable and Promise Types

```typescript
type TNullable<T> = T | undefined | null;
```

Makes a type nullable -- the value can be `T`, `undefined`, or `null`.

```typescript
type ValueOrPromise<T> = T | Promise<T>;
```

A value that may or may not be wrapped in a `Promise`. Used throughout the framework for methods that support both sync and async implementations.

### Class and Constructor Types

```typescript
type TConstructor<T> = new (...args: any[]) => T;
type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
```

Types representing concrete and abstract class constructors.

```typescript
type TClass<T> = TConstructor<T> & { [property: string]: any };
type TAbstractClass<T> = TAbstractConstructor<T> & { [property: string]: any };
```

Class types that include static properties. `TClass` is the most commonly used -- it represents a concrete class with both a constructor and arbitrary static members.

```typescript
type TMixinTarget<T> = TConstructor<{ [P in keyof T]: T[P] }>;
type TAbstractMixinTarget<T> = TAbstractConstructor<{ [P in keyof T]: T[P] }>;
```

Types for mixin pattern targets. Used when defining mixins that extend a base class while preserving its type:

```typescript
function MyMixin<T extends TMixinTarget<BaseClass>>(Base: T) {
  return class extends Base {
    // additional methods
  };
}
```

### Object Utility Types

```typescript
type ValueOf<T> = T[keyof T];
```

Extracts the union of all value types from an object type.

```typescript
type ValueOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
```

Makes specific keys optional while keeping all others required.

```typescript
type ValueOptionalExcept<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>>;
```

The inverse -- makes everything optional except the specified keys.

```typescript
type TPrettify<T> = { [K in keyof T]: T[K] } & {};
```

Flattens intersection types for better IDE display. Useful when combining multiple types with `&` produces hard-to-read hover tooltips.

### Const Value Extraction Types

```typescript
type TStringConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string>;
type TNumberConstValue<T extends TClass<any>> = Extract<ValueOf<T>, number>;
type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;
```

Extract constant value types from a class. These are used to derive union types from constant classes:

```typescript
// TRuntimeModule = 'node' | 'bun'
type TRuntimeModule = TConstValue<typeof RuntimeModules>;

// TMimeTypes = 'unknown' | 'image' | 'video' | 'text'
type TMimeTypes = TConstValue<typeof MimeTypes>;
```

### Value Resolution Types and Functions

Types and helper functions for lazy/deferred value resolution -- a core pattern in the framework's DI and configuration systems.

#### Types

```typescript
type TResolver<T> = (...args: any[]) => T;
type TAsyncResolver<T> = (...args: any[]) => T | Promise<T>;
```

Function types that resolve to a value. `TAsyncResolver` supports both sync and async functions.

```typescript
type TValueOrResolver<T> = T | TResolver<T>;
type TValueOrAsyncResolver<T> = T | TAsyncResolver<T>;
```

Union types allowing either a direct value or a resolver function. Used in configuration APIs where values can be provided eagerly or lazily.

#### resolveValue

```typescript
const resolveValue: <T>(valueOrResolver: TValueOrResolver<T>) => T;
```

Synchronously resolves a lazy value:
- **Direct values** -- returned as-is
- **Class constructors** -- returned as-is (not invoked)
- **Resolver functions** -- invoked and result returned

Class constructors are detected via `isClass()` (a source-level class-syntax check), which lives in `@venizia/ignis-inversion` and is re-exported by `helpers`; they are never called as resolver functions. `isClassConstructor` does not exist.

#### resolveValueAsync

```typescript
const resolveValueAsync: <T>(valueOrResolver: TValueOrAsyncResolver<T>) => Promise<T>;
```

Async version of `resolveValue`. Same behavior, but awaits the result if the resolver returns a `Promise`.

#### resolveClass

```typescript
const resolveClass: <T>(
  ref: TClass<T> | TResolver<TClass<T>> | string,
) => TClass<T> | string;
```

Resolves lazy class references. Handles three cases:
- **String binding keys** -- returned as-is (for DI key lookups)
- **Class constructors** -- returned as-is
- **Resolver functions** -- invoked and result returned

#### Resolution Example

```typescript
import { TValueOrAsyncResolver, resolveValueAsync } from '@venizia/ignis-helpers';

interface DatabaseConfig {
  host: string;
  port: number;
}

type ConfigOption = TValueOrAsyncResolver<DatabaseConfig>;

// Direct value
const config1: ConfigOption = { host: 'localhost', port: 5432 };

// Sync resolver
const config2: ConfigOption = () => ({ host: 'localhost', port: 5432 });

// Async resolver
const config3: ConfigOption = async () => {
  const config = await fetchConfigFromVault();
  return config;
};

// Resolve any of the above uniformly
const resolved = await resolveValueAsync(config3);
```

### Field Mapping Types

Types for declarative field-to-type mappings, used for configuration-driven data transformation.

```typescript
type TFieldMappingDataType = 'string' | 'number' | 'strings' | 'numbers' | 'boolean';
```

Supported data types for field mappings.

```typescript
interface IFieldMapping {
  name: string;
  type: TFieldMappingDataType;
  default?: string | number | Array<string> | Array<number> | boolean;
}
```

Defines a single field with its name, type, and optional default value.

```typescript
type TFieldMappingNames<T extends Array<IFieldMapping>> = Extract<
  T[number],
  { type: Exclude<T[number]['type'], undefined> }
>['name'];
```

Extracts the union of field names from a field mapping array type.

```typescript
type TObjectFromFieldMappings<
  T extends readonly {
    name: string;
    type: string;
    [extra: string | symbol]: any;
  }[],
> = {
  [K in T[number]['name']]: /* mapped to the declared type */
};
```

Constructs a typed object from a field mapping array, where each key maps to its declared runtime type: `'string'` becomes `string`, `'number'` becomes `number`, `'strings'` becomes `string[]`, `'numbers'` becomes `number[]`, and `'boolean'` becomes `boolean`.

### DI and Lifecycle Types

```typescript
type TInjectionGetter = <T>(opts: { key: string | symbol }) => T;
```

Function type for retrieving values from the IoC container by binding key.

```typescript
interface IConfigurable<Options extends object = any, Result = any> {
  configure(opts?: Options): ValueOrPromise<Result>;
}
```

Interface for components that require explicit initialization. Used by helpers and components that expose a `configure()` lifecycle method.

### JSX Types

Re-exported from `hono/jsx` for convenience when building JSX-based views:

```typescript
export type { Child, FC, PropsWithChildren } from 'hono/jsx';
```

- `FC` -- Function component type
- `Child` -- Valid child element type
- `PropsWithChildren` -- Props type that includes a `children` property

### Constants

#### Defaults

```typescript
class Defaults {
  static readonly APPLICATION_NAME: string; // process.env.APP_ENV_APPLICATION_NAME ?? 'APP'
  static readonly QUERY_LIMIT = 50;
  static readonly QUERY_OFFSET = 0;
}
```

Application-wide defaults for query pagination and application naming.

#### RuntimeModules

```typescript
class RuntimeModules {
  static readonly NODE = 'node';
  static readonly BUN = 'bun';

  static detect(): TRuntimeModule;
  static isBun(): boolean;
  static isNode(): boolean;
}

type TRuntimeModule = TConstValue<typeof RuntimeModules>; // 'node' | 'bun'
```

Runtime detection utility. `detect()` returns `'bun'` if `typeof Bun !== 'undefined'`, `'node'` otherwise. `isBun()` and `isNode()` are convenience methods that call `detect()` internally.

#### DataTypes

```typescript
class DataTypes {
  static readonly NUMBER = 'NUMBER';
  static readonly TEXT = 'TEXT';
  static readonly BYTE = 'BYTE';
  static readonly JSON = 'JSON';
  static readonly BOOLEAN = 'BOOLEAN';

  static readonly SCHEME_SET: Set<string>;
  static isValid(orgType: string): boolean;
}
```

Schema data type constants with validation. `SCHEME_SET` contains all valid type strings, and `isValid()` checks membership.

#### HTTP

The `HTTP` class groups all HTTP-related constants into nested objects.

**Headers** (commonly used subset -- the full list in `packages/helpers/src/common/constants/http.ts` also covers content negotiation, CORS, security, proxy/forwarding, and rate-limit headers):

| Constant | Value |
|----------|-------|
| `HTTP.Headers.AUTHORIZATION` | `'authorization'` |
| `HTTP.Headers.CACHE_CONTROL` | `'cache-control'` |
| `HTTP.Headers.CONTENT_DISPOSITION` | `'content-disposition'` |
| `HTTP.Headers.CONTENT_ENCODING` | `'content-encoding'` |
| `HTTP.Headers.CONTENT_LENGTH` | `'content-length'` |
| `HTTP.Headers.CONTENT_TYPE` | `'content-type'` |
| `HTTP.Headers.CONTENT_RANGE` | `'content-range'` |
| `HTTP.Headers.ETAG` | `'etag'` |
| `HTTP.Headers.LAST_MODIFIED` | `'last-modified'` |
| `HTTP.Headers.REQUEST_TRACING_ID` | `'x-request-id'` |
| `HTTP.Headers.REQUEST_DEVICE_INFO` | `'x-device-info'` |
| `HTTP.Headers.REQUEST_CHANNEL` | `'x-request-channel'` |
| `HTTP.Headers.REQUEST_COUNT_DATA` | `'x-request-count'` |
| `HTTP.Headers.RESPONSE_COUNT_DATA` | `'x-response-count'` |
| `HTTP.Headers.RESPONSE_FORMAT` | `'x-response-format'` |

**Header Values** (commonly used subset -- the full list also covers XML, PDF, zip, image, CSS/CSV/HTML, and event-stream types):

| Constant | Value |
|----------|-------|
| `HTTP.HeaderValues.APPLICATION_JSON` | `'application/json'` |
| `HTTP.HeaderValues.APPLICATION_FORM_URLENCODED` | `'application/x-www-form-urlencoded'` |
| `HTTP.HeaderValues.APPLICATION_OCTET_STREAM` | `'application/octet-stream'` |
| `HTTP.HeaderValues.MULTIPART_FORM_DATA` | `'multipart/form-data'` |
| `HTTP.HeaderValues.TEXT_PLAIN` | `'text/plain'` |

**Methods:**

| Constant | Value |
|----------|-------|
| `HTTP.Methods.GET` | `'get'` |
| `HTTP.Methods.POST` | `'post'` |
| `HTTP.Methods.PUT` | `'put'` |
| `HTTP.Methods.PATCH` | `'patch'` |
| `HTTP.Methods.DELETE` | `'delete'` |
| `HTTP.Methods.HEAD` | `'head'` |
| `HTTP.Methods.OPTIONS` | `'options'` |

**Result Codes:**

Status codes are grouped by class under `HTTP.ResultCodes.RS_1` through `HTTP.ResultCodes.RS_5` (e.g. `HTTP.ResultCodes.RS_4.NotFound`).

| Group | Constant | Value |
|-------|----------|-------|
| **RS_1** (1xx) | `Continue` | `100` |
| | `SwitchingProtocols` | `101` |
| | `EarlyHints` | `103` |
| **RS_2** (2xx) | `Ok` | `200` |
| | `Created` | `201` |
| | `Accepted` | `202` |
| | `NonAuthoritativeInformation` | `203` |
| | `NoContent` | `204` |
| | `ResetContent` | `205` |
| | `PartialContent` | `206` |
| | `MultiStatus` | `207` |
| **RS_3** (3xx) | `MovedPermanently` | `301` |
| | `Found` | `302` |
| | `NotModified` | `304` |
| | `TemporaryRedirect` | `307` |
| | `PermanentRedirect` | `308` |
| **RS_4** (4xx) | `BadRequest` | `400` |
| | `Unauthorized` | `401` |
| | `PaymentRequired` | `402` |
| | `Forbidden` | `403` |
| | `NotFound` | `404` |
| | `MethodNotAllowed` | `405` |
| | `NotAcceptable` | `406` |
| | `RequestTimeout` | `408` |
| | `Conflict` | `409` |
| | `Gone` | `410` |
| | `LengthRequired` | `411` |
| | `PreconditionFailed` | `412` |
| | `ContentTooLarge` | `413` |
| | `URITooLong` | `414` |
| | `UnsupportedMediaType` | `415` |
| | `RangeNotSatisfiable` | `416` |
| | `ExpectationFailed` | `417` |
| | `UnprocessableEntity` | `422` |
| | `Locked` | `423` |
| | `FailedDependency` | `424` |
| | `TooEarly` | `425` |
| | `UpgradeRequired` | `426` |
| | `PreconditionRequired` | `428` |
| | `TooManyRequests` | `429` |
| | `RequestHeaderFieldsTooLarge` | `431` |
| | `UnavailableForLegalReasons` | `451` |
| **RS_5** (5xx) | `InternalServerError` | `500` |
| | `NotImplemented` | `501` |
| | `BadGateway` | `502` |
| | `ServiceUnavailable` | `503` |
| | `GatewayTimeout` | `504` |
| | `HTTPVersionNotSupported` | `505` |
| | `InsufficientStorage` | `507` |
| | `LoopDetected` | `508` |
| | `NetworkAuthenticationRequired` | `511` |

**Derived Types:**

```typescript
type THttpMethod = ValueOf<typeof HTTP.Methods>;         // 'get' | 'post' | 'put' | ...
type THttpResultCode = ValueOf<typeof HTTP.ResultCodes>; // union of the RS_1..RS_5 group objects
```

#### GRPC

gRPC protocol constants for headers, methods, content types, and status codes.

```typescript
import { GRPC } from '@venizia/ignis-helpers';
```

| Property | Type | Description |
|----------|------|-------------|
| `GRPC.Methods.UNARY` | `'unary'` | Single request, single response |
| `GRPC.Methods.SERVER_STREAMING` | `'server_streaming'` | Single request, stream of responses |
| `GRPC.Methods.CLIENT_STREAMING` | `'client_streaming'` | Stream of requests, single response |
| `GRPC.Methods.BIDI_STREAMING` | `'bidi_streaming'` | Bidirectional streaming |
| `GRPC.Headers.CONTENT_TYPE` | `'content-type'` | HTTP content type header |
| `GRPC.Headers.TE` | `'te'` | Transfer encoding header |
| `GRPC.Headers.USER_AGENT` | `'user-agent'` | User agent header |
| `GRPC.Headers.GRPC_TIMEOUT` | `'grpc-timeout'` | gRPC timeout header |
| `GRPC.Headers.GRPC_ENCODING` | `'grpc-encoding'` | gRPC encoding header |
| `GRPC.Headers.GRPC_ACCEPT_ENCODING` | `'grpc-accept-encoding'` | gRPC accepted encodings header |
| `GRPC.Headers.GRPC_MESSAGE_TYPE` | `'grpc-message-type'` | gRPC message type header |
| `GRPC.Headers.GRPC_STATUS` | `'grpc-status'` | gRPC status code header |
| `GRPC.Headers.GRPC_MESSAGE` | `'grpc-message'` | gRPC error message header |
| `GRPC.Headers.GRPC_STATUS_DETAILS_BIN` | `'grpc-status-details-bin'` | gRPC binary status details header |
| `GRPC.Headers.GRPC_PREVIOUS_RPC_ATTEMPTS` | `'grpc-previous-rpc-attempts'` | gRPC previous RPC attempts header |
| `GRPC.Headers.GRPC_RETRY_PUSHBACK_MS` | `'grpc-retry-pushback-ms'` | gRPC retry pushback milliseconds header |
| `GRPC.Headers.GRPC_TRACE_BIN` | `'grpc-trace-bin'` | gRPC binary trace context header |
| `GRPC.Headers.GRPC_TAGS_BIN` | `'grpc-tags-bin'` | gRPC binary tags header |
| `GRPC.HeaderValues.GRPC` | `'application/grpc'` | Standard gRPC content type |
| `GRPC.HeaderValues.GRPC_PROTO` | `'application/grpc+proto'` | gRPC Protobuf content type |
| `GRPC.HeaderValues.GRPC_JSON` | `'application/grpc+json'` | gRPC JSON content type |
| `GRPC.HeaderValues.GRPC_WEB` | `'application/grpc-web'` | gRPC-Web content type |
| `GRPC.HeaderValues.GRPC_WEB_PROTO` | `'application/grpc-web+proto'` | gRPC-Web Protobuf content type |
| `GRPC.HeaderValues.GRPC_WEB_JSON` | `'application/grpc-web+json'` | gRPC-Web JSON content type |
| `GRPC.HeaderValues.GRPC_WEB_TEXT` | `'application/grpc-web-text'` | gRPC-Web text content type |
| `GRPC.ResultCodes.OK` | `0` | Success |
| `GRPC.ResultCodes.CANCELLED` | `1` | Operation cancelled |
| `GRPC.ResultCodes.UNKNOWN` | `2` | Unknown error |
| `GRPC.ResultCodes.INVALID_ARGUMENT` | `3` | Invalid argument |
| `GRPC.ResultCodes.DEADLINE_EXCEEDED` | `4` | Deadline exceeded |
| `GRPC.ResultCodes.NOT_FOUND` | `5` | Not found |
| `GRPC.ResultCodes.ALREADY_EXISTS` | `6` | Already exists |
| `GRPC.ResultCodes.PERMISSION_DENIED` | `7` | Permission denied |
| `GRPC.ResultCodes.RESOURCE_EXHAUSTED` | `8` | Resource exhausted |
| `GRPC.ResultCodes.FAILED_PRECONDITION` | `9` | Failed precondition |
| `GRPC.ResultCodes.ABORTED` | `10` | Operation aborted |
| `GRPC.ResultCodes.OUT_OF_RANGE` | `11` | Out of range |
| `GRPC.ResultCodes.UNIMPLEMENTED` | `12` | Unimplemented |
| `GRPC.ResultCodes.INTERNAL` | `13` | Internal server error |
| `GRPC.ResultCodes.UNAVAILABLE` | `14` | Service unavailable |
| `GRPC.ResultCodes.DATA_LOSS` | `15` | Unrecoverable data loss |
| `GRPC.ResultCodes.UNAUTHENTICATED` | `16` | Unauthenticated |

```typescript
// Derived types
type TGrpcMethod = ValueOf<typeof GRPC.Methods>;
type TGrpcResultCode = ValueOf<typeof GRPC.ResultCodes>;
```

#### MimeTypes

```typescript
class MimeTypes {
  static readonly UNKNOWN = 'unknown';
  static readonly IMAGE = 'image';
  static readonly VIDEO = 'video';
  static readonly TEXT = 'text';
}

type TMimeTypes = TConstValue<typeof MimeTypes>; // 'unknown' | 'image' | 'video' | 'text'
```

Content type classification constants.

## See Also

- **Guides:**
  - [Dependency Injection](/guides/core-concepts/dependency-injection) - DI types and patterns
  - [Repositories](/guides/core-concepts/persistent/repositories) - Repository mixins use these types

- **References:**
  - [Repository Mixins](/references/base/repositories/mixins) - Uses mixin types
  - [Utilities Index](/references/utilities/index) - Type utilities
