# Health Check Component

The Health Check component provides a simple endpoint for monitoring the health of the application.

## Overview

-   **Feature Name:** Health Check
-   **Purpose:** To provide a simple endpoint for monitoring the health of the application.
-   **Background:** In microservices architectures and containerized deployments (e.g., using Kubernetes), it is essential to have a health check endpoint that can be used by monitoring systems to determine if the application is running and healthy.
-   **Related Features/Modules:** This feature is a self-contained component that registers a controller with a single route.

## Design and Architecture

-   **`HealthCheckComponent`:** This component registers the `HealthCheckController`.
-   **`HealthCheckController`:** A simple controller that defines the health check route and returns a static JSON response.

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

This component provides a simple and effective way to monitor the health of your Ignis application.
