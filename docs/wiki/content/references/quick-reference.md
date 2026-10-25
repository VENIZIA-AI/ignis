---
title: Quick Reference Card
description: Single-page cheat sheet for IGNIS framework
lastUpdated: 2026-03-15
---

# Quick Reference Card

A single-page reference for the most commonly used classes, methods, decorators, and operators in IGNIS.

## Core Classes

### BaseApplication

```typescript
import { BaseApplication, IApplicationConfigs, IApplicationInfo } from '@venizia/ignis';
import { ValueOrPromise } from '@venizia/ignis-helpers';

export const appConfigs: IApplicationConfigs = {
  host: '0.0.0.0',
  port: 3000,
  // Required. An empty string mounts the application at the root.
  path: { base: '/', isStrict: false },
};

class MyApplication extends BaseApplication {
  getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return { name: 'my-app', version: '0.0.0', description: 'My IGNIS application' };
  }

  staticConfigure() {}
  preConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}
}

const application = new MyApplication({ scope: 'MyApplication', config: appConfigs });
application.init();
await application.start();
```

The constructor takes `{ scope, config }`. `config.path.base` must be a string - the constructor
throws by design when it is anything else, so a config assembled from the environment fails loudly
instead of breaking later inside the router.

**Key Methods:**
- `init()` - Register the core bindings; call it once before `start()`
- `initialize()` - Run the boot sequence; `start()` already calls it for you
- `start()` - Initialize, set up middlewares, then bind the socket
- `stop()` - Run the post-stop hooks, stop the server, then close every datasource (even when stopping the server fails)

### BaseRestController

```typescript
import { z } from '@hono/zod-openapi';
import { BaseRestController, controller, get, TRouteContext } from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';

@controller({ path: '/users' })
class UserController extends BaseRestController {
  constructor() {
    super({ scope: UserController.name });
  }

  override binding() {}

  @get({
    configs: {
      path: '/{id}',
      request: {
        params: z.object({ id: z.string() }),
      },
      responses: {
        [HTTP.ResultCodes.RS_2.Ok]: { description: 'User' },
      },
    },
  })
  getUser(context: TRouteContext) {
    const { id } = context.req.valid<{ id: string }>('param');
    return context.json({ id, name: 'John' }, HTTP.ResultCodes.RS_2.Ok);
  }
}
```

**Key Properties:**
- `this.router` - OpenAPIHono instance
- `this.path` - Controller base path
- `this.logger` - Scoped logger

### BaseGrpcController

```typescript
import { BaseGrpcController, controller, unary, ControllerTransports } from '@venizia/ignis';
import { GreeterService } from '../gen/greeter_connect';
import type { SayHelloRequest } from '../gen/greeter_pb';

@controller({ path: '/grpc', transport: ControllerTransports.GRPC, service: GreeterService })
class GreeterController extends BaseGrpcController {
  constructor() {
    super({ scope: GreeterController.name, path: '/grpc' });
  }

  override binding() {}

  @unary({ configs: { name: 'sayHello' } })
  async sayHello(opts: { request: SayHelloRequest }) {
    return { message: `Hello, ${opts.request.name}!` };
  }
}
```

### BaseService

```typescript
import { BaseService, inject } from '@venizia/ignis';
import { UserRepository } from '../repositories';

class UserService extends BaseService {
  constructor(
    @inject({ key: 'repositories.UserRepository' }) private userRepository: UserRepository,
  ) {
    super({ scope: UserService.name });
  }

  async getUser(id: string) {
    this.logger.info('Getting user | id: %s', id);
    return this.userRepository.findById({ id });
  }
}
```

**Key Properties:**
- `this.logger` - Scoped logger

### DefaultCRUDRepository

```typescript
import { repository } from '@venizia/ignis';
import { DefaultCRUDRepository } from '@venizia/ignis/postgres';
import { User, type userTable } from '../models';
import { PostgresDataSource } from '../datasources';

@repository({ model: User, dataSource: PostgresDataSource })
class UserRepository extends DefaultCRUDRepository<typeof userTable> {
  // No constructor needed - dataSource auto-injected from @repository decorator
}
```

