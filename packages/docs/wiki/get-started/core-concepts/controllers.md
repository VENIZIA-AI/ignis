# Controllers

Controllers in the Ignis framework are responsible for handling incoming HTTP requests, processing them, and returning responses to the client. They are the entry point for your application's API endpoints.

> **Deep Dive:** For a technical breakdown of the underlying `BaseController` class, see the [**Deep Dive: Controllers**](../../references/base/controllers.md) page.

## Creating a Controller

To create a controller, you extend `BaseController`, use the `@controller` decorator to define its base path, and then use method decorators like `@get`, `@post`, etc., to define your routes.

```typescript
import { BaseController, controller, get, jsonResponse, z } from '@vez/ignis';
import { Context } from 'hono';

@controller({ path: '/users' })
export class UserController extends BaseController {
  constructor() {
    // It's good practice to pass a scope for logging
    super({ scope: UserController.name, path: '/users' });
  }

  @get({
    configs: {
      path: '/',
      responses: jsonResponse({
        description: 'A list of users',
        schema: z.array(z.object({ id: z.string(), name: z.string() })),
      }),
    },
  })
  getAllUsers(c: Context) {
    return c.json([{ id: '1', name: 'John Doe' }]);
  }
}
```
Notice that the `binding()` method is no longer needed when using decorators.

## Controller Lifecycle

Controllers have a simple and predictable lifecycle managed by the application.

| Stage | Method | Description |
| :--- | :--- | :--- |
| **1. Instantiation** | `constructor(opts)` | The controller is created by the DI container. Dependencies are injected, and you call `super()` to initialize the internal Hono router. |
| **2. Configuration**| `registerControllers` phase | The application automatically discovers and registers all routes defined with decorators (`@get`, `@post`, etc.) on your controller methods. If you have routes defined manually inside `binding()`, that method is also called during this phase. |

## Defining Routes with Decorators (Recommended)

The recommended way to define routes is by using decorators directly on the controller methods that handle them. This approach is more declarative and keeps your code organized.

### HTTP Method Decorators

Ignis provides a decorator for each common HTTP method:

-   `@get(opts)`
-   `@post(opts)`
-   `@put(opts)`
-   `@patch(opts)`
-   `@del(opts)`
-   `@api(opts)` (a generic decorator where you specify the method in the `configs`)

The `opts` object contains a `configs` property that defines the route's path, request validation, and OpenAPI response schemas.

```typescript
import { get, post, z, jsonContent, jsonResponse, Authentication } from '@vez/ignis';

// ... inside a controller class

  @get({
    configs: {
      path: '/:id',
      request: {
        params: z.object({ id: z.string() }),
      },
      responses: jsonResponse({
        description: 'A single user',
        schema: z.object({ id: z.string(), name: z.string() }),
      }),
    },
  })
  getUserById(c: Context) {
    const { id } = c.req.valid('param');
    return c.json({ id, name: 'John Doe' });
  }

  @post({
    configs: {
      path: '/',
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
  })
  createUser(c: Context) {
    const { name } = c.req.valid('json');
    const newUser = { id: '2', name };
    return c.json(newUser, 201);
  }
```

## Manual Route Definition (Legacy)

While decorators are recommended, you can still define routes manually inside the `binding()` method. This can be useful for more complex scenarios or for organizing routes in a different way.

### `defineRoute`

Use this method for defining a single API endpoint with all its configurations and handler.

```typescript
import { Authentication, HTTP, jsonResponse, z } from '@vez/ignis';

// ... inside the binding() method

this.defineRoute({
  configs: {
    path: '/',
    method: 'get',
    authStrategies: [Authentication.STRATEGY_JWT], 
    responses: jsonResponse({
      description: 'List of all users',
      schema: z.array(z.object({ id: z.number(), name: z.string() })),
    }),
  },
  handler: (c) => {
    return c.json([{ id: 1, name: 'John Doe' }]);
  },
});
```

### `bindRoute`

This method offers a fluent API for defining routes.

```typescript
// ... inside the binding() method

this.bindRoute({
  configs: {
    path: '/:id',
    method: 'get',
    responses: jsonResponse({
      description: 'A single user',
      schema: z.object({ id: z.string(), name: z.string() }),
    }),
  },
}).to({
  handler: (c) => {
    const { id } = c.req.param();
    return c.json({ id: id, name: 'John Doe' });
  },
});
```

## `ControllerFactory` for CRUD Operations

For standard CRUD (Create, Read, Update, Delete) operations, Ignis provides a `ControllerFactory` that can generate a full-featured controller for any given entity. This significantly reduces boilerplate code.

```typescript
// src/controllers/configuration.controller.ts (Example from @examples/vert)
import { Configuration } from '@/models';
import { ConfigurationRepository } from '@/repositories';
import {
  BindingKeys,
  BindingNamespaces,
  controller,
  ControllerFactory,
  inject,
} from '@vez/ignis';

const BASE_PATH = '/configurations';

const _Controller = ControllerFactory.defineCrudController({
  repository: { name: ConfigurationRepository.name },
  controller: {
    name: 'ConfigurationController',
    basePath: BASE_PATH,
    isStrict: true,
  },
  entity: () => Configuration, // Provide a resolver for your entity class
});

@controller({ path: BASE_PATH })
export class ConfigurationController extends _Controller {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: ConfigurationRepository.name,
      }),
    })
    repository: ConfigurationRepository,
  ) {
    super(repository); // The generated controller expects the repository in its constructor
  }
}
```
The `ControllerFactory.defineCrudController` method automatically sets up the following routes based on your entity schema:

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

## Accessing Validated Request Data

When you define Zod schemas in your route's `request` configuration (whether with decorators or manual definition), Hono's validation middleware automatically parses and validates the incoming data. You can access this validated data using `c.req.valid()`.

```typescript
import { z } from '@hono/zod-openapi';
import { jsonContent, put } from '@vez/ignis';

// ... inside a controller class

const UserSchema = z.object({ name: z.string(), email: z.string().email() });

@put({
  configs: {
    path: '/:id',
    method: 'put',
    request: {
      params: z.object({ id: z.string() }),
      query: z.object({ notify: z.string().optional() }),
      body: jsonContent({ schema: UserSchema }),
    },
    // ... responses
  },
})
updateUser(c: Context) {
  // Access validated data from the request
  const { id } = c.req.valid('param');
  const { notify } = c.req.valid('query');
  const userUpdateData = c.req.valid('json'); // for body

  console.log(`Updating user ${id} with data:`, userUpdateData);
  if (notify) {
    console.log('Notification is enabled.');
  }

  return c.json({ success: true, id, ...userUpdateData });
}
```

Using `c.req.valid()` is the recommended way to access request data as it ensures that the data conforms to the schema you've defined, providing type safety within your handler.