# Deep Dive: Controllers

Technical reference for controller classes - the foundation for creating API endpoints in Ignis.

**Files:**
- `packages/core/src/base/controllers/abstract.ts`
- `packages/core/src/base/controllers/base.ts`

## Quick Reference

| Class | Purpose | Route Definition Methods |
|-------|---------|--------------------------|
| **AbstractController** | Base class with Hono router integration | `binding()`, `registerRoutesFromRegistry()` |
| **BaseController** | Concrete implementation for API routes | `defineRoute()`, `bindRoute()`, `@get`, `@post`, `@api` decorators |

## Routing Approaches

| Approach | When to Use | Example |
|----------|-------------|---------|
| **Decorator-Based** (Recommended) | Clean, declarative routes | `@get({ configs: {...} })` |
| **Manual Definition** | Complex routing logic | `this.defineRoute({ configs, handler })` |

## `AbstractController`

Base class integrating Hono routing with Ignis DI and OpenAPI generation.

### Key Features

| Feature | Description |
| :--- | :--- |
| **Hono Router** | Each controller manages its own `OpenAPIHono` router |
| **Lifecycle** | `binding()` for manual routes, `registerRoutesFromRegistry()` for decorators |
| **OpenAPI Integration** | Integrates with `@hono/zod-openapi` for schema generation |
| **Standard Route Configs** | `getRouteConfigs` adds auth strategies, default responses, controller tags |

## `BaseController`

Extends `AbstractController` with concrete implementations for defining API routes.

### Decorator-Based Routing (Recommended)

With the latest updates, the recommended way to define routes is by using decorators directly on your controller methods. This approach is more declarative, cleaner, and reduces boilerplate. The framework automatically discovers and registers these routes during startup via the `registerRoutesFromRegistry()` method.

The `binding()` method is no longer required if you are using only decorator-based routing.

:::tip Type Safety without Boilerplate
For decorator-based routes, you do not need to explicitly annotate the return type with `TRouteResponse`. TypeScript will automatically infer and validate the return type against the OpenAPI response schema you define in your `configs`. This gives you full type safety with less code.
:::

#### `@api` Decorator

The generic `@api` decorator allows you to define a route with a full configuration object. The decorated method will automatically have its `context` parameter and return type inferred and type-checked against the provided route configuration. This ensures strong type safety throughout your API definitions.

```typescript
import { api, BaseController, controller, HTTP, jsonContent, jsonResponse, z, TRouteContext } from '@venizia/ignis';

const MyRouteConfig = {
  method: 'get',
  path: '/data',
  responses: jsonResponse({ schema: z.object({ success: z.boolean() }) }),
} as const;

@controller({ path: '/my-feature' })
export class MyFeatureController extends BaseController {

  @api({ configs: MyRouteConfig })
  getData(c: TRouteContext<typeof MyRouteConfig>) { // Return type is automatically inferred and validated
    return c.json({ success: true });
  }
}
```

#### HTTP Method Decorators (`@get`, `@post`, etc.)

For convenience, `Ignis` provides decorator shortcuts for each HTTP method: These decorators accept the same `configs` object as `@api`, but without the `method` property.

- `@get(opts)`
- `@post(opts)`
- `@put(opts)`
- `@patch(opts)`
- `@del(opts)`

**Example using `@get` and `@post` with type inference:**

```typescript
import { get, post, z, jsonContent, jsonResponse, Authentication, TRouteContext } from '@venizia/ignis';

// Define route configs as const for full type inference
const USER_ROUTES = {
  listUsers: {
    path: '/',
    method: 'get',
    responses: jsonResponse({
      description: 'A list of users',
      schema: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  },
  getUser: {
    path: '/:id',
    method: 'get',
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: jsonResponse({
      description: 'A single user',
      schema: z.object({ id: z.string(), name: z.string() }),
    }),
  },
  createUser: {
    path: '/',
    method: 'post',
    authStrategies: [Authentication.STRATEGY_JWT], // Secure this endpoint
    request: {
      body: jsonContent({
        schema: z.object({ name: z.string() }),
      }),
    },
    responses: jsonResponse({
      schema: z.object({ id: z.string(), name: z.string() }),
    }),
  },
} as const; // Crucial for type inference!

// ... inside a controller class

  @get({ configs: USER_ROUTES.listUsers })
  getAllUsers(c: TRouteContext<typeof USER_ROUTES.listUsers>) { // Return type is automatically inferred
    return c.json([{ id: '1', name: 'John Doe' }]);
  }

  @get({ configs: USER_ROUTES.getUser })
  getUserById(c: TRouteContext<typeof USER_ROUTES.getUser>) { // Return type is automatically inferred
    const { id } = c.req.valid('param'); // id is typed as string
    return c.json({ id, name: 'John Doe' });
  }

  @post({ configs: USER_ROUTES.createUser })
  createUser(c: TRouteContext<typeof USER_ROUTES.createUser>) { // Return type is automatically inferred
    const { name } = c.req.valid('json'); // name is typed as string
    const newUser = { id: '2', name };
    return c.json(newUser, 201); // Return type is validated
  }
```

