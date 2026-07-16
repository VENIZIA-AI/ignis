# Health Check

A minimal status endpoint for uptime monitoring - the default target for load balancer health checks and Kubernetes liveness probes.

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

## In one example

Register the component with no configuration - `GET /health` and `POST /health/ping` are live immediately.

```typescript
import { HealthCheckComponent, BaseApplication, ValueOrPromise } from '@venizia/ignis';

export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    this.component(HealthCheckComponent);
  }
}
```

```bash
curl localhost:3000/health
# { "status": "ok" }
```

## How it works

- **Auto-registered controller.** `HealthCheckComponent.binding()` applies `@controller({ path })` to `HealthCheckController` via `Reflect.decorate` at runtime, then calls `this.application.controller(HealthCheckController)` - the path comes from DI, not a hardcoded class decorator.
- **Options are optional, field by field.** `IHealthCheckOptions.restOptions.path` is optional; a partially-filled binding (e.g., `{ restOptions: {} }`) still resolves - the component reads `healthOptions?.restOptions?.path ?? '/health'`, falling back per field rather than discarding the whole binding.
- **The default binding wins the race if you're late.** The constructor registers `HEALTH_CHECK_OPTIONS` via `initDefault: { enable: true }`, which runs before `binding()`. `initDefaultBindings()` only sets a key when `container.isBound()` is false - so a custom binding must exist BEFORE `this.component(HealthCheckComponent)` runs, or the default has already claimed the slot.
- **Three route styles, one controller.** `HealthCheckController` demonstrates all three IGNIS route patterns: fluent (`bindRoute().to()`) for `GET /`, decorator (`@api()`) for `POST /ping`, and imperative (`defineRoute()`, commented out in source) - a handy reference when picking a style for your own controllers.

## Common tasks

### Customize the health check path
Bind `IHealthCheckOptions` BEFORE registering the component - order matters (see above).

```typescript
import { HealthCheckBindingKeys, IHealthCheckOptions } from '@venizia/ignis';

this.bind<IHealthCheckOptions>({
  key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
}).toValue({ restOptions: { path: '/health-check' } });

this.component(HealthCheckComponent); // AFTER the bind
```

### Call the ping endpoint
`POST /health/ping` echoes `message` back with a server timestamp - useful for round-trip latency checks and body-parsing smoke tests.

```bash
curl -X POST localhost:3000/health/ping \
  -H 'content-type: application/json' \
  -d '{"message":"hello"}'
# { "type": "PONG", "date": "2026-02-11T12:00:00.000Z", "message": "hello" }
```

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `type` | `string` | No | Defaults to `"PING"` |
| `message` | `string` | Yes | Min 1, max 255 characters |

### Fix "health check endpoint returns 404"
Register the component in `preConfigure()`, before any controller registration completes.

```typescript
preConfigure(): ValueOrPromise<void> {
  this.component(HealthCheckComponent);
  // ... other registrations
}
```

## Reference

### Configuration
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `restOptions.path` | `string` (optional) | `'/health'` | Base path for health endpoints |

```typescript
interface IHealthCheckOptions {
  /** Partially-filled bindings are accepted; every missing field falls back to its default. */
  restOptions?: { path?: string };
}
```

### Binding keys
| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/health-check/options` | `HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS` | `IHealthCheckOptions` | No | `{ restOptions: { path: '/health' } }` |

### REST paths
| Constant | Value | Full path (default) |
|----------|-------|---------------------|
| `HealthCheckRestPaths.ROOT` | `/` | `GET /health` |
| `HealthCheckRestPaths.PING` | `/ping` | `POST /health/ping` |

Paths are relative to the base path configured in `IHealthCheckOptions.restOptions.path`.

### API endpoints
| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/health` | Basic health check | `{ "status": "ok" }` |
| `POST` | `/health/ping` | Echo test | `{ "type": "PONG", "date": "...", "message": "..." }` |

### Controller source
```typescript
import {
  BaseRestController, IControllerOptions, TRouteContext,
} from '@venizia/ignis';
import { api, jsonContent, jsonResponse } from '@venizia/ignis';
import { z } from '@hono/zod-openapi';
import { HTTP, ValueOrPromise } from '@venizia/ignis-helpers';

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

export class HealthCheckController extends BaseRestController {
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

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `GET /health` returns 404 | `HealthCheckComponent` not registered, or registered after controllers were already mounted | Call `this.component(HealthCheckComponent)` in `preConfigure()` |
| Custom path not applied | Custom `IHealthCheckOptions` bound AFTER `this.component()` ran - the default binding already claimed the DI key | Bind options BEFORE calling `this.component(HealthCheckComponent)` |
| `POST /health/ping` returns a validation error | `message` is missing, or exceeds 255 characters | Send a `message` string between 1 and 255 characters |

## See also

- **Guides:**
  - [Components Overview](/guides/core-concepts/components) - Component system basics
  - [Application](/guides/core-concepts/application/) - Registering components

- **Components:**
  - [All Components](./index) - Built-in components list

- **Best Practices:**
  - [Deployment Strategies](/best-practices/deployment-strategies) - Production monitoring

**Files:**

- [`packages/core/src/components/health-check/component.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/health-check/component.ts) - `HealthCheckComponent`
- [`packages/core/src/components/health-check/controller.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/health-check/controller.ts) - `HealthCheckController`
- [`packages/core/src/components/health-check/common/types.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/health-check/common/types.ts) - `IHealthCheckOptions`
- [`packages/core/src/components/health-check/common/keys.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/health-check/common/keys.ts) - `HealthCheckBindingKeys`
- [`packages/core/src/components/health-check/common/rest-paths.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core/src/components/health-check/common/rest-paths.ts) - `HealthCheckRestPaths`
