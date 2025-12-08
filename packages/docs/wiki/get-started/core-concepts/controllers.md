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
| **2. Configuration**| `registerControllers` phase | The application automatically discovers and registers all routes defined with decorators (`@get`, `@post`, etc.) on your controller methods. If you have routes defined manually inside `binding()`, that method is also called during this phase. **Note:** If you exclusively use decorators for routing, the `binding()` method can be omitted from your controller. |

## Defining Routes with Decorators (Recommended)

The recommended way to define routes is by using decorators directly on the controller methods that handle them. This approach is more declarative, keeps your code organized, and provides **full type safety** for your request parameters, query, body, and even the response.

:::tip Type Safety without Boilerplate
For decorator-based routes, you do not need to explicitly annotate the return type with `TRouteResponse`. TypeScript will automatically infer and validate the return type against the OpenAPI response schema you define in your `configs`. This gives you full type safety with less code.
:::

### HTTP Method Decorators

Ignis provides a decorator for each common HTTP method:

-   `@get(opts)`
-   `@post(opts)`
-   `@put(opts)`
-   `@patch(opts)`
-   `@del(opts)`
-   `@api(opts)` (a generic decorator where you specify the method in the `configs`)

The `opts` object contains a `configs` property that defines the route's path, request validation, and OpenAPI response schemas.

**Example using decorators with `ROUTE_CONFIGS` and full type inference:**

For optimal organization and type safety, define your route configurations in a constant with `as const`. This allows TypeScript to precisely infer the types for your request data and expected responses within your handler methods.

```typescript
import { BaseController, controller, get, post, HTTP, jsonContent, jsonResponse, TRouteContext } from '@vez/ignis';
import { z } from '@hono/zod-openapi';

// Define route configs as const for type inference
const TEST_ROUTES = {
  getData: {
    method: HTTP.Methods.GET,
    path: '/',
    responses: jsonResponse({
      description: 'A simple message',
      schema: z.object({ message: z.string(), method: z.string() }),
    }),
  },
  createItem: {
    method: HTTP.Methods.POST,
    path: '/',
    request: {
      body: jsonContent({
        description: 'Request body for creating an item',
        schema: z.object({ name: z.string(), value: z.number().int().positive() }),
      }),
    },
    responses: jsonResponse({
      description: 'Created item',
      schema: z.object({ id: z.string(), name: z.string(), value: z.number() }),
    }),
  },
} as const; // Crucial for strict type inference!

@controller({ path: '/my-items' })
export class MyItemsController extends BaseController {
  constructor() {
    super({ scope: MyItemsController.name, path: '/my-items' });
  }

  @get({ configs: TEST_ROUTES.getData })
  getData(c: TRouteContext<typeof TEST_ROUTES.getData>) { // Return type is automatically inferred
    // 'c' is fully typed here, including c.req.valid and c.json return type
    return c.json({ message: 'Hello from decorator', method: 'GET' }, HTTP.ResultCodes.RS_2.Ok);
  }

  @post({ configs: TEST_ROUTES.createItem })
  createItem(c: TRouteContext<typeof TEST_ROUTES.createItem>) { // Return type is automatically inferred
    // c.req.valid('json') is automatically typed based on createItem.request.body.content['application/json'].schema
    const body = c.req.valid('json');

    // Return type is automatically validated against createItem.responses[200].content['application/json'].schema
    return c.json(
      {
        id: 'some-uuid',
        name: body.name,
        value: body.value,
      },
      HTTP.ResultCodes.RS_2.Ok,
    );
  }
}
```

## Manual Route Definition (Recommended)

While decorators are available, the recommended way to define routes is by using the `defineRoute` and `bindRoute` methods inside the `binding()` method. This can be useful for more complex scenarios or for organizing routes in a different way.

:::tip Recommendation
For better organization and a more declarative approach, we strongly recommend using `defineRoute` or `bindRoute` within the `binding()` method to define your controller's routes. This keeps all route definitions in one place, making your controller easier to read and maintain.
:::

### `defineRoute`

Use this method for defining a single API endpoint with all its configurations and handler. It also benefits from type inference when used with `TRouteContext`.

