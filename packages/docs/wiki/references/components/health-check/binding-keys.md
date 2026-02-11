# Binding Keys

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/health-check/options` | `HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS` | `IHealthCheckOptions` | No | `{ restOptions: { path: '/health' } }` |

> [!NOTE]
> The component provides a default binding for `HEALTH_CHECK_OPTIONS`. You only need to bind this key if you want to customize the endpoint path.
