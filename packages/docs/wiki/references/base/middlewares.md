---
title: Middlewares Reference
description: Technical reference for IGNIS built-in middlewares
difficulty: intermediate
lastUpdated: 2026-01-03
---

# Middlewares Reference

IGNIS provides a collection of built-in middlewares for common application needs including error handling, request logging, request normalization, and favicon serving.

**Files:**
- `packages/core/src/base/middlewares/*.ts`

## Prerequisites

- [Hono Middleware basics](https://hono.dev/docs/guides/middleware)
- [IGNIS Application basics](./application.md)
- Basic understanding of HTTP request/response lifecycle

## Quick Reference

| Middleware | Purpose | Key Options |
|------------|---------|-------------|
| `appErrorHandler` | Catches and formats application errors | `logger` |
| `notFoundHandler` | Handles 404 Not Found responses | `logger` |
| `requestNormalize` | Pre-parses JSON request bodies | None |
| `RequestSpyMiddleware` | Logs request lifecycle and timing | None |
| `emojiFavicon` | Serves an emoji as favicon | `icon` |

## Table of Contents

- [Error Handler (`appErrorHandler`)](#error-handler-apporerrorhandler)
- [Not Found Handler (`notFoundHandler`)](#not-found-handler-notfoundhandler)
- [Request Normalizer (`requestNormalize`)](#request-normalizer-requestnormalize)
- [Request Spy (Debug)](#request-spy-debug)
- [Emoji Favicon](#emoji-favicon)
- [Creating Custom Middleware](#creating-custom-middleware)
- [Middleware Order & Priority](#middleware-order--priority)
- [See Also](#see-also)

## Built-in Middlewares

### Error Handler (`appErrorHandler`)

The error handler middleware catches all unhandled errors in your application and formats them into consistent JSON responses.

**File:** `packages/core/src/base/middlewares/app-error.middleware.ts`

#### Features

- **Automatic Error Formatting**: Converts all errors to structured JSON responses
- **ZodError Support**: Special handling for Zod validation errors with detailed field-level messages
- **Database Error Handling**: Automatically returns 400 for database constraint violations (unique, foreign key, not null, etc.)
- **Environment-Aware**: Hides stack traces and error causes in production
- **Request Tracking**: Includes `requestId` for debugging and tracing
- **Status Code Detection**: Automatically extracts `statusCode` from errors

#### Usage

```typescript
import { appErrorHandler } from '@venizia/ignis';

const app = new IgnisApplication({
  // ...
});

// Register error handler
app.onError(appErrorHandler({
  logger: app.logger
}));
```

#### Error Response Format

**Standard Error:**
```json
{
  "message": "Something went wrong",
  "statusCode": 500,
  "requestId": "abc123",
  "details": {
    "url": "http://localhost:3000/api/users",
    "path": "/api/users",
    "stack": "Error: Something went wrong\n  at ...",  // development only
    "cause": { ... }  // development only
  }
}
```

**Validation Error (ZodError):**
```json
{
  "message": "ValidationError",
  "statusCode": 422,
  "requestId": "abc123",
  "details": {
    "url": "http://localhost:3000/api/users",
    "path": "/api/users",
    "stack": "...",  // development only
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

**Database Constraint Error:**

Database constraint violations (unique, foreign key, not null, check) are automatically detected and returned as 400 Bad Request with a human-readable message:

```json
{
  "message": "Unique constraint violation\nDetail: Key (email)=(test@example.com) already exists.\nTable: User\nConstraint: UQ_User_email",
  "statusCode": 400,
  "requestId": "abc123",
  "details": {
    "url": "http://localhost:3000/api/users",
    "path": "/api/users",
    "stack": "...",  // development only
    "cause": { ... }  // development only
  }
}
```

**Supported PostgreSQL Error Codes:**

| Code | Error Type |
|------|------------|
| 23505 | Unique constraint violation |
| 23503 | Foreign key constraint violation |
| 23502 | Not null constraint violation |
| 23514 | Check constraint violation |
| 23P01 | Exclusion constraint violation |
| 22P02 | Invalid text representation |
| 22003 | Numeric value out of range |
| 22001 | String data too long |

#### API Reference

##### `appErrorHandler(options)`

**Parameters:**
| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `logger` | `ApplicationLogger` | Yes | Logger instance for error logging |

**Returns:** `ErrorHandler` - Hono error handler function

#### Common Patterns

```typescript
// Custom error with status code
class NotFoundError extends Error {
  statusCode = 404;

  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

// Throw in controller
const GetUserConfig = {
  method: HTTP.Methods.GET,
  path: '/users/:id',
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: jsonResponse({
    schema: z.object({ id: z.string(), name: z.string() }),
  }),
} as const;

@get({ configs: GetUserConfig })
async getUser(c: TRouteContext) {
  const { id } = c.req.valid<{ id: string }>('param');
  const user = await this.userRepository.findById(id);
  if (!user) {
    throw new NotFoundError(`User ${id} not found`);
  }
  return c.json(user, HTTP.ResultCodes.RS_2.Ok);
}
```

---

### Not Found Handler (`notFoundHandler`)

Handles requests to routes that don't exist, returning a standardized 404 response.

**File:** `packages/core/src/base/middlewares/not-found.middleware.ts`

#### Usage

```typescript
import { notFoundHandler } from '@venizia/ignis';

const app = new IgnisApplication({
  // ...
});

// Register 404 handler
app.notFound(notFoundHandler({
  logger: app.logger
}));
```

#### Response Format

```json
{
  "message": "URL NOT FOUND",
  "path": "/api/nonexistent",
  "url": "http://localhost:3000/api/nonexistent"
}
```

**Status Code:** `404 Not Found`

#### API Reference

##### `notFoundHandler(options)`

**Parameters:**
| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `logger` | `ApplicationLogger` | No | `console` | Logger instance for logging 404s |

**Returns:** `NotFoundHandler` - Hono not found handler function

---

### Request Normalizer (`requestNormalize`)

Pre-parses JSON request bodies to ensure consistent request handling and prevent common parsing issues.

**File:** `packages/core/src/base/middlewares/request-normalize.middleware.ts`

#### How It Works

1. **Skip for GET/OPTIONS**: No normalization for read-only requests
2. **Check Content-Length**: Skip if no body is present (`Content-Length: 0`)
3. **Check Content-Type**: Only process `application/json` requests
4. **Pre-parse JSON**: Calls `context.req.json()` to cache the parsed body

#### Benefits

- Prevents multiple body parsing attempts
- Ensures body is available for all subsequent middleware/handlers
- Catches JSON parsing errors early in the request lifecycle

#### Usage

```typescript
import { requestNormalize } from '@venizia/ignis';

const app = new IgnisApplication({
  // ...
});

// Register as early middleware
app.use(requestNormalize());
```

:::tip Why Pre-parse?
Hono's request body can only be read once. This middleware ensures the body is parsed and cached early, making it available to all downstream handlers.
:::

#### API Reference

##### `requestNormalize()`

**Parameters:** None

**Returns:** `MiddlewareHandler` - Hono middleware function

---

### Request Spy (Debug)

Logs detailed information about each request including timing, IP address, method, path, and query parameters.

**File:** `packages/core/src/base/middlewares/request-spy.middleware.ts`

#### Features

- Request lifecycle logging (START/DONE)
- Performance timing tracking
- IP address extraction (supports `x-real-ip` and `x-forwarded-for` headers)
- Request ID tracking
- Query and body parameter logging

#### Usage

```typescript
import { RequestSpyMiddleware } from '@venizia/ignis';

const app = new IgnisApplication({
  // ...
});

// Create and register spy middleware
const requestSpy = new RequestSpyMiddleware();
app.use(requestSpy.value());
```

#### Log Output

**Request Start:**
```
[spy][abc123] START  | Handling Request | forwardedIp: 192.168.1.1 | path: /api/users | method: GET
```

**Request Complete:**
```
[spy][abc123] DONE   | Handling Request | forwardedIp: 192.168.1.1 | path: /api/users | method: GET | Took: 45.23 (ms)
```

#### API Reference

##### `RequestSpyMiddleware`

**Class Methods:**
| Method | Returns | Description |
|--------|---------|-------------|
| `value()` | `MiddlewareHandler` | Returns the middleware handler |

**Static Properties:**
| Property | Type | Value | Description |
|----------|------|-------|-------------|
| `REQUEST_ID_KEY` | `string` | `'requestId'` | Context key for request ID |

#### Accessing Request ID

```typescript
import { RequestSpyMiddleware, get, HTTP, jsonResponse, TRouteContext, z } from '@venizia/ignis';

const ExampleConfig = {
  method: HTTP.Methods.GET,
  path: '/example',
  responses: jsonResponse({
    schema: z.object({ requestId: z.string() }),
  }),
} as const;

// In a controller
@get({ configs: ExampleConfig })
async example(c: TRouteContext) {
  const requestId = c.get(RequestSpyMiddleware.REQUEST_ID_KEY);
  console.log('Request ID:', requestId);
  return c.json({ requestId }, HTTP.ResultCodes.RS_2.Ok);
}
```

:::warning Performance Impact
Request spy logs every request detail. Consider disabling or reducing verbosity in production environments with high traffic.
:::

---

### Emoji Favicon

Serves an SVG emoji as the application's favicon, providing a lightweight alternative to traditional favicon files.

**File:** `packages/core/src/base/middlewares/emoji-favicon.middleware.ts`

#### Usage

```typescript
import { emojiFavicon } from '@venizia/ignis';

const app = new IgnisApplication({
  // ...
});

// Serve a rocket emoji as favicon
app.use(emojiFavicon({ icon: '🚀' }));
```

#### How It Works

1. Intercepts requests to `/favicon.ico`
2. Returns an inline SVG with the specified emoji
3. Sets `Content-Type: image/svg+xml`
4. All other requests pass through unchanged

#### API Reference

##### `emojiFavicon(options)`

**Parameters:**
| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `icon` | `string` | Yes | Emoji character to use as favicon |

**Returns:** `MiddlewareHandler` - Hono middleware function

#### Examples

```typescript
// Different emoji icons
app.use(emojiFavicon({ icon: '🔥' })); // Fire
app.use(emojiFavicon({ icon: '⚡' })); // Lightning
app.use(emojiFavicon({ icon: '🎯' })); // Target
app.use(emojiFavicon({ icon: '🌟' })); // Star
```

:::tip Browser Support
SVG favicons are supported in all modern browsers. Fallback to a traditional `.ico` file if you need to support legacy browsers.
:::

---

## Creating Custom Middleware

IGNIS uses Hono's middleware system. Create custom middleware using the `createMiddleware` factory:

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

// Usage
app.use(myMiddleware({ enabled: true, prefix: 'API' }));
```

### Provider-Based Middleware

For middleware requiring dependency injection:

```typescript
import { BaseHelper } from '@venizia/ignis-helpers';
import { IProvider } from '@venizia/ignis-inversion';
import { injectable } from '@venizia/ignis-inversion';
import { createMiddleware } from 'hono/factory';
import type { MiddlewareHandler } from 'hono';

@injectable()
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

// Usage
const myMiddleware = app.get(MyMiddleware);
app.use(myMiddleware.value());
```

---

## Middleware Order & Priority

Middleware execution order matters. Follow these guidelines:

### Recommended Order

```typescript
const app = new IgnisApplication({ /* ... */ });

// 1. CORS (if needed)
app.use(cors());

// 2. Request ID generation
app.use(requestId());

// 3. Request spy/logging
const requestSpy = new RequestSpyMiddleware();
app.use(requestSpy.value());

// 4. Request normalization
app.use(requestNormalize());

// 5. Security middleware (helmet, etc.)
app.use(helmet());

// 6. Rate limiting
app.use(rateLimit());

// 7. Authentication
app.use('/api/*', authenticate());

// 8. Favicon (can be early or late)
app.use(emojiFavicon({ icon: '🚀' }));

// 9. Application routes
app.mountControllers();

// 10. Error handler (LAST in chain)
app.onError(appErrorHandler({ logger: app.logger }));

// 11. Not found handler (AFTER error handler)
app.notFound(notFoundHandler({ logger: app.logger }));
```

### Key Principles

1. **Request ID First**: Generate request ID before logging
2. **Logging Early**: Log requests before normalization/parsing
3. **Normalization Before Business Logic**: Parse bodies before they're needed
4. **Security Middleware Before Routes**: Protect routes with security checks
5. **Error Handler Last**: Catch all errors from previous middleware
6. **404 Handler After Error Handler**: Ensure unhandled routes return 404

:::warning Order Matters
Placing error handler before routes will prevent it from catching route errors. Always register error handlers last.
:::

---

## Common Patterns

### Conditional Middleware

```typescript
const app = new IgnisApplication({ /* ... */ });

// Enable request spy only in development
if (process.env.NODE_ENV === 'development') {
  const requestSpy = new RequestSpyMiddleware();
  app.use(requestSpy.value());
}
```

### Route-Specific Middleware

```typescript
// Apply middleware to specific routes
app.use('/api/admin/*', adminAuthMiddleware());
app.use('/api/public/*', rateLimitMiddleware());
```

### Middleware Composition

```typescript
// Combine multiple middleware
const apiMiddleware = (): MiddlewareHandler => {
  return createMiddleware(async (context, next) => {
    // Run multiple middleware in sequence
    await requestNormalize()(context, async () => {
      await authenticate()(context, next);
    });
  });
};
```

---

## Performance Considerations

### Request Spy in Production

Request spy logs detailed information for every request. In high-traffic production environments:

```typescript
// Conditional request spy
const isDevelopment = process.env.NODE_ENV === 'development';

if (isDevelopment) {
  const requestSpy = new RequestSpyMiddleware();
  app.use(requestSpy.value());
}
```

### Error Logging Volume

Error handlers log every error. For high error rates, consider:
- Sampling (log 1 in N errors)
- Error aggregation services (Sentry, Rollbar)
- Rate-limited logging

---

## See Also

- **Related References:**
  - [Application](./application.md) - Application setup and configuration
  - [Controllers](./controllers.md) - HTTP routing and request handling
  - [Dependency Injection](./dependency-injection.md) - DI container and providers

- **Guides:**
  - [Building a CRUD API](/guides/tutorials/building-a-crud-api)

- **Best Practices:**
  - [Troubleshooting Tips](/best-practices/troubleshooting-tips)

- **External Resources:**
  - [Hono Middleware Documentation](https://hono.dev/docs/guides/middleware)
  - [HTTP Status Codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status)
