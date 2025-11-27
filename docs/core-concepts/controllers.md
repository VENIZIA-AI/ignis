# Controllers

Controllers in the Ignis framework are responsible for handling incoming HTTP requests, processing them, and returning responses to the client. They are the entry point for your application's API.

## Creating a Controller

To create a controller, you need to create a class that extends `BaseController` and is decorated with the `@controller` decorator.

The `@controller` decorator takes a metadata object with a `path` property, which defines the base path for all routes within that controller.

```typescript
import { BaseController, controller, IControllerOptions, ValueOrPromise } from '@vez/ignis';

@controller({ path: '/users' })
export class UserController extends BaseController {
  constructor(opts: IControllerOptions) {
    super({ ...opts, scope: UserController.name, path: '/users' });
  }

  override binding(): ValueOrPromise<void> {
    // Routes are defined here
  }
}
```

## Defining Routes

Routes are defined within the `binding()` method of the controller. The `BaseController` class provides two helper methods for this: `defineRoute` and `defineAuthRoute`.

### `defineRoute`

This method is used for defining public routes that do not require authentication.

```typescript
import { HTTP } from '@vez/ignis';

// ... inside the binding() method

this.defineRoute({
  configs: {
    path: '/',
    method: 'get',
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: {
        description: 'List of users',
      },
    },
  },
  handler: (c) => {
    return c.json([{ id: 1, name: 'John Doe' }]);
  },
});
```

This defines a `GET /users` endpoint.

### `defineAuthRoute`

This method is used for defining routes that require authentication and, optionally, specific roles.

```typescript
import { Authentication, ERole } from '@vez/ignis';

// ... inside the binding() method

this.defineAuthRoute({
  configs: {
    path: '/:id',
    method: 'get',
    authStrategies: [Authentication.STRATEGY_JWT],
    roles: [ERole.Admin], // Optional: only users with the 'Admin' role can access
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: {
        description: 'A single user',
      },
    },
  },
  handler: (c) => {
    const { id } = c.req.param();
    return c.json({ id: id, name: 'John Doe' });
  },
});
```

This defines a `GET /users/:id` endpoint that requires a valid JWT and the user to have the `Admin` role.

## Route Configuration

The `configs` object in `defineRoute` and `defineAuthRoute` is based on the OpenAPI specification and allows you to define:

- `path`: The route path (relative to the controller's base path).
- `method`: The HTTP method (`get`, `post`, `put`, `delete`, etc.).
- `request`: An object describing the request, including `params`, `query`, and `body`.
- `responses`: An object describing the possible responses.
- `tags`: An array of tags for grouping routes in the OpenAPI documentation.
- `security`: (Handled automatically by `defineAuthRoute`) Defines the security scheme.

By providing detailed route configurations, you can leverage the `@vez/ignis/swagger` component to automatically generate comprehensive OpenAPI documentation for your API.
