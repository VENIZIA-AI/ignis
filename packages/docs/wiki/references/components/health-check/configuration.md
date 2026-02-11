# Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `restOptions.path` | `string` | `'/health'` | Base path for health endpoints |

The component uses `IHealthCheckOptions` bound to `HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS`. If no custom binding is found, the component falls back to the default options:

```typescript
const DEFAULT_OPTIONS: IHealthCheckOptions = {
  restOptions: { path: '/health' },
};
```

::: details IHealthCheckOptions -- Full Reference
```typescript
interface IHealthCheckOptions {
  restOptions: { path: string };
}
```

The `path` value is applied via `@controller({ path })` decorator on `HealthCheckController` during the component's `binding()` phase. All controller routes are relative to this base path.
:::

## Rest Paths

The controller defines two internal route paths via `HealthCheckRestPaths`:

| Constant | Value | Full Path (default) |
|----------|-------|---------------------|
| `HealthCheckRestPaths.ROOT` | `/` | `GET /health` |
| `HealthCheckRestPaths.PING` | `/ping` | `POST /health/ping` |
