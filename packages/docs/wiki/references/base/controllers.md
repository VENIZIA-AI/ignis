# Deep Dive: Controllers

This document provides a technical overview of the `AbstractController` and `BaseController` classes, which are the foundation for creating API endpoints in an Ignis application.

## `AbstractController`

The `AbstractController` class is an abstract base that integrates Hono's routing capabilities with Ignis's dependency injection and OpenAPI documentation generation.

-   **File:** `packages/core/src/base/controllers/abstract.ts`

### Key Features

| Feature | Description |
| :--- | :--- |
| **Hono Router** | Each controller instance manages its own `OpenAPIHono` router. |
| **Lifecycle** | Provides a `binding()` method, which is the designated place to define all routes for the controller. |
| **OpenAPI Integration** | Integrates with `@hono/zod-openapi` for route definition and OpenAPI schema generation. |
| **Standard Route Configs** | The `getRouteConfigs` method centralizes the logic for preparing route configurations, including adding authentication strategies, default responses, and controller-specific tags. |

## `BaseController`

The `BaseController` extends `AbstractController` and provides concrete implementations for defining various types of API routes.

-   **File:** `packages/core/src/base/controllers/base.ts`

### Route Definition Methods

`BaseController` offers two primary methods for defining routes:

### `defineRoute`

This method is for creating API endpoints. It now handles both public and authenticated routes by accepting an `authStrategies` array within the `configs`.

```typescript
this.defineRoute({
  configs: TRouteConfig & { authStrategies?: TAuthStrategy[] };
  handler: Handler;
  hook?: Hook;
});
```

-   **`configs`**: An object that defines the route's OpenAPI specification. It now includes an optional `authStrategies` array. See the table below for details.
-   **`handler`**: The Hono route handler function `(c: Context) => Response`.
-   **`hook`**: An optional hook for processing the request or response, often used for validation error handling.

### `bindRoute`

This method offers a fluent API for defining routes, similar to `defineRoute`, but structured for chaining. It also supports `authStrategies`.

```typescript
this.bindRoute({
  configs: TRouteConfig & { authStrategies?: TAuthStrategy[] };
}).to({
  handler: Handler;
});
```

-   **`configs`**: Same as `defineRoute`, including `authStrategies`.
-   **`to`**: A method that accepts an object with the `handler` function.

### `TRouteConfig` Options

The `configs` object accepts properties based on the OpenAPI 3.0 specification.

| Property | Type | Description |
| :--- | :--- | :--- |
| `path` | `string` | The route path, relative to the controller's base path (e.g., `/:id`). |
| `method` | `'get' \| 'post' \| ...` | The HTTP method for the route. |
| `request` | `object` | Defines the request, including `params`, `query`, and `body`. You can use Zod schemas for validation. |
| `responses`| `object` | An object mapping HTTP status codes to response descriptions and schemas. The `jsonContent` and `jsonResponse` utilities can simplify this. |
| `tags` | `string[]` | An array of tags for grouping routes in the OpenAPI documentation. The controller's name is automatically added as a tag. |
| `summary` | `string` | A short summary of what the operation does. |
| `description`| `string` | A detailed description of the operation. |
| `authStrategies`| `TAuthStrategy[]` | An optional array of authentication strategy names (e.g., `[Authentication.STRATEGY_JWT]`). If provided, the framework will automatically add the necessary middleware to enforce these strategies. |

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

## `ControllerFactory`

The `ControllerFactory` provides a static method `defineCrudController` to quickly generate a pre-configured CRUD controller for any given `BaseEntity` and its corresponding repository. This significantly reduces boilerplate for standard RESTful resources.

-   **File:** `packages/core/src/base/controllers/factory.ts`

### `static defineCrudController<EntitySchema>(opts: ICrudControllerOptions<EntitySchema>)`

This factory method returns a `BaseController` class that is already set up with the following standard CRUD endpoints:

| Name | Method | Path | Description |
| :--- | :--- | :--- | :--- |
| `count` | `GET` | `/count` | Get the number of records matching a filter. |
| `find` | `GET` | `/` | Retrieve all records matching a filter. |
| `findById` | `GET` | `/:id` | Retrieve a single record by its ID. |
| `findOne` | `GET` | `/find-one` | Retrieve a single record matching a filter. |
| `create` | `POST` | `/` | Create a new record. |
| `updateById` | `PATCH` | `/:id` | Update a record by its ID. |
| `updateAll` | `PATCH` | `/` | Update multiple records matching a filter. |
| `deleteById` | `DELETE` | `/:id` | Delete a record by its ID. |
| `deleteAll` | `DELETE` | `/` | Delete multiple records matching a filter. |

### `ICrudControllerOptions<EntitySchema>`

| Option | Type | Description |
| :--- | :--- | :--- |
| `entity` | `TClass<BaseEntity<EntitySchema>> \| TResolver<TClass<BaseEntity<EntitySchema>>>` | The entity class (or a resolver function returning it) that this CRUD controller manages. This is used to derive request/response schemas. |
| `repository.name` | `string` | The binding key name of the repository associated with this entity (e.g., `'ConfigurationRepository'`). |
| `controller.name` | `string` | A unique name for the generated controller (e.g., `'ConfigurationController'`). |
| `controller.basePath`| `string` | The base path for all routes in this CRUD controller (e.g., `'/configurations'`). |
| `controller.isStrict` | `boolean` | If `true`, query parameters like `where` will be strictly validated. Defaults to `true`. |
| `controller.defaultLimit`| `number` | The default limit for `find` operations. Defaults to `10`. |

### Example

```typescript
// src/controllers/configuration.controller.ts
import { Configuration } from '@/models';
import { ConfigurationRepository } from '@/repositories';
import {
  controller,
  ControllerFactory,
  inject,
  BindingKeys,
  BindingNamespaces,
} from '@vez/ignis';

const BASE_PATH = '/configurations';

// Define the CRUD controller using the factory
const _ConfigurationController = ControllerFactory.defineCrudController({
  repository: { name: ConfigurationRepository.name },
  controller: {
    name: 'ConfigurationController',
    basePath: BASE_PATH,
    isStrict: true,
  },
  entity: () => Configuration, // Provide the entity class
});

// Extend the generated controller to add custom logic or inject dependencies
@controller({ path: BASE_PATH })
export class ConfigurationController extends _ConfigurationController {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ConfigurationRepository.name,
      }),
    })
    repository: ConfigurationRepository,
  ) {
    super(repository); // Pass the injected repository to the super constructor
  }
}
```

By leveraging these structured configuration options and the `ControllerFactory`, you ensure that your API is not only functional but also well-documented, easy to validate, and rapidly deployable for standard CRUD operations.