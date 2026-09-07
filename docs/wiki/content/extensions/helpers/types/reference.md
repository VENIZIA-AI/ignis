---
title: Types - Full Reference
description: Complete reference for every utility type, resolver function, and constant class exported from @venizia/ignis-helpers
difficulty: intermediate
---

# Types - Full Reference

Exhaustive reference for every utility type, resolver function, and constant class in `@venizia/ignis-helpers`, including the full `HTTP` and `GRPC` constant tables. For a readable introduction and the common tasks, start with the [Types overview](/extensions/helpers/types/).

**Files:**

- [`packages/helpers/src/common/types/`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/types) - utility, class, const-value, resolver, field-mapping, and injection types
- [`packages/helpers/src/common/resolvers.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/resolvers.ts) - `resolveValue`, `resolveValueAsync`, `resolveClass`
- [`packages/helpers/src/common/constants/app.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/constants/app.ts) - `Defaults`, `RuntimeModules`, `DataTypes`
- [`packages/helpers/src/common/constants/http.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/constants/http.ts) - `HTTP`
- [`packages/helpers/src/common/constants/grpc.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/constants/grpc.ts) - `GRPC`
- [`packages/helpers/src/common/constants/mime.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/constants/mime.ts) - `MimeTypes`
- [`packages/helpers/src/common/constants/index.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/constants/index.ts) - constants barrel

## Find what you need

