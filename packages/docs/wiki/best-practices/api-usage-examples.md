# API Usage Examples

Practical examples for defining endpoints and working with data in Ignis applications.

## Routing Patterns

### Decorator-Based Routing (Recommended)

Use `@get`, `@post` decorators with `as const` route configs for full type safety:

**`src/controllers/test/definitions.ts`**
```typescript
import { z } from '@hono/zod-openapi';
import { Authentication, HTTP, jsonContent, jsonResponse } from '@venizia/ignis';

// Define route configs as const for type inference
export const RouteConfigs = {
  // Use UPPER_CASE descriptive names for each route
  GET_TEST: {
    method: HTTP.Methods.GET,
    path: '/test',
    responses: jsonResponse({
      description: 'Test decorator GET endpoint',
      schema: z.object({ message: z.string(), method: z.string() }),
    }),
  },
  CREATE_ITEM: {
    method: HTTP.Methods.POST,
    path: '/items',
    authStrategies: [Authentication.STRATEGY_JWT], // Secure this endpoint
    request: {
      body: jsonContent({
        description: 'Request body for POST',
        schema: z.object({ name: z.string(), age: z.number().int().positive() }),
      }),
    },
    responses: jsonResponse({
      description: 'Test decorator POST endpoint',
      schema: z.object({ id: z.string(), name: z.string(), age: z.number() }),
    }),
  },
} as const;
```

Then, use the decorators in your controller class. The `TRouteContext` type provides a fully typed context, including request parameters, body, and response types.

**`src/controllers/test/controller.ts`**
```typescript
import {
  BaseController,
  controller,
  get,
  post,
  TRouteContext,
  HTTP,
} from '@venizia/ignis';
import { RouteConfigs } from './definitions';

@controller({ path: '/test' })
export class TestController extends BaseController {
  // ...

  @get({ configs: RouteConfigs.GET_TEST })
  getWithDecorator(context: TRouteContext<typeof RouteConfigs.GET_TEST>) {
    // context is fully typed!
    return context.json({ message: 'Hello from decorator', method: 'GET' }, HTTP.ResultCodes.RS_2.Ok);
  }

  @post({ configs: RouteConfigs.CREATE_ITEM })
  createWithDecorator(context: TRouteContext<typeof RouteConfigs.CREATE_ITEM>) {
    // context.req.valid('json') is automatically typed as { name: string, age: number }
    const body = context.req.valid('json');

    // The response is validated against the schema
    return context.json(
      {
        id: crypto.randomUUID(),
        name: body.name,
        age: body.age,
      },
      HTTP.ResultCodes.RS_2.Ok,
    );
  }
}
```

### Example 2: Manual Route Definition in `binding()`

You can also define routes manually within the controller's `binding()` method using `defineRoute` or `bindRoute`. This is useful for more complex scenarios or for developers who prefer a non-decorator syntax.

**`src/controllers/test/controller.ts`**
```typescript
import { BaseController, controller, HTTP, ValueOrPromise } from '@venizia/ignis';
import { RouteConfigs } from './definitions';

@controller({ path: '/test' })
export class TestController extends BaseController {
  // ...
  override binding(): ValueOrPromise<void> {
    // Using 'defineRoute'
    this.defineRoute({
      configs: RouteConfigs.GET_HELLO,
      handler: context => {
        return context.json({ message: 'Hello' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });

    // Using 'bindRoute' for a fluent API
    this.bindRoute({
      configs: RouteConfigs.GET_GREETING,
    }).to({
      handler: context => {
        return context.json({ message: 'Hello 3' }, HTTP.ResultCodes.RS_2.Ok);
      },
    });
  }
  // ...
}
```

### Example 3: Auto-Generated CRUD Controller

For standard database entities, you can use `ControllerFactory.defineCrudController` to instantly generate a controller with a full set of CRUD endpoints.

**`src/controllers/configuration.controller.ts`**
```typescript
import { Configuration } from '@/models';
import { ConfigurationRepository } from '@/repositories';
import {
  BindingKeys,
  BindingNamespaces,
  controller,
  ControllerFactory,
  inject,
} from '@venizia/ignis';

const BASE_PATH = '/configurations';

// 1. The factory generates a controller class with all CRUD routes
const _Controller = ControllerFactory.defineCrudController({
  repository: { name: ConfigurationRepository.name },
  controller: {
    name: 'ConfigurationController',
    basePath: BASE_PATH,
  },
  entity: () => Configuration, // The entity is used to generate OpenAPI schemas
});

// 2. Extend the generated controller to inject the repository
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
    super(repository);
  }
}
```
This automatically creates endpoints like `GET /configurations`, `POST /configurations`, `GET /configurations/:id`, etc.

## Repository (Data Access) Usage

Repositories are used to interact with your database. The `DefaultCRUDRepository` provides a rich set of methods for data manipulation. Here are examples from the `postConfigure` method in `src/application.ts`, which demonstrates how to use an injected repository.

