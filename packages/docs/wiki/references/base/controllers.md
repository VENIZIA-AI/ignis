---
title: Controllers Reference
description: Technical reference for controller classes and API endpoints
difficulty: beginner
---

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
    return c.json({ success: true }, HTTP.ResultCodes.RS_2.Ok);
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
import { get, post, z, jsonContent, jsonResponse, Authentication, TRouteContext, HTTP } from '@venizia/ignis';

// Define route configs as const for full type inference
const UserRoutes = {
  LIST_USERS: {
    path: '/',
    method: 'get',
    responses: jsonResponse({
      description: 'A list of users',
      schema: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  },
  GET_USER: {
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
  CREATE_USER: {
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

  @get({ configs: UserRoutes.LIST_USERS })
  getAllUsers(c: TRouteContext<typeof UserRoutes.LIST_USERS>) { // Return type is automatically inferred
    return c.json([{ id: '1', name: 'John Doe' }], HTTP.ResultCodes.RS_2.Ok);
  }

  @get({ configs: UserRoutes.GET_USER })
  getUserById(c: TRouteContext<typeof UserRoutes.GET_USER>) { // Return type is automatically inferred
    const { id } = c.req.valid('param'); // id is typed as string
    return c.json({ id, name: 'John Doe' }, HTTP.ResultCodes.RS_2.Ok);
  }

  @post({ configs: UserRoutes.CREATE_USER })
  createUser(c: TRouteContext<typeof UserRoutes.CREATE_USER>) { // Return type is automatically inferred
    const { name } = c.req.valid('json'); // name is typed as string
    const newUser = { id: '2', name };
    return c.json(newUser, HTTP.ResultCodes.RS_2.Created); // Return type is validated
  }
```

**Example using shared `RouteConfigs`:**

For better organization, you can define all your route configurations in a constant and reference them in your decorators. This approach also allows you to get a typed context for your handler.

```typescript
import { api, BaseController, controller, TRouteContext, jsonContent, jsonResponse, HTTP } from '@venizia/ignis';
import { z } from 'hono/zod-openapi';

const RouteConfigs = {
  PING: {
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

  @api({ configs: RouteConfigs.PING })
  ping(c: TRouteContext<typeof RouteConfigs.PING>) { // Return type is automatically inferred
    const { message } = c.req.valid('json');
    return c.json({ pong: message }, HTTP.ResultCodes.RS_2.Ok);
  }
}
```

### Manual Route Definition Methods

For advanced use cases or when you prefer a non-decorator approach, you can define routes manually using `defineRoute` and `bindRoute` methods inside the `binding()` method.

:::tip When to Use Manual Definition
Manual route definition is useful for:
- Dynamically generating routes based on configuration
- Conditional route registration (feature flags)
- Developers who prefer non-decorator syntax (coming from Express/Fastify)
- Complex routing logic that benefits from programmatic control
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
import { defineRouteConfigs, HTTP, jsonResponse, jsonContent, z } from '@venizia/ignis';

const RouteConfigs = defineRouteConfigs({
  ROOT: {
    method: HTTP.Methods.GET,
    path: '/',
    responses: jsonResponse({
      schema: z.object({ status: z.string() }),
    }),
  },
  PING: {
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

| Route Name | Method | Path | Description |
| :--- | :--- | :--- | :--- |
| `count` | `GET` | `/count` | Get the number of records matching a filter. |
| `find` | `GET` | `/` | Retrieve all records matching a filter. |
| `findById` | `GET` | `/:id` | Retrieve a single record by its ID. |
| `findOne` | `GET` | `/find-one` | Retrieve a single record matching a filter. |
| `create` | `POST` | `/` | Create a new record. |
| `updateById` | `PATCH` | `/:id` | Update a single record by its ID. |
| `updateBy` | `PATCH` | `/` | Update multiple records matching a `where` filter. |
| `deleteById` | `DELETE` | `/:id` | Delete a single record by its ID. |
| `deleteBy` | `DELETE` | `/` | Delete multiple records matching a `where` filter. |

### `ICrudControllerOptions<EntitySchema>`

| Option | Type | Description |
| :--- | :--- | :--- |
| `entity` | `TClass<BaseEntity<EntitySchema>> \| TResolver<TClass<BaseEntity<EntitySchema>>>` | The entity class (or a resolver function returning it) that this CRUD controller manages. This is used to derive request/response schemas. |
| `repository.name` | `string` | The binding key name of the repository associated with this entity (e.g., `'ConfigurationRepository'`). |
| `controller.name` | `string` | A unique name for the generated controller (e.g., `'ConfigurationController'`). |
| `controller.basePath`| `string` | The base path for all routes in this CRUD controller (e.g., `'/configurations'`). |
| `controller.readonly` | `boolean` | If `true`, only read operations (find, findOne, findById, count) are generated. Write operations are excluded. Defaults to `false`. |
| `controller.isStrict` | `boolean` | If `true`, query parameters like `where` will be strictly validated. Defaults to `true`. |
| `controller.defaultLimit`| `number` | The default limit for `find` operations. Defaults to `10`. |
| `authStrategies` | `Array<TAuthStrategy>` | Auth strategies applied to all routes (unless overridden per-route). |
| `routes` | `TRoutesConfig` | Per-route configuration combining schema and auth. See routes configuration below. |

### Routes Configuration

The `routes` option provides a unified way to configure both schema overrides and authentication for each endpoint:

```typescript
type TRouteAuthConfig =
  | { skipAuth: true }
  | { skipAuth?: false; authStrategies: Array<TAuthStrategy> };

type TReadRouteConfig = TRouteAuthConfig & { schema?: z.ZodObject };
type TWriteRouteConfig = TReadRouteConfig & { requestBody?: z.ZodObject };
type TDeleteRouteConfig = TRouteAuthConfig & { schema?: z.ZodObject };
```

| Route | Type | Description |
| :--- | :--- | :--- |
| `count` | `TReadRouteConfig` | Config for count endpoint |
| `find` | `TReadRouteConfig` | Config for find endpoint |
| `findOne` | `TReadRouteConfig` | Config for findOne endpoint |
| `findById` | `TReadRouteConfig` | Config for findById endpoint |
| `create` | `TWriteRouteConfig` | Config for create endpoint (supports `requestBody`) |
| `updateById` | `TWriteRouteConfig` | Config for updateById endpoint (supports `requestBody`) |
| `updateBy` | `TWriteRouteConfig` | Config for updateBy endpoint (supports `requestBody`) |
| `deleteById` | `TDeleteRouteConfig` | Config for deleteById endpoint |
| `deleteBy` | `TDeleteRouteConfig` | Config for deleteBy endpoint |

### Auth Resolution Priority

When resolving authentication for a route, the following priority applies:

1. **Endpoint `skipAuth: true`** → No auth (ignores controller `authStrategies`)
2. **Endpoint `authStrategies`** → Override controller (empty array = no auth)
3. **Controller `authStrategies`** → Default fallback

### Authentication Examples

```typescript
// 1. JWT auth on ALL routes
const UserController = ControllerFactory.defineCrudController({
  entity: UserEntity,
  repository: { name: 'UserRepository' },
  controller: { name: 'UserController', basePath: '/users' },
  authStrategies: ['jwt'],
});

// 2. JWT auth on all, but skip for public read endpoints
const ProductController = ControllerFactory.defineCrudController({
  entity: ProductEntity,
  repository: { name: 'ProductRepository' },
  controller: { name: 'ProductController', basePath: '/products' },
  authStrategies: ['jwt'],
  routes: {
    find: { skipAuth: true },
    findById: { skipAuth: true },
    count: { skipAuth: true },
  },
});

// 3. No controller auth, require JWT only for write operations
const ArticleController = ControllerFactory.defineCrudController({
  entity: ArticleEntity,
  repository: { name: 'ArticleRepository' },
  controller: { name: 'ArticleController', basePath: '/articles' },
  routes: {
    create: { authStrategies: ['jwt'] },
    updateById: { authStrategies: ['jwt'] },
    deleteById: { authStrategies: ['jwt'] },
  },
});

// 4. Custom schema with auth configuration
const OrderController = ControllerFactory.defineCrudController({
  entity: OrderEntity,
  repository: { name: 'OrderRepository' },
  controller: { name: 'OrderController', basePath: '/orders' },
  authStrategies: ['jwt'],
  routes: {
    find: { schema: CustomOrderListSchema, skipAuth: true },
    create: {
      schema: CustomOrderResponseSchema,
      requestBody: CustomOrderCreateSchema,
    },
  },
});
```

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

---

## See Also

- **Related References:**
  - [Services](./services.md) - Business logic layer called by controllers
  - [Repositories](./repositories/) - Data access layer for CRUD operations
  - [Middlewares](./middlewares.md) - Request/response middleware
  - [Application](./application.md) - Application setup and controller mounting
  - [Dependency Injection](./dependency-injection.md) - DI patterns and injection

- **Guides:**
  - [Building Your First API](/guides/getting-started/first-api.md)
  - [Controllers Guide](/guides/core-concepts/controllers.md)
  - [Routing and Decorators](/guides/core-concepts/routing.md)

- **Best Practices:**
  - [API Design Patterns](/best-practices/architecture/api-design.md)
  - [Error Handling](/best-practices/architecture/error-handling.md)
  - [Request Validation](/best-practices/security/input-validation.md)

- **External Resources:**
  - [OpenAPI Specification](https://swagger.io/specification/)
  - [HTTP Methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods)
