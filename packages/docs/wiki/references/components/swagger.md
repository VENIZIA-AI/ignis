# Swagger/OpenAPI Component

Automatic interactive API documentation generation using OpenAPI specifications.

## Quick Reference

| Component | Purpose |
|-----------|---------|
| **SwaggerComponent** | Configures documentation UI and routes |
| **UIProviderFactory** | Manages UI providers (Swagger UI, Scalar) |
| **Default UI** | Scalar (can be changed to Swagger UI) |

### Default Endpoints

| Path | Description |
|------|-------------|
| `/doc/explorer` | Documentation UI (Scalar by default) |
| `/doc/openapi.json` | Raw OpenAPI specification |

### UI Provider Types

| Provider | Value | When to Use |
|----------|-------|-------------|
| **Scalar** | `'scalar'` | Modern, clean UI (default) |
| **Swagger UI** | `'swagger'` | Classic Swagger interface |

## Architecture Components

-   **`SwaggerComponent`**: Configures documentation UI and registers routes
-   **`UIProviderFactory`**: Manages different UI providers
-   **`@hono/zod-openapi`**: Powers OpenAPI generation from Zod schemas
-   **Integration**: Works with controller `defineRoute` methods using Zod schemas

## Implementation Details

### Tech Stack

-   **Hono**
-   **`@hono/zod-openapi`**
-   **`@hono/swagger-ui`** (for Swagger UI)
-   **`@scalar/hono-api-reference`** (for Scalar UI)
-   **`zod`**

### Configuration

The Swagger component can be configured via the `ISwaggerOptions` binding. You can customize the documentation path, OpenAPI version, and the UI provider type.

**`ISwaggerOptions` Interface:**

```typescript
export interface ISwaggerOptions {
  restOptions: {
    base: { path: string }; // Base path for all documentation routes
    doc: { path: string };  // Path to the raw openapi.json file
    ui: {
      path: string;         // Path to the documentation UI
      type: 'swagger' | 'scalar'; // Type of UI to render
    };
  };
  explorer: {
    openapi: string;
    info?: { /* ... */ };
    servers?: Array<{ url: string; description?: string; }>;
  };
  uiConfig?: Record<string, any>; // Custom config for the UI provider
}
```

**Default Options:**

The default UI provider is `scalar`.

```typescript
const DEFAULT_SWAGGER_OPTIONS: ISwaggerOptions = {
  restOptions: {
    base: { path: '/doc' },
    doc: { path: '/openapi.json' },
    ui: { path: '/explorer', type: 'scalar' },
  },
  // ...
};
```

### Code Samples

#### 1. Registering the Swagger Component

In your `src/application.ts`, register the `SwaggerComponent`.

```typescript
// src/application.ts
import { SwaggerComponent, BaseApplication, ValueOrPromise } from '@venizia/ignis';

export class Application extends BaseApplication {
    // ...
    preConfigure(): ValueOrPromise<void> {
        // ...
        this.component(SwaggerComponent);
        // ...
    }
    // ...
}
```

#### 2. Customizing the UI Provider

To change the UI provider to Swagger UI, you can bind custom options in your application's `preConfigure` method.

```typescript
import { SwaggerComponent, SwaggerBindingKeys, ISwaggerOptions } from '@venizia/ignis';

// ... in your Application class's preConfigure method
  preConfigure(): ValueOrPromise<void> {
    // ...
    this.bind<ISwaggerOptions>({
      key: SwaggerBindingKeys.SWAGGER_OPTIONS,
    }).toValue({
      restOptions: {
        base: { path: '/doc' },
        doc: { path: '/openapi.json' },
        ui: { path: '/explorer', type: 'swagger' }, // Use Swagger UI
      },
      explorer: {
        openapi: '3.0.0',
      },
    });

    this.component(SwaggerComponent);
    // ...
  }
```

#### 3. Defining Routes with Zod Schemas

To get the most out of the documentation, define your routes with `zod` schemas.

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

## API or Interface Specifications

By default, the documentation is available at the following endpoints:

-   **/doc/explorer**: The documentation UI (`scalar` by default).
-   **/doc/openapi.json**: The raw OpenAPI specification.

These paths can be configured by providing custom `ISwaggerOptions`. This feature provides a powerful and flexible way to document your APIs, making them easier to consume and understand.

## See Also

- **Related Concepts:**
  - [Components Overview](/guides/core-concepts/components) - Component system basics
  - [Controllers](/guides/core-concepts/controllers) - Defining OpenAPI routes

- **Other Components:**
  - [Components Index](./index) - All built-in components

- **References:**
  - [Schema Utilities](/references/utilities/schema) - Response schema helpers
  - [JSX Utilities](/references/utilities/jsx) - HTML response schemas

- **External Resources:**
  - [OpenAPI Specification](https://swagger.io/specification/) - OpenAPI standard
  - [Scalar Documentation](https://github.com/scalar/scalar) - API documentation UI