```typescript
// In src/application.ts

// Get the repository instance from the DI container
const configurationRepository = this.get<ConfigurationRepository>({
  key: BindingKeys.build({
    namespace: BindingNamespaces.REPOSITORY,
    key: ConfigurationRepository.name,
  }),
});

// --- Find One Record ---
const record = await configurationRepository.findOne({
  filter: { where: { code: 'CODE_1' } },
});

// --- Find Multiple Records with Relations ---
const records = await configurationRepository.find({
  filter: {
    where: { code: 'CODE_2' },
    fields: { id: true, code: true, createdBy: true },
    limit: 100,
    include: [{ relation: 'creator' }], // Eager load the 'creator' relation
  },
});

// --- Create a Single Record ---
const newRecord = await configurationRepository.create({
  data: {
    code: 'NEW_CODE',
    group: 'SYSTEM',
    dataType: 'TEXT',
    tValue: 'some value',
  },
});

// --- Create Multiple Records ---
const newRecords = await configurationRepository.createAll({
  data: [
    { code: 'CODE_A', group: 'SYSTEM' },
    { code: 'CODE_B', group: 'SYSTEM' },
  ],
});

// --- Update a Record by ID ---
const updated = await configurationRepository.updateById({
  id: 'some-uuid',
  data: { tValue: 'new value' },
});

// --- Delete a Record by ID ---
const deleted = await configurationRepository.deleteById({
  id: newRecord.data!.id,
  options: { shouldReturn: true }, // Option to return the deleted record
});
```

## Server-Side Rendering (JSX)

Ignis supports server-side rendering using Hono's JSX middleware. This is useful for returning HTML content, such as landing pages or simple admin views.

**Usage:**

Use `defineJSXRoute` in your controller and `htmlResponse` for documentation.

```typescript
import { BaseController, controller, htmlResponse } from '@venizia/ignis';

@controller({ path: '/pages' })
export class PageController extends BaseController {
  
  override binding(): void {
    this.defineJSXRoute({
      configs: {
        method: 'get',
        path: '/welcome',
        description: 'Welcome Page',
        responses: htmlResponse({ description: 'HTML Welcome Page' }),
      },
      handler: (c) => {
        const title = 'Welcome to Ignis';
        
        // Return JSX directly
        return c.html(
          <html>
            <head><title>{title}</title></head>
            <body>
              <h1>{title}</h1>
              <p>Server-side rendered content.</p>
            </body>
          </html>
        );
      },
    });
  }
}
```

## Custom Middleware

Create reusable middleware using Hono's `createMiddleware` helper.

### Basic Middleware Pattern

```typescript
import { createMiddleware } from 'hono/factory';
import type { MiddlewareHandler } from 'hono';

// Simple middleware with options
export const rateLimiter = (opts: { maxRequests: number }): MiddlewareHandler => {
  const { maxRequests } = opts;
  const requests = new Map<string, number>();

  return createMiddleware(async (c, next) => {
    const ip = c.req.header('x-forwarded-for') ?? 'unknown';
    const count = requests.get(ip) ?? 0;

    if (count >= maxRequests) {
      return c.json({ error: 'Too many requests' }, 429);
    }

    requests.set(ip, count + 1);
    await next();
  });
};

// Usage in application
server.use('/api/*', rateLimiter({ maxRequests: 100 }));
```

### Middleware with Logging

```typescript
import { BaseHelper } from '@venizia/ignis';
import { createMiddleware } from 'hono/factory';

export const requestLogger = (): MiddlewareHandler => {
  const helper = new BaseHelper({ scope: 'RequestLogger' });

  return createMiddleware(async (c, next) => {
    const start = performance.now();
    const method = c.req.method;
    const path = c.req.path;

    helper.logger.info('[%s] %s - Started', method, path);

    await next();

    const duration = performance.now() - start;
    helper.logger.info('[%s] %s - Completed in %dms', method, path, duration.toFixed(2));
  });
};
```

### Middleware in Controllers

Apply middleware to specific routes in your controller:

```typescript
@controller({ path: '/admin' })
export class AdminController extends BaseController {
  constructor() {
    super({ scope: AdminController.name, path: '/admin' });
  }

  override binding(): void {
    // Apply middleware to all routes in this controller
    this.getRouter().use('*', adminOnlyMiddleware());

    this.defineRoute({
      configs: { method: 'get', path: '/dashboard', /* ... */ },
      handler: (c) => c.json({ /* ... */ }),
    });
  }
}
```

## Service Layer Patterns

Services contain business logic and orchestrate operations across multiple repositories.

### Basic Service

