# API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Returns health status |
| `POST` | `/health/ping` | Echoes a message back |

::: details API Specifications
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
:::

## Controller Implementation

The `HealthCheckController` uses two route definition patterns: the fluent `bindRoute` API for the root endpoint and the `@api` decorator for the ping endpoint.

::: details Controller Source
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
:::
