# Request Tracker

Automatic request logging middleware with unique request IDs, client IP detection, body parsing, and timing -- auto-registered by the framework.

> [!IMPORTANT]
> This component is **auto-registered** by `BaseApplication` during `initialize()`. No manual registration is needed.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Component** | `RequestTrackerComponent` |
| **Middleware** | `RequestSpyMiddleware` |
| **Utility** | `getIncomingIp()` |
| **Runtimes** | Both (Bun and Node.js) |

#### Import Paths
```typescript
import { RequestTrackerComponent } from '@venizia/ignis';
```

## Setup

### Step 1: Bind Configuration

No configuration binding is required. The component has no user-facing configuration options.

### Step 2: Register Component

This happens automatically inside `BaseApplication.initialize()`:

```typescript
// Internal to BaseApplication -- shown for reference only
this.component(RequestTrackerComponent);
```

The component registers two Hono middlewares on the application server during its `binding()` phase:
1. `requestId()` from `hono/request-id` -- generates a UUID and stores it on the Hono context under the key `'requestId'`
2. `RequestSpyMiddleware` -- logs request start/end with IP, method, path, query, body, and timing

### Step 3: Use

No injection or manual usage is needed. Once the application starts, every incoming request is automatically logged with a unique request ID.

A sample log output in **non-production** mode looks like this:

```
[SpyMW] [<request-id>][127.0.0.1][=>] GET      /hello | query: {} | body: null
[SpyMW] [<request-id>][127.0.0.1][<=] GET      /hello | Took: 1.23 (ms)
```

In **production** mode (`NODE_ENV=production`), body is excluded but query is still logged:

```
[SpyMW] [<request-id>][127.0.0.1][=>] GET      /hello | query: {}
[SpyMW] [<request-id>][127.0.0.1][<=] GET      /hello | Took: 1.23 (ms)
```

The log format follows this structure:

| Direction | Format |
|-----------|--------|
| Incoming (`=>`) | `[requestId][clientIp][=>] METHOD   path \| query: {...} \| body: {...}` |
| Outgoing (`<=`) | `[requestId][clientIp][<=] METHOD   path \| Took: X.XX (ms)` |

The HTTP method is padded to 8 characters for consistent alignment in log output.

> [!TIP]
> The request ID is also available in error middleware contexts (`NotFoundMiddleware`, `AppErrorMiddleware`), making it easy to correlate error logs with the original request.

## Configuration

The Request Tracker component has no user-configurable options. Its behavior is fully automatic.

| Behavior | Description |
|----------|-------------|
| **Request ID** | Generated automatically via `hono/request-id` middleware (UUID), stored on context as `'requestId'` |
| **IP Detection** | Priority: (1) connection info via `getIncomingIp()`, (2) `x-real-ip` header, (3) `x-forwarded-for` header |
| **Body Logging** | Logs request body in non-production environments only. Query is always logged |
| **Timing** | Measures and logs request duration in milliseconds (2 decimal places) via `performance.now()` |
| **Scope** | Registered as a singleton provider |

> [!NOTE]
> In **production** (`NODE_ENV=production`), only the request **body** is excluded from log output to prevent sensitive data exposure. Query parameters are still logged in all environments.

## Internals

### RequestTrackerComponent

The component class extends `BaseComponent`. It receives `BaseApplication` via `@inject({ key: CoreBindings.APPLICATION_INSTANCE })` in its constructor.

During construction, it creates a singleton binding for the middleware:

```typescript
Binding.bind({ key: RequestTrackerComponent.REQUEST_TRACKER_MW_BINDING_KEY })
  .toProvider(RequestSpyMiddleware)
  .setScope(BindingScopes.SINGLETON)
```

The binding key is constructed as `BindingNamespaces.MIDDLEWARE + '.' + RequestSpyMiddleware.name`, which resolves to `'middlewares.RequestSpyMiddleware'`.

#### Component Lifecycle

1. **`constructor()`** -- Receives `BaseApplication` via DI. Defines the middleware binding as a singleton provider.
2. **`binding()`** -- Registers `requestId()` middleware on the server. Resolves the `RequestSpyMiddleware` binding from the DI container. Throws if the middleware cannot be resolved. Registers the resolved middleware on the server.

### RequestSpyMiddleware

The middleware class extends `BaseHelper` with scope `'SpyMW'` and implements `IProvider<MiddlewareHandler>`.

```typescript
class RequestSpyMiddleware extends BaseHelper implements IProvider<MiddlewareHandler> {
  static readonly REQUEST_ID_KEY = 'requestId';
  private isDebugMode: boolean;
  // ...
}
```

#### IProvider Pattern

`RequestSpyMiddleware` implements the `IProvider<T>` interface from `@venizia/ignis-inversion`. This interface requires a single method:

```typescript
interface IProvider<T> {
  value(container: Container): T;
}
```

When the DI container resolves the binding (via `.toProvider(RequestSpyMiddleware)`), it instantiates the class and calls `value()` to obtain the actual `MiddlewareHandler`. This pattern allows the middleware to hold state (like `isDebugMode`) while producing a clean middleware function.

#### Debug Mode Detection

The constructor checks `process.env.NODE_ENV`:

```typescript
constructor() {
  super({ scope: 'SpyMW' });
  const env = process.env.NODE_ENV?.toLowerCase();
  this.isDebugMode = env !== Environment.PRODUCTION;
}
```