**Key Methods:**
- `find({ filter })` - Find many with filter, returns `T[]`
- `findById({ id })` - Find by ID
- `findOne({ filter })` - Find single entity
- `count({ where })` - Count entities; `where` is required
- `create({ data })` - Create single entity, returns `{ count, data }`
- `createAll({ data: [] })` - Create multiple entities, returns `{ count, data[] }`
- `updateById({ id, data })` - Update by ID
- `deleteById({ id })` - Delete by ID

### Model

```typescript
import { model } from '@venizia/ignis';
import { generateIdColumnDefs, ModelFactory } from '@venizia/ignis/postgres';
import type { TEntityObject } from '@venizia/ignis/postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';

export const userTable = pgTable('users', {
  ...generateIdColumnDefs({ id: { dataType: 'string' } }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
});

@model({ type: 'entity' })
export class User extends ModelFactory.defineEntity({ table: userTable }) {}

export type TUser = TEntityObject<typeof User>;
```

**Key Properties:**
- `static TABLE_NAME` - Database table name, read off the table
- `static schema` - The Drizzle table
- `static relations` - Relations resolver, built from the `relations` option (`one` and `many`)
- `static AUTHORIZATION_SUBJECT` - Authorization principal (auto-set from `@model` settings `authorize.principal`)

`BaseEntity` is the compatibility class for hand-written models. New code uses `ModelFactory.defineEntity`.


## Route Decorators

### HTTP Methods

| Decorator | HTTP Method | Example |
|-----------|-------------|---------|
| `@get()` | GET | `@get({ configs: { path: '/:id' } })` |
| `@post()` | POST | `@post({ configs: { path: '/' } })` |
| `@put()` | PUT | `@put({ configs: { path: '/:id' } })` |
| `@patch()` | PATCH | `@patch({ configs: { path: '/:id' } })` |
| `@del()` | DELETE | `@del({ configs: { path: '/:id' } })` |

### RPC Method Decorators (gRPC)

| Decorator | RPC Type | Example |
|-----------|----------|---------|
| `@rpc()` | Generic | `@rpc({ configs: { name: 'myMethod', method: 'unary' } })` |
| `@unary()` | Unary | `@unary({ configs: { name: 'sayHello' } })` |
| `@serverStream()` | Server streaming | `@serverStream({ configs: { name: 'listItems' } })` |
| `@clientStream()` | Client streaming | `@clientStream({ configs: { name: 'uploadData' } })` |
| `@bidiStream()` | Bidirectional | `@bidiStream({ configs: { name: 'chat' } })` |

> [!WARNING]
> Only `@unary` runs today. A controller with a streaming method throws when it is configured.

### REST Example

```typescript
import { z } from '@hono/zod-openapi';
import { BaseRestController, controller, get, inject, jsonContent, post, TRouteContext } from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';

@controller({ path: '/users' })
class UserController extends BaseRestController {
  constructor(
    @inject({ key: 'services.UserService' }) private userService: UserService,
  ) {
    super({ scope: UserController.name });
  }

  override binding() {}

  @post({
    configs: {
      path: '/',
      request: {
        body: jsonContent({
          description: 'User data',
          schema: z.object({ name: z.string() }),
        }),
      },
      responses: {
        [HTTP.ResultCodes.RS_2.Created]: { description: 'Created' },
      },
    },
  })
  async createUser(context: TRouteContext) {
    const data = context.req.valid<{ name: string }>('json');
    const result = await this.userService.create(data);
    return context.json(result, HTTP.ResultCodes.RS_2.Created);
  }

  @get({
    configs: {
      path: '/{id}',
      request: {
        params: z.object({ id: z.string() }),
      },
      responses: {
        [HTTP.ResultCodes.RS_2.Ok]: { description: 'User' },
      },
    },
  })
  async getUser(context: TRouteContext) {
    const { id } = context.req.valid<{ id: string }>('param');
    const result = await this.userService.findById(id);
    return context.json(result, HTTP.ResultCodes.RS_2.Ok);
  }
}
```


## Filter Operators

### Comparison Operators