**Example using shared `ROUTE_CONFIGS`:**

For better organization, you can define all your route configurations in a constant and reference them in your decorators. This approach also allows you to get a typed context for your handler.

```typescript
import { api, BaseController, controller, TRouteContext, jsonContent, jsonResponse, HTTP } from '@venizia/ignis';
import { z } from 'hono/zod-openapi';

const HEALTH_CHECK_ROUTES = {
  '/ping': {
    method: HTTP.Methods.POST,
    path: '/ping',
    request: {
      body: jsonContent({
        schema: z.object({ message: z.string().min(1) }),
      }),
    },
    responses: jsonResponse({
      schema: z.object({ pong: z.string() }),
    }),
  },
} as const; // Use 'as const' for strict type inference

@controller({ path: '/health' })
export class HealthCheckController extends BaseController {
  
  @api({ configs: HEALTH_CHECK_ROUTES['/ping'] })
  ping(c: TRouteContext<typeof HEALTH_CHECK_ROUTES['/ping']>) { // Return type is automatically inferred
    const { message } = c.req.valid('json');
    return c.json({ pong: message });
  }
}
```

### Manual Route Definition Methods

While decorator-based routing is available, the recommended way to define routes is by using the `defineRoute` and `bindRoute` methods inside the `binding()` method. This approach offers a clear and declarative syntax that keeps your route definitions organized and easy to manage.

:::tip Recommendation
For better organization and a more declarative approach, we strongly recommend using `defineRoute` or `bindRoute` within the `binding()` method to define your controller's routes. This keeps all route definitions in one place, making your controller easier to read and maintain.
:::

#### `defineRoute`

This method is for creating API endpoints. It now handles both public and authenticated routes by accepting an `authStrategies` array within the `configs`.

```typescript
this.defineRoute({
  configs: TAuthRouteConfig<RouteConfig>; // You would define this inline or via a const
  handler: TLazyRouteHandler<typeof configs, RouteEnv>; // Inferred from configs
  hook?: Hook;
});
```

-   **`configs`**: An object that defines the route's OpenAPI specification. It now includes an optional `authStrategies` array. See the table below for details.
-   **`handler`**: The Hono route handler function `(c: Context) => Response`.
-   **`hook`**: An optional hook for processing the request or response, often used for validation error handling.

#### `bindRoute`

This method offers a fluent API for defining routes, similar to `defineRoute`, but structured for chaining. It also supports `authStrategies`.

```typescript
this.bindRoute({
  configs: TAuthRouteConfig<RouteConfig>; // You would define this inline or via a const
}).to({
  handler: TLazyRouteHandler<typeof configs, RouteEnv>; // Inferred from configs
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
import { jsonContent } from '@venizia/ignis';

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

### `defineRouteConfigs`

-   **File:** `packages/core/src/base/controllers/factory/definition.ts`

The `defineRouteConfigs` function is a simple helper for creating a typed object containing multiple route configurations. This is particularly useful for organizing all of a controller's route definitions in a single, type-checked constant.

```typescript
import { defineRouteConfigs, HTTP, jsonResponse, z } from '@venizia/ignis';

const ROUTE_CONFIGS = defineRouteConfigs({
  '/': {
    method: HTTP.Methods.GET,
    path: '/',
    responses: jsonResponse({
      schema: z.object({ status: z.string() }),
    }),
  },
  '/ping': {
    method: HTTP.Methods.POST,
    path: '/ping',
    request: {
      body: jsonContent({
        schema: z.object({ message: z.string() }),
      }),
    },
    responses: jsonResponse({
      schema: z.object({ message: z.string() }),
    }),
  },
});
```

## `ControllerFactory`

The `ControllerFactory` provides a static method `defineCrudController` to quickly generate a pre-configured CRUD controller for any given `BaseEntity` and its corresponding repository. This significantly reduces boilerplate for standard RESTful resources.

-   **File:** `packages/core/src/base/controllers/factory/controller.ts`

### `static defineCrudController<EntitySchema>(opts: ICrudControllerOptions<EntitySchema>)`

This factory method returns a `BaseController` class that is already set up with the following standard CRUD endpoints.

**Note:** The returned class is dynamically named using `controller.name` from the options. This ensures that when registered with `app.controller()`, the class has a proper name for binding keys and debugging (e.g., `ConfigurationController` instead of an anonymous class).

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
| `schema` | `object` | An optional object to override the default Zod schemas for specific CRUD endpoints (e.g., `find`, `create`, `updateByIdRequestBody`). This allows for fine-grained control over the request and response validation and OpenAPI documentation. |
| `doDeleteWithReturn` | `boolean` | If `true`, the `deleteById` and `deleteAll` endpoints will return the deleted record(s) in the response body. Defaults to `false`. |

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
} from '@venizia/ignis';

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
