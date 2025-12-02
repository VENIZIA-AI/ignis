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
| **2. Configuration**| `binding()` | Called by the application during the `registerControllers` startup phase. This is where you **must** define all your routes using `defineRoute`, `defineAuthRoute`, or `defineJSXRoute`. |

## Defining Routes

Ignis provides three methods for defining routes, depending on whether you need JSON APIs, authenticated routes, or server-side rendered HTML pages.

### `defineRoute` (Public Routes)

Use this method for endpoints that do not require authentication.

```typescript
import { HTTP, jsonResponse } from '@vez/ignis';
import { z } from '@hono/zod-openapi';

// ... inside the binding() method

this.defineRoute({
  configs: {
    path: '/',
    method: 'get',
    responses: jsonResponse({ // Use the helper for standard responses
      description: 'List of all users',
      schema: z.array(z.object({ id: z.number(), name: z.string() })),
    }),
  },
  handler: (c) => {
    return c.json([{ id: 1, name: 'John Doe' }]);
  },
});
```
This defines a `GET /users` endpoint that will appear in your OpenAPI documentation with the specified schema.

### `defineAuthRoute` (Protected Routes)

Use this for routes that require authentication. It automatically adds the necessary middleware.

```typescript
import { Authentication, HTTP } from '@vez/ignis';

// ... inside the binding() method

this.defineAuthRoute({
  configs: {
    path: '/:id',
    method: 'get',
    authStrategies: [Authentication.STRATEGY_JWT], // Specify the auth strategy
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