```typescript
import { BaseService, inject, BindingKeys, BindingNamespaces } from '@venizia/ignis';

export class UserService extends BaseService {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: UserRepository.name,
      }),
    })
    private userRepository: UserRepository,

    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.REPOSITORY,
        key: OrderRepository.name,
      }),
    })
    private orderRepository: OrderRepository,
  ) {
    super({ scope: UserService.name });
  }

  async getUserWithOrders(userId: string) {
    const user = await this.userRepository.findById({ id: userId });
    if (!user.data) {
      return null;
    }

    const orders = await this.orderRepository.find({
      filter: { where: { userId } },
    });

    return {
      ...user.data,
      orders: orders.data,
    };
  }

  async deactivateUser(userId: string) {
    // Business logic: cancel pending orders before deactivating
    await this.orderRepository.updateBy({
      where: { userId, status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    return this.userRepository.updateById({
      id: userId,
      data: { status: 'INACTIVE' },
    });
  }
}
```

### Using Services in Controllers

```typescript
@controller({ path: '/users' })
export class UserController extends BaseController {
  constructor(
    @inject({
      key: BindingKeys.build({
        namespace: BindingNamespaces.SERVICE,
        key: UserService.name,
      }),
    })
    private userService: UserService,
  ) {
    super({ scope: UserController.name, path: '/users' });
  }

  @get({ configs: RouteConfigs.GET_USER_WITH_ORDERS })
  async getUserWithOrders(c: TRouteContext<typeof RouteConfigs.GET_USER_WITH_ORDERS>) {
    const { id } = c.req.valid('param');
    const result = await this.userService.getUserWithOrders(id);

    if (!result) {
      throw getError({ statusCode: 404, message: 'User not found' });
    }

    return c.json(result, HTTP.ResultCodes.RS_2.Ok);
  }
}
```

## Batch Operations

Use `updateBy` and `deleteBy` for bulk operations with filter conditions.

### Bulk Update

```typescript
// Update all inactive users to archived
const result = await userRepository.updateBy({
  where: { status: 'INACTIVE', lastLoginAt: { lt: new Date('2024-01-01') } },
  data: { status: 'ARCHIVED' },
});
// result.count = number of affected rows

// Update ALL records (requires force flag)
await userRepository.updateBy({
  where: {},  // Empty = all records
  data: { notificationSent: true },
  options: { force: true },  // Required for safety
});
```

### Bulk Delete

```typescript
// Delete expired sessions
const result = await sessionRepository.deleteBy({
  where: { expiresAt: { lt: new Date() } },
});

// Delete with return values
const deleted = await sessionRepository.deleteBy({
  where: { userId: 'user-123' },
  options: { shouldReturn: true },  // Returns deleted records
});
// deleted.data = array of deleted records
```

### Batch Create

```typescript
// Create multiple records at once
const result = await userRepository.createAll({
  data: [
    { name: 'Alice', email: 'alice@example.com' },
    { name: 'Bob', email: 'bob@example.com' },
    { name: 'Charlie', email: 'charlie@example.com' },
  ],
});
// result.data = array of created records with IDs
```

## Error Handling

Use `getError()` to throw structured errors that are automatically formatted by the framework.

### Throwing Errors

```typescript
import { getError, HTTP } from '@venizia/ignis';

// Basic error
throw getError({ message: 'Something went wrong' });
// Returns: { statusCode: 400, message: 'Something went wrong' }

// With status code
throw getError({
  statusCode: HTTP.ResultCodes.RS_4.NotFound,
  message: 'User not found',
});

// With message code for i18n
throw getError({
  statusCode: 404,
  message: 'User not found',
  messageCode: 'USER_NOT_FOUND',
});
```

### Error Handling in Route Handlers

```typescript
@get({ configs: RouteConfigs.GET_USER })
async getUser(c: TRouteContext<typeof RouteConfigs.GET_USER>) {
  const { id } = c.req.valid('param');

  const user = await this.userRepository.findById({ id });

  if (!user.data) {
    throw getError({
      statusCode: 404,
      message: `User with ID '${id}' not found`,
    });
  }

  return c.json(user.data, HTTP.ResultCodes.RS_2.Ok);
}
```

### Error Response Format

All errors are automatically formatted:

```json
{
  "statusCode": 404,
  "message": "User not found",
  "messageCode": "USER_NOT_FOUND",
  "requestId": "abc123"
}
```

### Try-Catch for Complex Operations

```typescript
async processOrder(c: Context) {
  const data = c.req.valid('json');

  try {
    const tx = await this.orderRepository.beginTransaction({
      isolationLevel: 'READ COMMITTED',
    });

    try {
      const order = await this.orderRepository.create({
        data: { ...data, status: 'PENDING' },
        options: { transaction: tx },
      });

      await this.inventoryService.decrementStock({
        items: data.items,
        transaction: tx,
      });

      await tx.commit();
      return c.json(order.data, HTTP.ResultCodes.RS_2.Created);
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  } catch (error) {
    this.logger.error('[processOrder] Failed: %s', error);

    if (error instanceof ApplicationError) {
      throw error;  // Re-throw application errors
    }

    throw getError({
      statusCode: 500,
      message: 'Failed to process order',
    });
  }
}
