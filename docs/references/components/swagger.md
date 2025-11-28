# Swagger/OpenAPI Component

The Swagger component automatically generates interactive API documentation for your Ignis application using OpenAPI specifications and supports multiple UI providers like Swagger UI and Scalar.

## Overview

-   **Feature Name:** Swagger/OpenAPI Documentation
-   **Purpose:** To automatically generate interactive API documentation for your Ignis application.
-   **Background:** Good documentation is crucial for any API. This feature leverages Hono's OpenAPI integration and various UI providers to offer a seamless way to document your API endpoints.
-   **Related Features/Modules:** This feature is closely tied to `base/controllers` and the `defineRoute`/`defineAuthRoute` methods, which use `zod` schemas to define the API structure.

## Design and Architecture

-   **`SwaggerComponent`:** The main component for this feature. It configures the documentation UI and registers the necessary routes to serve it.
-   **`UIProviderFactory`:** A factory class that manages different UI providers (e.g., `SwaggerUIProvider`, `ScalarUIProvider`).
-   **`@hono/zod-openapi`:** The underlying library that powers the OpenAPI generation from `zod` schemas.

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
import { SwaggerComponent, BaseApplication, ValueOrPromise } from '@vez/ignis';

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
import { SwaggerComponent, SwaggerBindingKeys, ISwaggerOptions } from '@vez/ignis';

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
import { BaseController, controller, HTTP, IControllerOptions, jsonContent, ValueOrPromise } from '@vez/ignis';

@controller({ path: '/hello' })
export class HelloController extends BaseController {
  constructor(opts: IControllerOptions) {
    super({ ...opts, scope: HelloController.name, path: '/hello' });
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
        return c.json({ message: 'Hello, Ignis!' });
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