| Operator | SQL | Example |
|----------|-----|---------|
| `eq` | `=` | `{ status: { eq: 'active' } }` |
| `neq` | `!=` | `{ status: { neq: 'deleted' } }` |
| `gt` | `>` | `{ age: { gt: 18 } }` |
| `gte` | `>=` | `{ age: { gte: 18 } }` |
| `lt` | `<` | `{ price: { lt: 100 } }` |
| `lte` | `<=` | `{ price: { lte: 100 } }` |

### Range Operators

| Operator | SQL | Example |
|----------|-----|---------|
| `between` | `BETWEEN` | `{ age: { between: [18, 65] } }` |
| `notBetween` | `NOT BETWEEN` | `{ age: { notBetween: [0, 18] } }` |

### List Operators

| Operator | SQL | Example |
|----------|-----|---------|
| `in` | `IN` | `{ status: { in: ['active', 'pending'] } }` |
| `nin` | `NOT IN` | `{ status: { nin: ['deleted'] } }` |

### Pattern Matching

| Operator | SQL | Example |
|----------|-----|---------|
| `like` | `LIKE` | `{ name: { like: '%john%' } }` |
| `ilike` | `ILIKE` | `{ email: { ilike: '%@gmail.com' } }` |
| `nlike` | `NOT LIKE` | `{ name: { nlike: '%test%' } }` |
| `nilike` | `NOT ILIKE` | `{ email: { nilike: '%spam%' } }` |

### Logical Operators

| Operator | SQL | Example |
|----------|-----|---------|
| `and` | `AND` | `{ and: [{ age: { gt: 18 } }, { status: 'active' }] }` |
| `or` | `OR` | `{ or: [{ role: 'admin' }, { role: 'moderator' }] }` |
| `not` | `NOT (...)` | `{ status: { not: 'deleted' } }` - inside a column, never at the top level |

### Array Operators (PostgreSQL)

| Operator | SQL | Example |
|----------|-----|---------|
| `contains` | `@>` | `{ tags: { contains: ['typescript'] } }` |
| `containedBy` | `<@` | `{ tags: { containedBy: ['ts', 'js', 'go'] } }` |
| `overlaps` | `&&` | `{ tags: { overlaps: ['react', 'vue'] } }` |

## Common Filters

### Basic Find

```typescript
const users = await userRepository.find({
  filter: {
    where: { isActive: true },
    order: ['createdAt DESC'],
    limit: 10,
    offset: 0,
  },
});
```

### With Multiple Conditions

```typescript
const users = await userRepository.find({
  filter: {
    where: {
      and: [
        { age: { gte: 18 } },
        { status: { in: ['active', 'pending'] } },
        { email: { ilike: '%@company.com' } },
      ],
    },
  },
});
```

### With Relations

```typescript
const posts = await postRepository.find({
  filter: {
    where: { published: true },
    include: [
      { relation: 'author' },
      { relation: 'comments', scope: { where: { approved: true }, limit: 5 } },
    ],
  },
});
```

### Selecting Fields

```typescript
const users = await userRepository.find({
  filter: {
    where: { isActive: true },
    fields: ['id', 'name', 'email'],
  },
});
```


## Dependency Injection

### Inject Decorator

```typescript
import { inject } from '@venizia/ignis';

class UserController extends BaseRestController {
  constructor(
    @inject({ key: 'services.UserService' })
    private userService: UserService,
  ) {
    super({ scope: UserController.name, path: '/users' });
  }
```

## Common Imports

### Core Framework

```typescript
import {
  // Application
  BaseApplication,

  // REST Controllers
  BaseRestController,
  controller,

  // gRPC Controllers
  BaseGrpcController,
  ControllerTransports,

  // REST Route Decorators
  get, post, put, patch, del, api,

  // gRPC Route Decorators
  rpc, unary, serverStream, clientStream, bidiStream,

  // Services
  BaseService,

  // Repositories
  DefaultCRUDRepository,
  repository,

  // Models
  ModelFactory,
  model,

  // DI
  inject,

  // Utilities
  jsonResponse,
  htmlResponse,
  Statuses,
} from '@venizia/ignis';
```