| Looking for | Go to |
|---|---|
| An escape hatch (`any`, a loose object) | [General Purpose Types](#general-purpose-types) |
| A value that may be absent, or a callback that may be async | [Nullable and Promise Types](#nullable-and-promise-types) |
| A constructor or class type parameter | [Class and Constructor Types](#class-and-constructor-types) |
| Telling a class from a plain function at runtime | [isClass](#isclass) |
| Making object keys optional or required, or flattening `A & B` | [Object Utility Types](#object-utility-types) |
| A union type derived from a const class | [Const Value Extraction Types](#const-value-extraction-types) |
| An option that accepts an eager value or a resolver function | [Value Resolution Types and Functions](#value-resolution-types-and-functions) |
| A config-driven field-to-type mapping | [Field Mapping Types](#field-mapping-types) |
| DI container getter types, the `configure()` interface | [DI and Lifecycle Types](#di-and-lifecycle-types) |
| JSX component prop types | [JSX Types](#jsx-types) |
| Query pagination defaults, the application name | [Defaults](#defaults) |
| Detecting Bun vs Node at runtime | [RuntimeModules](#runtimemodules) |
| Schema data type constants | [DataTypes](#datatypes) |
| HTTP headers, methods, status codes | [HTTP](#http) |
| gRPC methods, headers, status codes | [GRPC](#grpc) |
| Content-type classification (image, video, text) | [MimeTypes](#mimetypes) |

## Import paths

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

// isClass (source-level class-syntax check, re-exported from @venizia/ignis-inversion)
import { isClass } from '@venizia/ignis-helpers';

// Resolver functions
import { resolveValue, resolveValueAsync, resolveClass } from '@venizia/ignis-helpers';

// Constants
import { Defaults, RuntimeModules, DataTypes, HTTP, GRPC, MimeTypes } from '@venizia/ignis-helpers';

// Derived constant types
import type {
  TRuntimeModule,
  TMimeTypes,
  THttpMethod,
  THttpProtocol,
  THttpResultCode,
  TGrpcMethod,
  TGrpcResultCode,
} from '@venizia/ignis-helpers';

// JSX types (re-exported from hono/jsx)
import type { Child, FC, PropsWithChildren } from '@venizia/ignis-helpers';
```

All of the above resolve through the root `@venizia/ignis-helpers` barrel. It re-exports `./common` in full, which includes `./common/types` and `./common/constants`.

## General Purpose Types

`Source ->` [`types/utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/types/utility.ts)

```typescript
type AnyType = any;
type AnyObject = Record<string | symbol | number, any>;
type TOptions<T extends object = {}> = T;
```

| Type | Meaning | Use |
|------|---------|-----|
| `AnyType` | Alias for `any` | Escape hatch when a shape truly cannot be known at compile time |
| `AnyObject` | Loosely-typed record | Objects whose keys and value types are not known at compile time |
| `TOptions<T>` | Identity wrapper around `T` (defaults to `{}`) | Semantic marker that a parameter follows the framework's options-object pattern |

## Nullable and Promise Types

`Source ->` [`types/utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/types/utility.ts)

```typescript
type TNullable<T> = T | undefined | null;
type ValueOrPromise<T> = T | Promise<T>;
```

| Type | Meaning | Use |
|------|---------|-----|
| `TNullable<T>` | `T \| undefined \| null` | A value that may be absent in either JavaScript "no value" form |
| `ValueOrPromise<T>` | `T \| Promise<T>` | A method or callback that may be implemented sync or async |

## Class and Constructor Types

`Source ->` [`types/class.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/types/class.ts)

```typescript
type TConstructor<T> = new (...args: any[]) => T;
type TAbstractConstructor<T> = abstract new (...args: any[]) => T;
type TClass<T> = TConstructor<T> & { [property: string]: any };
type TAbstractClass<T> = TAbstractConstructor<T> & { [property: string]: any };
type TMixinTarget<T> = TConstructor<{ [P in keyof T]: T[P] }>;
type TAbstractMixinTarget<T> = TAbstractConstructor<{ [P in keyof T]: T[P] }>;
```

| Type | Meaning | Use |
|------|---------|-----|
| `TConstructor<T>` | A concrete `new (...args) => T` constructor | Typing a parameter that must be `new`-able |
| `TAbstractConstructor<T>` | An `abstract new (...args) => T` constructor | Typing a parameter that accepts an abstract class reference |
| `TClass<T>` | `TConstructor<T>` plus an index signature for static members | The most commonly used class type - a concrete class with arbitrary static properties |
| `TAbstractClass<T>` | `TAbstractConstructor<T>` plus an index signature for static members | Same as `TClass`, for abstract classes |
| `TMixinTarget<T>` | `TConstructor` over a mapped-identity copy of `T` | Types a mixin factory's `Base` parameter so the returned class keeps `T`'s shape |
| `TAbstractMixinTarget<T>` | `TAbstractConstructor` over a mapped-identity copy of `T` | Same as `TMixinTarget`, for mixins over an abstract base |

```typescript
function MyMixin<T extends TMixinTarget<BaseClass>>(Base: T) {
  return class extends Base {
    // additional methods
  };
}
```

### isClass

`Source ->` [`packages/inversion/src/common/utilities.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/inversion/src/common/utilities.ts)

```typescript
const isClass: <T>(target: any) => target is TClass<T>;
```

Declared in `@venizia/ignis-inversion` and re-exported by `helpers`. It's the single predicate that tells a constructor from a resolver function. Controller factories and `resolveValue`/`resolveValueAsync`/`resolveClass` all branch on it.

- **Filters to functions with a `prototype`** - true of every non-arrow function, so this alone is not sufficient.
- **Decompiles the function via `Function.prototype.toString`** and regex-tests that the source text literally starts with the `class` keyword.
- **Sound only when targeting ES2024+** - a class is emitted as `class`, never as an ES5 constructor function. Bundling this package down to ES5 breaks the predicate.

## Object Utility Types

`Source ->` [`types/utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/types/utility.ts)

```typescript
type ValueOf<T> = T[keyof T];
type ValueOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
type ValueOptionalExcept<T, K extends keyof T> = Pick<T, K> & Partial<Omit<T, K>>;
type TPrettify<T> = { [K in keyof T]: T[K] } & {};
```

| Type | Meaning | Use |
|------|---------|-----|
| `ValueOf<T>` | Union of all value types of `T` | Deriving a union type from an object type, most often a const class |
| `ValueOptional<T, K>` | `T` with keys `K` made optional, the rest unchanged | Relaxing specific required fields |
| `ValueOptionalExcept<T, K>` | `T` with everything optional except keys `K` | The inverse - only `K` stays required |
| `TPrettify<T>` | Flattens an intersection (`A & B`) into one object type | Readable IDE hover tooltips when combining types with `&` |

## Const Value Extraction Types

`Source ->` [`types/const-value.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/types/const-value.ts)

```typescript
type TStringConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string>;
type TNumberConstValue<T extends TClass<any>> = Extract<ValueOf<T>, number>;
type TConstValue<T extends TClass<any>> = Extract<ValueOf<T>, string | number>;
```

| Type | Meaning | Use |
|------|---------|-----|
| `TStringConstValue<T>` | The string-valued subset of `ValueOf<T>` | Deriving a string union from a const class with mixed value types |
| `TNumberConstValue<T>` | The number-valued subset of `ValueOf<T>` | Deriving a numeric union from a const class with mixed value types |
| `TConstValue<T>` | The string-or-number-valued subset of `ValueOf<T>` | The common case - deriving a union type from a const class (`RuntimeModules`, `MimeTypes`) |

```typescript
type TRuntimeModule = TConstValue<typeof RuntimeModules>; // 'node' | 'bun'
type TMimeTypes = TConstValue<typeof MimeTypes>;          // 'unknown' | 'image' | 'video' | 'text'
```

## Value Resolution Types and Functions

Types and functions for lazy/deferred value resolution - a core pattern in the framework's DI and configuration systems.

### Types

`Source ->` [`types/resolver.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/types/resolver.ts)

```typescript
type TResolver<T> = (...args: any[]) => T;
type TAsyncResolver<T> = (...args: any[]) => T | Promise<T>;
type TValueOrResolver<T> = T | TResolver<T>;
type TValueOrAsyncResolver<T> = T | TAsyncResolver<T>;
```

| Type | Meaning | Use |
|------|---------|-----|
| `TResolver<T>` | A sync function returning `T` | Deferred value production |
| `TAsyncResolver<T>` | A function returning `T` or `Promise<T>` | Deferred value production that may be async |
| `TValueOrResolver<T>` | `T \| TResolver<T>` | Config options that accept an eager value or a sync resolver |
| `TValueOrAsyncResolver<T>` | `T \| TAsyncResolver<T>` | Config options that accept an eager value or a sync/async resolver |

### resolveValue

`Source ->` [`resolvers.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/resolvers.ts) (also `resolveValueAsync`, `resolveClass`)

```typescript
const resolveValue: <T>(valueOrResolver: TValueOrResolver<T>) => T;
```

Synchronously resolves a lazy value.

| Input | Result |
|---|---|
| Non-function value | Returned as-is |
| Class constructor | Returned as-is - detected via `isClass()`, never invoked |
| Resolver function | Invoked; the return value is returned |

### resolveValueAsync

```typescript
const resolveValueAsync: <T>(valueOrResolver: TValueOrAsyncResolver<T>) => Promise<T>;
```

Async version of `resolveValue`. Same three cases, but the resolver's return value is `await`-ed before being returned.

### resolveClass

```typescript
const resolveClass: <T>(
  ref: TClass<T> | TResolver<TClass<T>> | string,
) => TClass<T> | string;
```

Resolves lazy class references.

| Input | Result |
|---|---|
| String binding key | Returned as-is, for DI key lookups |
| Class constructor | Returned as-is |
| Resolver function | Invoked via `resolveValue`; the result is returned |

### Resolution example

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

## Field Mapping Types

`Source ->` [`types/field-mapping.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/types/field-mapping.ts)

Types for declarative field-to-type mappings, used for configuration-driven data transformation.

```typescript
type TFieldMappingDataType = 'string' | 'number' | 'strings' | 'numbers' | 'boolean';

interface IFieldMapping {
  name: string;
  type: TFieldMappingDataType;
  default?: string | number | Array<string> | Array<number> | boolean;
}

type TFieldMappingNames<T extends Array<IFieldMapping>> = Extract<
  T[number],
  { type: Exclude<T[number]['type'], undefined> }
>['name'];

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

| Type | Meaning | Use |
|------|---------|-----|
| `TFieldMappingDataType` | Union of the five supported field kinds | Constrains `IFieldMapping.type` |
| `IFieldMapping` | `{ name, type, default? }` | Declares one field's name, runtime type, and optional default |
| `TFieldMappingNames<T>` | Union of `name` values from a field-mapping array type | Extracts the set of declared field names |
| `TObjectFromFieldMappings<T>` | An object type keyed by `T[number]['name']` | Maps each declared type to its runtime TypeScript equivalent: `'string'` -> `string`, `'number'` -> `number`, `'strings'` -> `string[]`, `'numbers'` -> `number[]`, `'boolean'` -> `boolean` |

## DI and Lifecycle Types

`Source ->` [`types/injection.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/types/injection.ts)

```typescript
type TInjectionGetter = <T>(opts: { key: string | symbol }) => T;

interface IConfigurable<Options extends object = any, Result = any> {
  configure(opts?: Options): ValueOrPromise<Result>;
}
```

| Type | Meaning | Use |
|------|---------|-----|
| `TInjectionGetter` | A function retrieving `T` from the IoC container by binding key | Typing a container-getter parameter |
| `IConfigurable<Options, Result>` | Interface with one `configure(opts?)` method | Implemented by helpers and components that expose an explicit initialization step |

## JSX Types

`Source ->` [`jsx.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/jsx.ts)

Re-exported from `hono/jsx` for convenience when building JSX-based views:

```typescript
export type { Child, FC, PropsWithChildren } from 'hono/jsx';
```

| Type | Meaning |
|------|---------|
| `FC` | Function component type |
| `Child` | Valid child element type |
| `PropsWithChildren` | Props type that includes a `children` property |

## Constants

### Defaults

`Source ->` [`constants/app.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/constants/app.ts)

```typescript
class Defaults {
  static readonly APPLICATION_NAME: string; // process.env.APP_ENV_APPLICATION_NAME ?? 'APP'
  static readonly QUERY_LIMIT = 50;
  static readonly QUERY_OFFSET = 0;
}
```

Application-wide defaults for query pagination and application naming. `APPLICATION_NAME` is evaluated once, at module load.

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

Runtime detection utility.

| Method | Behavior |
|---|---|
| `detect()` | Returns `'bun'` if `typeof Bun !== 'undefined'`, else `'node'` |
| `isBun()` | Calls `detect()` and compares to `'bun'` - no caching, runs the check every time |
| `isNode()` | Calls `detect()` and compares to `'node'` - no caching, runs the check every time |

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

Schema data type constants with validation. `SCHEME_SET` contains all five valid type strings, and `isValid()` checks membership.

### HTTP

`Source ->` [`constants/http.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/constants/http.ts)

The `HTTP` class groups all HTTP-related constants into nested objects: `Headers`, `HeaderValues`, `Methods`, `Protocols`, and `ResultCodes`.

#### HTTP.Headers

Grouped by category, matching the source file's comments:

| Group | Constant | Value |
|-------|----------|-------|
| **Content** | `CONTENT_DISPOSITION` | `'content-disposition'` |
| | `CONTENT_ENCODING` | `'content-encoding'` |
| | `CONTENT_LENGTH` | `'content-length'` |
| | `CONTENT_TYPE` | `'content-type'` |
| | `CONTENT_RANGE` | `'content-range'` |
| | `CONTENT_SECURITY_POLICY` | `'content-security-policy'` |
| **Request** (content negotiation & conditionals) | `ACCEPT` | `'accept'` |
| | `ACCEPT_ENCODING` | `'accept-encoding'` |
| | `ACCEPT_LANGUAGE` | `'accept-language'` |
| | `AUTHORIZATION` | `'authorization'` |
| | `COOKIE` | `'cookie'` |
| | `HOST` | `'host'` |
| | `IF_MODIFIED_SINCE` | `'if-modified-since'` |
| | `IF_NONE_MATCH` | `'if-none-match'` |
| | `ORIGIN` | `'origin'` |
| | `REFERER` | `'referer'` |
| | `USER_AGENT` | `'user-agent'` |
| **Response** (caching, auth challenges & redirects) | `ALLOW` | `'allow'` |
| | `CACHE_CONTROL` | `'cache-control'` |
| | `ETAG` | `'etag'` |
| | `LAST_MODIFIED` | `'last-modified'` |
| | `LOCATION` | `'location'` |
| | `RETRY_AFTER` | `'retry-after'` |
| | `SET_COOKIE` | `'set-cookie'` |
| | `VARY` | `'vary'` |
| | `WWW_AUTHENTICATE` | `'www-authenticate'` |
| **CORS** (RFC 6454 / Fetch spec) | `ACCESS_CONTROL_ALLOW_CREDENTIALS` | `'access-control-allow-credentials'` |
| | `ACCESS_CONTROL_ALLOW_HEADERS` | `'access-control-allow-headers'` |
| | `ACCESS_CONTROL_ALLOW_METHODS` | `'access-control-allow-methods'` |
| | `ACCESS_CONTROL_ALLOW_ORIGIN` | `'access-control-allow-origin'` |
| | `ACCESS_CONTROL_EXPOSE_HEADERS` | `'access-control-expose-headers'` |
| | `ACCESS_CONTROL_MAX_AGE` | `'access-control-max-age'` |
| | `ACCESS_CONTROL_REQUEST_HEADERS` | `'access-control-request-headers'` |
| | `ACCESS_CONTROL_REQUEST_METHOD` | `'access-control-request-method'` |
| **Transport** | `CONNECTION` | `'connection'` |
| | `TRANSFER_ENCODING` | `'transfer-encoding'` |
| | `UPGRADE` | `'upgrade'` |
| **Security** | `STRICT_TRANSPORT_SECURITY` | `'strict-transport-security'` |
| | `X_CONTENT_TYPE_OPTIONS` | `'x-content-type-options'` |
| | `X_FRAME_OPTIONS` | `'x-frame-options'` |
| **Proxy / forwarding** (de facto standard) | `FORWARDED` | `'forwarded'` |
| | `X_FORWARDED_FOR` | `'x-forwarded-for'` |
| | `X_FORWARDED_HOST` | `'x-forwarded-host'` |
| | `X_FORWARDED_PROTO` | `'x-forwarded-proto'` |
| **Rate limiting** (de facto standard) | `X_RATELIMIT_LIMIT` | `'x-ratelimit-limit'` |
| | `X_RATELIMIT_REMAINING` | `'x-ratelimit-remaining'` |
| | `X_RATELIMIT_RESET` | `'x-ratelimit-reset'` |
| **IGNIS custom** | `REQUEST_TRACING_ID` | `'x-request-id'` |
| | `REQUEST_DEVICE_INFO` | `'x-device-info'` |
| | `REQUEST_CHANNEL` | `'x-request-channel'` |
| | `REQUEST_COUNT_DATA` | `'x-request-count'` |
| | `RESPONSE_COUNT_DATA` | `'x-response-count'` |
| | `RESPONSE_FORMAT` | `'x-response-format'` |

#### HTTP.HeaderValues

| Group | Constant | Value |
|-------|----------|-------|
| **Application** | `APPLICATION_FORM_URLENCODED` | `'application/x-www-form-urlencoded'` |
| | `APPLICATION_GRAPHQL_JSON` | `'application/graphql+json'` |
| | `APPLICATION_GZIP` | `'application/gzip'` |
| | `APPLICATION_JAVASCRIPT` | `'application/javascript'` |
| | `APPLICATION_JSON` | `'application/json'` |
| | `APPLICATION_MSGPACK` | `'application/msgpack'` |
| | `APPLICATION_NDJSON` | `'application/x-ndjson'` |
| | `APPLICATION_OCTET_STREAM` | `'application/octet-stream'` |
| | `APPLICATION_PDF` | `'application/pdf'` |
| | `APPLICATION_PROTOBUF` | `'application/x-protobuf'` |
| | `APPLICATION_XML` | `'application/xml'` |
| | `APPLICATION_ZIP` | `'application/zip'` |
| **Multipart** | `MULTIPART_FORM_DATA` | `'multipart/form-data'` |
| **Text** | `TEXT_CSS` | `'text/css'` |
| | `TEXT_CSV` | `'text/csv'` |
| | `TEXT_EVENT_STREAM` | `'text/event-stream'` |
| | `TEXT_HTML` | `'text/html'` |
| | `TEXT_PLAIN` | `'text/plain'` |
| | `TEXT_XML` | `'text/xml'` |
| **Image** | `IMAGE_GIF` | `'image/gif'` |
| | `IMAGE_JPEG` | `'image/jpeg'` |
| | `IMAGE_PNG` | `'image/png'` |
| | `IMAGE_SVG` | `'image/svg+xml'` |
| | `IMAGE_WEBP` | `'image/webp'` |

#### HTTP.Methods

| Constant | Value |
|----------|-------|
| `HTTP.Methods.GET` | `'get'` |
| `HTTP.Methods.POST` | `'post'` |
| `HTTP.Methods.PUT` | `'put'` |
| `HTTP.Methods.PATCH` | `'patch'` |
| `HTTP.Methods.DELETE` | `'delete'` |
| `HTTP.Methods.HEAD` | `'head'` |
| `HTTP.Methods.OPTIONS` | `'options'` |
| `HTTP.Methods.QUERY` | `'query'` (RFC 10008 `QUERY` method) |

> [!IMPORTANT]
> All `HTTP.Methods.*` tokens are lowercase. `@hono/zod-openapi` route definitions accept no other case.

Every IGNIS network fetcher uppercases the method at the wire boundary, via `method.toUpperCase()`. But undici, Node's `fetch` implementation, only normalizes six of the eight methods on its own:

| Undici normalizes it on its own | Undici does not |
|---|---|
| `delete`, `get`, `head`, `options`, `post`, `put` | `patch`, `query` |

A lowercase `patch` or `query` sent as-is travels verbatim over Node, and the server rejects it. Bun's `fetch` uppercases every method, which hides the bug until the app runs on Node.

#### HTTP.Protocols

| Constant | Value |
|----------|-------|
| `HTTP.Protocols.HTTP` | `'http'` |
| `HTTP.Protocols.HTTPS` | `'https'` |

#### HTTP.ResultCodes

Status codes are grouped by class under `HTTP.ResultCodes.RS_1` through `HTTP.ResultCodes.RS_5` - for example, `HTTP.ResultCodes.RS_4.NotFound`.

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

#### Derived types

```typescript
type THttpMethod = ValueOf<typeof HTTP.Methods> | Uppercase<ValueOf<typeof HTTP.Methods>>;
// 'get' | 'post' | ... | 'query' | 'GET' | 'POST' | ... | 'QUERY'

type THttpProtocol = ValueOf<typeof HTTP.Protocols> | Uppercase<ValueOf<typeof HTTP.Protocols>>;
// 'http' | 'https' | 'HTTP' | 'HTTPS'

type THttpResultCode = ValueOf<typeof HTTP.ResultCodes>;
// union of the RS_1..RS_5 group objects (not a flat number union)
```

### GRPC

`Source ->` [`constants/grpc.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/constants/grpc.ts)

gRPC protocol constants for methods, headers, content types, and status codes.

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
type TGrpcMethod = ValueOf<typeof GRPC.Methods>;
type TGrpcResultCode = ValueOf<typeof GRPC.ResultCodes>;
```

### MimeTypes

`Source ->` [`constants/mime.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/common/constants/mime.ts)

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

## See also

- [Types overview](/extensions/helpers/types/) - introduction and the most common tasks
- [Dependency Injection](/guides/core-concepts/dependency-injection) - `TInjectionGetter` and DI-adjacent types in use
- [Repository Mixins](/references/base/repositories/mixins) - `TMixinTarget` in use
- [Helpers Overview](/extensions/helpers/) - all available helpers
