# Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `restOptions.base.path` | `string` | `'/doc'` | Base path for all documentation routes |
| `restOptions.doc.path` | `string` | `'/openapi.json'` | Path to the raw OpenAPI spec (relative to base) |
| `restOptions.ui.path` | `string` | `'/explorer'` | Path to the documentation UI (relative to base) |
| `restOptions.ui.type` | `'swagger' \| 'scalar'` | `'scalar'` | UI provider type |
| `explorer.openapi` | `string` | `'3.0.0'` | OpenAPI specification version |
| `uiConfig` | `Record<string, any>` | `undefined` | Custom config passed to the UI provider |

> [!NOTE]
> The `explorer.info` and `explorer.servers` fields are auto-populated from your application's `package.json` and server address. You only need to set them if you want to override the auto-detected values.

::: details ISwaggerOptions -- Full Reference
```typescript
export interface ISwaggerOptions {
  restOptions: {
    base: { path: string };
    doc: { path: string };
    ui: { path: string; type: TDocumentUIType };
  };
  explorer: {
    openapi: string;
    info?: {
      title: string;
      version: string;
      description: string;
      contact?: { name: string; email: string };
    };
    servers?: Array<{
      url: string;
      description?: string;
    }>;
  };
  uiConfig?: Record<string, any>;
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `restOptions.base.path` | `string` | `'/doc'` | Base path for all documentation routes |
| `restOptions.doc.path` | `string` | `'/openapi.json'` | Path to the raw OpenAPI spec (relative to base) |
| `restOptions.ui.path` | `string` | `'/explorer'` | Path to the documentation UI (relative to base) |
| `restOptions.ui.type` | `'swagger' \| 'scalar'` | `'scalar'` | UI provider type |
| `explorer.openapi` | `string` | `'3.0.0'` | OpenAPI specification version |
| `explorer.info.title` | `string` | Auto from `package.json` | API title |
| `explorer.info.version` | `string` | Auto from `package.json` | API version |
| `explorer.info.description` | `string` | Auto from `package.json` | API description |
| `explorer.info.contact` | `{ name, email }` | Auto from `package.json` | Contact information |
| `explorer.servers` | `Array<{ url, description? }>` | Auto-detected | Server URLs |
| `uiConfig` | `Record<string, any>` | `undefined` | Custom config passed to the UI provider |
:::

## Tech Stack

The Swagger component integrates the following libraries:

| Library | Purpose |
|---------|---------|
| `@hono/zod-openapi` | OpenAPI generation from Zod schemas |
| `@hono/swagger-ui` | Swagger UI rendering |
| `@scalar/hono-api-reference` | Scalar UI rendering |
| `zod` | Schema validation and type generation |

## Architecture Components

- **`SwaggerComponent`** -- Configures documentation UI and registers routes
- **`UIProviderFactory`** -- Singleton factory that manages different UI providers
- **`@hono/zod-openapi`** -- Powers OpenAPI generation from Zod schemas
- **Integration** -- Works with controller `defineRoute` methods using Zod schemas

> [!TIP]
> The component also auto-registers JWT (`bearer`) and Basic security schemes in the OpenAPI spec, so authenticated endpoints display the correct auth UI in the documentation.
