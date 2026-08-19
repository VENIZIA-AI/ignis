---
title: Middlewares Reference
description: Technical reference for built-in middlewares in IGNIS
difficulty: intermediate
lastUpdated: 2026-06-14
---

# Middlewares Reference

IGNIS provides built-in middleware functions and a provider-based middleware class for handling common HTTP concerns: error handling, request logging, 404 responses, and favicon serving. These are registered automatically by `BaseApplication` during startup - you do not import or wire them manually.

**Files:**
- `packages/core-server/src/base/middlewares/app-error/app-error.middleware.ts`
- `packages/core-server/src/base/middlewares/not-found/not-found.middleware.ts`
- `packages/core-server/src/base/middlewares/request-spy/request-spy.middleware.ts`
- `packages/core-server/src/base/middlewares/emoji-favicon/emoji-favicon.middleware.ts`

## Prerequisites

Before reading this document, you should understand:
- [Hono middleware](https://hono.dev/docs/guides/middleware) basics
- [Application lifecycle](./application.md)
- [Providers](./providers.md) - `RequestSpyMiddleware` implements `IProvider`

## Quick Reference

| Middleware | Type | Purpose |
|-----------|------|---------|
| `AppErrorMiddleware` | `IProvider<ErrorHandler>` | Global error handler (Zod, DB constraints, generic) |
| `notFoundHandler` | `NotFoundHandler` | JSON 404 response for unknown routes |
| `RequestSpyMiddleware` | `IProvider<MiddlewareHandler>` | Request/response logging with timing |
| `emojiFavicon` | `MiddlewareHandler` | Serves an emoji as SVG favicon |

## Default Registration Order

`BaseApplication.registerDefaultMiddlewares()` registers middleware in this order during `initialize()`:

```typescript
protected async registerDefaultMiddlewares() {
  const server = this.getServer();

  // 1. Global error handler
  server.onError(new AppErrorMiddleware({ logger, rootKey }).value());

  // 2. Async context storage (if enabled)
  if (this.configs.asyncContext?.enable) {
    server.use(contextStorage());
  }

  // 3. Not-found handler
  server.notFound(notFoundHandler({ logger }));

  // 4. RequestTrackerComponent (requestId + RequestSpyMiddleware)
  this.component(RequestTrackerComponent);

  // 5. Emoji favicon
  server.use(emojiFavicon({ icon: this.configs.favicon ?? '🔥' }));
}
```

After `registerDefaultMiddlewares()`, the application calls user-defined `staticConfigure()`, `preConfigure()`, and so on. The user's `setupMiddlewares()` hook runs after `initialize()` but before the server starts.

## AppErrorMiddleware

Global error handler registered via `server.onError()`. Handles ZodError validation errors, PostgreSQL constraint violations, and generic errors. Like `RequestSpyMiddleware`, it is an `IProvider` - build it, then call `value()` for the handler.

Registered automatically by `BaseApplication`.

### Signature

```typescript
class AppErrorMiddleware extends BaseHelper implements IProvider<ErrorHandler> {
  constructor(opts?: { logger?: ILogger; rootKey?: string });
  value(): ErrorHandler;
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `logger` | `ILogger \| undefined` | Overrides the middleware's own scoped logger - `BaseApplication` passes its own so error lines stay in its scope |
| `rootKey` | `string \| undefined` | Optional root key to wrap the error response object |

### Error Handling Logic

#### 1. ZodError (Validation Errors)

When `error.name === 'ZodError'`, returns HTTP `422 Unprocessable Entity`.

`message` and `normalized.code` come from the first failing issue. `message` is that issue's message; `normalized.code` is its `params.code` if the schema set one, otherwise its raw Zod code. The full per-field list stays under `details.cause`. `normalized.args` is always `{}` - a Zod issue carries no interpolation values.

```json
{
  "message": "Invalid email address",
  "statusCode": 422,
  "normalized": {
    "text": "Invalid email address",
    "code": "user.email.invalid",
    "args": {}
  },
  "requestId": "abc-123",
  "details": {
    "url": "http://localhost:3000/users",
    "path": "/users",
    "stack": "...(non-production only)",
    "cause": [
      {
        "path": "email",
        "message": "Invalid email address",
        "code": "invalid_string",
        "expected": "string",
        "received": "undefined"
      }
    ]
  }
}
```

To emit a stable, domain-specific `normalized.code`, attach `params.code` to a custom check:

```typescript
z.string().refine(isEmail, {
  message: 'Invalid email address',
  params: { code: 'user.email.invalid' }
});
// produces "normalized": { "code": "user.email.invalid", ... }
```

> [!NOTE]
> When `error.message` cannot be parsed as the expected Zod issue array (a malformed or unrecognized `ZodError`), no issue-derived code exists. `normalized.code` still resolves to `MessageCode.DEFAULT` (`"core.system_error"`) via `MessageCode.resolve(undefined)`. No error response from this middleware is ever missing `normalized.code`.

#### 2. PostgreSQL Constraint Violations

Database errors in SQLSTATE class `22` (data exception), `23` (integrity constraint), and `44` (WITH CHECK OPTION violation) are detected by class. They return HTTP `400 Bad Request`. A known code uses its specific message; any other in-class code uses `"Invalid database request"` as a fallback.

| Class | Codes with a specific message |
|-------|-------------------------------|
| `23` Integrity | `23505` unique, `23503` foreign key, `23502` not null, `23514` check, `23P01` exclusion, `23000` integrity, `23001` restrict |
| `22` Data exception | `22001` string too long, `22003` numeric range, `22004` null not allowed, `22007` datetime format, `22008` datetime overflow, `22009` tz displacement, `22011` substring, `22012` division by zero, `22023` invalid parameter, `22025` invalid escape, `22026` length mismatch, `22030` duplicate JSON key, `22032` invalid JSON, `22P01` floating-point, `22P02` invalid text, `22P03` invalid binary, `22P05` untranslatable char |
| `44` View check | `44000` WITH CHECK OPTION violation |

:::tip Transient conflicts return 409, not 400/500
Class `40` (`40001` serialization failure, `40P01` deadlock) is transient/retryable. It returns **409 Conflict** with `normalized.code: "database.conflict"` and a safe "please retry" message - the client can safely retry the same request. Programming/infra classes (`42` syntax, `53` resources, `0A`, `25`, `28`) remain 500.
:::

:::warning Production sanitizes database internals
In **production** the message is the base message only - `Detail:`/`Table:`/`Constraint:` are stripped (they echo row values and schema names), and `details.stack`/`details.cause` are omitted. Codes outside class 22/23/44 (e.g. `42703` undefined column) and connection failures return a generic `"Internal Server Error"`, so SQL, schema names, and connection host/port never leak.
:::

#### 3. Generic Errors

All other errors use the `statusCode` property from the error if present, otherwise default to HTTP `500 Internal Server Error`.

### Response Format

```json
{
  "message": "Error message",
  "statusCode": 500,
  "normalized": {
    "text": "Error message",
    "code": "core.system_error",
    "args": {}
  },
  "requestId": "abc-123",
  "details": {
    "url": "http://localhost:3000/users",
    "path": "/users",
    "stack": "...(non-production only)",
    "cause": "...(non-production only)"
  }
}
```

An intentional `getError(...)` throw also carries `extra` when the throw site attached context of its own; every other branch never does. There is no top-level `messageCode` - the code always lives at `normalized.code`.

When `rootKey` is provided (e.g., `rootKey: 'error'`), the response is wrapped:

```json
{
  "error": {
    "message": "Error message",
    "statusCode": 500,
    "normalized": {
      "text": "Error message",
      "code": "core.system_error",
      "args": {}
    },
    "requestId": "abc-123",
    "details": { ... }
  }
}
```

**Production behavior:** `stack` and `cause` fields are omitted when `NODE_ENV` is `'production'`.

### Custom Errors

Throw any error with a `statusCode` property and the handler picks it up:

```typescript
class NotFoundError extends Error {
  statusCode = 404;

  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

// In a controller
@get({ configs: GetUserConfig })
async getUser(c: TRouteContext) {
  const user = await this.userRepository.findById(id);
  if (!user) {
    throw new NotFoundError(`User ${id} not found`);
  }
  return c.json(user, HTTP.ResultCodes.RS_2.Ok);
}
```


## notFoundHandler

Returns a JSON 404 response when no route matches. Registered via `server.notFound()`.

**Not exported from `@venizia/ignis`** - registered automatically by `BaseApplication`.

### Signature

```typescript
function notFoundHandler(opts: {
  logger?: ILogger;
}): NotFoundHandler
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `logger` | `ILogger \| undefined` | Logger instance (defaults to `console`) |

### Response Format

```json
{
  "message": "URL NOT FOUND",
  "statusCode": 404,
  "requestId": "abc-123",
  "path": "/unknown",
  "url": "http://localhost:3000/unknown"
}
```

The handler logs the 404 at warn level with the request ID, path, and full URL. An unrouted path is a
client mistake, not a server fault - alerting tuned to error level should not fire on it.


## RequestSpyMiddleware

A provider-based middleware class that logs incoming request details and outgoing response timing. It extends `BaseHelper` and implements `IProvider<MiddlewareHandler>`.

**Not exported from `@venizia/ignis`** - registered automatically via `RequestTrackerComponent` by `BaseApplication`.

### Class Definition

```typescript
export class RequestSpyMiddleware extends BaseHelper implements IProvider<MiddlewareHandler> {
  static readonly REQUEST_ID_KEY = 'requestId';

  constructor() {
    super({ scope: 'SpyMW' });
  }

  async parseBody(opts: { req: TContext['req'] }): Promise<unknown>;
  value(): MiddlewareHandler;
}
```

### How It Is Registered

`RequestSpyMiddleware` is not registered directly. Instead, `BaseApplication.registerDefaultMiddlewares()` registers a `RequestTrackerComponent`, which:

1. Adds the `requestId()` middleware from `hono/request-id` to assign a unique ID to every request
2. Binds `RequestSpyMiddleware` as a singleton provider in the DI container
3. Resolves the middleware via `IProvider.value()` and registers it with `server.use()`

### Request Logging

In **non-production** mode, logs the full request including query and body:

```
[requestId][clientIp][=>] METHOD   /path | query: {...} | body: {...}
```

In **production** mode, body is excluded:

```
[requestId][clientIp][=>] METHOD   /path | query: {...}
```

### Response Logging

After the handler completes:

```
[requestId][clientIp][<=] METHOD   /path | Took: 12.34 (ms)
```

### Body Parsing

The `parseBody` method parses the request body based on `Content-Type`:

| Content-Type | Parse Method |
|-------------|-------------|
| `application/json` | `req.json()` |
| `multipart/form-data` | `req.parseBody()` |
| `application/x-www-form-urlencoded` | `req.parseBody()` |
| Other | `req.text()` |

Returns `null` if no `Content-Type` header or `Content-Length` is `0`/missing. Throws HTTP 400 `'Malformed Body Payload'` on parse failure.

### IP Detection

The middleware resolves the client IP from the connection info or falls back to `x-real-ip` / `x-forwarded-for` headers. If neither is available, it throws HTTP 400 `'Malformed Connection Info'`.

### Accessing the Request ID

`RequestSpyMiddleware.REQUEST_ID_KEY` is `'requestId'` - since the middleware class itself is not exported from `@venizia/ignis`, read the context variable by that key:

```typescript
import { get, jsonResponse, TRouteContext } from '@venizia/ignis';
import { z } from '@hono/zod-openapi';
import { HTTP } from '@venizia/ignis-helpers';

const ExampleConfig = {
  method: HTTP.Methods.GET,
  path: '/example',
  responses: jsonResponse({
    schema: z.object({ requestId: z.string() }),
  }),
} as const;

@get({ configs: ExampleConfig })
async example(c: TRouteContext) {
  const requestId = c.get('requestId');
  return c.json({ requestId }, HTTP.ResultCodes.RS_2.Ok);
}
```


## emojiFavicon

A simple middleware that serves an emoji as an SVG favicon on `/favicon.ico`.

**Not exported from `@venizia/ignis`** - registered automatically by `BaseApplication`.

### Signature

```typescript
function emojiFavicon(opts: { icon: string }): MiddlewareHandler
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `icon` | `string` | Emoji character to use as favicon |

### Behavior

- Only intercepts requests to `/favicon.ico`
- Returns an SVG with `content-type: image/svg+xml`
- All other requests pass through via `next()`

**Default icon:** The application uses `this.configs.favicon ?? '🔥'` when registering.


## Middleware Configuration via IApplicationConfigs

Several middleware behaviors are configured through `IApplicationConfigs`:

```typescript
interface IApplicationConfigs {
  favicon?: string;                    // Emoji for emojiFavicon (default: '🔥')
  error?: { rootKey: string };         // Root key wrapper for AppErrorMiddleware
  asyncContext?: { enable: boolean };  // Enable Hono contextStorage() middleware
  // ...
}
```

## User-Defined Middlewares

The `setupMiddlewares()` abstract method on `AbstractApplication` is called after `initialize()` and before the server starts. Use this hook to register additional Hono middlewares via `this.getServer()`:

```typescript
export class MyApplication extends BaseApplication {
  async setupMiddlewares() {
    const server = this.getServer();

    // CORS
    server.use(cors({ origin: '*' }));

    // Body limit
    server.use(bodyLimit({ maxSize: 1024 * 1024 })); // 1MB

    // Route-specific
    server.use('/api/admin/*', adminAuthMiddleware());
  }
}
```

The `IMiddlewareConfigs` type defines the shape for configurable middleware options:

```typescript
interface IMiddlewareConfigs {
  requestId?: IRequestIdOptions;
  compress?: ICompressOptions;
  cors?: ICORSOptions;
  csrf?: ICSRFOptions;
  bodyLimit?: IBodyLimitOptions;
  ipRestriction?: IBaseMiddlewareOptions & IIPRestrictionRules;
  [extra: string | symbol]: any;
}
```

Each option interface extends `IBaseMiddlewareOptions`:

```typescript
interface IBaseMiddlewareOptions {
  enable: boolean;
  path?: string;
  [extra: string | symbol]: any;
}
```


## Creating Custom Middleware

IGNIS uses Hono's middleware system. Create custom middleware using the `createMiddleware` factory from `hono/factory`.

### Basic Middleware

```typescript
import { createMiddleware } from 'hono/factory';
import type { MiddlewareHandler } from 'hono';

export const myMiddleware = (): MiddlewareHandler => {
  return createMiddleware(async (context, next) => {
    // Before request handling
    console.log('Before:', context.req.path);

    await next();

    // After request handling
    console.log('After:', context.req.path);
  });
};
```

### Middleware with Options

```typescript
interface MyMiddlewareOptions {
  enabled: boolean;
  prefix?: string;
}

export const myMiddleware = (opts: MyMiddlewareOptions): MiddlewareHandler => {
  const { enabled, prefix = 'LOG' } = opts;

  return createMiddleware(async (context, next) => {
    if (enabled) {
      console.log(`[${prefix}]`, context.req.path);
    }
    await next();
  });
};
```

### Provider-Based Middleware

For middleware requiring dependency injection, implement `IProvider<MiddlewareHandler>`:

```typescript
import { BaseHelper } from '@venizia/ignis-helpers';
import { IProvider } from '@venizia/ignis-inversion';
import { createMiddleware } from 'hono/factory';
import type { MiddlewareHandler } from 'hono';

export class MyMiddleware extends BaseHelper implements IProvider<MiddlewareHandler> {
  constructor() {
    super({ scope: MyMiddleware.name });
  }

  value(): MiddlewareHandler {
    return createMiddleware(async (context, next) => {
      this.logger.info('Processing request:', context.req.path);
      await next();
    });
  }
}
```

Register it with `.toProvider()` (the same pattern `RequestTrackerComponent` uses for `RequestSpyMiddleware`). Then use the resolved handler inside `setupMiddlewares()`: `get()` returns the produced `MiddlewareHandler`, because the container calls `value()` for provider bindings.

```typescript
export class MyApplication extends BaseApplication {
  preConfigure() {
    this.bind({ key: 'middlewares.MyMiddleware' })
      .toProvider(MyMiddleware)
      .setScope(BindingScopes.SINGLETON);
  }

  async setupMiddlewares() {
    const myMiddleware = this.get<MiddlewareHandler>({ key: 'middlewares.MyMiddleware' });
    this.getServer().use(myMiddleware);
  }
}
```


## Performance Considerations

### Request Spy in Production

`RequestSpyMiddleware` logs every request. IGNIS automatically skips body logging in production (`NODE_ENV === 'production'`), but the middleware still runs. For ultra-high-traffic workloads consider sampling strategies or externalizing log aggregation.

### Error Logging Volume

Error handlers log every error. For high error rates, consider:
- Sampling (log 1 in N errors)
- Error aggregation services (Sentry, Rollbar)
- Rate-limited logging


## See Also

- **Related References:**
  - [Application](./application.md) - Application lifecycle and initialization
  - [Providers](./providers.md) - Provider pattern (`RequestSpyMiddleware` implements `IProvider`)
  - [Components](./components.md) - `RequestTrackerComponent`

- **Guides:**
  - [Application Guide](/guides/core-concepts/application/)

- **External Resources:**
  - [Hono Middleware Documentation](https://hono.dev/docs/guides/middleware)
