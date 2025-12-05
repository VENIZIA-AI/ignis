# Controllers

Controllers in the Ignis framework are responsible for handling incoming HTTP requests, processing them, and returning responses to the client. They are the entry point for your application's API endpoints.

> **Deep Dive:** For a technical breakdown of the underlying `BaseController` class, see the [**Deep Dive: Controllers**](../../references/base/controllers.md) page.

## Creating a Controller

To create a controller, you extend `BaseController` and use the `@controller` decorator to define its base path.

```typescript
import { BaseController, controller, ValueOrPromise } from '@vez/ignis';

@controller({ path: '/users' })
export class UserController extends BaseController {
  constructor() {
    // It's good practice to pass a scope for logging
    super({ scope: UserController.name, path: '/users' });
  }

  // `binding()` is where you'll define your routes
  override binding(): ValueOrPromise<void> {
    // ... routes defined here
  }
}
```

## Controller Lifecycle

Controllers have a simple and predictable lifecycle managed by the application.

| Stage | Method | Description |
| :--- | :--- | :--- |
| **1. Instantiation** | `constructor(opts)` | The controller is created by the DI container. Dependencies are injected, and you call `super()` to initialize the internal Hono router. |
| **2. Configuration**| `binding()` | Called by the application during the `registerControllers` startup phase. This is where you **must** define all your routes using `defineRoute` or `bindRoute`. |

## Defining Routes

Ignis offers two primary methods for defining routes: `defineRoute` and `bindRoute`. Both methods now support specifying authentication strategies directly in their `configs` object.

### `defineRoute`

Use this method for defining a single API endpoint with all its configurations and handler.

```typescript
import { Authentication, HTTP, jsonContent } from '@vez/ignis';
import { z } from '@hono/zod-openapi';

// ... inside the binding() method

this.defineRoute({
  configs: {
    path: '/',
    method: 'get',
    // Optional: Add authentication strategies
    authStrategies: [Authentication.STRATEGY_JWT], 
    responses: jsonContent({ // Use the helper for standard responses
      description: 'List of all users',
      schema: z.array(z.object({ id: z.number(), name: z.string() })),
    }),
  },
  handler: (c) => {
    return c.json([{ id: 1, name: 'John Doe' }]);
  },
});
```
This defines a `GET /users` endpoint that will appear in your OpenAPI documentation with the specified schema. If `authStrategies` is provided, the route will be protected.

### `bindRoute`

This method offers a fluent API for defining routes, useful for more readable chaining of configurations.

```typescript
import { Authentication, HTTP, jsonContent } from '@vez/ignis';
import { z } from '@hono/zod-openapi';

// ... inside the binding() method

this.bindRoute({
  configs: {
    path: '/:id',
    method: 'get',
    // Optional: Add authentication strategies
    authStrategies: [Authentication.STRATEGY_JWT],
    responses: jsonContent({
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
    strict: true,
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

When you define Zod schemas in your route's `request` configuration, Hono's validation middleware automatically parses and validates the incoming data. You can access this validated data using `c.req.valid()`.

```typescript
import { z } from '@hono/zod-openapi';
import { jsonContent } from '@vez/ignis';

// ... inside the binding() method

const UserSchema = z.object({ name: z.string(), email: z.string().email() });

this.defineRoute({
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
  handler: (c) => {
    // Access validated data from the request
    const { id } = c.req.valid('param');
    const { notify } = c.req.valid('query');
    const userUpdateData = c.req.valid('json'); // for body

    console.log(`Updating user ${id} with data:`, userUpdateData);
    if (notify) {
      console.log('Notification is enabled.');
    }

    return c.json({ success: true, id, ...userUpdateData });
  },
});
```

Using `c.req.valid()` is the recommended way to access request data as it ensures that the data conforms to the schema you've defined, providing type safety within your handler.
