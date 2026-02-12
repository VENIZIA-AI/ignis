# Health Check

Simple endpoint for monitoring application health -- essential for microservices and containerized deployments.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `HealthCheckComponent` |
| **Controller** | `HealthCheckController` |
| **Runtimes** | Both |

#### Import Paths
```typescript
import { HealthCheckComponent, HealthCheckBindingKeys } from '@venizia/ignis';
import type { IHealthCheckOptions } from '@venizia/ignis';
```

## Setup

### Step 1: Bind Configuration (Optional)

Skip this step to use the default `/health` path. To customize the path:

```typescript
import { HealthCheckBindingKeys, IHealthCheckOptions } from '@venizia/ignis';

// In your Application class's preConfigure method
this.bind<IHealthCheckOptions>({
  key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
}).toValue({
  restOptions: { path: '/health-check' },
});
```

### Step 2: Register Component

```typescript
import { HealthCheckComponent } from '@venizia/ignis';

preConfigure(): ValueOrPromise<void> {
  // ... optional bindings from Step 1
  this.component(HealthCheckComponent);
}
```

### Step 3: Use

The health check endpoints are auto-registered -- no injection needed. Once the component is registered, `GET /health` and `POST /health/ping` are available immediately.

> [!TIP]
> If you customized the path in Step 1, the endpoints will be at your custom path instead (e.g., `GET /health-check` and `POST /health-check/ping`).

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `restOptions.path` | `string` | `'/health'` | Base path for health endpoints |

The component uses `IHealthCheckOptions` bound to `HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS`. If no custom binding is found, it falls back to:

```typescript
const DEFAULT_OPTIONS: IHealthCheckOptions = {
  restOptions: { path: '/health' },
};
```

#### IHealthCheckOptions -- Full Reference
```typescript
interface IHealthCheckOptions {
  restOptions: { path: string };
}
```

The `path` value is applied via `@controller({ path })` decorator on `HealthCheckController` during the component's `binding()` phase. All controller routes are relative to this base path.

### Component Lifecycle

1. **`constructor()`** -- Receives `BaseApplication` via `@inject({ key: CoreBindings.APPLICATION_INSTANCE })`. Calls `super()` with `initDefault: { enable: true, container: application }` and provides default bindings for `HEALTH_CHECK_OPTIONS`:

```typescript
constructor(
  @inject({ key: CoreBindings.APPLICATION_INSTANCE }) private application: BaseApplication,
) {
  super({
    scope: HealthCheckComponent.name,
    initDefault: { enable: true, container: application },
    bindings: {
      [HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS]: Binding.bind<IHealthCheckOptions>({
        key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
      }).toValue(DEFAULT_OPTIONS),
    },
  });
}
```

The `initDefault: { enable: true, container: application }` option tells `BaseComponent` to automatically register all entries in `this.bindings` into the DI container before `binding()` is called. This happens inside `BaseComponent.configure()` via `initDefaultBindings()`, which iterates over `this.bindings` and calls `container.set()` for any key not already bound. This means users who bind their own `HEALTH_CHECK_OPTIONS` before registering the component will keep their custom value -- the default is only applied if the key is unbound.

2. **`binding()`** -- Reads options from the DI container using `application.get()` with `isOptional: true` and falls back to `DEFAULT_OPTIONS` via the `??` operator. Applies `@controller({ path })` decorator dynamically to `HealthCheckController` using `Reflect.decorate`. Registers the controller with the application:

```typescript
override binding(): ValueOrPromise<void> {
  const healthOptions =
    this.application.get<IHealthCheckOptions>({
      key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
      isOptional: true,
    }) ?? DEFAULT_OPTIONS;

  Reflect.decorate(
    [controller({ path: healthOptions.restOptions.path })],
    HealthCheckController,
  );
  this.application.controller(HealthCheckController);
}
```

> [!NOTE]
> The `@controller` decorator is applied dynamically during `binding()`, not statically on the class definition. This allows the path to be configured at runtime via DI bindings.

