---
title: Middleware Reference
description: Technical reference for built-in middlewares in IGNIS
difficulty: intermediate
lastUpdated: 2026-03-15
---

# Middleware Reference

IGNIS provides built-in middleware functions and a provider-based middleware class for handling common HTTP concerns: error handling, request logging, 404 responses, and favicon serving. These are registered automatically by `BaseApplication` during startup.

**Files:**
- `packages/core/src/base/middlewares/app-error.middleware.ts`
- `packages/core/src/base/middlewares/not-found.middleware.ts`
- `packages/core/src/base/middlewares/request-spy.middleware.ts`
- `packages/core/src/base/middlewares/emoji-favicon.middleware.ts`

## Prerequisites

Before reading this document, you should understand:
- [Hono middleware](https://hono.dev/docs/guides/middleware) basics
- [Application lifecycle](./application.md)
- [Providers](./providers.md) - `RequestSpyMiddleware` implements `IProvider`

## Quick Reference

| Middleware | Type | Purpose |
|-----------|------|---------|
| `appErrorHandler` | `ErrorHandler` | Global error handler (Zod, DB constraints, generic) |
| `notFoundHandler` | `NotFoundHandler` | JSON 404 response for unknown routes |
| `RequestSpyMiddleware` | `IProvider<MiddlewareHandler>` | Request/response logging with timing |
| `emojiFavicon` | `MiddlewareHandler` | Serves an emoji as SVG favicon |

## Default Registration Order

`BaseApplication.registerDefaultMiddlewares()` registers middleware in this order during `initialize()`:

```typescript
protected async registerDefaultMiddlewares() {
  const server = this.getServer();

  // 1. Global error handler
  server.onError(appErrorHandler({ logger, rootKey }));

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

## appErrorHandler

Global error handler registered via `server.onError()`. Handles ZodError validation errors, PostgreSQL constraint violations, and generic errors.

### Signature

```typescript
function appErrorHandler(opts: {
  logger: Logger;
  rootKey?: string;
}): ErrorHandler
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `logger` | `Logger` | Logger instance for error logging |
| `rootKey` | `string \| undefined` | Optional root key to wrap the error response object |

### Error Handling Logic

#### 1. ZodError (Validation Errors)

When `error.name === 'ZodError'`, returns HTTP `422 Unprocessable Entity`:

```json
{
  "message": "ValidationError",
  "statusCode": 422,
  "requestId": "abc-123",
  "details": {
    "url": "http://localhost:3000/users",
    "path": "/users",
    "stack": "...(non-production only)",
    "cause": [
      {
        "path": "email",
        "message": "Invalid email",
        "code": "invalid_string",
        "expected": "string",
        "received": "undefined"
      }
    ]
  }
}
```

#### 2. PostgreSQL Constraint Violations

Database errors with recognized SQLSTATE codes return HTTP `400 Bad Request` instead of 500:

| SQLSTATE Code | Error Type |
|--------------|------------|
| `23505` | Unique constraint violation |
| `23503` | Foreign key constraint violation |
| `23502` | Not null constraint violation |
| `23514` | Check constraint violation |
| `23P01` | Exclusion constraint violation |
| `22P02` | Invalid text representation |
| `22003` | Numeric value out of range |
| `22001` | String data too long |

The error response includes detail, table, and constraint information when available from the database error's `cause` property.

#### 3. Generic Errors

All other errors use the `statusCode` property from the error if present, otherwise default to HTTP `500 Internal Server Error`.

### Response Format

```json
{
  "message": "Error message",
  "statusCode": 500,
  "requestId": "abc-123",
  "details": {
    "url": "http://localhost:3000/users",
    "path": "/users",
    "stack": "...(non-production only)",
    "cause": "...(non-production only)"
  }
}
```

When `rootKey` is provided (e.g., `rootKey: 'error'`), the response is wrapped:

```json
{
  "error": {
    "message": "Error message",
    "statusCode": 500,
    "requestId": "abc-123",
    "details": { ... }
  }
}
```

**Production behavior:** `stack` and `cause` fields are omitted when `NODE_ENV` is `'production'`.


## notFoundHandler

Returns a JSON 404 response when no route matches. Registered via `server.notFound()`.

### Signature

```typescript
function notFoundHandler(opts: {
  logger?: Logger;
}): NotFoundHandler
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `logger` | `Logger \| undefined` | Logger instance (defaults to `console`) |

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

The handler logs the 404 at error level with the request ID, path, and full URL.


## RequestSpyMiddleware

A provider-based middleware class that logs incoming request details and outgoing response timing. It extends `BaseHelper` and implements `IProvider<MiddlewareHandler>`.

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


## emojiFavicon

A simple middleware that serves an emoji as an SVG favicon on `/favicon.ico`.

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
  error?: { rootKey: string };         // Root key wrapper for appErrorHandler
  asyncContext?: { enable: boolean };  // Enable Hono contextStorage() middleware
  // ...
}
```

## User-Defined Middlewares

The `setupMiddlewares()` abstract method on `AbstractApplication` is called after `initialize()` and before the server starts. Use this hook to register additional Hono middlewares:

```typescript
export class MyApplication extends BaseApplication {
  async setupMiddlewares() {
    const server = this.getServer();

    // CORS
    server.use(cors({ origin: '*' }));

    // Body limit
    server.use(bodyLimit({ maxSize: 1024 * 1024 })); // 1MB
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


## See Also

- **Related References:**
  - [Application](./application.md) - Application lifecycle and initialization
  - [Providers](./providers.md) - Provider pattern (`RequestSpyMiddleware` implements `IProvider`)
  - [Components](./components.md) - `RequestTrackerComponent`

- **Guides:**
  - [Application Guide](/guides/core-concepts/application/)
