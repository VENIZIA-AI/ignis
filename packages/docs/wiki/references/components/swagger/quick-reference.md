# Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `SwaggerComponent` |
| **UI Factory** | `UIProviderFactory` |
| **Runtimes** | Both |

::: details Import Paths
```typescript
import { SwaggerComponent, SwaggerBindingKeys, UIProviderFactory } from '@venizia/ignis';
import type { ISwaggerOptions, IUIProvider, IUIConfig } from '@venizia/ignis';
```
:::

## UI Provider Types

| Provider | Value | When to Use |
|----------|-------|-------------|
| **Scalar** | `'scalar'` | Modern, clean UI (default) |
| **Swagger UI** | `'swagger'` | Classic Swagger interface |

## Default Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/doc/explorer` | Documentation UI (Scalar by default) |
| `GET` | `/doc/openapi.json` | Raw OpenAPI specification |