## Binding Keys

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/health-check/options` | `HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS` | `IHealthCheckOptions` | No | `{ restOptions: { path: '/health' } }` |

> [!NOTE]
> The component provides a default binding for `HEALTH_CHECK_OPTIONS` via `initDefault`. You only need to bind this key if you want to customize the endpoint path. If you do bind it, do so **before** calling `this.component(HealthCheckComponent)` -- the `initDefaultBindings()` check uses `isBound()` and will skip keys that already exist in the container.

### Rest Paths

| Constant | Value | Full Path (default) |
|----------|-------|---------------------|
| `HealthCheckRestPaths.ROOT` | `/` | `GET /health` |
| `HealthCheckRestPaths.PING` | `/ping` | `POST /health/ping` |

### Rest Path Constants

```typescript
class HealthCheckRestPaths {
  static readonly ROOT = '/';    // GET /health (or custom base path)
  static readonly PING = '/ping'; // POST /health/ping (or custom base path + /ping)
}
```

The controller defines two internal route paths via `HealthCheckRestPaths`. These paths are relative to the base path configured in `IHealthCheckOptions.restOptions.path`.

## API Endpoints

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/health` | Basic health check | `{ "status": "ok" }` |
| `POST` | `/health/ping` | Echo test | `{ "type": "PONG", "date": "...", "message": "..." }` |

### GET /health

Returns a simple health status object. Used by load balancers, Kubernetes liveness probes, and monitoring tools to verify the application is running.

### POST /health/ping

Echoes a message back with a server timestamp. Useful for:
- Verifying end-to-end connectivity
- Measuring round-trip latency
- Testing request body parsing

#### Request & Response Specifications

**GET /health**

Response `200`:
```json
{
  "status": "ok"
}
```

**POST /health/ping**

Request body:
```json
{
  "type": "PING",
  "message": "Any string here"
}
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `type` | `string` | No | Defaults to `"PING"` |
| `message` | `string` | Yes | Min 1, max 255 characters |

Response `200`:
```json
{
  "type": "PONG",
  "date": "2026-02-11T12:00:00.000Z",
  "message": "Any string here"
}
```

### Route Definition Patterns

The `HealthCheckController` demonstrates all three route definition patterns supported by Ignis:

| Pattern | Method | Used For |
|---------|--------|----------|
| **Fluent API** (`bindRoute().to()`) | Root health check (`GET /`) | Inline handlers, method chaining |
| **Imperative API** (`defineRoute()`) | (commented out in source) | Direct handler assignment in `binding()` |
| **Decorator API** (`@api()`) | Ping endpoint (`POST /ping`) | Class method handlers with OpenAPI metadata |

The controller uses `this.definitions = RouteConfigs` to store route configurations for introspection. This is optional but enables tools to discover available routes without invoking `binding()`.

#### Controller Source
```typescript
import {
  BaseController, IControllerOptions, TRouteContext,
  api, jsonContent, jsonResponse, HTTP, z,
} from '@venizia/ignis';

const RouteConfigs = {
  ROOT: {
    method: HTTP.Methods.GET,
    path: HealthCheckRestPaths.ROOT,
    responses: jsonResponse({
      schema: z.object({ status: z.string() }).openapi({
        description: 'HealthCheck Schema',
        examples: [{ status: 'ok' }],
      }),
      description: 'Health check status',
    }),
  },
  PING: {
    method: HTTP.Methods.POST,
    path: HealthCheckRestPaths.PING,
    request: {
      body: jsonContent({
        description: 'PING | Request body',
        schema: z.object({
          type: z.string().optional().default('PING'),
          message: z.string().min(1).max(255),
        }),
      }),
    },
    responses: jsonResponse({
      schema: z
        .object({
          type: z.string().optional().default('PONG'),
          date: z.iso.datetime(),
          message: z.string(),
        })
        .openapi({
          description: 'HealthCheck PingPong Schema',
          examples: [{ date: new Date().toISOString(), message: 'ok' }],
        }),
      description: 'HealthCheck PingPong Message',
    }),
  },
} as const;

