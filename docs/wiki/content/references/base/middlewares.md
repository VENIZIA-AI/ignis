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
- `packages/kernel/src/base/middlewares/app-error/app-error.middleware.ts`
- `packages/kernel/src/base/middlewares/not-found/not-found.middleware.ts`
- `packages/core-server/src/base/middlewares/request-spy/request-spy.middleware.ts`
- `packages/kernel/src/base/middlewares/emoji-favicon/emoji-favicon.middleware.ts`
- `packages/kernel/src/base/middlewares/form-body/form-body.middleware.ts`
- `packages/kernel/src/base/applications/rest.ts`
- `packages/kernel/src/base/middlewares/common/errors.ts`

## Prerequisites

Before reading this document, you should understand:
- [Hono middleware](https://hono.dev/docs/guides/middleware) basics
- [Application lifecycle](./application.md)
- [Providers](./providers.md) - `RequestSpyMiddleware` implements `IProvider`

## Quick Reference

| Middleware | Type | Exported from `@venizia/ignis` | Purpose |
|-----------|------|-------------------------------|---------|
| `AppErrorMiddleware` | `IProvider<ErrorHandler>` | no (its parent `BaseAppErrorMiddleware` is) | Global error handler (Zod, DB constraints, generic) |
| `notFoundHandler` | `NotFoundHandler` | yes | JSON 404 response for unknown routes |
| `RequestSpyMiddleware` | `IProvider<MiddlewareHandler>` | no | Request/response logging with timing |
| `emojiFavicon` | `MiddlewareHandler` | yes | Serves an emoji as SVG favicon |

## Default Registration Order

`BaseApplication.registerDefaultMiddlewares()` registers middleware in this order during `initialize()`:

```typescript
protected async registerDefaultMiddlewares() {
  const server = this.getServer();

  // The kernel's four, from RestApplication.registerDefaultMiddlewares():
  // 1. Request id
  server.use(requestId({ generator: () => this.generateRequestId() }));

  // 2. Body limit - only when configs.middlewares.bodyLimit is set and enable !== false.
  // Ahead of every middleware a host adds after this one, the request spy included.
  if (bodyLimitOptions && bodyLimitOptions.enable !== false) {
    server.use(bodyLimit({ maxSize, onError }));
  }

  // 3. Global error handler
  server.onError(new AppErrorMiddleware({ logger, rootKey }).value());

  // 4. Not-found handler
  server.notFound(notFoundHandler({ logger }));

  // Then what only a listening server adds:
  // 5. Async context storage (if enabled)
  if (this.configs.asyncContext?.enable) {
    server.use(contextStorage());
  }

  // 6. RequestTrackerComponent (RequestSpyMiddleware; the requestId it reads is already installed)
  this.component(RequestTrackerComponent);

  // 7. Emoji favicon
  server.use(emojiFavicon({ icon: this.configs.favicon ?? '🔥' }));
}
```

Steps 1 to 4 live on the kernel's `RestApplication`, so a browser Worker answers with the same
envelope. `BaseApplication` calls `super.registerDefaultMiddlewares()` first, then adds steps 5 to
7.

> [!NOTE]
> `configs.middlewares.bodyLimit` is the one `IMiddlewareConfigs` key the framework installs by itself - see [Body limit](#body-limit-configs-middlewares-bodylimit) below. Every other key in `IMiddlewareConfigs` is a shape for your own `setupMiddlewares()` to read; the framework does not wire it.

After `registerDefaultMiddlewares()`, the application calls user-defined `staticConfigure()`, `preConfigure()`, and so on. The user's `setupMiddlewares()` hook runs after `initialize()` but before the server starts.

## Body limit (`configs.middlewares.bodyLimit`)

`RestApplication.registerDefaultMiddlewares()` reads `configs.middlewares.bodyLimit` and, when it is set and `enable !== false`, installs Hono's `hono/body-limit` right after the request id - ahead of every middleware a host adds afterward, the request spy included. Left unset, there is no body-size limit from the framework.

```typescript
interface IBodyLimitOptions extends IBaseMiddlewareOptions {
  maxSize: number;
  onError?: (c: Context) => Response | Promise<Response>;
}
```

| Option | Type | Default | Meaning |
|---|---|---|---|
| `maxSize` | `number` | - | Byte ceiling. Must be a finite number `>= 0`, or the application throws at boot. |
| `enable` | `boolean` | applies the limit unless `false` | A missing `enable` still applies the limit - fail-closed for a security control. |
| `path` | `string` | every path | Passed to `server.use(path, limiter)` when set. |
| `onError` | `(c: Context) => Response \| Promise<Response>` | throws `RequestErrors.BODY_TOO_LARGE` | Your own handler for the over-limit case. |

```typescript
const application = new MyApplication({
  scope: 'MyApp',
  config: {
    // ...the rest of IApplicationConfigs
    middlewares: {
      bodyLimit: { enable: true, maxSize: 10 * 1024 * 1024 },
    },
  },
});
```

> [!IMPORTANT]
> `registerDefaultMiddlewares()` reads `configs.middlewares` **before `staticConfigure()` runs** - it is one of the first steps in the boot sequence, ahead of every hook you override. Pass `middlewares` through the constructor's `config` (or an application-config factory that builds that object), never by assigning `this.configs.middlewares` inside `staticConfigure()` or a later hook: it is read too late to take effect, and the application refuses to boot when it detects the value changed after the fact.

Over the limit, and with no `onError`, the request answers `413` with `core.request.body_too_large` (`RequestErrors.BODY_TOO_LARGE`). Every other `IMiddlewareConfigs` key - `compress`, `cors`, `csrf`, `ipRestriction` - is a type only; wire it yourself in `setupMiddlewares()`, as in [User-Defined Middlewares](#user-defined-middlewares).

> [!WARNING]
> `extra.maxBytes` on a static-asset upload route only bounds a declared `Content-Length` - a chunked request with none skips it. Pair `extra.maxBytes` with `configs.middlewares.bodyLimit` for a ceiling nothing can skip. Raise `configs.server.maxRequestBodySize` above `bodyLimit.maxSize`, or Bun's own limit (default 128 MiB) answers `413` first, with no IGNIS envelope and no `core.request.body_too_large` code. Keep `bodyLimit.path` away from a route that streams a body through - the limiter buffers the whole body on any path it is scoped to, chunked or not.

## Form body reader

A route whose `request.body.content` declares `multipart/form-data` or `application/x-www-form-urlencoded` gets one more middleware appended, after every application middleware and after the static-asset length guard, and before the route's own validator:

```
authenticate -> authorize -> application middleware -> (static-asset maxBytes guard) -> formBodyReader -> validator
```

`formBodyReader` reads the form through `readFormBody` (from `@venizia/ignis-helpers`) and caches the result, so the validator that runs next reads the same `FormData` instead of the stream, and never gets a chance to throw its own generic parse failure. Read here, a malformed form is `400 core.request.body_malformed` - the same code `RequestSpyMiddleware`'s own JSON check throws, and the one `parseMultipartBody` throws when a handler parses a form by hand. See [Error Handling Logic](#error-handling-logic) for what a Hono `HTTPException` your own code throws (or a validator's) renders as.

`AbstractRestController.buildRouteMiddlewares` decides whether to append it, with `hasFormBody({ content })` reading `restConfig.request?.body?.content`. Neither `hasFormBody` nor `formBodyReader` is exported from `@venizia/ignis` - they run for every declared form route automatically.

> [!WARNING]
> Middleware that reads a form body itself - an upload guard running before the route's own validator - is not covered by this reader. Call `readFormBody({ req: context.req })` there too; see [Request Utility](/references/utilities/request#notes).

## AppErrorMiddleware

Global error handler registered via `server.onError()`. Handles ZodError validation errors, PostgreSQL constraint violations, and generic errors. Like `RequestSpyMiddleware`, it is an `IProvider` - build it, then call `value()` for the handler.

**Not exported from `@venizia/ignis`** - registered automatically by `BaseApplication`. The
browser-pure parent `BaseAppErrorMiddleware` is exported, and takes the same options.

### Signature

`AppErrorMiddleware` extends `BaseAppErrorMiddleware` and overrides nothing. It exists to supply
the two host reads as defaults: the ambient environment name through `Environment.ambient`, and
`ErrorPrettier` as the log formatter. Neither can live in the kernel.

```typescript
class AppErrorMiddleware extends BaseAppErrorMiddleware {
  constructor(opts?: {
    logger?: ILogger;
    rootKey?: string;
    intentionalStackFrames?: number;
    unexpectedStackFrames?: number;
    environment?: () => string | undefined;
    formatError?: TErrorLogFormatter;
  });
}
```

| Option | Type | Default | Meaning |
|--------|------|---------|---------|
| `logger` | `ILogger` | own scoped logger | Overrides the middleware's own logger - `BaseApplication` passes its own so error lines stay in its scope |
| `rootKey` | `string` | none | Wraps the error response object under this key |
| `intentionalStackFrames` | `number` | `5` | Stack frames kept for a deliberate `getError()` throw |
| `unexpectedStackFrames` | `number` | `10` | Stack frames kept for an unexpected throw |
| `environment` | `() => string \| undefined` | `() => Environment.ambient` | How this host reads its environment name. A function, because `NODE_ENV` has to be read per request |
| `formatError` | `TErrorLogFormatter` | `ErrorPrettier.format` | How a thrown error is rendered into the log line |

`value(): ErrorHandler` comes from `BaseAppErrorMiddleware`, which extends `BaseHelper` and
implements `IProvider<ErrorHandler>`.

### Error Handling Logic

#### 1. ZodError (Validation Errors)

When `error.name === 'ZodError'`, returns HTTP `422 Unprocessable Entity`.

`message` and `normalized.code` come from one **primary issue**. The handler picks the first issue that carries a non-empty `params.code`, and falls back to `issues[0]` when no issue has one. So a domain code you attached anywhere in the schema wins over the position of the failure. `message` is that issue's message; `normalized.code` is its `params.code` if present, otherwise its raw Zod code. The full per-field list stays under `details.cause`. `normalized.args` is always `{}` - a Zod issue carries no interpolation values.

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
| `22` Data exception | `22000` data exception, `22001` string too long, `22003` numeric range, `22004` null not allowed, `22007` datetime format, `22008` datetime overflow, `22009` tz displacement, `22011` substring, `22012` division by zero, `22023` invalid parameter, `22025` invalid escape, `22026` length mismatch, `22030` duplicate JSON key, `22032` invalid JSON, `22P01` floating-point, `22P02` invalid text, `22P03` invalid binary, `22P05` untranslatable char |
| `44` View check | `44000` WITH CHECK OPTION violation |

:::tip Transient conflicts return 409, not 400/500
Class `40` (`40001` serialization failure, `40P01` deadlock) is transient/retryable. It returns **409 Conflict** with `normalized.code: "database.conflict"` and a safe "please retry" message - the client can safely retry the same request. Programming/infra classes (`42` syntax, `53` resources, `0A`, `25`, `28`) remain 500.
:::

:::warning Production sanitizes database internals
In **production** the message is the base message only - `Detail:`/`Table:`/`Constraint:` are stripped (they echo row values and schema names), and `details.stack`/`details.cause` are omitted. Codes outside class 22/23/44 (e.g. `42703` undefined column) and connection failures return a generic `"Internal Server Error"`, so SQL, schema names, and connection host/port never leak.
:::

#### 3. Generic Errors

All other errors use the `statusCode` property from the error if present, otherwise default to HTTP `500 Internal Server Error`. A Hono `HTTPException` - thrown by `@hono/zod-openapi`'s own request validator, or by your own code - carries its status on `.status`, not `.statusCode`; the handler reads that too, so a validator's or your own `HTTPException` with a 4xx status renders as that status and keeps its own message, sanitized environment or not. A 5xx `HTTPException` stays an unexpected `500` whose message never reaches the client, the same as any other unclassified error.

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

**Production behavior:** `stack` and `cause` are omitted unless the ambient environment is a
development one. The test is fail-closed and identical to the one `RequestSpyMiddleware` uses: only
`local`, `debug`, `development`, `dev` and `sit` count as non-production. `uat`, `alpha`, `beta`,
`staging`, an unrecognized name and an unset `NODE_ENV` are all sanitized as production. Read
"production" that way everywhere on this page.

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

**Exported from `@venizia/ignis`**, though you rarely need it - `BaseApplication` registers it for
you.

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
  static readonly REQUEST_ID_KEY = REQUEST_ID_KEY; // 'requestId'

  private isDebugMode: boolean;

  constructor() {
    super({ scope: 'SpyMW' });
    const env = Environment.ambient?.toLowerCase();
    this.isDebugMode = !!env && EnvironmentNames.DEVELOPMENT_ENVS.has(env);
  }

  async parseBody(opts: { req: TContext['req'] }): Promise<unknown>;
  value(): MiddlewareHandler;
}
```

### How It Is Registered

`RequestSpyMiddleware` is not registered directly. Instead, `BaseApplication.registerDefaultMiddlewares()` registers a `RequestTrackerComponent`, which:

1. Binds `RequestSpyMiddleware` as a singleton provider under `middlewares.RequestSpyMiddleware`
2. Resolves the middleware via `IProvider.value()` and registers it with `server.use()`

The component does **not** install `requestId()`. The kernel's `RestApplication` already did, one
step earlier, using `RequestIdGenerator` rather than `crypto.randomUUID`.

### Request Logging

Every request logs the request id, client IP, method, path and query. **The body is extra, and the
gate on it is fail-closed.** It is logged only when the ambient environment is one IGNIS recognises
as a development environment.

| Ambient `NODE_ENV` | Body logged |
|--------------------|-------------|
| `local`, `debug`, `development`, `dev`, `sit` | yes |
| `uat`, `alpha`, `beta`, `staging`, `production` | no |
| any other name, or unset | no |

The set is `EnvironmentNames.DEVELOPMENT_ENVS`. The environment is read once, in the constructor.

In a development environment, the line carries query and body:

```
[requestId][clientIp][=>] METHOD   /path | query: {...} | body: {...}
```

Everywhere else the body is dropped:

```
[requestId][clientIp][=>] METHOD   /path | query: {...}
```

> [!WARNING]
> The older rule was `env !== 'production'`, and it is gone on purpose. That test enabled body
> logging for an unset `NODE_ENV` and for every pre-production name carrying real user data.
> Redaction is no defence: it masks secret-shaped keys, so `nationalId`, `cardNumber` and `ssn`
> were written verbatim. Do not reintroduce the negated test.

### Response Logging

After the handler completes:

```
[requestId][clientIp][<=] METHOD   /path | Took: 12.34 (ms)
```

### Body Parsing

`value()` calls `parseBody` for every request in a development environment. Outside development it
calls `parseBody` only when `Content-Type` includes `application/json` - the table below applies in
full only in development; elsewhere only the `application/json` row is reachable from this
middleware. A form body outside development is read by [Form body reader](#form-body-reader) instead,
just ahead of the route's own validator, or not at all on a route with no declared form body.

The `parseBody` method itself parses the request body based on `Content-Type`:

| Content-Type | Match | Parse Method |
|-------------|-------|-------------|
| `application/json` | substring | `req.json()` |
| `multipart/form-data` | substring | `req.parseBody()` |
| `application/x-www-form-urlencoded` | substring | `req.parseBody()` |
| `application/octet-stream` | exact | `req.raw.body`, returned as the raw stream |
| `text/*` | prefix | `req.raw.clone().text()` - the handler still reads the original. A body a middleware already read comes from Hono's cache, `req.text()` |
| Other | - | not read; returns `<N bytes, content-type>` |

Returns `null` when there is no `Content-Type` header, when `Content-Length` is exactly `'0'`, or
when `req.raw.body` is absent. Only an explicit `'0'` short-circuits: a chunked request carries no
`Content-Length`, and gating on the header's presence would skip every streamed body.

A parse failure throws HTTP 400 with code `core.request.body_malformed`.

The spy never drains a body the handler may stream on. A handler that forwards `req.raw.body` - an upload proxy - receives it untouched.

### IP Detection

The middleware resolves the client IP from the connection info, then falls back to the `x-real-ip`
and `x-forwarded-for` headers, and finally to the literal string `'unknown'`. It is best-effort and
never fatal. A unix socket, some proxies and any in-process call yield no connection info, and
refusing to serve over that would turn a logging gap into an outage.

### Accessing the Request ID

The middleware class is not exported from `@venizia/ignis`, but the key is: import `REQUEST_ID_KEY`,
or read the context variable by its literal value `'requestId'`.

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

**Exported from `@venizia/ignis`**, though you rarely need it - `BaseApplication` registers it for
you. To change the icon, set `configs.favicon`.

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
  middlewares?: IMiddlewareConfigs;    // Only bodyLimit is installed by the framework - see Body limit
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

`RequestSpyMiddleware` logs every request. Body logging is off outside a development environment, and the middleware only parses a JSON body there - see [Body Parsing](#body-parsing). It still runs on every request either way. For ultra-high-traffic workloads consider sampling strategies or externalizing log aggregation.

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
