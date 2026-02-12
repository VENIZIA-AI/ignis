# Swagger/OpenAPI

Automatic interactive API documentation generation using OpenAPI specifications, powered by Scalar or Swagger UI.

## Quick Reference

| Item | Value |
|------|-------|
| **Package** | `@venizia/ignis` |
| **Class** | `SwaggerComponent` |
| **UI Factory** | `UIProviderFactory` |
| **Runtimes** | Both |

| Provider | Value | When to Use |
|----------|-------|-------------|
| **Scalar** | `'scalar'` | Modern, clean UI (default) |
| **Swagger UI** | `'swagger'` | Classic Swagger interface |

#### Import Paths
```typescript
import { SwaggerComponent, SwaggerBindingKeys, UIProviderFactory } from '@venizia/ignis';
import type { ISwaggerOptions, IUIProvider, IUIConfig, IGetProviderParams } from '@venizia/ignis';
```

## Setup

### Step 1: Bind Configuration (Optional)

Skip this step to use the defaults (Scalar UI at `/doc/explorer`). To customize:

```typescript
// In your Application class's preConfigure method (src/application.ts)
import { SwaggerBindingKeys, ISwaggerOptions } from '@venizia/ignis';

this.bind<ISwaggerOptions>({
  key: SwaggerBindingKeys.SWAGGER_OPTIONS,
}).toValue({
  restOptions: {
    base: { path: '/doc' },
    doc: { path: '/openapi.json' },
    ui: { path: '/explorer', type: 'swagger' }, // Use Swagger UI instead of Scalar
  },
  explorer: {
    openapi: '3.0.0',
  },
});
```

### Step 2: Register Component

```typescript
// src/application.ts
import { SwaggerComponent, BaseApplication, ValueOrPromise } from '@venizia/ignis';

export class Application extends BaseApplication {
  preConfigure(): ValueOrPromise<void> {
    // ...
    this.component(SwaggerComponent);
  }
}
```

### Step 3: Define Routes with Zod Schemas

To get the most out of the documentation, define your routes with `zod` schemas:

```typescript
// src/controllers/hello.controller.ts
import { z } from '@hono/zod-openapi';
import { BaseController, controller, HTTP, jsonContent, ValueOrPromise } from '@venizia/ignis';

@controller({ path: '/hello' })
export class HelloController extends BaseController {
  constructor() {
    super({ scope: HelloController.name, path: '/hello' });
  }

  override binding(): ValueOrPromise<void> {
    this.defineRoute({
      configs: {
        path: '/',
        method: 'get',
        responses: {
          [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
            description: 'A simple hello message',
            schema: z.object({ message: z.string() }),
          }),
        },
      },
      handler: (c) => {
        return c.json({ message: 'Hello, `Ignis`!' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
}
```

> [!TIP]
> Controllers using `defineRoute` with Zod schemas automatically generate OpenAPI specs. The Swagger component discovers all registered controller routes and renders them in the documentation UI.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `restOptions.base.path` | `string` | `'/doc'` | Base path for all documentation routes |
| `restOptions.doc.path` | `string` | `'/openapi.json'` | Path to the raw OpenAPI spec (relative to base) |
| `restOptions.ui.path` | `string` | `'/explorer'` | Path to the documentation UI (relative to base) |
| `restOptions.ui.type` | `'swagger' \| 'scalar'` | `'scalar'` | UI provider type |
| `explorer.openapi` | `string` | `'3.0.0'` | OpenAPI specification version |
| `uiConfig` | `Record<string, any>` | `undefined` | Custom config passed to the UI provider |

> [!IMPORTANT]
> The `explorer.info` field is **always overwritten** during the component's `binding()` phase. The component unconditionally reads your application's `package.json` via `application.getAppInfo()` and sets `explorer.info` to `{ title, version, description, contact }` from that data. Any user-provided `explorer.info` values are discarded. If you need to customize these fields, update your `package.json` instead.