### Helpers

```typescript
import {
  // Logging
  LoggerFactory,
  ApplicationLogger,

  // Caching
  RedisSingleHelper,

  // Queues
  SequentialQueueHelper,

  // Crypto
  Hash,

  // HTTP
  HTTP,
} from '@venizia/ignis-helpers';
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';
import { CronHelper } from '@venizia/ignis-helpers/cron';
import { BunS3Helper } from '@venizia/ignis-helpers/bun-s3';
```

> [!NOTE]
> `MinioHelper` from `@venizia/ignis-helpers/minio` is `@deprecated`. Use `BunS3Helper` from
> `@venizia/ignis-helpers/bun-s3` instead - it reaches MinIO over the same S3 API, and adds
> presigned URLs, tagging and byte ranges.

`Hash` is the crypto surface for digests and HMACs. Both methods are synchronous.

```typescript
import { Hash, HashAlgorithms } from '@venizia/ignis-helpers';

const digest = Hash.withAlgorithm(HashAlgorithms.SHA256).digest({ message: 'payload' });
const signature = Hash.withAlgorithm(HashAlgorithms.SHA256).hmac({
  message: 'payload',
  secret: 'my-secret',
});
```

### Dependency Injection

```typescript
import { Container, BindingKeys } from '@venizia/ignis-inversion';
import { BindingNamespaces } from '@venizia/ignis';
```


## OpenAPI/Swagger

### JSON Response

```typescript
import { z } from '@hono/zod-openapi';
import { jsonResponse, TRouteContext } from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';

@get({
  configs: {
    path: '/users/{id}',
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: jsonResponse({
      description: 'User data',
      schema: z.object({
        id: z.string(),
        name: z.string(),
        email: z.string().email(),
      }),
    }),
  },
})
getUser(context: TRouteContext) {
  const { id } = context.req.valid<{ id: string }>('param');
  return context.json(
    { id, name: 'John', email: 'john@example.com' },
    HTTP.ResultCodes.RS_2.Ok,
  );
}
```

### HTML Response

```typescript
import { htmlResponse, TRouteContext } from '@venizia/ignis';

@get({
  configs: {
    path: '/dashboard',
    responses: htmlResponse({
      description: 'Dashboard page',
    }),
  },
})
getDashboard(context: TRouteContext) {
  return context.html(<DashboardPage />);
}
```

## Status Codes

### Using Statuses

```typescript
import { Statuses } from '@venizia/ignis';

// Create with status
const { data: order } = await orderRepository.create({
  data: {
    items: [...],
    status: Statuses.PENDING,
  },
});

// Update status
await orderRepository.updateById({
  id: orderId,
  data: { status: Statuses.COMPLETED },
});

// Check status
if (Statuses.isActive(order.status)) {
  // Process order
}

if (Statuses.isCompleted(order.status)) {
  // Order is done
}
```

### Common Statuses

| Status | Value | Category |
|--------|-------|----------|
| `UNKNOWN` | `'000_UNKNOWN'` | Initial |
| `DRAFT` | `'001_DRAFT'` | Initial |
| `PENDING` | `'103_PENDING'` | Pending |
| `ACTIVATED` | `'201_ACTIVATED'` | Active |
| `RUNNING` | `'202_RUNNING'` | Active |
| `COMPLETED` | `'303_COMPLETED'` | Completed |
| `SUCCESS` | `'302_SUCCESS'` | Completed |
| `CONFIRMED` | `'305_CONFIRMED'` | Completed |
| `SUSPENDED` | `'402_SUSPENDED'` | Inactive |
| `ARCHIVED` | `'405_ARCHIVED'` | Inactive |
| `REFUNDED` | `'408_REFUNDED'` | Inactive |
| `FAIL` | `'500_FAIL'` | Failed |
| `CANCELLED` | `'505_CANCELLED'` | Failed |
| `DELETED` | `'506_DELETED'` | Failed |


## Middlewares

### Built-in Middlewares

All four ship installed. `BaseApplication` registers the request id, the error handler, the 404
handler, `RequestSpyMiddleware` and the emoji favicon during `initialize()`. You do not wire them.

