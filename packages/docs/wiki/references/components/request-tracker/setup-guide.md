# Setup Guide

> [!IMPORTANT]
> The Request Tracker component is **auto-registered** by `BaseApplication` during the `initialize()` lifecycle step. You do not need to perform any of the steps below manually.

### Step 1: Bind Configuration

No configuration binding is required. The component has no user-facing configuration options.

### Step 2: Register Component

This happens automatically inside `BaseApplication.initialize()`:

```typescript
// Internal to BaseApplication — shown for reference only
this.component(RequestTrackerComponent);
```

The component registers two Hono middlewares on the application server:
1. `requestId()` from `hono/request-id` — generates a unique request ID
2. `RequestSpyMiddleware` — logs request start/end with timing

### Step 3: Use in Services

No injection or manual usage is needed. Once the application starts, every incoming request is automatically logged with a unique request ID.

A sample log output looks like this:

```
[spy][<request-id>] START | Handling Request | forwardedIp: 127.0.0.1 | path: /hello | method: GET
[spy][<request-id>] DONE  | Handling Request | forwardedIp: 127.0.0.1 | path: /hello | method: GET | Took: 1.234 (ms)
```

> [!TIP]
> The request ID is also available in error middleware contexts (`NotFoundMiddleware`, `AppErrorMiddleware`), making it easy to correlate error logs with the original request.
