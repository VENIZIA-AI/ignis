# Binding Keys

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/swagger/options` | `SwaggerBindingKeys.SWAGGER_OPTIONS` | `ISwaggerOptions` | No | See below |

**Default value:**

```typescript
const DEFAULT_SWAGGER_OPTIONS: ISwaggerOptions = {
  restOptions: {
    base: { path: '/doc' },
    doc: { path: '/openapi.json' },
    ui: { path: '/explorer', type: 'scalar' },
  },
  explorer: {
    openapi: '3.0.0',
    info: {
      title: 'API Documentation',
      version: '1.0.0',
      description: 'API documentation for your service',
    },
  },
};
```

> [!NOTE]
> The component provides a default binding for `SWAGGER_OPTIONS`. You only need to bind this key if you want to customize paths, the UI provider type, or OpenAPI metadata.