| Middleware | Exported from `@venizia/ignis` | Purpose |
|------------|-------------------------------|---------|
| `AppErrorMiddleware` | no | Global error handler, installed via `onError` |
| `notFoundHandler` | yes | JSON 404 response for unknown routes |
| `RequestSpyMiddleware` | no | Request and response logging with timing |
| `emojiFavicon` | yes | Serves an emoji as an SVG favicon |

Change the favicon through `configs.favicon` and the error wrapper through `configs.error.rootKey`
rather than re-registering anything.

### Your Own Middlewares

The application has no `use`, `onError` or `notFound` members. Register on the Hono server you get
from `this.getServer()`, inside `setupMiddlewares()`. CORS is the exception: set it in the
constructor config, where the framework installs it before its own early exits:

```typescript
import { BaseApplication } from '@venizia/ignis';
import { compress } from 'hono/compress';

const application = new MyApplication({
  scope: 'MyApp',
  config: {
    path: { base: '/api', isStrict: true },
    middlewares: { cors: { enable: true, origin: ['https://app.example.com'] } },
  },
});

class MyApplication extends BaseApplication {
  // ...other lifecycle hooks

  setupMiddlewares() {
    this.getServer().use(compress());
  }
}
```


## Common Patterns

### Controller → Service → Repository

```typescript
import { z } from '@hono/zod-openapi';
import {
  BaseRestController,
  BaseService,
  controller,
  DefaultCRUDRepository,
  inject,
  jsonContent,
  post,
  repository,
  TRouteContext,
} from '@venizia/ignis';
import { genSalt, hash } from 'bcrypt';
import { HTTP } from '@venizia/ignis-helpers';
import { PostgresDataSource } from '../datasources';
import { User } from '../models';

type CreateUserDto = { name: string; email: string; password: string };

// Controller
@controller({ path: '/users' })
class UserController extends BaseRestController {
  constructor(
    @inject({ key: 'services.UserService' })
    private userService: UserService,
  ) {
    super({ scope: UserController.name });
  }

  override binding() {}

  @post({
    configs: {
      path: '/',
      request: {
        body: jsonContent({
          description: 'User data',
          schema: z.object({
            name: z.string(),
            email: z.string().email(),
            password: z.string(),
          }),
        }),
      },
      responses: {
        [HTTP.ResultCodes.RS_2.Created]: { description: 'Created' },
      },
    },
  })
  async createUser(context: TRouteContext) {
    const data = context.req.valid<CreateUserDto>('json');
    return context.json(
      await this.userService.create(data),
      HTTP.ResultCodes.RS_2.Created,
    );
  }
}

// Service
class UserService extends BaseService {
  constructor(
    @inject({ key: 'repositories.UserRepository' })
    private userRepository: UserRepository,
  ) {
    super({ scope: UserService.name });
  }

  async create(data: CreateUserDto) {
    // Business logic. Passwords want a slow, salted KDF, so this is `bcrypt`, not the
    // digest helper - `Hash` is for message digests and HMACs, never for credentials.
    const hashedPassword = await hash(data.password, await genSalt(10));

    return this.userRepository.create({
      data: {
        ...data,
        password: hashedPassword,
      },
    });
  }
}

// Repository
@repository({ model: User, dataSource: PostgresDataSource })
class UserRepository extends DefaultCRUDRepository<typeof userTable> {
  // DataSource auto-injected from @repository decorator
}
```


## See Also

- **Full Documentation:**
  - [Base Abstractions](./base/) - Complete API reference
  - [Components](/extensions/components/) - Pre-built features
  - [Helpers](/extensions/helpers/) - Utility helpers
  - [Utilities](./utilities/) - Pure functions

- **Guides:**
  - [Getting Started](/guides/) - Tutorials and walkthroughs
  - [Core Concepts](/guides/core-concepts/application/) - Architecture deep-dive

- **Best Practices:**
  - [Architectural Patterns](/best-practices/architectural-patterns)
  - [Security Guidelines](/best-practices/security-guidelines)