When `isDebugMode` is `true` (any environment other than `'production'`), the incoming request log includes both `query` and `body`. When `false`, only `query` is logged.

#### value() -- Middleware Handler

The `value()` method returns a Hono middleware created via `createMiddleware()` from `hono/factory`. The middleware performs the following steps:

1. Starts a performance timer via `performance.now()`
2. Extracts the request ID from the Hono context (set by `requestId()` middleware)
3. Resolves the client IP using the priority chain (see IP Detection below)
4. Throws `'Malformed Connection Info'` (400) if both `incomingIp` and `forwardedIp` are `null`
5. Extracts method, path, and query from the request
6. Parses the request body via `parseBody()`
7. Logs the incoming request with `[=>]` direction marker
8. Calls `await next()` to proceed to the next middleware/handler
9. Calculates duration and logs the outgoing response with `[<=]` direction marker

#### parseBody()

A public method that parses the request body based on `Content-Type` and `Content-Length` headers.

```typescript
async parseBody(opts: { req: TContext['req'] }): Promise<unknown>
```

**Return conditions:**

| Condition | Result |
|-----------|--------|
| No `Content-Type` header | Returns `null` |
| No `Content-Length` header or value is `'0'` | Returns `null` |
| `Content-Type` includes `application/json` | Calls `req.json()` |
| `Content-Type` includes `multipart/form-data` | Calls `req.parseBody()` |
| `Content-Type` includes `application/x-www-form-urlencoded` | Calls `req.parseBody()` |
| Any other `Content-Type` (text, html, xml, etc.) | Calls `req.text()` |
| Parsing fails for any content type | Throws `'Malformed Body Payload'` (HTTP 400) |

### getIncomingIp() Utility

A utility function that attempts to extract the client IP address from the Hono context using runtime-specific connection info.

```typescript
const getIncomingIp = (context: Context): string | null
```

**Runtime detection:**
- Uses `RuntimeModules.isBun()` from `@venizia/ignis-helpers` to detect the runtime
- On **Bun**: imports `getConnInfo` from `hono/bun`
- On **Node.js**: imports `getConnInfo` from `@hono/node-server/conninfo`
- Returns `connInfo.remote.address` if available, `null` otherwise
- Returns `null` if `getConnInfo` is unavailable or throws

#### IP Detection Priority

The middleware resolves the client IP using a three-step fallback chain:

| Priority | Source | Description |
|----------|--------|-------------|
| 1 | `getIncomingIp(context)` | Direct connection info from the runtime (Bun or Node.js) |
| 2 | `x-real-ip` header | Set by reverse proxies (e.g., Nginx `proxy_set_header X-Real-IP`) |
| 3 | `x-forwarded-for` header | Standard proxy header with original client IP |

The `clientIp` used in log output is resolved as `incomingIp ?? forwardedIp` -- meaning connection info takes precedence when available.

If **all three** sources return `null`, the middleware throws a `'Malformed Connection Info'` error with HTTP 400 status.

## Binding Keys

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `middlewares.RequestSpyMiddleware` | `RequestTrackerComponent.REQUEST_TRACKER_MW_BINDING_KEY` | `MiddlewareHandler` | Auto | Provided by component |

The key is constructed from `BindingNamespaces.MIDDLEWARE` (`'middlewares'`) + `RequestSpyMiddleware.name` (`'RequestSpyMiddleware'`). The component binds `RequestSpyMiddleware` as a singleton provider at this key during construction.

## Troubleshooting

### "Invalid middleware to init request tracker | Please check again binding value"

**Cause:** The `RequestSpyMiddleware` binding could not be resolved from the DI container during the component's `binding()` phase. This typically means the binding was removed or overwritten before `binding()` executed.

**Fix:** Ensure no custom code unbinds or replaces the `middlewares.RequestSpyMiddleware` key. If you need to customize request logging, extend the component rather than removing the binding.

### "Malformed Body Payload"

**Cause:** The `RequestSpyMiddleware` attempted to parse the request body based on the `Content-Type` header, but the body content was malformed (e.g., invalid JSON with `application/json` content type, or corrupt form data).

**Fix:** Ensure clients send valid body content that matches the declared `Content-Type` header. This error returns HTTP 400 Bad Request.

### "Malformed Connection Info"

**Cause:** The middleware could not determine the client IP address from any source. All three must have failed: (1) `getIncomingIp()` returned `null` (runtime connection info unavailable), (2) `x-real-ip` header was absent, and (3) `x-forwarded-for` header was absent. This error returns HTTP 400 Bad Request.

**Fix:** Ensure your reverse proxy (e.g., Nginx, Caddy) forwards at least one of these headers:
- `x-real-ip`
- `x-forwarded-for`

If running without a proxy, ensure the runtime provides connection info (Bun does this natively; Node.js requires `@hono/node-server`).

## See Also

- **Guides:**
  - [Components Overview](/guides/core-concepts/components) - Component system basics
  - [Middlewares](/references/base/middlewares) - Request middleware system

- **Components:**
  - [All Components](./index) - Built-in components list

- **Helpers:**
  - [Logger Helper](/references/helpers/logger/) - Logging utilities

- **Best Practices:**
  - [Troubleshooting Tips](/best-practices/troubleshooting-tips) - Debugging with request IDs
  - [Deployment Strategies](/best-practices/deployment-strategies) - Production logging
