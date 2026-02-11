# Usage

## Constants

### Defaults

```typescript
class Defaults {
  static readonly APPLICATION_NAME: string; // process.env.APP_ENV_APPLICATION_NAME ?? 'APP'
  static readonly QUERY_LIMIT = 50;
  static readonly QUERY_OFFSET = 0;
}
```

Application-wide defaults for query pagination and application naming.

### RuntimeModules

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

Runtime detection utility. `detect()` returns `'bun'` if running in Bun, `'node'` otherwise.

### DataTypes

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

Schema data type constants with validation via `SCHEME_SET` and `isValid()`.

### HTTP

The `HTTP` class groups HTTP-related constants.

**Headers:**

```typescript
HTTP.Headers.AUTHORIZATION       // 'authorization'
HTTP.Headers.CONTENT_TYPE        // 'content-type'
HTTP.Headers.REQUEST_TRACING_ID  // 'x-request-id'
// ... and more
```

::: details All HTTP.Headers values

| Constant | Value |
|----------|-------|
| `AUTHORIZATION` | `'authorization'` |
| `CACHE_CONTROL` | `'cache-control'` |
| `CONTENT_DISPOSITION` | `'content-disposition'` |
| `CONTENT_ENCODING` | `'content-encoding'` |
| `CONTENT_LENGTH` | `'content-length'` |
| `CONTENT_TYPE` | `'content-type'` |
| `CONTENT_RANGE` | `'content-range'` |
| `ETAG` | `'etag'` |
| `LAST_MODIFIED` | `'last-modified'` |
| `REQUEST_TRACING_ID` | `'x-request-id'` |
| `REQUEST_DEVICE_INFO` | `'x-device-info'` |
| `REQUEST_CHANNEL` | `'x-request-channel'` |
| `REQUEST_COUNT_DATA` | `'x-request-count'` |
| `RESPONSE_COUNT_DATA` | `'x-response-count'` |
| `RESPONSE_FORMAT` | `'x-response-format'` |

:::

**Header Values:**

```typescript
HTTP.HeaderValues.APPLICATION_JSON           // 'application/json'
HTTP.HeaderValues.APPLICATION_FORM_URLENCODED // 'application/x-www-form-urlencoded'
HTTP.HeaderValues.APPPLICATION_OCTET_STREAM  // 'application/octet-stream'
HTTP.HeaderValues.MULTIPART_FORM_DATA        // 'multipart/form-data'
HTTP.HeaderValues.TEXT_PLAIN                 // 'text/plain'
```

**Methods:**

```typescript
HTTP.Methods.GET     // 'get'
HTTP.Methods.POST    // 'post'
HTTP.Methods.PUT     // 'put'
HTTP.Methods.PATCH   // 'patch'
HTTP.Methods.DELETE   // 'delete'
HTTP.Methods.HEAD    // 'head'
HTTP.Methods.OPTIONS // 'options'
```

**Result Codes:**

```typescript
HTTP.ResultCodes.RS_FAIL           // 0
HTTP.ResultCodes.RS_SUCCESS        // 1
HTTP.ResultCodes.RS_UNKNOWN_ERROR  // -199
HTTP.ResultCodes.RS_2.Ok           // 200
HTTP.ResultCodes.RS_4.NotFound     // 404
HTTP.ResultCodes.RS_5.InternalServerError // 500
```

::: details All HTTP.ResultCodes values

| Group | Constant | Value |
|-------|----------|-------|
| Top-level | `RS_FAIL` | `0` |
| | `RS_SUCCESS` | `1` |
| | `RS_UNKNOWN_ERROR` | `-199` |
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

:::

**Derived Types:**

```typescript
type THttpMethod = ValueOf<typeof HTTP.Methods>;       // 'get' | 'post' | 'put' | ...
type THttpResultCode = ValueOf<typeof HTTP.ResultCodes>; // 0 | 1 | -199 | { Ok: 200, ... } | ...
```

### MimeTypes

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

## Shared Types

### Value Resolution Types

Types for lazy/deferred value resolution patterns.

**TResolver / TAsyncResolver:**

```typescript
type TResolver<T> = (...args: any[]) => T;
type TAsyncResolver<T> = (...args: any[]) => T | Promise<T>;
```

Function types that resolve to a value. `TAsyncResolver` supports async functions.