export class HealthCheckController extends BaseController {
  constructor(opts: IControllerOptions) {
    super({ ...opts, scope: HealthCheckController.name });
    this.definitions = RouteConfigs;
  }

  override binding(): ValueOrPromise<void> {
    // Fluent API for the root health check
    this.bindRoute({ configs: RouteConfigs.ROOT }).to({
      handler: context => {
        return context.json({ status: 'ok' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }

  // Decorator API for the ping endpoint
  @api({ configs: RouteConfigs.PING })
  pingPong(context: TRouteContext) {
    const { message } = context.req.valid<{ type?: string; message: string }>('json');
    return context.json(
      { type: 'PONG', date: new Date().toISOString(), message },
      HTTP.ResultCodes.RS_2.Ok,
    );
  }
}
```

#### Route Configuration Schemas

**Root endpoint (`GET /`):**
```typescript
const RouteConfigs = {
  ROOT: {
    method: HTTP.Methods.GET,
    path: HealthCheckRestPaths.ROOT,
    responses: jsonResponse({
      schema: z.object({ status: z.string() }).openapi({
        description: 'HealthCheck Schema',
        examples: [{ status: 'ok' }],
      }),
      description: 'Health check status',
    }),
  },
```

**Ping endpoint (`POST /ping`):**
```typescript
  PING: {
    method: HTTP.Methods.POST,
    path: HealthCheckRestPaths.PING,
    request: {
      body: jsonContent({
        description: 'PING | Request body',
        schema: z.object({
          type: z.string().optional().default('PING'),
          message: z.string().min(1).max(255),
        }),
      }),
    },
    responses: jsonResponse({
      schema: z.object({
        type: z.string().optional().default('PONG'),
        date: z.iso.datetime(),
        message: z.string(),
      }).openapi({
        description: 'HealthCheck PingPong Schema',
        examples: [{ date: new Date().toISOString(), message: 'ok' }],
      }),
      description: 'HealthCheck PingPong Message',
    }),
  },
} as const;
```

## Troubleshooting

### "Health check endpoint returns 404"

**Cause:** The `HealthCheckComponent` was not registered in your application, or it was registered after controllers were already mounted.

**Fix:** Register the component in `preConfigure()` before any controller registration:

```typescript
preConfigure(): ValueOrPromise<void> {
  this.component(HealthCheckComponent);
  // ... other registrations
}
```

### "Custom path is not applied"

**Cause:** The custom `IHealthCheckOptions` binding was registered after the component. The component reads options during its `binding()` phase -- if no binding exists at that point, it uses the default `/health` path. However, because `HealthCheckComponent` uses `initDefault: { enable: true }`, it also registers a default binding before `binding()` runs. If you bind your custom options after calling `this.component()`, the default has already been set and your override will not take effect during the current lifecycle.

**Fix:** Bind your custom options before calling `this.component(HealthCheckComponent)`:

```typescript
preConfigure(): ValueOrPromise<void> {
  // Bind options FIRST
  this.bind<IHealthCheckOptions>({
    key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
  }).toValue({
    restOptions: { path: '/custom-health' },
  });

  // THEN register component
  this.component(HealthCheckComponent);
}
```

### "POST /health/ping returns validation error"

**Cause:** The request body is missing the required `message` field, or the `message` value exceeds the 255-character limit.

**Fix:** Ensure the request body includes a `message` string between 1 and 255 characters:

```json
{
  "message": "hello"
}
```

## See Also

- **Guides:**
  - [Components Overview](/guides/core-concepts/components) - Component system basics
  - [Application](/guides/core-concepts/application/) - Registering components

- **Components:**
  - [All Components](./index) - Built-in components list

- **Best Practices:**
  - [Deployment Strategies](/best-practices/deployment-strategies) - Production monitoring
