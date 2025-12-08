# Health Check Component

The Health Check component provides a simple endpoint for monitoring the health of the application.

## Overview

-   **Feature Name:** Health Check
-   **Purpose:** To provide a simple endpoint for monitoring the health of the application.
-   **Background:** In microservices architectures and containerized deployments (e.g., using Kubernetes), it is essential to have a health check endpoint that can be used by monitoring systems to determine if the application is running and healthy.
-   **Related Features/Modules:** This feature is a self-contained component that registers a controller with a single route.

## Design and Architecture

-   **`HealthCheckComponent`:** This component registers the `HealthCheckController`.
-   **`HealthCheckController`:** A simple controller that uses decorators (`@api`) to define the health check routes and returns static JSON responses.

## Implementation Details

### Tech Stack

-   **Hono**
-   **`@hono/zod-openapi`**

### Configuration

The health check endpoint path can be configured by binding a custom `IHealthCheckOptions` object to the `HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS` key in the DI container.

**Default options:**

```typescript
const DEFAULT_OPTIONS: IHealthCheckOptions = {
  restOptions: { path: '/health' },
};
```

#### Customizing the Health Check Path

In your `src/application.ts`, you can bind your custom options:

```typescript
import { HealthCheckBindingKeys, IHealthCheckOptions, HealthCheckComponent } from '@vez/ignis';

// ... in your Application class's preConfigure method
  preConfigure(): ValueOrPromise<void> {
    // ...
    this.bind<IHealthCheckOptions>({
      key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
    }).toValue({
      restOptions: { path: '/health-check' },
    });
    this.component(HealthCheckComponent);
    // ...
  }
```

### Code Samples

#### Controller Implementation

The `HealthCheckController` is a simple controller that uses decorators to define its routes. It now includes a `GET /` for a simple status check and a `POST /ping` that echoes a message.

```typescript
// packages/core/src/components/health-check/controller.ts
import { BaseController, IControllerOptions, TRouteContext, api, jsonContent, jsonResponse, HTTP, z } from '@vez/ignis';

const ROUTE_CONFIGS = {
  '/': {
    method: HTTP.Methods.GET,
    path: '/',
    responses: jsonResponse({
      schema: z.object({ status: z.string() }).openapi({
        description: 'HealthCheck Schema',
        examples: [{ status: 'ok' }],
      }),
      description: 'Health check status',
    }),
  },
  '/ping': {
    method: HTTP.Methods.POST,
    path: '/ping',
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

@controller({ path: '/health' }) // Base path is configured by options
export class HealthCheckController extends BaseController {
  constructor(opts: IControllerOptions) {
    super({ ...opts, scope: HealthCheckController.name });
    // Note: This is optional declare internal controller route definitions
    this.definitions = ROUTE_CONFIGS;
  }

  @api({ configs: ROUTE_CONFIGS['/'] })
  checkHealth(c: TRouteContext<typeof ROUTE_CONFIGS['/']>) { // Return type is automatically inferred and validated
    return c.json({ status: 'ok' });
  }

  @api({ configs: ROUTE_CONFIGS['/ping'] })
  pingPong(c: TRouteContext<typeof ROUTE_CONFIGS['/ping']>) { // Return type is automatically inferred and validated
    // context.req.valid('json') is automatically typed as { type?: string, message: string }
    const { message } = c.req.valid('json');

    // Return type is automatically validated against the response schema
    return c.json(
      { type: 'PONG', date: new Date().toISOString(), message },
      HTTP.ResultCodes.RS_2.Ok,
    );
  }
}
```

#### Registering the Health Check Component

In your `src/application.ts`, simply register the `HealthCheckComponent`.

```typescript
// src/application.ts
import { HealthCheckComponent } from '@vez/ignis';

// ... in your Application class's preConfigure method
  preConfigure(): ValueOrPromise<void> {
    // ...
    this.component(HealthCheckComponent);
    // ...
  }
```

## API or Interface Specifications

-   **Endpoint:** `GET /health` (or the custom path you configured)
-   **Method:** `GET`
-   **Success Response (200 OK):**
    ```json
    {
      "status": "ok"
    }
    ```
-   **Endpoint:** `POST /health/ping`
-   **Method:** `POST`
-   **Request Body:**
    ```json
    {
      "message": "Any string here"
    }
    ```
-   **Success Response (200 OK):**
    ```json
    {
      "type": "PONG",
      "date": "YYYY-MM-DDTHH:mm:ss.sssZ",
      "message": "Any string here"
    }
    ```

This component provides a simple and effective way to monitor the health of your Ignis application.