> [!NOTE]
> The `explorer.servers` field is auto-populated only when empty. If you provide `explorer.servers` with at least one entry, the component preserves your values. When no servers are configured, it creates a default entry from `application.getServerAddress()` plus the application base path.

#### ISwaggerOptions -- Full Reference
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
| `explorer.info.title` | `string` | Always from `package.json` `name` | API title (overwritten at runtime) |
| `explorer.info.version` | `string` | Always from `package.json` `version` | API version (overwritten at runtime) |
| `explorer.info.description` | `string` | Always from `package.json` `description` | API description (overwritten at runtime) |
| `explorer.info.contact` | `{ name, email }` | Always from `package.json` `author` | Contact information (overwritten at runtime) |
| `explorer.servers` | `Array<{ url, description? }>` | Auto-detected when empty | Server URLs |
| `uiConfig` | `Record<string, any>` | `undefined` | Custom config passed to the UI provider |

#### IGetProviderParams Interface

The `IGetProviderParams` interface is used by `UIProviderFactory.getProvider()` and `UIProviderFactory.register()`:

```typescript
export interface IGetProviderParams {
  type: string;
}
```

This interface is exported for use when building custom tooling around the `UIProviderFactory` -- for example, programmatically querying which providers are available or registering providers in tests.

### Tech Stack

| Library | Purpose |
|---------|---------|
| `@hono/zod-openapi` | OpenAPI generation from Zod schemas |
| `@hono/swagger-ui` | Swagger UI rendering |
| `@scalar/hono-api-reference` | Scalar UI rendering |
| `zod` | Schema validation and type generation |

> [!TIP]
> The component also auto-registers JWT (`bearer`) and Basic security schemes in the OpenAPI spec, so authenticated endpoints display the correct auth UI in the documentation.

## Architecture

### Component Lifecycle

The `SwaggerComponent` executes the following during `binding()`:

1. **Resolve options** -- reads `SwaggerBindingKeys.SWAGGER_OPTIONS` from DI using `application.get()` with `isOptional: true`, falls back to `DEFAULT_SWAGGER_OPTIONS` via the `??` operator if no binding exists
2. **Overwrite info** -- unconditionally reads `package.json` via `application.getAppInfo()` and overwrites `explorer.info` with `{ title: appInfo.name, version: appInfo.version, description: appInfo.description, contact: appInfo.author }`
3. **Auto-detect servers** -- if `explorer.servers` is empty or unset, creates one entry from `http://` + `application.getServerAddress()` + `configs.path.base`
4. **Normalize paths** -- all path segments (`base.path`, `doc.path`, `ui.path`) are normalized to ensure a leading `/` is present, handling both `/path` and `path` inputs
5. **Register OpenAPI doc route** -- calls `rootRouter.doc(docPath, explorer)` to register the raw JSON endpoint
6. **Resolve UI type with fallback** -- evaluates `restOptions.ui.type || DocumentUITypes.SWAGGER`. Note: this means a falsy value (empty string) falls back to `'swagger'`, not `'scalar'`
7. **Validate UI type** -- checks the resolved type against `DocumentUITypes.SCHEME_SET`, throws if invalid
8. **Register UI provider** -- calls `UIProviderFactory.register({ type })` to instantiate the UI renderer
9. **Construct docUrl** -- builds the full documentation URL by joining `configs.path.base`, `configs.basePath`, and the computed `docPath`
10. **Register UI route** -- creates `GET` handler at `uiPath` that calls `uiProvider.render()` with `{ title: appInfo.name, url: docUrl, ...uiConfig }`
11. **Register security schemes** -- auto-registers JWT (bearer) and Basic security schemes in the OpenAPI registry

### Architecture Components

| Component | Class | Role |
|-----------|-------|------|
| **SwaggerComponent** | `extends BaseComponent` | Orchestrates binding, overwrites OpenAPI metadata from `package.json` |
| **UIProviderFactory** | `extends MemoryStorageHelper` (singleton) | Registry for UI providers, validates and instantiates |
| **SwaggerUIProvider** | `implements IUIProvider` | Renders Swagger UI via `@hono/swagger-ui` |
| **ScalarUIProvider** | `implements IUIProvider` | Renders Scalar UI via `@scalar/hono-api-reference` |

