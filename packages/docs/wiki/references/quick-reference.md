---
title: Quick Reference Card
description: Single-page cheat sheet for IGNIS framework
lastUpdated: 2026-01-03
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
- `get<T>(key)` - Resolve from DI container
- `mountControllers()` - Register controllers

### BaseController

```typescript
import { BaseController, controller, get } from '@venizia/ignis';

@controller({ path: '/users' })
class UserController extends BaseController {
  @get({ configs: { path: '/:id' } })
  async getUser(@param('id') id: string) {
    return { id, name: 'John' };
  }
}
```

**Key Properties:**
- `this.context` - Hono context
- `this.container` - DI container
- `this.logger` - Scoped logger

### BaseService

```typescript
import { BaseService, injectable } from '@venizia/ignis';

@injectable()
class UserService extends BaseService {
  constructor() {
    super({ scope: UserService.name });
  }

  async getUser(id: string) {
    this.logger.info('Getting user', id);
    return this.userRepo.findById(id);
  }
}
```

**Key Properties:**
- `this.logger` - Scoped logger

### DefaultCRUDRepository

```typescript
import { DefaultCRUDRepository } from '@venizia/ignis';
import { User } from '../models';

class UserRepository extends DefaultCRUDRepository<User> {
  constructor() {
    super(User);
  }
}
```

**Key Methods:**
- `create(data)` - Create single entity
- `createMany(data[])` - Create multiple entities
- `find(filter?)` - Find many with filter
- `findById(id)` - Find by ID
- `findOne(filter)` - Find single entity
- `count(filter?)` - Count entities
- `update(id, data)` - Update by ID
- `updateMany(filter, data)` - Update multiple
- `delete(id)` - Delete by ID (soft/hard based on config)
- `deleteMany(filter)` - Delete multiple

### BaseEntity

```typescript
import { BaseEntity, model } from '@venizia/ignis';
import { integer, text, pgTable } from 'drizzle-orm/pg-core';

@model()
class User extends BaseEntity {
  static readonly tableName = 'users';
  static readonly schema = pgTable(User.tableName, {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
  });
}
```

**Key Properties:**
- `static tableName` - Database table name
- `static schema` - Drizzle schema definition


## Route Decorators

### HTTP Methods

| Decorator | HTTP Method | Example |
|-----------|-------------|---------|
| `@get()` | GET | `@get({ configs: { path: '/:id' } })` |
| `@post()` | POST | `@post({ configs: { path: '/' } })` |
| `@put()` | PUT | `@put({ configs: { path: '/:id' } })` |
| `@patch()` | PATCH | `@patch({ configs: { path: '/:id' } })` |
| `@del()` | DELETE | `@del({ configs: { path: '/:id' } })` |

### Parameter Decorators

| Decorator | Extracts | Example |
|-----------|----------|---------|
| `@param('name')` | Route parameter | `@param('id') id: string` |
| `@query('name')` | Query string | `@query('page') page: string` |
| `@body()` | Request body | `@body() data: CreateUserDto` |
| `@header('name')` | HTTP header | `@header('authorization') auth: string` |

### Example

```typescript
@controller({ path: '/users' })
class UserController extends BaseController {
  @post({ configs: { path: '/' } })
  async createUser(
    @body() data: CreateUserDto,
    @header('authorization') token: string
  ) {
    return this.userService.create(data);
  }

  @get({ configs: { path: '/' } })
  async listUsers(
    @query('page') page: string,
    @query('limit') limit: string
  ) {
    return this.userService.findAll({ page, limit });
  }

  @get({ configs: { path: '/:id' } })
  async getUser(@param('id') id: string) {
    return this.userService.findById(id);
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
| `notIn` | `NOT IN` | `{ status: { notIn: ['deleted'] } }` |

### Pattern Matching

| Operator | SQL | Example |
|----------|-----|---------|
| `like` | `LIKE` | `{ name: { like: '%john%' } }` |
| `ilike` | `ILIKE` | `{ email: { ilike: '%@gmail.com' } }` |
| `notLike` | `NOT LIKE` | `{ name: { notLike: '%test%' } }` |
| `notILike` | `NOT ILIKE` | `{ email: { notILike: '%spam%' } }` |
| `startsWith` | `LIKE 'value%'` | `{ name: { startsWith: 'John' } }` |
| `endsWith` | `LIKE '%value'` | `{ email: { endsWith: '@example.com' } }` |

### Null Operators

| Operator | SQL | Example |
|----------|-----|---------|
| `isNull` | `IS NULL` | `{ deletedAt: { isNull: true } }` |
| `isNotNull` | `IS NOT NULL` | `{ email: { isNotNull: true } }` |

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

### JSON Operators (PostgreSQL)

| Operator | Description | Example |
|----------|-------------|---------|
| `jsonPath` | Query JSON field | `{ metadata: { jsonPath: '$.user.name', eq: 'John' } }` |


## Common Filters

### Basic Find

```typescript
const users = await userRepo.find({
  where: { isActive: true },
  orderBy: { createdAt: 'desc' },
  limit: 10,
  offset: 0,
});
```

### With Multiple Conditions

```typescript
const users = await userRepo.find({
  where: {
    and: [
      { age: { gte: 18 } },
      { status: { in: ['active', 'pending'] } },
      { email: { endsWith: '@company.com' } }
    ]
  }
});
```

### With Relations

```typescript
const posts = await postRepo.find({
  where: { published: true },
  include: {
    author: true,
    comments: {
      where: { approved: true },
      limit: 5
    }
  }
});
```

### Selecting Fields

```typescript
const users = await userRepo.find({
  where: { isActive: true },
  fields: ['id', 'name', 'email'], // Only these fields
});
```


## Dependency Injection

### Injectable Decorator

```typescript
import { injectable } from '@venizia/ignis';

