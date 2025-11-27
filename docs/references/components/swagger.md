# Swagger/OpenAPI Component

The Swagger component automatically generates interactive API documentation for your Ignis application using Swagger UI and OpenAPI specifications.

## Overview

-   **Feature Name:** Swagger/OpenAPI Documentation
-   **Purpose:** To automatically generate interactive API documentation for your Ignis application.
-   **Background:** Good documentation is crucial for any API. This feature leverages Hono's OpenAPI integration and Swagger UI to provide a seamless way to document your API endpoints.
-   **Related Features/Modules:** This feature is closely tied to `base/controllers` and the `defineRoute`/`defineAuthRoute` methods, which use `zod` schemas to define the API structure.

## Design and Architecture

-   **`SwaggerComponent`:** The main component for this feature. It configures the Swagger UI and registers the necessary routes to serve the documentation.
-   **`@hono/zod-openapi`:** The underlying library that powers the OpenAPI generation from `zod` schemas.
-   **`@hono/swagger-ui`:** The library that provides the Swagger UI interface.

## Implementation Details

### Tech Stack

-   **Hono**
-   **`@hono/zod-openapi`**
-   **`@hono/swagger-ui`**
-   **`zod`**

### Configuration

The Swagger component can be configured via the `ISwaggerOptions` binding. You can customize the path for the documentation, the OpenAPI version, and more.

**Default options:**

```typescript
const DEFAULT_SWAGGER_OPTIONS: ISwaggerOptions = {
  restOptions: {
    path: {
      base: '/doc',
      doc: '/openapi.json',
      ui: 'explorer',
    },
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

#### 2. Defining Routes with Zod Schemas

To get the most out of the Swagger documentation, define your routes with `zod` schemas.

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

By default, the Swagger documentation is available at the following endpoints:

-   **/doc/explorer**: The Swagger UI.
-   **/doc/openapi.json**: The raw OpenAPI specification.

These paths can be configured by providing custom `ISwaggerOptions` when you bind the `SwaggerComponent`.

This feature provides a powerful way to document your APIs, making them easier to consume and understand for both frontend developers and other API clients.
