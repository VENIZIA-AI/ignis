# Setup Guide

## Step 1: Bind Configuration (Optional)

Skip this step to use the default `/health` path. To customize the path:

```typescript
import { HealthCheckBindingKeys, IHealthCheckOptions } from '@venizia/ignis';

// In your Application class's preConfigure method
preConfigure(): ValueOrPromise<void> {
  this.bind<IHealthCheckOptions>({
    key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS,
  }).toValue({
    restOptions: { path: '/health-check' },
  });
}
```

## Step 2: Register Component

```typescript
import { HealthCheckComponent } from '@venizia/ignis';

// In your Application class's preConfigure method
preConfigure(): ValueOrPromise<void> {
  // ... optional bindings from Step 1
  this.component(HealthCheckComponent);
}
```

## Step 3: Use

The health check endpoints are auto-registered -- no injection needed. Once the component is registered, `GET /health` and `POST /health/ping` are available immediately.

> [!TIP]
> If you customized the path in Step 1, the endpoints will be at your custom path instead (e.g., `GET /health-check` and `POST /health-check/ping`).
