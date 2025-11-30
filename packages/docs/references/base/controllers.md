# Deep Dive: Controllers

This document provides a technical overview of the `BaseController` class, which is the foundation for creating API endpoints in an Ignis application.

## `BaseController` Class

The `BaseController` is an abstract class that integrates Hono's routing capabilities with Ignis's dependency injection and OpenAPI documentation generation.

-   **File:** `packages/core/src/base/controllers/base.ts`

### Key Features

| Feature | Description |
| :--- | :--- |
| **Routing** | Each controller instance manages its own `OpenAPIHono` router. The base path for this router is defined by the `@controller` decorator. |
| **Lifecycle** | Provides a `binding()` method, which is the designated place to define all routes for the controller. |
| **OpenAPI Integration** | The `defineRoute` and `defineAuthRoute` methods are built on top of `@hono/zod-openapi`, allowing you to define routes with Zod schemas for validation and automatic documentation. |
| **Authentication** | `defineAuthRoute` seamlessly integrates with the authentication system, allowing you to secure endpoints with one or more authentication strategies. |

## Route Definition Methods

### `defineRoute`

This method is for creating public routes.

```typescript
this.defineRoute({
  configs: TRouteConfig;
  handler: Handler;
  hook?: Hook;
});
```

-   **`configs`**: An object that defines the route's OpenAPI specification. See the table below for details.
-   **`handler`**: The Hono route handler function `(c: Context) => Response`.
-   **`hook`**: An optional hook for processing the request or response, often used for validation error handling.

### `defineAuthRoute`

This method is for creating protected routes that require authentication. It's a wrapper around `defineRoute` that adds authentication middleware.

```typescript
this.defineAuthRoute({
  configs: TRouteConfig & { authStrategies: TAuthStrategy[] };
  handler: Handler;
  hook?: Hook;
});
```

-   **`authStrategies`**: An array of authentication strategy names (e.g., `[Authentication.STRATEGY_JWT]`). The framework will automatically add the necessary middleware to enforce these strategies.

### `TRouteConfig` Options

The `configs` object accepts properties based on the OpenAPI 3.0 specification.

| Property | Type | Description |
| :--- | :--- | :--- |
| `path` | `string` | The route path, relative to the controller's base path (e.g., `/:id`). |
| `method` | `'get' | 'post' | ...` | The HTTP method for the route. |
| `request` | `object` | Defines the request, including `params`, `query`, and `body`. You can use Zod schemas for validation. |
| `responses`| `object` | An object mapping HTTP status codes to response descriptions and schemas. The `jsonContent` and `jsonResponse` utilities can simplify this. |
| `tags` | `string[]` | An array of tags for grouping routes in the OpenAPI documentation. The controller's name is automatically added as a tag. |
| `summary` | `string` | A short summary of what the operation does. |
| `description`| `string` | A detailed description of the operation. |

### Example of `request` Configuration

```typescript
import { z } from '@hono/zod-openapi';
import { jsonContent } from '@vez/ignis';

// ...
request: {
  params: z.object({ id: z.string() }),
  query: z.object({ format: z.string().optional() }),
  body: jsonContent({
    schema: z.object({ name: z.string() })
  })
}
// ...
```

By leveraging these structured configuration options, you ensure that your API is not only functional but also well-documented and easy to validate.