@injectable()
class MyService extends BaseService {
  // ...
}
```

### Inject Decorator

```typescript
import { inject } from '@venizia/ignis';

@injectable()
class UserController extends BaseController {
  constructor(
    @inject({ key: 'services.UserService' })
    private userService: UserService
  ) {
    super();
  }
}
```

### Manual Resolution

```typescript
const userService = app.get<UserService>('services.UserService');
```


## Common Imports

### Core Framework

```typescript
import {
  // Application
  BaseApplication,

  // Controllers
  BaseController,
  controller,

  // HTTP Methods
  get, post, put, patch, del,

  // Parameters
  param, query, body, header, context,

  // Services
  BaseService,

  // Repositories
  BaseRepository,
  DefaultCRUDRepository,

  // Models
  BaseEntity,
  model,

  // DI
  inject,
  injectable,

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
  RedisHelper,

  // Queues
  QueueHelper,

  // Crypto
  hash,
  compare,

  // HTTP
  HTTP,
} from '@venizia/ignis-helpers';
import { BullMQHelper } from '@venizia/ignis-helpers/bullmq';
import { CronHelper } from '@venizia/ignis-helpers/cron';
import { MinIOHelper } from '@venizia/ignis-helpers/minio';
```

### Dependency Injection

```typescript
import {
  Container,
  BindingKeys,
  BindingNamespaces,
} from '@venizia/ignis-inversion';
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
async getUser(@param('id') id: string) {
  return { id, name: 'John', email: 'john@example.com' };
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
async getDashboard() {
  return this.context.html(<DashboardPage />);
}
```


## Status Codes

### Using Statuses

```typescript
import { Statuses } from '@venizia/ignis';

// Create with status
const order = await orderRepo.create({
  items: [...],
  status: Statuses.PENDING,
});

// Update status
await orderRepo.update(orderId, {
  status: Statuses.COMPLETED,
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
  appErrorHandler,
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
app.onError(appErrorHandler({ logger: app.logger }));

// 404 handler
app.notFound(notFoundHandler({ logger: app.logger }));
```


## Environment Variables

### Loading Environment

```typescript
import { EnvHelper } from '@venizia/ignis-helpers';

// Load from .env file
EnvHelper.load();

// Get variable
const dbUrl = EnvHelper.get('DATABASE_URL');

// Get with default
const port = EnvHelper.get('PORT', '3000');

// Get required (throws if missing)
const apiKey = EnvHelper.getRequired('API_KEY');
```


## Common Patterns

### Controller → Service → Repository

```typescript
// Controller
@controller({ path: '/users' })
class UserController extends BaseController {
  constructor(
    @inject({ key: 'services.UserService' })
    private userService: UserService
  ) {
    super();
  }

  @post({ configs: { path: '/' } })
  async createUser(@body() data: CreateUserDto) {
    return this.userService.create(data);
  }
}

// Service
@injectable()
class UserService extends BaseService {
  constructor(
    @inject({ key: 'repositories.UserRepository' })
    private userRepo: UserRepository
  ) {
    super({ scope: UserService.name });
  }

  async create(data: CreateUserDto) {
    // Business logic
    const hashedPassword = await hash({ value: data.password });

    return this.userRepo.create({
      ...data,
      password: hashedPassword,
      status: Statuses.ACTIVATED,
    });
  }
}

// Repository
@injectable()
class UserRepository extends DefaultCRUDRepository<User> {
  constructor() {
    super(User);
  }
}
```


## See Also

- **Full Documentation:**
  - [Base Abstractions](./base/) - Complete API reference
  - [Components](./components/) - Pre-built features
  - [Helpers](./helpers/) - Utility helpers
  - [Utilities](./utilities/) - Pure functions

- **Guides:**
  - [Getting Started](/guides/) - Tutorials and walkthroughs
  - [Core Concepts](/guides/core-concepts/application/) - Architecture deep-dive

- **Best Practices:**
  - [Architectural Patterns](/best-practices/architectural-patterns)
  - [Security Guidelines](/best-practices/security-guidelines)
