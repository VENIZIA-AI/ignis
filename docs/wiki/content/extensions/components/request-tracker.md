# Request Tracker

Automatic request logging middleware that assigns a UUID request ID to every request, then logs method, path, client IP, and timing on the way in and out.

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

## In one example

Nothing to configure - once the application starts, every request is logged automatically.

```
[SpyMW] [<request-id>][127.0.0.1][=>] GET      /hello | query: {} | body: null
[SpyMW] [<request-id>][127.0.0.1][<=] GET      /hello | Took: 1.23 (ms)
```

In **production** (`NODE_ENV=production`), the body is omitted; query is still logged:

```
[SpyMW] [<request-id>][127.0.0.1][=>] GET      /hello | query: {}
[SpyMW] [<request-id>][127.0.0.1][<=] GET      /hello | Took: 1.23 (ms)
```

| Direction | Format |
|-----------|--------|
| Incoming (`=>`) | `[requestId][clientIp][=>] METHOD   path \| query: {...} \| body: {...}` |
| Outgoing (`<=`) | `[requestId][clientIp][<=] METHOD   path \| Took: X.XX (ms)` |

The HTTP method is padded to 8 characters for consistent alignment.

## How it works

- **Two middlewares, one component.** `binding()` registers Hono's own `requestId()` (from `hono/request-id`) first, then resolves `RequestSpyMiddleware` from the DI container and registers it - `requestId()` must run first so the spy can read the ID off the context.
- **IP resolution is best-effort, never fatal.** The middleware tries `getIncomingIp()` (runtime connection info), then `x-real-ip`, then `x-forwarded-for`; if none resolve it logs `'unknown'` instead of failing the request - this middleware observes traffic, it does not gate it.
- **Body logging is environment-gated.** `RequestSpyMiddleware` reads `NODE_ENV` once in its constructor: any value other than `'production'` logs the body; `'production'` logs query only. Query is always logged in every environment.
- **Body parsing follows Content-Type.** JSON, multipart, and URL-encoded bodies use Hono's own parsers; `application/octet-stream` returns the raw stream; everything else is read as text. A parse failure throws `'Malformed Body Payload'` (HTTP 400).
- **The middleware is an `IProvider`, not a plain function.** `RequestSpyMiddleware implements IProvider<MiddlewareHandler>` from `@venizia/ignis-inversion` - the container instantiates the class (so it can hold `isDebugMode` state) and calls `.value()` to obtain the actual Hono handler.

> [!TIP]
> The request ID is also available in the framework's error handlers (`notFoundHandler`, `appErrorHandler`), making it easy to correlate error logs with the original request.

## Common tasks

### Correlate logs with a request
Read the `requestId` context value inside your own handlers or middleware - the same ID appears in every `[SpyMW]` log line for that request.

```typescript
const requestId = context.get('requestId');
```

### Reuse `parseBody` for your own middleware
`parseBody` is a public method - reuse it wherever you need the same Content-Type-aware parsing.

```typescript
async parseBody(opts: { req: TContext['req'] }): Promise<unknown>
```

### Understand the client IP resolution order
| Priority | Source | Notes |
|----------|--------|-------|
| 1 | `getIncomingIp(context)` | Native connection info - `hono/bun` on Bun, `@hono/node-server/conninfo` on Node.js |
| 2 | `x-real-ip` header | Set by reverse proxies (e.g., Nginx `proxy_set_header X-Real-IP`) |
| 3 | `x-forwarded-for` header | Standard proxy header |
| 4 | `'unknown'` | Logged when none of the above resolve - the request still proceeds |

### Understand body-parsing outcomes
| Condition | Result |
|-----------|--------|
| No `Content-Type` header | `null` |
| `Content-Length` is `'0'`, or no body stream present | `null` |
| `Content-Type` includes `application/json` | `req.json()` |
| `Content-Type` includes `multipart/form-data` or `application/x-www-form-urlencoded` | `req.parseBody()` |
| `Content-Type` is `application/octet-stream` | Raw body stream |
| Any other `Content-Type` (text, html, xml, etc.) | `req.text()` |
| Parsing throws for any content type | `'Malformed Body Payload'` (HTTP 400) |

## Reference

### Configuration
No user-configurable options - behavior is fully automatic.

### Binding keys
| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `middlewares.RequestSpyMiddleware` | `RequestTrackerComponent.REQUEST_TRACKER_MW_BINDING_KEY` | `MiddlewareHandler` | Auto | Singleton provider, registered by the constructor |

The key is built as `BindingNamespaces.MIDDLEWARE` (`'middlewares'`) + `.` + `RequestSpyMiddleware.name`.

### RequestSpyMiddleware
```typescript
class RequestSpyMiddleware extends BaseHelper implements IProvider<MiddlewareHandler> {
  static readonly REQUEST_ID_KEY = 'requestId';
  private isDebugMode: boolean;
  // ...
}
```

- Extends `BaseHelper` with scope `'SpyMW'`
- Constructor sets `isDebugMode = process.env.NODE_ENV?.toLowerCase() !== Environment.PRODUCTION`
- `value()` returns a Hono middleware built via `createMiddleware()` from `hono/factory`

### Component lifecycle
1. **`constructor()`** - Receives `BaseApplication` via DI. Defines the middleware binding as a singleton provider.
2. **`binding()`** - Registers `requestId()` on the server. Resolves the `RequestSpyMiddleware` binding, throwing if it cannot be resolved. Registers the resolved middleware on the server.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Invalid middleware to init request tracker \| Please check again binding value` | `RequestSpyMiddleware` binding was unbound or overwritten before `binding()` ran | Don't unbind or replace `middlewares.RequestSpyMiddleware`; extend the component instead of removing its binding |
| `Malformed Body Payload` (400) | Body content didn't match its declared `Content-Type` (e.g., invalid JSON with `application/json`) | Ensure clients send body content that matches the `Content-Type` header |

## See also

- **Guides:**
  - [Components Overview](/guides/core-concepts/components) - Component system basics
  - [Middlewares](/references/base/middlewares) - Request middleware system

- **Components:**
  - [All Components](./index) - Built-in components list

- **Helpers:**
  - [Logger Helper](/extensions/helpers/logger/) - Logging utilities

- **Best Practices:**
  - [Troubleshooting Tips](/best-practices/troubleshooting-tips) - Debugging with request IDs
  - [Deployment Strategies](/best-practices/deployment-strategies) - Production logging

**Files:**

- [`packages/core/src/components/request-tracker/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/request-tracker/component.ts) - `RequestTrackerComponent`
- [`packages/core/src/base/middlewares/request-spy/request-spy.middleware.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/base/middlewares/request-spy/request-spy.middleware.ts) - `RequestSpyMiddleware`
- [`packages/core/src/utilities/network.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/utilities/network.utility.ts) - `getIncomingIp()`
