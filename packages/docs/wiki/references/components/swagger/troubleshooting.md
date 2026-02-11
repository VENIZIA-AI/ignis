# Troubleshooting

### "Invalid document UI Type"

**Cause:** The `restOptions.ui.type` value is not `'swagger'` or `'scalar'`. The `UIProviderFactory` only recognizes these two built-in providers.

**Fix:** Use a valid UI type:

```typescript
this.bind<ISwaggerOptions>({
  key: SwaggerBindingKeys.SWAGGER_OPTIONS,
}).toValue({
  restOptions: {
    base: { path: '/doc' },
    doc: { path: '/openapi.json' },
    ui: { path: '/explorer', type: 'scalar' }, // 'scalar' or 'swagger'
  },
  explorer: { openapi: '3.0.0' },
});
```

### Documentation UI shows no routes

**Cause:** Controllers are not defining routes with Zod schemas via `defineRoute` or `bindRoute`. Only routes registered through `@hono/zod-openapi` appear in the OpenAPI spec.

**Fix:** Use `defineRoute` with Zod response schemas in your controllers:

```typescript
this.defineRoute({
  configs: {
    path: '/',
    method: 'get',
    responses: {
      200: jsonContent({
        description: 'Success',
        schema: z.object({ message: z.string() }),
      }),
    },
  },
  handler: (c) => c.json({ message: 'ok' }, 200),
});
```

### "Unknown UI Provider"

**Cause:** The `UIProviderFactory.getProvider()` was called with a type that has not been registered. This typically happens if the component binding phase failed silently.

**Fix:** Ensure the `SwaggerComponent` is registered in `preConfigure()` and that no errors occur during its `binding()` phase. Check the application logs for warnings from `UIProviderFactory`.

### OpenAPI spec missing authentication schemes

**Cause:** The `SwaggerComponent` auto-registers JWT and Basic security schemes. If the `AuthenticationComponent` is not registered, authenticated routes will not show auth UI in the documentation.

**Fix:** Register `AuthenticationComponent` before `SwaggerComponent` in `preConfigure()` to ensure auth strategies are available when the Swagger component configures security schemes.