#### UIProviderFactory and MemoryStorageHelper

`UIProviderFactory` extends `MemoryStorageHelper<{ [key: string | symbol]: IUIProvider }>`, which provides a simple in-memory key-value store with the following methods used internally:

- `isBound(key)` -- checks if a provider type is already registered
- `get(key)` -- retrieves a registered provider instance
- `set(key, value)` -- stores a provider instance
- `keys()` -- lists all registered provider type keys

This gives the factory a lightweight, type-safe storage backend without requiring the full DI container.

#### Lazy Dynamic Imports

Both `SwaggerUIProvider` and `ScalarUIProvider` use `await import()` inside their `render()` method to load the underlying UI library:

```typescript
// SwaggerUIProvider
async render(context, config, next) {
  const { swaggerUI } = await import('@hono/swagger-ui');
  // ...
}

// ScalarUIProvider
async render(context, config, next) {
  const { Scalar } = await import('@scalar/hono-api-reference');
  // ...
}
```

This means UI libraries are loaded on the **first HTTP request** to the documentation endpoint, not at application startup. This keeps startup time fast and avoids loading unused UI libraries (only the configured provider's library is ever imported).

#### ScalarUIProvider Title Mapping

The `ScalarUIProvider` maps the `title` field to `pageTitle` when calling the Scalar renderer:

```typescript
const { title, url, ...customConfig } = config;
return Scalar({ url, pageTitle: title, ...customConfig })(context, next);
```

This is a quirk to be aware of if you are inspecting the rendered output or writing custom UI providers -- Scalar uses `pageTitle` instead of `title`.

### UIProviderFactory API

| Method | Signature | Description |
|--------|-----------|-------------|
| `getInstance()` | `static () => UIProviderFactory` | Returns singleton instance |
| `register()` | `(opts: { type: string }) => void` | Instantiates and registers a UI provider (idempotent) |
| `getProvider()` | `(opts: IGetProviderParams) => IUIProvider` | Returns registered provider or throws |
| `getRegisteredProviders()` | `() => string[]` | Lists all registered provider type keys |

#### register() Idempotency

The `register()` method is idempotent. If a provider of the given type is already registered, it logs a warning and returns without error:

```typescript
register(opts: { type: string }): void {
  if (this.isBound(opts.type)) {
    this.logger
      .for(this.register.name)
      .warn('Skip registering BOUNDED Document UI | type: %s', opts.type);
    return;
  }
  // ... instantiate and store the provider
}
```

This means calling `register({ type: 'scalar' })` multiple times is safe and will not create duplicate provider instances.

### IUIProvider Interface

```typescript
interface IUIProvider {
  render(context: Context, config: IUIConfig, next: Next): Promise<Response | void>;
}

interface IUIConfig {
  title: string;     // App name from package.json
  url: string;       // Full URL to OpenAPI JSON endpoint
  [key: string]: any; // Additional config from uiConfig option
}
```

### Security Scheme Registration

The component auto-registers two OpenAPI security schemes:

```typescript
// JWT Bearer
rootRouter.openAPIRegistry.registerComponent('securitySchemes', 'jwt', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

// Basic Auth
rootRouter.openAPIRegistry.registerComponent('securitySchemes', 'basic', {
  type: 'http',
  scheme: 'basic',
});
```

This ensures routes using `authStrategies: ['jwt']` or `authStrategies: ['basic']` display the correct auth UI (lock icon + input fields) in the documentation.

## Binding Keys

| Key | Constant | Type | Required | Default |
|-----|----------|------|----------|---------|
| `@app/swagger/options` | `SwaggerBindingKeys.SWAGGER_OPTIONS` | `ISwaggerOptions` | No | See below |

The `SwaggerComponent` constructor creates a default binding using the `Binding` fluent API:

```typescript
this.bindings = {
  [SwaggerBindingKeys.SWAGGER_OPTIONS]: Binding.bind<ISwaggerOptions>({
    key: SwaggerBindingKeys.SWAGGER_OPTIONS,
  }).toValue(DEFAULT_SWAGGER_OPTIONS),
};
```

Note that unlike `HealthCheckComponent`, `SwaggerComponent` does not pass `initDefault: { enable: true, container: application }` to `BaseComponent`. The default bindings stored in `this.bindings` are not automatically registered into the DI container. Instead, the `binding()` method reads from the container with `isOptional: true` and falls back to `DEFAULT_SWAGGER_OPTIONS` via the `??` operator.

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
> The `explorer.info` values in `DEFAULT_SWAGGER_OPTIONS` are never used at runtime because `binding()` unconditionally overwrites `explorer.info` with data from `package.json`. They exist only as structural defaults.

### Type Definitions

```typescript
type TDocumentUIType = TConstValue<typeof DocumentUITypes>;

class DocumentUITypes {
  static readonly SWAGGER = 'swagger';
  static readonly SCALAR = 'scalar';
  static readonly SCHEME_SET: Set<string>;
  static isValid(input: string): boolean;
}
```

`TDocumentUIType` is derived via `TConstValue`, which extracts the union of all `static readonly` string values from `DocumentUITypes`. This ensures the type stays in sync with the constants automatically.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/doc/explorer` | Documentation UI (Scalar by default) |
| `GET` | `/doc/openapi.json` | Raw OpenAPI specification |

> [!NOTE]
> These paths are based on the default configuration. If you customize `restOptions.base.path`, `restOptions.ui.path`, or `restOptions.doc.path`, the actual endpoints change accordingly.

### Documentation UI Endpoint

**Default path:** `/doc/explorer`

Renders an interactive API documentation page using the configured UI provider (Scalar or Swagger UI). The UI fetches the OpenAPI spec from the JSON endpoint and renders it with full request/response exploration, authentication controls, and try-it-out functionality.

### OpenAPI JSON Endpoint

**Default path:** `/doc/openapi.json`

Returns the raw OpenAPI JSON specification generated from all registered controller routes and their Zod schemas. This endpoint can be used by:
- External API testing tools (Postman, Insomnia)
- CI pipelines for API contract validation
- Client SDK generators (openapi-generator, orval)
- API gateway configuration

## Troubleshooting

### "Invalid document UI Type"

**Cause:** The `restOptions.ui.type` value is not `'swagger'` or `'scalar'`. The `UIProviderFactory` only recognizes these two built-in providers. Note that a falsy value (empty string, `undefined`) does not trigger this error -- it silently falls back to `'swagger'` due to the `||` operator, not to the default `'scalar'`.

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

### explorer.info values not matching custom configuration

**Cause:** The `SwaggerComponent` unconditionally overwrites `explorer.info` with values from `package.json` during its `binding()` phase. Any values you set in `explorer.info` via the DI binding are discarded.

**Fix:** Update your project's `package.json` fields (`name`, `version`, `description`, `author`) to control what appears in the API documentation info section. The component reads these via `application.getAppInfo()`.

## See Also

- **Guides:**
  - [Components Overview](/guides/core-concepts/components) - Component system basics
  - [Controllers](/guides/core-concepts/controllers) - Defining OpenAPI routes

- **Components:**
  - [All Components](./index) - Built-in components list
  - [Authentication](./authentication/) - JWT/Basic auth for secured endpoints

- **Utilities:**
  - [Schema Utilities](/references/utilities/schema) - Response schema helpers
  - [JSX Utilities](/references/utilities/jsx) - HTML response schemas

- **External Resources:**
  - [OpenAPI Specification](https://swagger.io/specification/) - OpenAPI standard
  - [Scalar Documentation](https://github.com/scalar/scalar) - Scalar API documentation UI
  - [@hono/zod-openapi](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) - Hono OpenAPI integration
