<div align="center">

# :fire: IGNIS - @venizia/ignis

**High-performance TypeScript server infrastructure combining enterprise-grade architecture with Hono speed.**

[![npm](https://img.shields.io/npm/v/@venizia/ignis.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis)
[![License](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Hono](https://img.shields.io/badge/Hono-4.x-E36002.svg?style=flat-square&logo=hono&logoColor=white)](https://hono.dev/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.45-C5F74F.svg?style=flat-square)](https://orm.drizzle.team/)

IGNIS brings together the structured, enterprise development experience of **LoopBack 4** with the blazing speed and simplicity of **Hono**, giving you the best of both worlds: decorator-based DI, repository pattern, DataSource abstraction, component system, boot conventions - running on Hono's ~140k req/s engine with Drizzle ORM's type-safe SQL.

[Installation](#installation) &#8226; [Quick Start](#quick-start) &#8226; [API Reference](#controllers) &#8226; [Documentation](https://venizia-ai.github.io/ignis)

</div>

## Highlights

| | Feature | |
| :---: | :--- | :--- |
| **1** | **Zero-Config CRUD** | 2-line repository gives you full create/read/update/delete |
| **2** | **Type-Safe SQL** | End-to-end TypeScript inference with Drizzle ORM |
| **3** | **Auto OpenAPI** | Every route produces Swagger documentation automatically |
| **4** | **~140k req/s** | Hono-powered HTTP with zero wrapper overhead |
| **5** | **9 Built-in Components** | Auth, Health, Swagger, Mail, Socket.IO, Static Assets, and more |
| **6** | **3 Route Patterns** | Decorator, imperative, or fluent -- your choice |

---

## At a Glance

```typescript
import {
  BaseApplication,       // Your app extends this
  BaseRestController,    // Controllers extend this
} from '@venizia/ignis';
import {
  DefaultCRUDRepository, // Repositories extend this
  BasePostgresEntity,            // Models extend this
  BasePostgresDataSource,        // DataSources extend this
} from '@venizia/ignis/postgres';
```

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Application Lifecycle](#application-lifecycle)
- [Application Configuration](#application-configuration)
- [Controllers](#controllers)
- [Repositories](#repositories)
- [Models](#models)
- [DataSources](#datasources)
- [Search](#search)
- [Memory Connector](#memory-connector)
- [Services](#services)
- [Components](#components)
- [Request Context](#request-context)
- [Middleware System](#middleware-system)
- [Error Handling](#error-handling)
- [Decorators Reference](#decorators-reference)
- [Response Helpers](#response-helpers)
- [Real-World Patterns](#real-world-patterns)
- [Testing](#testing)
- [Performance Tips](#performance-tips)
- [Documentation](#documentation)
- [License](#license)

---

## Installation

```bash
bun add @venizia/ignis
```

### Required Peer Dependencies

```bash
bun add hono @hono/zod-openapi drizzle-orm drizzle-zod pg jose @asteasolutions/zod-to-openapi
```

### Optional Peer Dependencies

Install only what you use:

```bash
# Swagger / API Reference UI
bun add @hono/swagger-ui @scalar/hono-api-reference

# Node.js runtime (if not using Bun)
bun add @hono/node-server

# Socket.IO real-time
bun add socket.io socket.io-client @socket.io/bun-engine

# Redis adapter for Socket.IO horizontal scaling
bun add @socket.io/redis-adapter @socket.io/redis-emitter

# Background job queues
bun add bullmq

# Authorization (Casbin RBAC)
bun add casbin

# Email
bun add nodemailer mailgun.js

# Search (Typesense)
bun add typesense

# gRPC controller transport
bun add @connectrpc/connect
```

---

## Quick Start

### 1. Define a Model

```typescript
// models/user.model.ts
import { model } from '@venizia/ignis';
import { BasePostgresEntity, generateIdColumnDefs, generateTzColumnDefs } from '@venizia/ignis/postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';

@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['password'],
  },
})
export class User extends BasePostgresEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    username: text('username').notNull().unique(),
    email: text('email').notNull().unique(),
    password: text('password'),
  });

  static override relations = () => [];
}
```

### 2. Define a DataSource

```typescript
// datasources/postgres.datasource.ts
import { datasource, ValueOrPromise } from '@venizia/ignis';
import { BasePostgresDataSource } from '@venizia/ignis/postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

interface IDSConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  // Optional pg Pool tuning (see "Complete DataSource Configuration" below)
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BasePostgresDataSource<IDSConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: {
        host: process.env.DB_HOST!,
        port: +(process.env.DB_PORT ?? 5432),
        database: process.env.DB_NAME!,
        user: process.env.DB_USER!,
        password: process.env.DB_PASSWORD!,
      },
      // Schema is auto-discovered from @repository bindings
    });
  }

  override configure(): ValueOrPromise<void> {
    const schema = this.getSchema();
    this.pool = new Pool(this.settings);
    this.connector = drizzle({ client: this.pool, schema });
  }

  override getConnectionString() {
    const { host, port, user, password, database } = this.settings;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

### 3. Define a Repository

```typescript
// repositories/user.repository.ts
import { repository } from '@venizia/ignis';
import { PersistableRepository } from '@venizia/ignis/postgres';
import { User } from '../models/user.model';
import { PostgresDataSource } from '../datasources/postgres.datasource';

@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends PersistableRepository<typeof User.schema> {
  // No constructor needed -- DataSource is auto-injected at param[0]
}
```

### 4. Define a Controller

```typescript
// controllers/user.controller.ts
import {
  BaseRestController, controller, get, post,
  inject, jsonContent, jsonResponse, TRouteContext,
} from '@venizia/ignis';
import { z } from '@hono/zod-openapi';
import { UserRepository } from '../repositories/user.repository';

@controller({ path: '/users' })
export class UserController extends BaseRestController {
  constructor(
    @inject({ key: 'repositories.UserRepository' }) private userRepository: UserRepository,
  ) {
    super({ scope: UserController.name });
  }

  override binding() {}

  @get({
    configs: {
      path: '/',
      responses: jsonResponse({
        schema: z.array(z.object({ id: z.string(), username: z.string(), email: z.string() })),
      }),
    },
  })
  async listUsers(context: TRouteContext) {
    const users = await this.userRepository.find({ filter: {} });
    return context.json(users, 200);
  }

  @post({
    configs: {
      path: '/',
      request: {
        body: jsonContent({
          description: 'New user data',
          schema: z.object({ username: z.string(), email: z.string(), password: z.string() }),
        }),
      },
      responses: jsonResponse({
        schema: z.object({ count: z.number(), data: z.any() }),
      }),
    },
  })
  async createUser(context: TRouteContext) {
    const body = context.req.valid<{ username: string; email: string; password: string }>('json');
    const result = await this.userRepository.create({ data: body });
    return context.json(result, 200);
  }
}
```

### 5. Define the Application

```typescript
// application.ts
import {
  BaseApplication, IApplicationConfigs, IApplicationInfo,
  HealthCheckComponent, SwaggerComponent, ValueOrPromise,
} from '@venizia/ignis';
import { PostgresDataSource } from './datasources/postgres.datasource';
import { UserRepository } from './repositories/user.repository';
import { UserController } from './controllers/user.controller';

const configs: IApplicationConfigs = {
  host: 'localhost',
  port: 3000,
  path: { base: '/api', isStrict: true },
};

export class Application extends BaseApplication {
  constructor() {
    super({ scope: Application.name, config: configs });
    this.init();
  }

  getAppInfo(): IApplicationInfo {
    return { name: 'My App', version: '1.0.0', description: 'My IGNIS application' };
  }

  staticConfigure() {}

  preConfigure(): ValueOrPromise<void> {
    // Register components
    this.component(HealthCheckComponent);
    this.component(SwaggerComponent);

    // Register datasources, repositories, and controllers
    this.dataSource(PostgresDataSource);
    this.repository(UserRepository);
    this.controller(UserController);
  }

  postConfigure(): ValueOrPromise<void> {}

  setupMiddlewares(): ValueOrPromise<void> {
    // Add CORS, body limit, etc.
  }
}
```

### 6. Start the Server

```typescript
// index.ts
import { Application } from './application';

const app = new Application();
app.start();
```

---

## Application Lifecycle

`BaseApplication` extends the IoC `Container` and orchestrates a well-defined startup sequence:

```
1. init()                       Register core bindings (app instance, server, root router)
2. start()                      Entry point -- calls initialize() then starts the server
   |
   +-- initialize()
   |   |
   |   +-- printStartUpInfo()              Log environment, runtime, timezone, datasource info
   |   +-- validateEnvs()                  Validate required environment variables
   |   +-- registerDefaultMiddlewares()    Error handler, async context, request tracker, favicon
   |   +-- staticConfigure()               Pre-DI static setup (e.g., serve static files)
   |   +-- preConfigure()                  Register controllers, services, components, datasources
   |   +-- registerDataSources()           Configure all datasources (auto-discover schemas)
   |   +-- registerComponents()            Configure all components (can register more datasources)
   |   +-- registerControllers()           Configure controllers, mount routes on root router
   |   +-- postConfigure()                 Post-registration hooks
   |
   +-- setupMiddlewares()                  Register Hono middlewares (CORS, body limit, etc.)
   +-- mount root router                   Mount to base path
   +-- startBunModule / startNodeModule    Start HTTP server
   +-- executePostStartHooks()             Run any registered post-start hooks
```

### What Happens Inside Each Phase

**`registerDefaultMiddlewares()`** -- Automatically sets up:

- `appErrorHandler` -- Global error handler that catches all errors, formats them as JSON, handles ZodError validation errors (returns 422), recognizes PostgreSQL constraint violations (returns 400 instead of 500), and strips stack traces in production.
- `contextStorage()` -- Hono async context storage for accessing request context anywhere (enabled by default, controlled via `asyncContext.enable` config).
- `RequestTrackerComponent` -- Injects `x-request-id` header on every request and parses request body.
- `emojiFavicon` -- Returns a favicon emoji response (configurable via `favicon` config).
- `notFoundHandler` -- Returns a structured 404 response for unmatched routes.

**`registerDataSources()`** -- Iterates all bindings tagged `datasources`, calls `configure()` on each. Schema auto-discovery happens here.

**`registerComponents()`** -- Iterates all bindings tagged `components`, calls `configure()` on each. Components can register additional datasources during their configuration (the method re-fetches bindings after each component to pick up dynamically added datasources).

**`registerControllers()`** -- Dispatches per configured transport (`configs.transports`, default `['rest']`): a `RestComponent` handles REST controllers (validates that `@controller` metadata has a `path`, calls `configure()` -- which triggers `binding()` and `registerRoutesFromRegistry()` -- then mounts the controller's router at its configured path on the root router), and, when `'grpc'` is included, a `GrpcComponent` handles gRPC controllers. A gRPC controller discovered without `'grpc'` in `transports` is logged as an error and skipped.

### Key Application Methods

| Method | Description |
| --- | --- |
| `controller(ctor)` | Register a controller class -- bound to `controllers.{Name}` |
| `service(ctor)` | Register a service class -- bound to `services.{Name}` |
| `repository(ctor)` | Register a repository class -- bound to `repositories.{Name}` |
| `dataSource(ctor)` | Register a datasource class (singleton) -- bound to `datasources.{Name}` |
| `component(ctor)` | Register a component class (singleton) -- bound to `components.{Name}` |
| `static({ folderPath })` | Serve static files (auto-detects Bun/Node runtime) |
| `getServer()` | Get the main `OpenAPIHono` instance |
| `getServerPort()` | Get the configured server port |
| `getServerHost()` | Get the configured server host |
| `getServerAddress()` | Get `host:port` string |
| `getRootRouter()` | Get the root router for direct route registration |
| `getProjectRoot()` | Get the project working directory |
| `getProjectConfigs()` | Get the full application configuration object |
| `getServerInstance()` | Get the underlying Bun.Server or Node HTTP server instance |
| `registerPostStartHook({ identifier, hook })` | Register a callback to run after server starts |
| `boot()` | Convention-based auto-discovery (controllers, services, repositories, datasources) |
| `stop()` | Gracefully stop the server |

### `registerDynamicBindings()` -- Handling Late/Circular Registrations

The `registerDynamicBindings()` method is the engine behind `registerDataSources()`, `registerComponents()`, and `registerControllers()`. It handles the case where configuring one binding may register new bindings of the same type:

```typescript
protected async registerDynamicBindings<T extends IConfigurable>(opts: {
  namespace: TBindingNamespace;
  onBeforeConfigure?: (opts: { binding: Binding<T> }) => Promise<void>;
  onAfterConfigure?: (opts: { binding: Binding<T>; instance: T }) => Promise<void>;
}): Promise<void>;
```

It works by:

1. Fetching all bindings for the given namespace, excluding already-configured ones.
2. Configuring each binding in sequence.
3. After each configuration, re-fetching bindings to pick up any newly added ones.
4. Repeating until no new bindings remain.

This is critical for components that register datasources during their own configuration.

### `registerPostStartHook()` -- Running Code After Server Start

```typescript
// In preConfigure() or postConfigure():
this.registerPostStartHook({
  identifier: 'warmup-cache',
  hook: async () => {
    const cacheService = this.get<CacheService>({ key: 'services.CacheService' });
    await cacheService.warmup();
    console.log('Cache warmed up');
  },
});

this.registerPostStartHook({
  identifier: 'register-cron-jobs',
  hook: async () => {
    const cronService = this.get<CronService>({ key: 'services.CronService' });
    cronService.startAll();
  },
});
```

Post-start hooks execute sequentially after the HTTP server is listening. Each hook is logged with its execution time.

### Static File Serving

```typescript
staticConfigure() {
  // Serve files from ./public directory at all unmatched routes
  this.static({ folderPath: './public' });

  // Or serve at a specific path
  this.static({ restPath: '/assets/*', folderPath: './static-assets' });
}
```

Runtime-aware: uses `hono/bun` `serveStatic` on Bun, `@hono/node-server/serve-static` on Node.js.

### Runtime Detection

IGNIS auto-detects the runtime and starts the server accordingly:

```typescript
// Bun (default)
Bun.serve({ port, hostname, fetch: server.fetch });

// Node.js (requires @hono/node-server)
import { serve } from '@hono/node-server';
serve({ fetch: server.fetch, port, hostname });
```

The runtime is detected via `RuntimeModules.detect()` which checks for the presence of the global `Bun` object.

---

## Application Configuration

```typescript
interface IApplicationConfigs {
  host?: string;           // Server host (default: 'localhost' or APP_ENV_SERVER_HOST/HOST env)
  port?: number;           // Server port (default: 3000 or PORT/APP_ENV_SERVER_PORT env)

  path: {
    base: string;          // Base path for all routes (e.g., '/api')
    isStrict: boolean;     // Currently unused -- see strictPath below
  };

  strictPath?: boolean;    // When true (default), '/users' and '/users/' are different routes

  requestId?: {
    isStrict: boolean;     // Enforce request ID on all requests
  };

  favicon?: string;        // Emoji favicon (default: fire emoji)

  error?: {
    rootKey: string;       // Wrap error responses in this key (e.g., 'error')
  };

  asyncContext?: {
    enable: boolean;       // Enable Hono async context storage (default: true)
  };

  bootOptions?: IBootOptions;  // Convention-based auto-discovery options

  transports?: ('rest' | 'grpc')[];  // Controller transports to enable (default: ['rest'])

  debug?: {
    shouldShowRoutes?: boolean;  // Print all registered routes on startup
  };
}
```

**Note:** the actual Hono strict-routing flag is read from the top-level `strictPath` (defaulting to `true`), not from `path.isStrict` -- `path.isStrict` is declared on the type but not currently read anywhere.

```typescript
interface IApplicationInfo {
  name: string;
  version: string;
  description: string;
  author?: { name: string; email: string; url?: string };
}
```

---

## Controllers

### BaseRestController

All controllers extend `BaseRestController`, which provides:

- An `OpenAPIHono` router instance
- Route registration methods (`defineRoute`, `bindRoute`, `defineJSXRoute`)
- Automatic authentication and authorization middleware injection
- OpenAPI schema generation and route tagging
- Zod-based request validation with automatic 422 error responses

```typescript
abstract class BaseRestController extends AbstractRestController {
  // Register routes -- override this method
  abstract binding(): ValueOrPromise<void>;

  // Imperative route definition
  defineRoute({ configs, handler, hook? });

  // Fluent two-step route definition
  bindRoute({ configs }).to({ handler });

  // JSX/HTML route definition (server-side rendering)
  defineJSXRoute({ configs, handler });

  // Get the router for this controller
  getRouter(): OpenAPIHono;
}
```

### Three Route Definition Patterns

#### 1. Decorator Pattern

Use `@get`, `@post`, `@put`, `@patch`, `@del`, or the generic `@api` decorators. Decorator-based routes are automatically registered during `configure()` via `registerRoutesFromRegistry()`:

```typescript
@controller({ path: '/products' })
class ProductController extends BaseRestController {
  constructor(
    @inject({ key: 'repositories.ProductRepository' }) private productRepository: ProductRepository,
    @inject({ key: 'services.InventoryService' }) private inventoryService: InventoryService,
  ) {
    super({ scope: ProductController.name });
  }

  override binding() {} // decorator routes are auto-registered

  @get({
    configs: {
      path: '/',
      description: 'List all products with pagination',
      responses: jsonResponse({
        schema: z.array(z.object({
          id: z.number(),
          name: z.string(),
          price: z.number(),
          category: z.string(),
        })),
        description: 'Array of products',
      }),
    },
  })
  async list(context: TRouteContext) {
    const products = await this.productRepository.find({
      filter: { order: ['createdAt DESC'], limit: 20 },
    });
    return context.json(products, 200);
  }

  @get({
    configs: {
      path: '/{id}',
      request: {
        params: z.object({ id: z.string().pipe(z.coerce.number()) }),
      },
      responses: jsonResponse({
        schema: z.object({
          id: z.number(),
          name: z.string(),
          price: z.number(),
          stock: z.number(),
        }),
      }),
    },
  })
  async getById(context: TRouteContext) {
    const { id } = context.req.valid<{ id: number }>('param');
    const product = await this.productRepository.findById({ id });
    if (!product) {
      return context.json({ message: 'Product not found' }, 404);
    }
    return context.json(product, 200);
  }

  @post({
    configs: {
      path: '/',
      authenticate: { strategies: ['jwt'] },
      request: {
        body: jsonContent({
          schema: z.object({
            name: z.string().min(1).max(255),
            price: z.number().positive(),
            category: z.string(),
            description: z.string().optional(),
          }),
          description: 'New product data',
        }),
      },
      responses: jsonResponse({
        schema: z.object({ count: z.number(), data: z.any() }),
      }),
    },
  })
  async create(context: TRouteContext) {
    const data = context.req.valid<{
      name: string;
      price: number;
      category: string;
      description?: string;
    }>('json');
    const result = await this.productRepository.create({ data });
    return context.json(result, 200);
  }
}
```

#### 2. Imperative Pattern

Define routes directly inside `binding()`:

```typescript
override binding() {
  this.defineRoute({
    configs: {
      path: '/',
      method: 'get',
      description: 'List products',
      responses: jsonResponse({ schema: z.array(ProductSchema) }),
    },
    handler: async (context) => {
      const products = await this.productRepository.find({ filter: {} });
      return context.json(products, 200);
    },
  });

  this.defineRoute({
    configs: {
      path: '/{id}',
      method: 'delete',
      authenticate: { strategies: ['jwt'] },
      authorize: { action: 'delete', resource: 'Product' },
      request: { params: idParamsSchema({ idType: 'number' }) },
      responses: jsonResponse({ schema: z.object({ count: z.number() }) }),
    },
    handler: async (context) => {
      const { id } = context.req.valid<{ id: number }>('param');
      const result = await this.productRepository.deleteById({ id });
      return context.json(result, 200);
    },
  });
}
```

#### 3. Fluent Pattern

Two-step binding with `bindRoute().to()`:

```typescript
override binding() {
  this.bindRoute({
    configs: {
      path: '/{id}',
      method: 'get',
      request: { params: idParamsSchema({ idType: 'number' }) },
      responses: jsonResponse({ schema: ProductSchema }),
    },
  }).to({
    handler: async (context) => {
      const { id } = context.req.valid<{ id: number }>('param');
      const product = await this.productRepository.findById({ id });
      return context.json(product, 200);
    },
  });
}
```

### `getRouteConfigs()` -- How Auth Middleware is Injected

When you specify `authenticate` or `authorize` on a route config, `getRouteConfigs()` automatically:

1. Converts `authenticate.strategies` into OpenAPI security specs for documentation.
2. Creates an `authenticate` middleware based on strategies and mode, and prepends it to the middleware chain.
3. Creates an `authorize` middleware (if configured) and appends it after authenticate.
4. Merges any custom `middleware` array from the config.
5. Adds the controller's scope name as an OpenAPI tag.

This means you never manually wire auth middleware -- it is all declarative.

### Middleware Chaining on Routes

You can pass additional Hono middleware to any route:

```typescript
import { rateLimiter } from 'hono-rate-limiter'; // separate package -- Hono ships no built-in rate limiter
import { cors } from 'hono/cors';

@post({
  configs: {
    path: '/upload',
    middleware: [
      rateLimiter({ windowMs: 60_000, limit: 10 }),
      cors({ origin: 'https://myapp.com' }),
    ],
    authenticate: { strategies: ['jwt'] },
    // ...
  },
})
async uploadFile(context: TRouteContext) { /* ... */ }
```

Middleware execution order: `authenticate` -> `authorize` -> custom middleware -> handler.

### Request Validation with Zod

Routes automatically validate request parameters, query strings, headers, and body against Zod schemas. Invalid requests return a `422 Unprocessable Entity` with structured error details:

```typescript
@post({
  configs: {
    path: '/',
    request: {
      body: jsonContent({
        schema: z.object({
          email: z.string().email('Invalid email format'),
          age: z.number().int().min(18, 'Must be at least 18'),
          role: z.enum(['admin', 'user', 'moderator']),
        }),
        description: 'New user data',
      }),
      query: z.object({
        dryRun: z.string().optional().transform(v => v === 'true'),
      }),
      headers: z.object({
        'x-api-key': z.string().min(1),
      }),
    },
    responses: jsonResponse({ schema: UserSchema }),
  },
})
async createUser(context: TRouteContext) {
  const body = context.req.valid<{ email: string; age: number; role: string }>('json');
  const { dryRun } = context.req.valid<{ dryRun?: boolean }>('query');
  const apiKey = context.req.valid<{ 'x-api-key': string }>('header');
  // All validated -- proceed safely
}
```

On validation failure, the error handler returns:

```json
{
  "message": "Invalid email format",
  "messageCode": "invalid_format",
  "statusCode": 422,
  "requestId": "abc-123",
  "details": {
    "url": "http://localhost:3000/api/users",
    "path": "/api/users",
    "cause": [
      { "path": "email", "message": "Invalid email format", "code": "invalid_format" },
      { "path": "age", "message": "Must be at least 18", "code": "too_small" }
    ]
  }
}
```

Top-level `message`/`messageCode` come from the first Zod issue (or a schema-supplied `params.code`, if present); `"ValidationError"` is only used as a fallback when no issue list can be parsed at all. `details.stack` is included alongside `cause` outside production.

### Accessing Hono Context

The `context` parameter (`TRouteContext`) provides full access to the Hono request/response:

```typescript
async myHandler(context: TRouteContext) {
  // Request data
  const body = context.req.valid<MyType>('json');
  const params = context.req.valid<{ id: number }>('param');
  const query = context.req.valid<{ page: number }>('query');

  // Raw request access
  const url = context.req.url;
  const method = context.req.method;
  const path = context.req.path;
  const userAgent = context.req.header('user-agent');
  const allHeaders = context.req.raw.headers;

  // Authenticated user (set by auth middleware)
  const currentUser = context.get('auth.current.user');
  const auditUserId = context.get('audit.user.id');

  // Set response headers
  context.header('X-Custom-Header', 'value');
  context.header('Cache-Control', 'no-store');

  // Response types
  return context.json({ data: 'value' }, 200);
  return context.text('plain text', 200);
  return context.html('<h1>Hello</h1>');
  return context.redirect('/other-page');
  return context.body(null, 204);  // No content
}
```

### File Upload Handling

```typescript
@post({
  configs: {
    path: '/upload',
    authenticate: { strategies: ['jwt'] },
    responses: jsonResponse({ schema: z.object({ filename: z.string(), size: z.number() }) }),
  },
})
async upload(context: TRouteContext) {
  const body = await context.req.parseBody();
  const file = body['file'];

  if (file instanceof File) {
    const buffer = await file.arrayBuffer();
    // Process file...
    return context.json({ filename: file.name, size: file.size }, 200);
  }

  return context.json({ message: 'No file provided' }, 400);
}
```

### Streaming Responses

```typescript
@get({
  configs: {
    path: '/stream',
    responses: { 200: { description: 'Streamed response' } },
  },
})
async streamData(context: TRouteContext) {
  return context.body(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('chunk 1\n'));
        setTimeout(() => {
          controller.enqueue(new TextEncoder().encode('chunk 2\n'));
          controller.close();
        }, 1000);
      },
    }),
    200,
    { 'Content-Type': 'text/plain' },
  );
}
```

### JSX Server-Side Rendering

```typescript
this.defineJSXRoute({
  configs: {
    path: '/profile',
    method: 'get',
    description: 'User profile page',
    authenticate: { strategies: ['jwt'] },
    responses: htmlResponse({ description: 'Rendered profile page' }),
  },
  handler: (context) => {
    const user = context.get('auth.current.user');
    return context.html(<ProfilePage user={user} />);
  },
});
```

### Route Decorators

| Decorator | Description |
| --- | --- |
| `@controller({ path })` | Class decorator -- registers controller base path |
| `@get({ configs })` | GET route -- method is set automatically |
| `@post({ configs })` | POST route |
| `@put({ configs })` | PUT route |
| `@patch({ configs })` | PATCH route |
| `@del({ configs })` | DELETE route |
| `@api({ configs })` | Generic route -- specify method in configs |

### Route Configuration

```typescript
interface IAuthRouteConfig extends HonoRouteConfig {
  path: string;
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  description?: string;
  tags?: string[];

  // Authentication
  authenticate?: {
    strategies?: ('jwt' | 'basic')[];
    mode?: 'any' | 'all';
  };

  // Authorization (Casbin RBAC)
  authorize?: IAuthorizationSpec | IAuthorizationSpec[];

  // Request schema validation
  request?: {
    body?: ContentConfig;
    query?: ZodSchema;
    params?: ZodSchema;
    headers?: ZodSchema;
  };

  // Response schema
  responses: Record<number | string, ResponseConfig>;

  // Additional Hono middleware
  middleware?: MiddlewareHandler[];
}
```

### Controller Factory

Auto-generate a full CRUD controller from an entity definition:

```typescript
import { ControllerFactory } from '@venizia/ignis';

const UserCrudController = ControllerFactory.defineCrudController({
  entity: User,
  repository: { name: 'UserRepository' },
  controller: {
    name: 'UserCrudController',
    basePath: '/users',
    isStrict: {
      path: true,            // Strict path matching
      requestSchema: true,   // Strict Zod request validation
    },
  },
  authenticate: { strategies: ['jwt'] },
  authorize: { action: 'manage', resource: 'User' },
  routes: {
    find: { authenticate: { skip: true } },      // Public read -- also skips authorization
    findById: { authenticate: { skip: true } },   // Public read
    count: { authenticate: { skip: true } },       // Public read
    create: {
      request: { body: CustomCreateSchema },       // Override request body schema
    },
    deleteById: {
      authorize: { action: 'delete', resource: 'User' },  // Override authorization
    },
  },
});
```

This generates the following endpoints:

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/count` | Count records matching where condition |
| `GET` | `/` | Find all records (paginated, with Content-Range header) |
| `GET` | `/{id}` | Find record by ID |
| `GET` | `/find-one` | Find first matching record |
| `POST` | `/` | Create new record |
| `PATCH` | `/{id}` | Update record by ID |
| `PATCH` | `/` | Bulk update matching records |
| `DELETE` | `/{id}` | Delete record by ID |
| `DELETE` | `/` | Bulk delete matching records |

Each generated endpoint includes:

- OpenAPI schema documentation derived from entity Zod schemas (select, create, update).
- Conditional count response via `x-request-count` header -- send `x-request-count: false` to get data only without the wrapping `{ count, data }` object.
- Content-Range header for paginated find results (e.g., `records 0-19/150`).
- Authentication and authorization middleware from controller-level or route-level config.
- `X-Response-Count` response header with the count of returned records.

#### Customizing Controller Factory Routes

Per-route auth configuration priority:

1. If a route has `authenticate: { skip: true }` -- no authentication AND no authorization for that route.
2. If a route has `authenticate: { strategies, mode }` -- uses these, overriding controller defaults.
3. If a route has `authorize: { skip: true }` -- keeps authentication but skips authorization.
4. Otherwise -- uses controller-level `authenticate` and `authorize`.

You can override request/response schemas per route:

```typescript
routes: {
  create: {
    request: { body: CustomCreateSchema },           // Custom request body
    response: { schema: CustomResponseSchema },      // Custom response schema
  },
  find: {
    request: { query: CustomFilterQuerySchema },     // Custom query params
    response: { headers: { 'X-Total': { description: 'Total count', schema: { type: 'string' } } } },
  },
}
```

---

## Repositories

### Hierarchy

```
AbstractRepository<TDataObject, TPersistObject, TOptions>
  extends BaseHelper                     (engine-neutral: lazy dataSource/entity resolution, class-keyed
  |                                        @model settings getters -- hiddenFields/defaultWhere/defaultLimit --
  |                                        all CRUD verbs abstract)
  |
  +-- PostgresBaseRepository              (+ FilterBuilder, hidden-column query/RETURNING plumbing, drizzle wiring)
        |
        +-- ReadableRepository        (read operations only -- write operations throw errors)
              |
              +-- PersistableRepository   (+ create, update, delete operations)
                    |
                    +-- DefaultCRUDRepository  (alias -- identical to PersistableRepository)
                    +-- SoftDeletableRepository (extends DefaultCRUDRepository -- soft-delete semantics)
```

`AbstractRepository` is the single engine-neutral base every connector's hierarchy extends directly -- the search branch (Typesense) re-parents its own `TypesenseBaseRepository` onto it the same way. `PersistableRepository` is the recommended base class for most use cases. `DefaultCRUDRepository` is a convenience alias. Use `ReadableRepository` when you need a repository that should only read data (e.g., reporting views, read replicas).

### Defining a Repository

```typescript
// Zero boilerplate -- DataSource auto-injected from @repository metadata
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends PersistableRepository<typeof User.schema> {
  // No constructor needed!
}

// Or with explicit @inject for more control
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends PersistableRepository<typeof User.schema> {
  constructor(
    @inject({ key: 'datasources.PostgresDataSource' }) dataSource: PostgresDataSource,
  ) {
    super(dataSource);
  }

  // Custom methods
  async findByEmail(email: string) {
    return this.findOne({ filter: { where: { email } } });
  }

  async findActiveUsers() {
    return this.find({
      filter: {
        where: { status: 'active' },
        order: ['createdAt DESC'],
      },
    });
  }
}
```

**Important:** Both `model` AND `dataSource` are required in `@repository` for schema auto-discovery. Without both, the model will not be registered in the datasource schema and relational queries will fail.

### Read Operations

#### `count()` -- Count Records

```typescript
// Simple count
const { count } = await repository.count({ where: { status: 'active' } });

// Count with complex conditions
const { count } = await repository.count({
  where: {
    and: [
      { role: { inq: ['admin', 'moderator'] } },
      { createdAt: { gte: new Date('2024-01-01') } },
      { or: [{ isVerified: true }, { score: { gt: 100 } }] },
    ],
  },
});

// Count within a transaction
const { count } = await repository.count({
  where: { status: 'pending' },
  options: { transaction: tx },
});
```

#### `existsWith()` -- Check Existence

```typescript
const emailTaken = await repository.existsWith({
  where: { email: 'john@example.com' },
});

if (emailTaken) {
  throw new Error('Email already in use');
}
```

#### `find()` -- Find All Records

```typescript
// Basic find with filter
const users = await repository.find({
  filter: {
    where: { status: 'active' },
    fields: ['id', 'name', 'email'],
    order: ['createdAt DESC'],
    limit: 20,
    skip: 0,
  },
});

// Find with pagination range info
const { data, range } = await repository.find({
  filter: { where: { status: 'active' }, limit: 20, skip: 40 },
  options: { shouldQueryRange: true },
});
// data = User[] (the 20 records)
// range = { start: 40, end: 59, total: 150 }

// Find with relation inclusion (uses Query API)
const usersWithPosts = await repository.find({
  filter: {
    where: { isActive: true },
    include: [
      { relation: 'posts', scope: { where: { isPublished: true }, limit: 5 } },
    ],
  },
});

// Find all (bypass default filter for admin views)
const allUsers = await repository.find({
  filter: {},
  options: { shouldSkipDefaultFilter: true },
});

// Find with transaction
const users = await repository.find({
  filter: { where: { batchId: currentBatch } },
  options: { transaction: tx },
});

// Find with row-level locking (requires a transaction; incompatible with include/fields)
const users = await repository.find({
  filter: { where: { status: 'active' } },
  options: { transaction: tx, lock: { strength: 'update' } },
});
```

#### `findOne()` vs `findById()` -- Differences

`findOne()` accepts a full filter with `where`, `fields`, `include`, and `order`. It returns the first matching record:

```typescript
const user = await repository.findOne({
  filter: {
    where: { email: 'john@example.com' },
    fields: ['id', 'name', 'email'],
    include: [{ relation: 'profile' }],
  },
});
// Returns User | null
```

`findById()` is a convenience wrapper around `findOne()` that automatically sets `where: { id }`. It accepts an optional filter **without** the `where` clause:

```typescript
const user = await repository.findById({
  id: 42,
  filter: {
    fields: ['id', 'name', 'email'],
    include: [{ relation: 'posts' }],
  },
});
// Returns User | null
// Equivalent to: findOne({ filter: { where: { id: 42 }, fields: [...], include: [...] } })
```

### Write Operations

#### `create()` -- Create Single Record

```typescript
// Create and return the created record (default: shouldReturn = true)
const { count, data } = await repository.create({
  data: { username: 'john', email: 'john@example.com', role: 'user' },
});
// count = 1, data = { id: 1, username: 'john', ... }

// Create without returning data (faster -- skips RETURNING clause)
const { count } = await repository.create({
  data: { username: 'john', email: 'john@example.com' },
  options: { shouldReturn: false },
});
// count = 1, data = null

// Create within a transaction
const { data: user } = await repository.create({
  data: { username: 'john', email: 'john@example.com' },
  options: { transaction: tx },
});
```

#### `createAll()` -- Bulk Create

```typescript
// Bulk create and return all records
const { count, data } = await repository.createAll({
  data: [
    { username: 'john', email: 'john@example.com' },
    { username: 'jane', email: 'jane@example.com' },
    { username: 'bob', email: 'bob@example.com' },
  ],
});
// count = 3, data = [{ id: 1, ... }, { id: 2, ... }, { id: 3, ... }]

// Bulk create without returning (faster for large inserts)
const { count } = await repository.createAll({
  data: largeDataArray,
  options: { shouldReturn: false },
});
```

#### `updateById()` -- Update Single Record

```typescript
// Update by ID and return the updated record
const { count, data } = await repository.updateById({
  id: 42,
  data: { email: 'new@example.com', status: 'verified' },
});
// count = 1, data = { id: 42, email: 'new@example.com', ... }

// Update JSON fields using dot notation
const { data } = await repository.updateById({
  id: 42,
  data: {
    'metadata.theme': 'dark',
    'metadata.notifications.email': false,
  },
});
```

#### `updateAll()` / `updateBy()` -- Bulk Update

```typescript
// Update all matching records
const { count, data } = await repository.updateAll({
  data: { status: 'inactive' },
  where: { lastLoginAt: { lt: new Date('2024-01-01') } },
});
// count = 25, data = [...25 updated records...]

// updateBy is an alias for updateAll
const { count } = await repository.updateBy({
  data: { isNotified: true },
  where: { role: 'subscriber' },
  options: { shouldReturn: false },
});

// SAFETY: Empty where throws an error to prevent accidental mass updates
// Use force: true to explicitly allow it
const { count } = await repository.updateAll({
  data: { version: 2 },
  where: {},
  options: { force: true },
});
```

### Delete Operations

```typescript
// Delete by ID (returns deleted record)
const { count, data } = await repository.deleteById({ id: 42 });
// count = 1, data = { id: 42, username: 'john', ... }

// Delete all matching records
const { count, data } = await repository.deleteAll({
  where: { status: 'inactive' },
});

// deleteBy is an alias for deleteAll
const { count } = await repository.deleteBy({
  where: { expiresAt: { lt: new Date() } },
  options: { shouldReturn: false },
});

// SAFETY: Empty where throws an error. Use force: true to allow.
const { count } = await repository.deleteAll({
  where: {},
  options: { force: true, shouldReturn: false },
});
```

### Filter System

```typescript
interface TFilter<T> {
  where?: TWhere<T>;       // Query conditions
  fields?: TFields;        // Column selection
  include?: TInclusion[];  // Relation loading
  order?: string[];        // Sorting (e.g., ['createdAt DESC', 'name ASC'])
  limit?: number;          // Max results (default: 10)
  skip?: number;           // Offset
  offset?: number;         // Fallback for skip -- if both are set, skip wins
}
```

#### Where Operators

Comparison (`eq`/`neq`/`gt`/`gte`/`lt`/`lte`), pattern matching (`like`/`ilike`/`regexp` and negations), array/set (`inq`/`nin`/`between`/`notBetween`), null checks (`is`/`isn`), logical (`and`/`or`), and PostgreSQL array-column operators (`contains`/`containedBy`/`overlaps`) are all supported. JSON path queries (dot notation into `json`/`jsonb` columns, with automatic numeric casting for comparison operators) and JSON path sorting work the same way. Full operator tables: [Filter System Quick Reference](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/references/base/filter-system/quick-reference.md).

```typescript
// Comparison + pattern matching
const users = await repository.find({
  filter: { where: { age: { gte: 18 }, email: { ilike: '%@gmail.com' } } },
});

// Array/set + logical
const users = await repository.find({
  filter: { where: { and: [{ status: { inq: ['active', 'pending'] } }, { role: { neq: 'guest' } }] } },
});

// JSON path query (dot notation into a jsonb column)
const users = await repository.find({
  filter: { where: { 'metadata.score': { gt: 50, lte: 100 } } },
});
```

#### Field Selection

```typescript
// Array format -- include only these columns
const users = await repository.find({
  filter: { fields: ['id', 'name', 'email'] },
});

// Object format -- include/exclude
const users = await repository.find({
  filter: { fields: { id: true, name: true, password: false } },
});
```

#### Relation Inclusion

```typescript
// Simple inclusion
const users = await repository.find({
  filter: {
    include: [{ relation: 'posts' }],
  },
});

// With nested filter (scope)
const users = await repository.find({
  filter: {
    include: [{
      relation: 'posts',
      scope: {
        where: { isPublished: true },
        limit: 5,
        order: ['createdAt DESC'],
        include: [{ relation: 'comments' }],  // Nested relations
      },
    }],
  },
});

// Skip default filter on a specific relation
const users = await repository.find({
  filter: {
    include: [{
      relation: 'archivedPosts',
      shouldSkipDefaultFilter: true,  // Show soft-deleted posts
    }],
  },
});
```

Note: Relations are defined on the model via `static relations`. The FilterBuilder resolves relation configurations from the MetadataRegistry and applies hidden property exclusion and default filters to included relations automatically.

### `shouldQueryRange` -- Range Object

When `shouldQueryRange: true` is passed to `find()`, the method runs both the data fetch and a count query in parallel, then returns:

```typescript
const result = await repository.find({
  filter: { where: { status: 'active' }, limit: 10, skip: 20 },
  options: { shouldQueryRange: true },
});

// result.data = User[] (the 10 records)
// result.range = { start: 20, end: 29, total: 150 }
```

This follows the HTTP Content-Range header standard. The ControllerFactory uses this to set `Content-Range: records 20-29/150` headers.

### `shouldSkipDefaultFilter` -- When and Why

The `shouldSkipDefaultFilter` option bypasses the model's `defaultFilter`. Common use cases:

```typescript
// Admin panel showing all records (including soft-deleted)
const allUsers = await repository.find({
  filter: {},
  options: { shouldSkipDefaultFilter: true },
});

// Data migration or cleanup script
const deletedUsers = await repository.find({
  filter: { where: { isDeleted: true } },
  options: { shouldSkipDefaultFilter: true },
});

// Export all data for backup
const everything = await repository.find({
  filter: {},
  options: { shouldSkipDefaultFilter: true, shouldQueryRange: true },
});
```

### ExtraOptions

All repository operations accept an `options` parameter. The base shape is `IExtraOptions`:

```typescript
interface IExtraOptions {
  transaction?: ITransaction;          // Use within a transaction
  log?: { use: boolean; level?: TLogLevel }; // Enable operation logging (write operations only)
  shouldSkipDefaultFilter?: boolean;   // Bypass model's default filter
  lock?: {                             // Row-level locking. Requires a transaction; incompatible
    strength: 'update' | 'no key update' | 'share' | 'key share'; // with include/fields (Query API)
    config?: { noWait?: true } | { skipLocked?: true };
  };
}
```

`shouldReturn` and `shouldQueryRange` are **not** part of `IExtraOptions` -- they only exist as ad-hoc intersections on the specific methods that support them: `shouldReturn` on `create`/`createAll`/`updateById`/`updateAll`/`deleteById`/`deleteAll` (`options: IExtraOptions & { shouldReturn?: boolean }`), and `shouldQueryRange` only on `find` (`options: IExtraOptions & { shouldQueryRange?: boolean }`). `count`/`existsWith` accept neither.

`log: { use: true }` is only honored by write operations (`create`/`updateById`/`deleteById`/etc.) -- read operations (`find`/`findOne`/`count`/`existsWith`) never inspect it.

### Hidden Fields and Default Filter

This behavior lives directly on the repository hierarchy now, not in separate mixins: `AbstractRepository` (`src/base/repositories/core/`) exposes the class-keyed `@model` settings as protected getters -- `hiddenFields`, `defaultWhere`, `defaultLimit` -- resolved once per entity class and memoized; `PostgresBaseRepository` (`src/connectors/postgres/repositories/core/`) is where those getters actually get applied to SQL, via its own `getHiddenProperties()`/`getVisibleProperties()`/`buildQuery()`/`applyDefaultFilter()`. The two mixins this section used to describe (`FieldsVisibilityMixin`, `DefaultFilterMixin`, under `src/connectors/postgres/repositories/mixins/`) are legacy -- no longer composed onto any repository class -- and are not exported from any barrel.

#### Hidden fields

Automatically excludes properties listed in `@model({ settings: { hiddenProperties } })` from all query results at the SQL level -- not post-processing:

```typescript
@model({
  type: 'entity',
  settings: { hiddenProperties: ['password', 'secretToken'] },
})
export class User extends BasePostgresEntity<typeof User.schema> { ... }

// All repository queries automatically exclude 'password' and 'secretToken'
const user = await userRepository.findById({ id: 1 });
// user.password === undefined (never selected from DB)

// Hidden fields are excluded from:
// - find() / findOne() / findById() SELECT queries
// - create() RETURNING clauses
// - updateById() / updateAll() RETURNING clauses
// - deleteById() / deleteAll() RETURNING clauses
// - Included relation queries (applied recursively)
```

`PostgresBaseRepository.getVisibleProperties()` caches the visible property set for performance. It computes it once from the schema columns minus hidden properties.

#### Default filter

Automatically applies a default filter to all queries. Common use case -- soft delete:

```typescript
@model({
  type: 'entity',
  settings: { defaultFilter: { where: { isDeleted: false } } },
})
export class User extends BasePostgresEntity<typeof User.schema> { ... }

// All queries automatically add WHERE is_deleted = false
const users = await userRepository.find({ filter: {} });

// The default filter merges with user-provided filters:
const activeAdmins = await userRepository.find({
  filter: { where: { role: 'admin' } },
});
// SQL: WHERE is_deleted = false AND role = 'admin'

// Bypass when needed (e.g., admin panel showing all records)
const allUsers = await userRepository.find({
  filter: {},
  options: { shouldSkipDefaultFilter: true },
});
```

Merge strategy: `where` conditions are deep-merged (user values override matching keys); all other filter fields (`limit`, `order`, etc.) -- user completely replaces default if provided.

### Dual Query API

Repositories use two internal query paths:

- **Core API** (`connector.select().from()`): 15--20% faster. Used for queries without relation inclusion and without explicit field selection. Builds SQL directly via Drizzle's core select/where/orderBy/limit/offset.
- **Query API** (`connector.query.EntityName.findMany()`): Supports `include` for relation loading and field selection via `columns`. Used when the filter contains `include` or `fields`.

The repository automatically selects the appropriate API based on whether `include` or `fields` are present in the filter via `canUseCoreAPI()`. You do not need to think about this -- it is transparent.

### UpdateBuilder -- JSON Path Updates

The `UpdateBuilder` transforms data containing dot-notation JSON path keys into chained `jsonb_set()` calls:

```typescript
// Input data:
{ name: 'John', 'metadata.settings.theme': 'dark', 'metadata.version': 2 }

// Generates SQL:
// UPDATE users SET
//   name = 'John',
//   metadata = jsonb_set(jsonb_set("metadata", '{settings,theme}', '"dark"'::jsonb, true), '{version}', '2'::jsonb, true)
// WHERE id = 42
```

Multiple path updates to the same JSON column are chained into a single expression. The `create_missing` parameter is set to `true`, so intermediate keys are created if they do not exist.

---

## Models

### BasePostgresEntity

All entities extend `BasePostgresEntity` and define a static `schema` using Drizzle's `pgTable`:

```typescript
import { model } from '@venizia/ignis';
import { BasePostgresEntity, TRelationConfig } from '@venizia/ignis/postgres';
import { pgTable, text, jsonb, boolean } from 'drizzle-orm/pg-core';

@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['password', 'secretToken'],
    defaultFilter: { where: { isDeleted: false } },
  },
})
export class User extends BasePostgresEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs({
      deleted: { enable: true, columnName: 'deleted_at', withTimezone: true },
    }),
    ...generateUserAuditColumnDefs(),
    username: text('username').notNull().unique(),
    email: text('email').notNull().unique(),
    password: text('password'),
    secretToken: text('secret_token'),
    role: text('role').default('user'),
    isDeleted: boolean('is_deleted').default(false),
    metadata: jsonb('metadata').$type<{ theme?: string; score?: number }>(),
  });

  static override relations = (): TRelationConfig[] => [
    // 'many' side: no fields/references -- relationName points at the 'one' relation declared on Post
    { name: 'posts', type: 'many', schema: Post.schema, metadata: { relationName: 'author' } },
    // 'one' side: fields/references establish the FK, since it's declared on this table
    { name: 'profile', type: 'one', schema: Profile.schema, metadata: { fields: [Profile.schema.userId], references: [User.schema.id] } },
  ];

  static override TABLE_NAME = 'User';
}
```

### @model Decorator

```typescript
@model({
  type: 'entity',                          // Entity type identifier
  settings: {
    hiddenProperties: ['password'],        // Excluded from all queries at SQL level
    defaultFilter: { where: { isDeleted: false } },  // Auto-applied to all queries
  },
})
```

When `@model` is applied, it registers the class with the `MetadataRegistry`, extracting:

- The static `schema` (pgTable definition)
- The static `relations` (relation configuration array or resolver function)
- The model metadata (type, settings)

### Schema Generation

`BasePostgresEntity` provides `getSchema()` for Zod schema generation from the Drizzle table using `drizzle-zod`:

```typescript
const entity = new User();

entity.getSchema({ type: 'select' });  // Zod schema for SELECT results -- all fields as returned from DB
entity.getSchema({ type: 'create' });  // Zod schema for INSERT data -- required/optional based on column definitions
entity.getSchema({ type: 'update' });  // Zod schema for UPDATE data -- all fields optional (partial)
```

These schemas are used by `ControllerFactory` to auto-generate OpenAPI documentation. The schema factory is lazily initialized and shared across all BasePostgresEntity instances for performance.

### Static `relations` Definition

Relations are defined as a static property or function returning an array of `TRelationConfig`:

```typescript
static override relations = (): TRelationConfig[] => [
  {
    name: 'posts',
    type: 'many',          // RelationTypes.MANY -- no fields/references; relationName points
    schema: Post.schema,    // at the 'one' relation declared on the other side (Post)
    metadata: {
      relationName: 'author',
    },
  },
  {
    name: 'profile',
    type: 'one',            // RelationTypes.ONE -- the FK-owning side declares fields/references
    schema: Profile.schema,
    metadata: {
      fields: [Profile.schema.userId],
      references: [User.schema.id],
    },
  },
];
```

These relations are used by the `FilterBuilder` when processing `include` in filters, and by the DataSource's `discoverSchema()` to build Drizzle relation definitions.

### Enrichers

Column definition helpers that spread common column patterns into a `pgTable` schema:

| Enricher | Adds |
| --- | --- |
| `generateIdColumnDefs()` | Primary key column -- auto-increment integer (default), UUID string, big-number, or custom string generator |
| `generateTzColumnDefs()` | `created_at`/`modified_at` timestamps (with timezone, auto `$onUpdate`), optional `deleted_at` for soft delete |
| `generateUserAuditColumnDefs()` | `created_by`/`modified_by`, auto-populated from `context.get('audit.user.id')` on create/update |
| `generatePrincipalColumnDefs()` | Polymorphic discriminator pair (`principal_id`/`principal_type` by default) |
| `generateDataTypeColumnDefs()` | Multi-type value columns (`data_type` + `n_value`/`t_value`/`b_value`/`j_value`/`bo_value`) for key-value/settings tables |

Full options and generated-column tables: [Models reference](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/references/base/models.md).

---

## DataSources

### BasePostgresDataSource

DataSources manage database connections and provide Drizzle connectors:

```typescript
abstract class BasePostgresDataSource<Settings, Schema> extends AbstractPostgresDataSource {
  // Implemented by subclass
  abstract configure(): ValueOrPromise<void>;
  abstract getConnectionString(): ValueOrPromise<string>;

  // Auto-discovers schema from @repository bindings
  getSchema(): Schema;

  // Check if any repositories reference this datasource
  hasDiscoverableModels(): boolean;

  // Transaction support -- postgres's own IDatabaseTransactionOptions/IDatabaseTransaction<Schema>,
  // narrowing the neutral ITransactionOptions/ITransaction from AbstractDataSource
  beginTransaction(opts?: IDatabaseTransactionOptions): Promise<IDatabaseTransaction<Schema>>;
}
```

#### Capability Probe

Every datasource -- regardless of connector -- exposes `getCapabilities(): { transactions: boolean }`. `AbstractDataSource` (the engine-neutral root every connector extends) defaults it to `{ transactions: false }`, paired with a `beginTransaction()` default that throws the standardized NotSupported error (`core.not_supported`, HTTP 501). `BasePostgresDataSource` (postgres) is the one connector that overrides both: `getCapabilities()` reports `{ transactions: true }`, and `beginTransaction()` is a real implementation (below) instead of the inherited throw. `TypesenseDataSource` adds no override -- it inherits the neutral NotSupported default from `AbstractDataSource` directly. Check `getCapabilities().transactions` before calling `beginTransaction()` on a datasource whose connector isn't known ahead of time.

### Complete DataSource Configuration

```typescript
@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BasePostgresDataSource<IDSConfigs> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: {
        host: process.env.DB_HOST!,
        port: +(process.env.DB_PORT ?? 5432),
        database: process.env.DB_NAME!,
        user: process.env.DB_USER!,
        password: process.env.DB_PASSWORD!,
        // pg Pool options:
        max: 20,                        // max pool connections
        idleTimeoutMillis: 30000,       // close idle clients after 30s
        connectionTimeoutMillis: 5000,  // timeout connecting after 5s
      },
    });
  }

  override configure(): ValueOrPromise<void> {
    const schema = this.getSchema();  // Auto-discovers from repositories
    this.pool = new Pool(this.settings);
    this.connector = drizzle({ client: this.pool, schema });
  }

  override getConnectionString() {
    const { host, port, user, password, database } = this.settings;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

### Schema Auto-Discovery

DataSources do not need manual schema configuration. When `getSchema()` is called during `configure()`, the DataSource:

1. Queries the `MetadataRegistry` for all `@repository` bindings that reference this DataSource class.
2. For each binding, extracts the model's static `schema` (pgTable) and `relations`.
3. Combines them into a single schema object: `{ User: User.schema, Post: Post.schema, ...relations }`.
4. Caches the result.

This means adding a new model + repository automatically makes it available to all queries without touching the DataSource code.

### Transaction Deep Dive

```typescript
const tx = await dataSource.beginTransaction({
  isolationLevel: 'READ COMMITTED',  // default
});

try {
  await userRepository.create({
    data: { username: 'john', email: 'john@example.com' },
    options: { transaction: tx },
  });

  await auditRepository.create({
    data: { action: 'user_created', userId: newUser.id },
    options: { transaction: tx },
  });

  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
}
```

`beginTransaction()` acquires a dedicated `PoolClient` and returns an `IDatabaseTransaction<Schema>` (`connector`, `commit()`, `rollback()`, `isolationLevel`, `isActive`); passing `{ transaction: tx }` to a repository method routes it through that dedicated connector instead of the DataSource's shared pool, and `commit()`/`rollback()` always release the client back to the pool. Full internals: [Transactions guide](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/guides/core-concepts/persistent/transactions.md).

#### Isolation Levels

| Level | Constant | When to Use |
| --- | --- | --- |
| `READ COMMITTED` | `IsolationLevels.READ_COMMITTED` | Default. Each statement sees only data committed before it began. Sufficient for most CRUD operations. |
| `REPEATABLE READ` | `IsolationLevels.REPEATABLE_READ` | All statements in the transaction see a snapshot from the start. Use for consistent reads across multiple queries (e.g., generating reports). |
| `SERIALIZABLE` | `IsolationLevels.SERIALIZABLE` | Strictest. Transactions behave as if they ran sequentially. Use for financial operations or inventory management where absolute consistency is required. May cause serialization failures requiring retry. |

#### Connection Release

Connections are always released back to the pool in the `finally` block of both `commit()` and `rollback()`. This means even if the commit or rollback SQL fails, the connection is still released, preventing pool exhaustion.

---

## Search

IGNIS has a second, engine-neutral branch for search-only entities backed by Typesense instead of Postgres. It mirrors the SQL branch -- same `@model`/`@repository` decorators, same `TFilter`/where-operator vocabulary, same hidden-field/default-filter/default-limit behavior -- but returns a slightly different envelope in a few places (see below).

### Search Entities

Search entities extend `BaseSearchEntity` and define a static `definition` via `defineSearchCollection` + the `field` DSL, instead of Drizzle's `pgTable`. Same as `BasePostgresEntity`, apply `@model` so `hiddenProperties`/`defaultFilter`/`defaultLimit` are registered:

```typescript
import { model } from '@venizia/ignis';
import { BaseSearchEntity, defineSearchCollection, field } from '@venizia/ignis/typesense';

@model({
  type: 'entity',
  settings: { hiddenProperties: ['internalNotes'], defaultLimit: 20 },
})
export class Product extends BaseSearchEntity {
  static override definition = defineSearchCollection({
    name: 'products',
    fields: [
      field.id(),
      field.string('name', { searchable: true, sortable: true }),
      field.number('price', { filterable: true, sortable: true }),
      field.string('internalNotes', { optional: true }),
    ],
    defaultSort: 'price',
  });
}
```

`field.id()` is optional -- `defineSearchCollection` prepends it automatically when missing. `defaultSort` must reference a `number` field; Typesense's `default_sorting_field` only accepts a scalar numeric field, never a string or array.

### Search DataSources

`TypesenseDataSource` is a `BaseSearchDataSource` subclass, imported from a dedicated sub-path so the root `@venizia/ignis` barrel never pulls in the `typesense` client:

```typescript
import { DataSourceDrivers, datasource } from '@venizia/ignis';
import { TypesenseDataSource } from '@venizia/ignis/typesense';

@datasource({ driver: DataSourceDrivers.TYPESENSE })
export class ProductSearchDataSource extends TypesenseDataSource {
  constructor() {
    super({
      name: ProductSearchDataSource.name,
      config: {
        nodes: [{ host: process.env.TYPESENSE_HOST!, port: +(process.env.TYPESENSE_PORT ?? 8108) }],
        apiKey: process.env.TYPESENSE_API_KEY!,
      },
    });
  }
}
```

`typesense` is an optional peer dependency -- install it yourself (`bun add typesense`) if you use the search branch.

Same as the postgres branch, collections are discovered from `@repository` bindings and auto-provisioned (via `ensureCollection()`, additive-only) when the DataSource's `configure()` runs during boot. Opt out with:

- `autoProvision: false` in the `super({ ... })` call -- skips provisioning, discovery still runs.
- `@datasource({ autoDiscovery: false })` -- skips discovery entirely (`getSchema()` returns `{}`).

`getClient()` returns the raw typesense `Client`, an escape hatch symmetric to the SQL branch's `pg.Pool` access:

```typescript
const client = productSearchDataSource.getClient();
```

### Search Repositories

Same tiered hierarchy as the SQL branch, over Typesense instead of Postgres:

```
ReadableSearchRepository        (read operations only)
  |
  +-- PersistableSearchRepository   (+ create, update)
        |
        +-- DefaultSearchRepository     (+ delete)
```

`TSearchDocument<typeof X.schema>` derives the document type straight from the collection definition -- same idea as postgres's `typeof User.schema` inference, no hand-written interface needed:

```typescript
import { repository } from '@venizia/ignis';
import { DefaultSearchRepository, TSearchDocument } from '@venizia/ignis/typesense';

type ProductDocument = TSearchDocument<typeof Product.schema>;
// -> { id: string; name: string; price: number; internalNotes?: string }

@repository({ model: Product, dataSource: ProductSearchDataSource })
export class ProductSearchRepository extends DefaultSearchRepository<ProductDocument> {
  // No constructor needed -- dataSource auto-injected from @repository metadata
}
```

`TSearchDocument` only resolves field-level types when the collection is captured through `defineSearchCollection`'s `const` type param -- true as long as you call it directly on a `static schema = defineSearchCollection({ ... })` assignment, as above. `id` is always inferred as a required `string`; fields marked `{ optional: true }` become optional properties, everything else is required.

`@repository`, `TFilter`, and the where operators (`eq`, `gt`, `inq`, `and`/`or`, ...) work the same as the SQL branch -- `TFilter`/`TWhere` is translated into Typesense search params by `TypesenseQueryDialect`. Operators that can't be expressed as a Typesense `filter_by` throw instead of silently degrading:

- `like` / `ilike` (and their negations)
- JSON-path fields (e.g. `'metadata.score'`)
- `include` (relations)

Reach for the repository's `search()` method when you need one of these -- it's a raw passthrough to the driver (no dialect translation, no default filter applied).

`hiddenProperties`, `defaultFilter`, and `defaultLimit` from `@model` settings are honored the same way they are for the SQL branch: hidden fields become Typesense `exclude_fields`, `defaultFilter` is AND-merged into every query, and an omitted `limit` falls back to `defaultLimit` then `DEFAULT_LIMIT` (10).

Note "the same way" covers hidden-fields/limit fallback, not the `where` merge policy: the search branch (like memory) always AND-merges `defaultFilter.where` with the user's `where`, while Postgres deep-merges with the user filter winning key-by-key (`merge({}, defaultWhere, userWhere)`, `filter.ts`) -- see the memory connector section below for the concrete difference.

### Envelope Differences vs SQL

`create()`/`createAll()` are overloaded by `shouldReturn` the same way on both branches, and every write verb now returns `{ count, data }` on both branches too -- but Typesense has no `RETURNING` equivalent, so a few return shapes and constraints still differ underneath that shared envelope:

| Aspect | SQL | Search |
| --- | --- | --- |
| `deleteById()` `data` | The deleted row, straight from `RETURNING` | Populated only when the model has a `defaultFilter` -- its guard read (a `findById()` done to check the row isn't excluded) is the only document Typesense ever hands back. No `defaultFilter` means no guard read, so `data` is `null` even with `shouldReturn: true` |
| `deleteAll()` / `deleteBy()` `data` | The deleted rows via `RETURNING`, always in lockstep with `count` | A `find()` snapshot taken *before* the delete, capped at `defaultLimit`/`DEFAULT_LIMIT` (10) like any other read -- `count` (the engine's real deleted-row count) can exceed `data.length` when more rows matched than the snapshot's page size. Truncating (no effective `where`) reports `{ count: 0, data: [] }` -- Typesense's truncate reports no per-document count at all |
| `updateAll()` / `updateBy()` `data` | The updated rows via `RETURNING`, always in lockstep with `count` | A `find()` snapshot taken *after* the update, subject to the same pagination cap as `deleteAll()` -- can likewise diverge from `count` |
| `skip` | Any offset | Must be a multiple of `limit` -- Typesense paginates by page, not row offset |
| Transactions / row-level locks | `beginTransaction()` / `{ transaction }`, `{ lock }` in options | Neither is supported -- both throw the standardized NotSupported error |

### Adding a Search Engine

A new engine is one folder under `src/connectors/<engine>/` -- `DataSource`, `Driver`, a paired `QueryDialect` (never mixed with another engine's driver), a compiler (neutral DSL -> engine schema), a repository tier re-parented onto the shared `AbstractRepository`, and an internal error classifier -- sub-path exported (`@venizia/ignis/<engine>`) with the client as an optional peer dependency, the same convention `typesense/` follows today. Full contract (fixed `ISearchDriver` verb set, escape-hatch extras, transaction posture): [Connectors reference](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/references/base/connectors.md).

---

## Memory Connector

`MemoryDataSource` + `MemoryRepository` (`src/connectors/memory/`) are a zero-dependency, Map-backed engine for prototyping and tests -- the same role LoopBack 4's memory connector plays. No client library, no network, no peer dependency. Import it from the root (`@venizia/ignis`) or from its explicit sub-path (`@venizia/ignis/memory`) - both doors resolve to the same modules. Only optional-peer connectors (typesense) are sub-path-only:

```typescript
import {
  AbstractEntity,
  SchemaTypes,
  TSchemaType,
  model,
  repository,
} from '@venizia/ignis';
import { MemoryDataSource, MemoryRepository } from '@venizia/ignis/memory';
import { z } from '@hono/zod-openapi';

const ProductSelectSchema = z.object({ id: z.string(), title: z.string(), price: z.number() });
type ProductDocument = z.infer<typeof ProductSelectSchema>;

@model({ type: 'entity', settings: { defaultLimit: 20 } })
class Product extends AbstractEntity {
  static readonly COLLECTION_NAME = 'products';

  constructor() {
    super({ name: Product.COLLECTION_NAME });
  }

  getSchema(opts: { type: TSchemaType }) {
    switch (opts.type) {
      case SchemaTypes.SELECT:
        return ProductSelectSchema;
      default:
        return ProductSelectSchema;
    }
  }
}

class ProductDataSource extends MemoryDataSource {
  constructor() {
    super({ name: ProductDataSource.name });
  }
}

@repository({ model: Product, dataSource: ProductDataSource })
class ProductRepository extends MemoryRepository<ProductDocument> {
  // No constructor needed -- dataSource auto-injected from @repository metadata
}

const productRepository = new ProductRepository(new ProductDataSource());
const products = await productRepository.find({ filter: { where: { price: { gt: 10 } }, order: ['price DESC'] } });
```

A static `COLLECTION_NAME` on the model is this connector's discoverable-model convention -- the equivalent of postgres's static `schema` or the search branch's static `definition`. `MemoryRepository` is a single, untiered class implementing every `AbstractRepository` verb (no Readable/Persistable/DefaultCRUD split -- there's no connection/dialect plumbing to layer progressively), supporting equality, comparison (`gt`/`gte`/`lt`/`lte`/`between`), pattern (`like`/`ilike` via anchored `RegExp`), array (`inq`/`nin`), and logical (`and`/`or`) operators, plus `order`/`skip`/`limit`/`fields`. Operators with no faithful plain-JS meaning (`is`/`isn`, `regexp`/`iregexp`, the PostgreSQL-only array operators, `include`) throw instead of guessing.

`hiddenProperties`, `defaultFilter`, and `defaultLimit` from `@model` settings are honored the same way every connector honors them, with the same AND-merge default-filter policy as the search branch (narrows rather than overrides, unlike postgres's key-by-key deep merge). No transactions or row locks -- both reject with the standardized NotSupported error. Ids default to `crypto.randomUUID()` when a document is created without one.

Full operator matrix and internals: [Memory Connector guide](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/guides/core-concepts/persistent/memory-connector.md).

---

## Services

Services encapsulate business logic and are registered in the DI container:

```typescript
import { BaseService, inject } from '@venizia/ignis';

export class UserService extends BaseService {
  constructor(
    @inject({ key: 'repositories.UserRepository' }) private userRepository: UserRepository,
    @inject({ key: 'repositories.AuditRepository' }) private auditRepository: AuditRepository,
  ) {
    super({ scope: UserService.name });
  }

  async createUser(data: CreateUserInput) {
    const tx = await this.userRepository.dataSource.beginTransaction();
    try {
      const { data: user } = await this.userRepository.create({
        data,
        options: { transaction: tx },
      });

      await this.auditRepository.create({
        data: { action: 'user_created', userId: user.id },
        options: { transaction: tx },
      });

      await tx.commit();
      return user;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async deactivateInactiveUsers() {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
    const { count } = await this.userRepository.updateBy({
      data: { status: 'inactive' },
      where: { lastLoginAt: { lt: cutoff }, status: 'active' },
    });
    this.logger.info('Deactivated %d inactive users', count);
    return { count };
  }
}
```

Register in the application:

```typescript
this.service(UserService);
```

`BaseService` extends `BaseHelper`, providing a scoped logger instance (`this.logger`).

---

## Components

Components are self-contained modules that register controllers, services, bindings, and middleware. They extend `BaseComponent` and participate in the application lifecycle.

### Built-in Components

| Component | Import | Description |
| --- | --- | --- |
| **HealthCheckComponent** | `@venizia/ignis` | Health check endpoints (`GET /health`, `POST /health/ping`) |
| **SwaggerComponent** | `@venizia/ignis` | OpenAPI documentation with Swagger UI or Scalar UI |
| **AuthenticateComponent** | `@venizia/ignis` | JWS/JWKS + Basic authentication strategies, token services, auth middleware |
| **AuthorizeComponent** | `@venizia/ignis` | Casbin-based RBAC authorization with enforcers |
| **RequestTrackerComponent** | `@venizia/ignis` | `x-request-id` header injection, request body parsing |
| **StaticAssetComponent** | `@venizia/ignis/static-asset` | File upload/download CRUD with MinIO, Disk, or Bun S3 storage |
| **MailComponent** | `@venizia/ignis/mail` | Email sending via Nodemailer/Mailgun with Direct/BullMQ/InternalQueue executors |
| **SocketIOComponent** | `@venizia/ignis/socket-io` | Socket.IO server with a mandatory Redis adapter for horizontal scaling |
| **WebSocketComponent** | `@venizia/ignis/websocket` | Native WebSocket support (Bun runtime) |
| **GrpcComponent** | `@venizia/ignis/grpc` | Auto-registered by `BaseApplication` (like `RestComponent`) -- mounts controllers whose `@controller` metadata has `transport: 'grpc'` via ConnectRPC; never registered manually with `this.component()` |

### Health Check Component

```typescript
import { HealthCheckComponent, HealthCheckBindingKeys, IHealthCheckOptions } from '@venizia/ignis';

this.bind<IHealthCheckOptions>({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS }).toValue({
  restOptions: { path: '/health-check' }, // optional, default: /health
});
this.component(HealthCheckComponent);
```

`GET /health` (basic status) and `POST /health/ping` (ping/pong echo) -- no separate liveness/readiness probe pair. Details: [Health Check](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/extensions/components/health-check.md).

### Swagger / OpenAPI Component

```typescript
import { SwaggerComponent, SwaggerBindingKeys, ISwaggerOptions } from '@venizia/ignis';

this.bind<ISwaggerOptions>({ key: SwaggerBindingKeys.SWAGGER_OPTIONS }).toValue({
  restOptions: { base: { path: '/doc' }, doc: { path: '/openapi.json' }, ui: { path: '/explorer', type: 'scalar' } },
});
this.component(SwaggerComponent);
```

Auto-populates `info` from `getAppInfo()`, registers JWT/Basic security schemes, and serves Scalar or Swagger UI depending on `ui.type`. Details: [Swagger](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/extensions/components/swagger.md).

### Authentication Component

Basic auth plus Bearer tokens under two JOSE standards -- **JWS** (HMAC-signed, single shared secret) and **JWKS** (asymmetric, issuer/verifier split, `/certs` publishing) -- with optional AES-encrypted payloads:

```typescript
import { AuthenticateComponent, AuthenticateBindingKeys, JOSEStandards, TJWTTokenServiceOptions } from '@venizia/ignis';

this.bind<TJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  standard: JOSEStandards.JWS,
  options: { jwtSecret: process.env.JWT_SECRET!, headerAlgorithm: 'HS256', getTokenExpiresFn: () => 86400 },
});
this.component(AuthenticateComponent);
```

Strategies (`jwt`/`basic`) register via `AuthenticationStrategyRegistry`; the current user is available via `context.get('auth.current.user')` after the middleware runs. Authentication mode is `any` (first success wins) or `all` (every strategy must pass). Full setup (JWKS issuer/verifier mode, token service API, route vs controller-level auth): [Authentication](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/extensions/components/authentication/index.md).

### Authorization Component

Casbin-based RBAC. `IAuthorizeOptions` carries the component-wide decision policy; the enforcer is registered separately through `AuthorizationEnforcerRegistry`:

```typescript
import { AuthorizeComponent, AuthorizeBindingKeys, AuthorizationDecisions } from '@venizia/ignis';

this.bind({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  defaultDecision: AuthorizationDecisions.DENY,
  alwaysAllowRoles: ['superadmin'],
});
this.component(AuthorizeComponent);
```

Apply with `authorize: { action, resource }` (or an array, all must pass) in a route's `configs`. Full enforcer registration and Casbin model setup: [Authorization](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/extensions/components/authorization/index.md).

### Static Asset Component

File upload/download with MinIO, Disk, or Bun S3 storage. Sub-path only, like `mail`/`socket-io`/`websocket`:

```typescript
import { StaticAssetComponent, StaticAssetComponentBindingKeys, StaticAssetStorageTypes } from '@venizia/ignis/static-asset';
import { DiskHelper } from '@venizia/ignis-helpers';

this.bind({ key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS }).toValue({
  staticAsset: { controller: { name: 'AssetController', basePath: '/assets' }, storage: StaticAssetStorageTypes.DISK, helper: new DiskHelper({ basePath: './uploads' }) },
});
this.component(StaticAssetComponent);
```

MinIO and Bun S3 backends follow the same shape, swapping `storage` and `helper`. Details: [Static Asset](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/extensions/components/static-asset/index.md).

### Mail Component

```typescript
import { MailComponent } from '@venizia/ignis/mail';
```

Transporters: Nodemailer (SMTP), Mailgun (API). Executors: Direct (synchronous), BullMQ (Redis-backed queue), InternalQueue (in-memory). Details: [Mail](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/extensions/components/mail/index.md).

### Socket.IO Component

```typescript
import { SocketIOComponent, SocketIOBindingKeys } from '@venizia/ignis/socket-io';

this.bind({ key: SocketIOBindingKeys.SERVER_OPTIONS }).toValue({ cors: { origin: '*' } });
// A Redis connection and an authenticate handler are both mandatory (unlike most other components).
this.bind({ key: SocketIOBindingKeys.REDIS_CONNECTION }).toValue(redisHelper);
this.bind({ key: SocketIOBindingKeys.AUTHENTICATE_HANDLER }).toValue(authenticateSocket);
this.component(SocketIOComponent);
```

Bun and Node.js runtime handlers (auto-detected), Redis adapter for horizontal scaling. Details: [Socket.IO](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/extensions/components/socket-io/index.md).

---

## Request Context

Access the Hono request context from anywhere using `useRequestContext()`:

```typescript
import { useRequestContext, IAuthUser } from '@venizia/ignis';

function getCurrentRequestId(): string | undefined {
  const context = useRequestContext();
  return context?.get('requestId');
}

function getCurrentUser(): IAuthUser | undefined {
  const context = useRequestContext();
  return context?.get('auth.current.user');
}
```

This uses Hono's `contextStorage()` which stores the context in `AsyncLocalStorage`. It is available anywhere within the request lifecycle -- services, repositories, helpers, enrichers, etc.

**Note:** Requires `asyncContext.enable: true` in application config (the default).

---

## Middleware System

### Registering Custom Middleware

Add middleware in `setupMiddlewares()` -- these run on every request:

```typescript
setupMiddlewares(): ValueOrPromise<void> {
  const server = this.getServer();

  // CORS
  server.use('*', cors({
    origin: ['https://myapp.com', 'https://admin.myapp.com'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));

  // Body size limit
  server.use('*', bodyLimit({ maxSize: 50 * 1024 * 1024 })); // 50MB

  // Custom logging middleware
  server.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;
    console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${duration}ms`);
  });

  // Rate limiting on specific paths
  server.use('/api/auth/*', rateLimiter({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    limit: 100,
  }));
}
```

### Default Middleware Stack (registered automatically)

1. `appErrorHandler` -- Global error handler
2. `contextStorage` -- Async context for `useRequestContext()`
3. `notFoundHandler` -- Structured 404 responses
4. `RequestTrackerComponent` -- Request ID injection + body parsing
5. `emojiFavicon` -- Favicon handler

---

## Error Handling

### Error Propagation

Errors propagate through the layer stack and are caught by the global `appErrorHandler` (Hono's `onError`), which routes each error to one of four shapes:

```
ZodError                              -> 422, via formatZodError()
DB client error (SQLSTATE class 22/23/44) -> 400, via isDatabaseClientError()
Transient DB conflict (40001/40P01)   -> 409, via isRetryableDatabaseError()
Everything else (incl. getError())    -> its own statusCode, default 500
```

```
Controller throws -> appErrorHandler catches -> JSON error response
Service throws   -> Controller doesn't catch -> appErrorHandler catches
Repository throws -> Service doesn't catch -> Controller doesn't catch -> appErrorHandler
```

### Error Response Format

```json
{
  "message": "Error description",
  "messageCode": "some.message.code",
  "statusCode": 500,
  "requestId": "abc-123-def",
  "extra": { "any": "extra context attached via getError({ extra })" },
  "details": {
    "url": "http://localhost:3000/api/users",
    "path": "/api/users",
    "stack": "Error: ...\n    at ...",
    "cause": { "code": "23505", "detail": "Key (email)=(john@example.com) already exists." }
  }
}
```

In production (`NODE_ENV=production`), `stack` and `cause` are stripped from responses, and an unexpected (non-`getError`) 500 has its `message` replaced with a generic `"Internal Server Error"` so raw driver/connection errors never leak.

### PostgreSQL Constraint Errors

The error handler classifies by SQLSTATE **class** (the code's first two characters), not an exhaustive list of individual codes:

| SQLSTATE class | Meaning | Resolved status |
| --- | --- | --- |
| `22` | Data exception (e.g. `22001` string too long, `22003` numeric out of range, `22P02` invalid text representation) | 400 |
| `23` | Integrity constraint violation (e.g. `23505` unique, `23503` foreign key, `23502` not null, `23514` check, `23P01` exclusion) | 400 |
| `44` | WITH CHECK OPTION violation | 400 |
| `40001` / `40P01` (exact codes, not a class) | Serialization failure / deadlock detected -- transient, safe to retry | 409, `messageCode: 'database.conflict'` |

In production, only the generic per-code message is returned; outside production, `detail`/`table`/`constraint` from the driver are appended for debugging.

### Throwing Application Errors

Use `getError()` from helpers to throw errors with specific status codes:

```typescript
import { getError, HTTP } from '@venizia/ignis-helpers';

throw getError({
  statusCode: HTTP.ResultCodes.RS_4.NotFound,
  message: 'User not found',
});

throw getError({
  statusCode: HTTP.ResultCodes.RS_4.Forbidden,
  message: 'Insufficient permissions',
});
```

`throwNotSupported()` (`src/utilities/error.utility.ts`) is the standardized way connectors reject a capability they deliberately don't implement (e.g. Typesense/Memory transactions and locks): it logs a warning, then throws via `getError()` with `messageCode: 'core.not_supported'` and HTTP 501.

---

## Decorators Reference

| Decorator | Target | Parameters | Description |
| --- | --- | --- | --- |
| `@model({ type, settings?, tableName?, skipMigrate? })` | Class | `type`: `'entity' \| 'view'` (required); `settings.hiddenProperties`: string[]; `settings.defaultFilter`: TFilter | Register entity model with hidden properties and default filters |
| `@datasource({ driver, autoDiscovery? })` | Class | `driver`: e.g. `'node-postgres'`, `'typesense'` (required); `autoDiscovery`: boolean (default true) | Register datasource with driver configuration |
| `@repository({ model, dataSource })` | Class | `model`: entity class; `dataSource`: datasource class | Bind repository to model and datasource; auto-injects datasource at param[0] |
| `@controller({ path })` | Class | `path`: base path string | Register controller with base path. Default authentication/authorization is set at the `ControllerFactory` level, not on this decorator |
| `@get({ configs })` | Method | Full route config (path, request, responses, authenticate, authorize, middleware) | Define GET route |
| `@post({ configs })` | Method | Same as `@get` | Define POST route |
| `@put({ configs })` | Method | Same as `@get` | Define PUT route |
| `@patch({ configs })` | Method | Same as `@get` | Define PATCH route |
| `@del({ configs })` | Method | Same as `@get` | Define DELETE route |
| `@api({ configs })` | Method | Same as `@get` + `method` field | Define route with explicit HTTP method |
| `@inject({ key, isOptional? })` | Constructor param / Property | `key`: binding key string or symbol; `isOptional`: boolean (default false) | Inject dependency from IoC container |
| `@injectable({ scope?, tags? })` | Class | `scope`: `'singleton'` or `'transient'`; `tags`: string[] | Mark class as injectable with scope and tags |

---

## Response Helpers

Utility functions for building OpenAPI-compliant response and request schemas:

```typescript
import { jsonContent, jsonResponse, htmlResponse, idParamsSchema } from '@venizia/ignis';
import { z } from '@hono/zod-openapi';

// JSON request body
jsonContent({
  schema: z.object({ name: z.string(), email: z.string() }),
  description: 'User creation payload',
});
// => { description, content: { 'application/json': { schema } } }

// JSON response with automatic error fallback
jsonResponse({
  schema: z.object({ id: z.number(), name: z.string() }),
  description: 'User object',
  headers: {
    'x-request-id': { description: 'Request ID', schema: { type: 'string' } },
  },
});
// => { 200: { ... }, '4xx | 5xx': { ... ErrorSchema ... } }

// HTML response
htmlResponse({ description: 'Rendered page' });
// => { 200: { content: { 'text/html': { schema } } }, '4xx | 5xx': { ... } }

// Path parameter schema
idParamsSchema({ idType: 'number' });
// => z.object({ id: z.number() })

idParamsSchema({ idType: 'string' });
// => z.object({ id: z.string() })
```

---

## Real-World Patterns

### Complete User CRUD with Auth, Validation, Soft Delete, Pagination

A model with hidden fields + soft delete, a repository, a service enforcing a uniqueness rule, and a controller wiring auth/authorization onto routes -- the full layered pattern in one file group:

```typescript
// models/user.model.ts
@model({ type: 'entity', settings: { hiddenProperties: ['password'], defaultFilter: { where: { isDeleted: false } } } })
export class User extends BasePostgresEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs({ deleted: { enable: true, columnName: 'deleted_at', withTimezone: true } }),
    username: text('username').notNull().unique(),
    email: text('email').notNull().unique(),
    password: text('password'),
    isDeleted: boolean('is_deleted').default(false).notNull(),
  });
  static override relations = () => [];
  static override TABLE_NAME = 'User';
}

// repositories/user.repository.ts
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}

// services/user.service.ts -- enforces a uniqueness rule before delegating to the repository
export class UserService extends BaseService {
  constructor(@inject({ key: 'repositories.UserRepository' }) private userRepository: UserRepository) {
    super({ scope: UserService.name });
  }

  async createUser(data: { username: string; email: string; password: string }) {
    const exists = await this.userRepository.existsWith({ where: { email: data.email } });
    if (exists) {
      throw getError({ statusCode: HTTP.ResultCodes.RS_4.Conflict, message: 'Email already in use' });
    }
    return this.userRepository.create({ data: { ...data, password: await Bun.password.hash(data.password) } });
  }
}

// controllers/user.controller.ts -- @get is public, @post requires jwt + authorization
@controller({ path: '/users' })
export class UserController extends BaseRestController {
  constructor(@inject({ key: 'services.UserService' }) private userService: UserService) {
    super({ scope: UserController.name });
  }
  override binding() {}
}
```

The full walkthrough (pagination, controller-level find/create/soft-delete routes, OpenAPI schemas) is the [Building a CRUD API tutorial](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/guides/tutorials/building-a-crud-api.md).

---

## Testing

IGNIS uses the Bun test runner throughout. A repository test needs only a configured DataSource:

```typescript
import { describe, test, expect, beforeAll } from 'bun:test';

describe('UserRepository', () => {
  let repository: UserRepository;

  beforeAll(async () => {
    const dataSource = new PostgresDataSource();
    await dataSource.configure();
    repository = new UserRepository(dataSource, { entityClass: User });
  });

  test('create and find user', async () => {
    const { data: user } = await repository.create({ data: { username: 'test', email: 'test@example.com' } });
    expect(user.id).toBeDefined();

    const found = await repository.findById({ id: user.id });
    expect(found!.email).toBe('test@example.com');
  });
});
```

Controller tests drive `app.getServer().fetch()` against a real running `Application` -- routes are only mounted inside `start()`. Full patterns (hidden-field/default-filter assertions, request validation, auth): [Testing tutorial](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/guides/tutorials/testing.md).

---

## Performance Tips

1. **Singleton DataSources** -- DataSources are registered with `BindingScopes.SINGLETON` by default. The connection pool is shared across all repository instances. Never create DataSource instances per-request.

2. **Lazy Entity Resolution** -- Entity instances are resolved from metadata only on first access. This avoids unnecessary construction during application startup.

3. **Hidden Fields at SQL Level** -- `hiddenProperties` are excluded in the SQL SELECT clause, not filtered post-query. This means sensitive data never leaves the database.

4. **Core API vs Query API** -- The repository automatically uses the faster Core API (15--20% faster) when your filter does not include relations or explicit field selection. No manual optimization needed.

5. **Visible Property Caching** -- `PostgresBaseRepository.getVisibleProperties()` computes the visible property set once and caches it. Subsequent queries reuse the cached column selection.

6. **Parallel Count + Data** -- When `shouldQueryRange: true`, the data fetch and count query run in parallel via `Promise.all`, not sequentially.

7. **Schema Factory Sharing** -- `BasePostgresEntity` uses a lazy singleton for the Drizzle-Zod schema factory, shared across all entity instances. Schema generation does not create redundant factory objects.

8. **Avoid `shouldReturn: true` for Bulk Inserts** -- When inserting large batches, pass `shouldReturn: false` to skip the `RETURNING` clause, which significantly reduces response payload size and memory usage.

9. **Use Transactions Wisely** -- Each transaction acquires a dedicated connection from the pool. Long-running transactions hold connections and can starve other requests. Keep transactions short and always release them (commit or rollback) in a try/finally block.

10. **Column Cache** -- The `FilterBuilder` and `UpdateBuilder` use `getCachedColumns()` to avoid repeatedly parsing table schema metadata. Columns are computed once per table and cached globally.

---

## Documentation

- [IGNIS Repository](https://github.com/VENIZIA-AI/ignis)
- [Getting Started](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/guides/index.md)
- [Core Concepts](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/guides/core-concepts/application/index.md)
- [Examples](https://github.com/VENIZIA-AI/ignis/tree/main/examples/vert)

---

## License

MIT