**TValueOrResolver / TValueOrAsyncResolver:**

```typescript
type TValueOrResolver<T> = T | TResolver<T>;
type TValueOrAsyncResolver<T> = T | TAsyncResolver<T>;
```

Union types allowing either a direct value or a resolver function.

::: details Usage example

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

// Resolve any of the above
const resolved = await resolveValueAsync(config3);
```

:::

### General Purpose Types

```typescript
type AnyType = any;
type AnyObject = Record<string | symbol | number, any>;
```

Escape hatches for general-purpose typing. `AnyObject` is a loosely-typed record.

```typescript
type TOptions<T extends object = {}> = T;
```

Wrapper type for options objects. Provides a semantic alias used across the framework.

### Nullable Types

```typescript
type TNullable<T> = T | undefined | null;
```

Makes a type nullable (can be `undefined` or `null`).

```typescript
type ValueOrPromise<T> = T | Promise<T>;
```

A value that may or may not be wrapped in a Promise.

### Class Types

```typescript
type TConstructor<T> = new (...args: any[]) => T;
type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
```

Types representing class constructors.

```typescript
type TClass<T> = TConstructor<T> & { [property: string]: any };
type TAbstractClass<T> = TAbstractConstructor<T> & { [property: string]: any };
```

Class types with static properties.

```typescript
type TMixinTarget<T> = TConstructor<{ [P in keyof T]: T[P] }>;
type TAbstractMixinTarget<T> = TAbstractConstructor<{ [P in keyof T]: T[P] }>;
```

Types for mixin pattern targets.

### Object Utility Types

```typescript
type ValueOf<T> = T[keyof T];
```

Extracts the value types from an object type.

```typescript
type ValueOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
type ValueOptionalExcept<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>>;
```

Make specific keys optional while keeping others required, or vice versa.

```typescript
type TPrettify<T> = { [K in keyof T]: T[K] } & {};
```

Flattens intersection types for better IDE display.

### Const Value Types

```typescript
type TStringConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string>;
type TNumberConstValue<T extends TClass<any>> = Extract<ValueOf<T>, number>;
type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;
```

Extract constant value types from a class. Used to derive union types from constant classes like `RuntimeModules` or `MimeTypes`.

::: details Usage example

```typescript
import { RuntimeModules, TConstValue } from '@venizia/ignis-helpers';

// TRuntimeModule = 'node' | 'bun'
type TRuntimeModule = TConstValue<typeof RuntimeModules>;
```

:::

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

type TObjectFromFieldMappings<T extends readonly { name: string; type: string; ... }[]> = {
  [K in T[number]['name']]: /* mapped type based on field type */
};
```

`TFieldMappingNames` extracts the names from a field mapping array. `TObjectFromFieldMappings` constructs a typed object where each key maps to its declared type (`string` to `string`, `numbers` to `number[]`, etc.).

### DI & Lifecycle Types

```typescript
type TInjectionGetter = <T>(opts: { key: string | symbol }) => T;
```

Function type for retrieving values from the IoC container by binding key.

```typescript
interface IConfigurable<Options extends object = any, Result = any> {
  configure(opts?: Options): ValueOrPromise<Result>;
}
```

Interface for components that require explicit initialization. Used by helpers and components that have a `configure()` lifecycle method.

### Domain Types

```typescript
type TPermissionEffect = 'allow' | 'deny';
```

Permission effect for authorization rules.

### JSX Types

Re-exported from `hono/jsx` for convenience when building JSX-based views.

```typescript
export type { Child, FC, PropsWithChildren } from 'hono/jsx';
```

## Type Utilities

### resolveValue / resolveValueAsync

```typescript
const resolveValue: <T>(valueOrResolver: TValueOrResolver<T>) => T;
const resolveValueAsync: <T>(valueOrResolver: TValueOrAsyncResolver<T>) => Promise<T>;
```

Helper functions to resolve lazy values. They handle:
- **Direct values**: returned as-is
- **Class constructors**: returned as-is (not invoked)
- **Resolver functions**: invoked and result returned

### resolveClass

```typescript
const resolveClass: <T>(
  ref: TClass<T> | TResolver<TClass<T>> | string,
) => TClass<T> | string;
```

Resolves lazy class references. Handles string binding keys (returned as-is), class constructors (returned as-is), and resolver functions (invoked).
