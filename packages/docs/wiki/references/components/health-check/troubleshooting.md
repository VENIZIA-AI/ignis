# Troubleshooting

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

**Cause:** The custom `IHealthCheckOptions` binding was registered after the component. The component reads options during its `binding()` phase -- if no binding exists at that point, it uses the default `/health` path.

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