```typescript
import { Authentication, HTTP, jsonResponse, z, TRouteContext } from '@vez/ignis';

// ... inside the binding() method

const GetUsersRoute = {
  path: '/',
  method: 'get',
  authStrategies: [Authentication.STRATEGY_JWT],
  responses: jsonResponse({
    description: 'List of all users',
    schema: z.array(z.object({ id: z.number(), name: z.string() })),
  }),
} as const;

this.defineRoute({
  configs: GetUsersRoute,
  handler: (c: TRouteContext<typeof GetUsersRoute>) => { // Return type is automatically inferred
    return c.json([{ id: 1, name: 'John Doe' }]);
  },
});
```

### `bindRoute`

This method offers a fluent API for defining routes, similar to `defineRoute`, but structured for chaining. It also benefits from `TRouteContext` for type safety.

```typescript
import { jsonResponse, z, TRouteContext } from '@vez/ignis';

// ... inside the binding() method

const GetUserByIdRoute = {
  path: '/:id',
  method: 'get',
  responses: jsonResponse({
    description: 'A single user',
    schema: z.object({ id: z.string(), name: z.string() }),
  }),
} as const;

this.bindRoute({
  configs: GetUserByIdRoute,
}).to({
  handler: (c: TRouteContext<typeof GetUserByIdRoute>) => { // Return type is automatically inferred
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

:::info Customization
The `ControllerFactory` is highly customizable. You can override the Zod schemas for any of the generated routes to add, remove, or modify fields for request validation and response shapes. You can also configure other behaviors, like making delete operations return the deleted records.

For a full list of customization options, see the [**Deep Dive: `ControllerFactory`**](../../references/base/controllers.md#controllerfactory) documentation.
:::

### `defineJSXRoute` (Server-Side Rendered HTML)

Use this method for routes that render HTML pages using JSX components. This is perfect for building server-side rendered web applications.

```typescript
import { htmlResponse } from '@vez/ignis';

// ... inside the binding() method

this.defineJSXRoute({
  configs: {
    path: '/',
    method: 'get',
    description: 'Home page',
    responses: htmlResponse({
      description: 'HTML home page',
    }),
  },
  handler: (c) => {
    const user = { name: 'John Doe' };
    return c.html(<HomePage user={user} />);
  },
});
```

**Key Points:**
- The handler **must** return `c.html()` with a JSX component
- JSX routes automatically include HTML content-type in OpenAPI documentation
- Views are typically organized in `src/views/` directory
- Components can be reused across multiple pages

**Example View Component:**

```typescript
// src/views/pages/home.page.tsx
import type { FC } from '@vez/ignis';
import { MainLayout } from '../layouts/main.layout';

interface HomePageProps {
  user: { name: string };
}

export const HomePage: FC<HomePageProps> = ({ user }) => {
  return (
    <MainLayout title="Home">
      <h1>Welcome, {user.name}!</h1>
      <p>This page is rendered on the server using JSX.</p>
    </MainLayout>
  );
};
```

**Example Layout Component:**

```typescript
// src/views/layouts/main.layout.tsx
import type { FC, PropsWithChildren } from '@vez/ignis';

interface MainLayoutProps {
  title: string;
}

export const MainLayout: FC<PropsWithChildren<MainLayoutProps>> = ({ title, children }) => {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
      </head>
      <body>
        <header>
          <nav>
            <a href="/">Home</a>
            <a href="/about">About</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <p>© 2025 My App</p>
        </footer>
      </body>
    </html>
  );
};
```

> **Note:** JSX support in Ignis uses Hono's built-in JSX runtime. Make sure your `tsconfig.json` includes the JSX configuration (this is already set up in the framework's base configuration).

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

Using `c.req.valid()` is the recommended way to access request data as it ensures that the data conforms to the schema you've defined. For even better type safety, you can use the `TRouteContext` utility type.

```typescript
import { z } from '@hono/zod-openapi';
import { jsonContent, put, TRouteContext } from '@vez/ignis';

// ... inside a controller class

const updateUserConfig = {
  path: '/:id',
  method: 'put',
  request: {
    params: z.object({ id: z.string() }),
    query: z.object({ notify: z.string().optional() }),
    body: jsonContent({
      schema: z.object({ name: z.string(), email: z.string().email() }),
    }),
  },
  // ... responses
} as const; // Use 'as const' for strict type inference

@put({ configs: updateUserConfig })
updateUser(c: TRouteContext<typeof updateUserConfig>) {
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

Using `TRouteContext` provides full type inference for `c.req.valid()`, so your editor will know that `id` is a string, `notify` is an optional string, and `userUpdateData` matches the body schema.
