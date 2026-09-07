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
import { BaseApplication } from '@venizia/ignis';

class MyApp extends BaseApplication {
  constructor() {
    super({ projectRoot: __dirname });
  }
}

const app = new MyApp();
await app.initialize();
await app.start();
```

**Key Methods:**
- `initialize()` - Bootstrap the application
- `start()` - Start HTTP server
- `stop()` - Stop server gracefully

### BaseRestController

```typescript
import { BaseRestController, controller, get } from '@venizia/ignis';

@controller({ path: '/users' })
class UserController extends BaseRestController {
  constructor() {
    super({ scope: UserController.name, path: '/users' });
  }

  override binding() {}

  @get({ configs: { path: '/:id', responses: { 200: { description: 'User' } } } })
  getUser(c: Context) {
    const id = c.req.param('id');
    return c.json({ id, name: 'John' });
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

@controller({ path: '/grpc', transport: ControllerTransports.GRPC, service: GreeterService })
class GreeterController extends BaseGrpcController {
  constructor() {
    super({ scope: GreeterController.name, path: '/grpc' });
  }

  override binding() {}

  @unary({ configs: { name: 'sayHello' } })
  async sayHello(request: SayHelloRequest) {
    return { message: `Hello, ${request.name}!` };
  }
}
```

### BaseService

```typescript
import { BaseService } from '@venizia/ignis';

class UserService extends BaseService {
  constructor() {
    super({ scope: UserService.name });
  }

  async getUser(id: string) {
    this.logger.info('Getting user', id);
    return this.userRepository.findById({ id });
  }
}
```

**Key Properties:**
- `this.logger` - Scoped logger

### DefaultCRUDRepository

```typescript
import { DefaultCRUDRepository, repository } from '@venizia/ignis';
import { User } from '../models';
import { PostgresDataSource } from '../datasources';

@repository({ model: User, dataSource: PostgresDataSource })
class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  // No constructor needed - dataSource auto-injected from @repository decorator
}
```

**Key Methods:**
- `find({ filter })` - Find many with filter, returns `T[]`
- `findById({ id })` - Find by ID
- `findOne({ filter })` - Find single entity
- `count({ where? })` - Count entities
- `create({ data })` - Create single entity, returns `{ count, data }`
- `createAll({ data: [] })` - Create multiple entities, returns `{ count, data[] }`
- `updateById({ id, data })` - Update by ID
- `deleteById({ id })` - Delete by ID

### BaseEntity

```typescript
import { BaseEntity, model } from '@venizia/ignis';
import { integer, text, pgTable } from 'drizzle-orm/pg-core';

@model({ type: 'entity' })
class User extends BaseEntity {
  static readonly TABLE_NAME = 'users';
  static readonly schema = pgTable(User.TABLE_NAME, {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
  });
}
```

**Key Properties:**
- `static TABLE_NAME` - Database table name
- `static schema` - Drizzle schema definition
- `static AUTHORIZATION_SUBJECT` - Authorization principal (auto-set from `@model` settings `authorize.principal`)


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

### REST Example

```typescript
@controller({ path: '/users' })
class UserController extends BaseRestController {
  constructor(
    @inject({ key: 'services.UserService' }) private userService: UserService,
  ) {
    super({ scope: UserController.name, path: '/users' });
  }

  override binding() {}

  @post({ configs: { path: '/', responses: { 201: { description: 'Created' } } } })
  async createUser(c: Context) {
    const data = await c.req.json();
    const result = await this.userService.create(data);
    return c.json(result, 201);
  }

  @get({ configs: { path: '/:id', responses: { 200: { description: 'User' } } } })
  async getUser(c: Context) {
    const id = c.req.param('id');
    const result = await this.userService.findById(id);
    return c.json(result);
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
| `not` | `NOT` | `{ not: { status: 'deleted' } }` |

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

  // Models
  BaseEntity,
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
  hash,

  // HTTP
  HTTP,
} from '@venizia/ignis-helpers';
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';
import { CronHelper } from '@venizia/ignis-helpers/cron';
import { MinioHelper } from '@venizia/ignis-helpers/minio';
```

### Dependency Injection

```typescript
import { Container, BindingKeys } from '@venizia/ignis-inversion';
import { BindingNamespaces } from '@venizia/ignis';
```


## OpenAPI/Swagger

### JSON Response

```typescript
import { jsonResponse } from '@venizia/ignis';
import { z } from '@hono/zod-openapi';

@get({
  configs: {
    path: '/users/:id',
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
getUser(c: Context) {
  const id = c.req.param('id');
  return c.json({ id, name: 'John', email: 'john@example.com' });
}
```

### HTML Response

```typescript
import { htmlResponse } from '@venizia/ignis';

@get({
  configs: {
    path: '/dashboard',
    responses: htmlResponse({
      description: 'Dashboard page',
    }),
  },
})
getDashboard(c: Context) {
  return c.html(<DashboardPage />);
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

```typescript
import {
  AppErrorMiddleware,
  notFoundHandler,
  RequestSpyMiddleware,
  emojiFavicon,
} from '@venizia/ignis';

const app = new MyApp();

// Request logging and body parsing
const requestSpy = new RequestSpyMiddleware();
app.use(requestSpy.value());

// Emoji favicon
app.use(emojiFavicon({ icon: '🚀' }));

// Error handling (register last)
app.onError(new AppErrorMiddleware({ logger: app.logger }).value());

// 404 handler
app.notFound(notFoundHandler({ logger: app.logger }));
```


## Common Patterns

### Controller → Service → Repository

```typescript
// Controller
@controller({ path: '/users' })
class UserController extends BaseRestController {
  constructor(
    @inject({ key: 'services.UserService' })
    private userService: UserService,
  ) {
    super({ scope: UserController.name, path: '/users' });
  }

  override binding() {}

  @post({ configs: { path: '/', responses: { 201: { description: 'Created' } } } })
  async createUser(c: Context) {
    const data = await c.req.json();
    return c.json(await this.userService.create(data), 201);
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
    // Business logic
    const hashedPassword = await hash({ value: data.password });

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
class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
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
