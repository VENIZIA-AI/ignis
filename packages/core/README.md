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
  BaseRestController,        // Controllers extend this
  DefaultCRUDRepository, // Repositories extend this
  BaseEntity,            // Models extend this
  BaseDataSource,        // DataSources extend this
} from '@venizia/ignis';
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
```

---

## Quick Start

### 1. Define a Model

```typescript
// models/user.model.ts
import { BaseEntity, model, generateIdColumnDefs, generateTzColumnDefs } from '@venizia/ignis';
import { pgTable, text } from 'drizzle-orm/pg-core';

@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['password'],
  },
})
export class User extends BaseEntity<typeof User.schema> {
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
import { BaseDataSource, datasource, ValueOrPromise } from '@venizia/ignis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

interface IDSConfigs {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource<IDSConfigs> {
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
import { PersistableRepository, repository } from '@venizia/ignis';
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
  inject, jsonContent, jsonResponse, HTTP, TRouteContext,
} from '@venizia/ignis';
import { z } from '@hono/zod-openapi';
import { UserRepository } from '../repositories/user.repository';

@controller({ path: '/users' })
export class UserController extends BaseRestController {
  constructor(
    @inject({ key: 'repositories.UserRepository' }) private userRepo: UserRepository,
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
    const users = await this.userRepo.find({ filter: {} });
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
    const result = await this.userRepo.create({ data: body });
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

**`registerControllers()`** -- Iterates all bindings tagged `controllers`. For each: validates that `@controller` metadata has a `path`, calls `configure()` (which triggers `binding()` and `registerRoutesFromRegistry()`), then mounts the controller's router at its configured path on the root router.

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
  host?: string;           // Server host (default: 'localhost' or APP_ENV_SERVER_HOST env)
  port?: number;           // Server port (default: 3000 or PORT/APP_ENV_SERVER_PORT env)

  path: {
    base: string;          // Base path for all routes (e.g., '/api')
    isStrict: boolean;     // When true, '/users' and '/users/' are different routes
  };

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

  debug?: {
    shouldShowRoutes?: boolean;  // Print all registered routes on startup
  };
}
```

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
abstract class BaseRestController extends AbstractController {
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
    @inject({ key: 'repositories.ProductRepository' }) private productRepo: ProductRepository,
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
    const products = await this.productRepo.find({
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
    const product = await this.productRepo.findById({ id });
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
    const result = await this.productRepo.create({ data });
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
      const products = await this.productRepo.find({ filter: {} });
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
      const result = await this.productRepo.deleteById({ id });
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
      const product = await this.productRepo.findById({ id });
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
import { rateLimiter } from 'hono/rate-limiter';
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
  "message": "ValidationError",
  "statusCode": 422,
  "requestId": "abc-123",
  "details": {
    "cause": [
      { "path": "email", "message": "Invalid email format", "code": "invalid_string" },
      { "path": "age", "message": "Must be at least 18", "code": "too_small" }
    ]
  }
}
```

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
| `@controller({ path, authenticate? })` | Class decorator -- registers controller path and optional default auth |
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
- `X-Response-Count-Data` response header with the count of returned records.

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
AbstractRepository
  extends DefaultFilterMixin(FieldsVisibilityMixin(BaseHelper))
  |
  +-- ReadableRepository        (read operations only -- write operations throw errors)
  |     |
  |     +-- PersistableRepository   (+ create, update, delete operations)
  |           |
  |           +-- DefaultCRUDRepository  (alias -- identical to PersistableRepository)
```

`PersistableRepository` is the recommended base class for most use cases. `DefaultCRUDRepository` is a convenience alias. Use `ReadableRepository` when you need a repository that should only read data (e.g., reporting views, read replicas).

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
const { count } = await repo.count({ where: { status: 'active' } });

// Count with complex conditions
const { count } = await repo.count({
  where: {
    and: [
      { role: { inq: ['admin', 'moderator'] } },
      { createdAt: { gte: new Date('2024-01-01') } },
      { or: [{ isVerified: true }, { score: { gt: 100 } }] },
    ],
  },
});

// Count within a transaction
const { count } = await repo.count({
  where: { status: 'pending' },
  options: { transaction: tx },
});
```

#### `existsWith()` -- Check Existence

```typescript
const emailTaken = await repo.existsWith({
  where: { email: 'john@example.com' },
});

if (emailTaken) {
  throw new Error('Email already in use');
}
```

#### `find()` -- Find All Records

```typescript
// Basic find with filter
const users = await repo.find({
  filter: {
    where: { status: 'active' },
    fields: ['id', 'name', 'email'],
    order: ['createdAt DESC'],
    limit: 20,
    skip: 0,
  },
});

// Find with pagination range info
const { data, range } = await repo.find({
  filter: { where: { status: 'active' }, limit: 20, skip: 40 },
  options: { shouldQueryRange: true },
});
// data = User[] (the 20 records)
// range = { start: 40, end: 59, total: 150 }

// Find with relation inclusion (uses Query API)
const usersWithPosts = await repo.find({
  filter: {
    where: { isActive: true },
    include: [
      { relation: 'posts', scope: { where: { isPublished: true }, limit: 5 } },
    ],
  },
});

// Find all (bypass default filter for admin views)
const allUsers = await repo.find({
  filter: {},
  options: { shouldSkipDefaultFilter: true },
});

// Find with transaction
const users = await repo.find({
  filter: { where: { batchId: currentBatch } },
  options: { transaction: tx },
});

// Find with debug logging
const users = await repo.find({
  filter: { where: { status: 'active' } },
  options: { log: { use: true, level: 'debug' } },
});
```

#### `findOne()` vs `findById()` -- Differences

`findOne()` accepts a full filter with `where`, `fields`, `include`, and `order`. It returns the first matching record:

```typescript
const user = await repo.findOne({
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
const user = await repo.findById({
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
const { count, data } = await repo.create({
  data: { username: 'john', email: 'john@example.com', role: 'user' },
});
// count = 1, data = { id: 1, username: 'john', ... }

// Create without returning data (faster -- skips RETURNING clause)
const { count } = await repo.create({
  data: { username: 'john', email: 'john@example.com' },
  options: { shouldReturn: false },
});
// count = 1, data = null

// Create within a transaction
const { data: user } = await repo.create({
  data: { username: 'john', email: 'john@example.com' },
  options: { transaction: tx },
});
```

#### `createAll()` -- Bulk Create

```typescript
// Bulk create and return all records
const { count, data } = await repo.createAll({
  data: [
    { username: 'john', email: 'john@example.com' },
    { username: 'jane', email: 'jane@example.com' },
    { username: 'bob', email: 'bob@example.com' },
  ],
});
// count = 3, data = [{ id: 1, ... }, { id: 2, ... }, { id: 3, ... }]

// Bulk create without returning (faster for large inserts)
const { count } = await repo.createAll({
  data: largeDataArray,
  options: { shouldReturn: false },
});
```

#### `updateById()` -- Update Single Record

```typescript
// Update by ID and return the updated record
const { count, data } = await repo.updateById({
  id: 42,
  data: { email: 'new@example.com', status: 'verified' },
});
// count = 1, data = { id: 42, email: 'new@example.com', ... }

// Update JSON fields using dot notation
const { data } = await repo.updateById({
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
const { count, data } = await repo.updateAll({
  data: { status: 'inactive' },
  where: { lastLoginAt: { lt: new Date('2024-01-01') } },
});
// count = 25, data = [...25 updated records...]

// updateBy is an alias for updateAll
const { count } = await repo.updateBy({
  data: { isNotified: true },
  where: { role: 'subscriber' },
  options: { shouldReturn: false },
});

// SAFETY: Empty where throws an error to prevent accidental mass updates
// Use force: true to explicitly allow it
const { count } = await repo.updateAll({
  data: { version: 2 },
  where: {},
  options: { force: true },
});
```

### Delete Operations

```typescript
// Delete by ID (returns deleted record)
const { count, data } = await repo.deleteById({ id: 42 });
// count = 1, data = { id: 42, username: 'john', ... }

// Delete all matching records
const { count, data } = await repo.deleteAll({
  where: { status: 'inactive' },
});

// deleteBy is an alias for deleteAll
const { count } = await repo.deleteBy({
  where: { expiresAt: { lt: new Date() } },
  options: { shouldReturn: false },
});

// SAFETY: Empty where throws an error. Use force: true to allow.
const { count } = await repo.deleteAll({
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
  offset?: number;         // Alias for skip
}
```

#### Where Operators -- Complete Reference

**Comparison operators:**

| Operator | Description | Example |
| --- | --- | --- |
| _(equality)_ | Exact match | `{ status: 'active' }` |
| `eq` | Equal | `{ age: { eq: 25 } }` |
| `ne` / `neq` | Not equal | `{ role: { neq: 'guest' } }` |
| `gt` | Greater than | `{ score: { gt: 90 } }` |
| `gte` | Greater than or equal | `{ age: { gte: 18 } }` |
| `lt` | Less than | `{ price: { lt: 100 } }` |
| `lte` | Less than or equal | `{ priority: { lte: 5 } }` |

**Pattern matching operators:**

| Operator | Description | Example |
| --- | --- | --- |
| `like` | SQL LIKE (case-sensitive) | `{ name: { like: '%john%' } }` |
| `ilike` | Case-insensitive LIKE | `{ email: { ilike: '%@GMAIL.COM' } }` |
| `nlike` | NOT LIKE | `{ name: { nlike: '%test%' } }` |
| `nilike` | NOT ILIKE | `{ email: { nilike: '%spam%' } }` |
| `regexp` | POSIX regex (case-sensitive) | `{ code: { regexp: '^[A-Z]{3}' } }` |
| `iregexp` | POSIX regex (case-insensitive) | `{ name: { iregexp: '^john' } }` |

**Array/set operators:**

| Operator | Description | Example |
| --- | --- | --- |
| `inq` / `in` | IN array | `{ status: { inq: ['active', 'pending'] } }` |
| `nin` | NOT IN array | `{ role: { nin: ['banned', 'deleted'] } }` |
| `between` | BETWEEN two values | `{ age: { between: [18, 65] } }` |
| `notBetween` | NOT BETWEEN | `{ score: { notBetween: [0, 10] } }` |

**Null check operators:**

| Operator | Description | Example |
| --- | --- | --- |
| `is` | IS NULL (when value is null) | `{ deletedAt: { is: null } }` |
| `isn` | IS NOT NULL (when value is null) | `{ email: { isn: null } }` |

**Logical operators:**

| Operator | Description | Example |
| --- | --- | --- |
| `and` | Logical AND | `{ and: [{ status: 'active' }, { role: 'admin' }] }` |
| `or` | Logical OR | `{ or: [{ role: 'admin' }, { role: 'moderator' }] }` |

**PostgreSQL array column operators** (for columns defined as `text[]`, `integer[]`, etc.):

| Operator | SQL | Description | Example |
| --- | --- | --- | --- |
| `contains` | `@>` | Array contains all elements | `{ tags: { contains: ['urgent', 'bug'] } }` |
| `containedBy` | `<@` | Array is contained by | `{ tags: { containedBy: ['a', 'b', 'c'] } }` |
| `overlaps` | `&&` | Arrays have common elements | `{ categories: { overlaps: ['tech', 'science'] } }` |

**JSON path queries** (for `json`/`jsonb` columns):

```typescript
// Query nested JSON fields using dot notation
const users = await repo.find({
  filter: {
    where: {
      'metadata.theme': 'dark',
      'settings.notifications.email': true,
      'preferences.items[0].enabled': { eq: true },
      'metadata.score': { gt: 50, lte: 100 },
    },
  },
});
```

JSON path queries automatically handle numeric casting: when a numeric comparison operator (`gt`, `gte`, `lt`, `lte`, `between`) is used with a numeric value, the extracted text is safely cast to `numeric` via a CASE expression.

**Sorting with JSON paths:**

```typescript
const products = await repo.find({
  filter: {
    order: [
      'createdAt DESC',
      'metadata.priority DESC',
      'data.nested.score ASC',
    ],
  },
});
```

#### Field Selection

```typescript
// Array format -- include only these columns
const users = await repo.find({
  filter: { fields: ['id', 'name', 'email'] },
});

// Object format -- include/exclude
const users = await repo.find({
  filter: { fields: { id: true, name: true, password: false } },
});
```

#### Relation Inclusion

```typescript
// Simple inclusion
const users = await repo.find({
  filter: {
    include: [{ relation: 'posts' }],
  },
});

// With nested filter (scope)
const users = await repo.find({
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
const users = await repo.find({
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
const result = await repo.find({
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
const allUsers = await repo.find({
  filter: {},
  options: { shouldSkipDefaultFilter: true },
});

// Data migration or cleanup script
const deletedUsers = await repo.find({
  filter: { where: { isDeleted: true } },
  options: { shouldSkipDefaultFilter: true },
});

// Export all data for backup
const everything = await repo.find({
  filter: {},
  options: { shouldSkipDefaultFilter: true, shouldQueryRange: true },
});
```

### ExtraOptions

All repository operations accept an `options` parameter:

```typescript
interface IExtraOptions {
  transaction?: ITransaction;          // Use within a transaction
  shouldReturn?: boolean;              // Return data after create/update/delete (default: true)
  shouldQueryRange?: boolean;          // Return { data, range: { total, start, end } }
  shouldSkipDefaultFilter?: boolean;   // Bypass model's default filter
  log?: { use: boolean; level?: TLogLevel }; // Enable operation logging
}
```

### Mixins

#### FieldsVisibilityMixin

Automatically excludes properties listed in `@model({ settings: { hiddenProperties } })` from all query results at the SQL level -- not post-processing:

```typescript
@model({
  settings: { hiddenProperties: ['password', 'secretToken'] },
})
export class User extends BaseEntity<typeof User.schema> { ... }

// All repository queries automatically exclude 'password' and 'secretToken'
const user = await userRepo.findById({ id: 1 });
// user.password === undefined (never selected from DB)

// Hidden fields are excluded from:
// - find() / findOne() / findById() SELECT queries
// - create() RETURNING clauses
// - updateById() / updateAll() RETURNING clauses
// - deleteById() / deleteAll() RETURNING clauses
// - Included relation queries (applied recursively)
```

The mixin caches the visible property set for performance. It computes it once from the schema columns minus hidden properties.

#### DefaultFilterMixin

Automatically applies a default filter to all queries. Common use case -- soft delete:

```typescript
@model({
  settings: { defaultFilter: { where: { isDeleted: false } } },
})
export class User extends BaseEntity<typeof User.schema> { ... }

// All queries automatically add WHERE is_deleted = false
const users = await userRepo.find({ filter: {} });

// The default filter merges with user-provided filters:
const activeAdmins = await userRepo.find({
  filter: { where: { role: 'admin' } },
});
// SQL: WHERE is_deleted = false AND role = 'admin'

// Bypass when needed (e.g., admin panel showing all records)
const allUsers = await userRepo.find({
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

### BaseEntity

All entities extend `BaseEntity` and define a static `schema` using Drizzle's `pgTable`:

```typescript
import { BaseEntity, model } from '@venizia/ignis';
import { pgTable, text, integer, jsonb, boolean } from 'drizzle-orm/pg-core';

@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['password', 'secretToken'],
    defaultFilter: { where: { isDeleted: false } },
  },
})
export class User extends BaseEntity<typeof User.schema> {
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

  static override relations = () => [
    { name: 'posts', type: 'many', schema: Post.schema, metadata: { fields: [Post.schema.authorId], references: [User.schema.id] } },
    { name: 'profile', type: 'one', schema: Profile.schema, metadata: { fields: [Profile.schema.userId], references: [User.schema.id] } },
  ];

  static TABLE_NAME = 'User';
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

`BaseEntity` provides `getSchema()` for Zod schema generation from the Drizzle table using `drizzle-zod`:

```typescript
const entity = new User();

entity.getSchema({ type: 'select' });  // Zod schema for SELECT results -- all fields as returned from DB
entity.getSchema({ type: 'create' });  // Zod schema for INSERT data -- required/optional based on column definitions
entity.getSchema({ type: 'update' });  // Zod schema for UPDATE data -- all fields optional (partial)
```

These schemas are used by `ControllerFactory` to auto-generate OpenAPI documentation. The schema factory is lazily initialized and shared across all BaseEntity instances for performance.

### Static `relations` Definition

Relations are defined as a static property or function returning an array of `TRelationConfig`:

```typescript
static override relations = () => [
  {
    name: 'posts',
    type: 'many',          // RelationTypes.MANY
    schema: Post.schema,
    metadata: {
      fields: [Post.schema.authorId],
      references: [User.schema.id],
    },
  },
  {
    name: 'profile',
    type: 'one',            // RelationTypes.ONE
    schema: Profile.schema,
    metadata: {
      fields: [Profile.schema.userId],
      references: [User.schema.id],
    },
  },
];
```

These relations are used by the `FilterBuilder` when processing `include` in filters, and by the DataSource's `discoverSchema()` to build Drizzle relation definitions.

### Enrichers -- Complete Reference

Column definition helpers that add common patterns to your table schemas.

#### `generateIdColumnDefs()` -- ID Column

```typescript
// Auto-incrementing integer ID (default)
...generateIdColumnDefs()
// Column: id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY

// Auto-incrementing integer ID (explicit)
...generateIdColumnDefs({ id: { dataType: 'number' } })

// UUID string ID (uses crypto.randomUUID() by default)
...generateIdColumnDefs({ id: { dataType: 'string' } })

// Custom string ID generator
...generateIdColumnDefs({
  id: { dataType: 'string', generator: () => mySnowflakeGenerator() },
})

// BigInt ID (as JavaScript number)
...generateIdColumnDefs({ id: { dataType: 'big-number', numberMode: 'number' } })

// BigInt ID (as JavaScript bigint)
...generateIdColumnDefs({ id: { dataType: 'big-number', numberMode: 'bigint' } })

// With custom sequence options
...generateIdColumnDefs({
  id: { dataType: 'number', sequenceOptions: { startWith: 1000, increment: 1 } },
})
```

#### `generateTzColumnDefs()` -- Timestamps

```typescript
// Default: createdAt + modifiedAt (with timezone, defaultNow)
...generateTzColumnDefs()
// Columns: created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
//          modified_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL (auto-updates via $onUpdate)

// With deletedAt for soft delete
...generateTzColumnDefs({
  deleted: { enable: true, columnName: 'deleted_at', withTimezone: true },
})
// Adds: deleted_at TIMESTAMP WITH TIME ZONE (nullable)

// Disable modifiedAt
...generateTzColumnDefs({
  modified: { enable: false },
})
// Only creates: created_at

// Custom column names
...generateTzColumnDefs({
  created: { columnName: 'date_created', withTimezone: false },
  modified: { enable: true, columnName: 'date_modified', withTimezone: false },
})
```

#### `generateUserAuditColumnDefs()` -- Audit Trail

Automatically populates `createdBy` and `modifiedBy` from the authenticated user in the request context:

```typescript
// Default: integer columns
...generateUserAuditColumnDefs()
// Columns: created_by integer, modified_by integer
// Auto-populated from context.get('audit.user.id') on create/update

// String IDs
...generateUserAuditColumnDefs({
  created: { dataType: 'string', columnName: 'created_by', allowAnonymous: true },
  modified: { dataType: 'string', columnName: 'modified_by', allowAnonymous: true },
})
```

When `allowAnonymous: false` (default is `true`), an error is thrown if there is no authenticated user in the request context. This is useful for columns that must always have an audit trail.

**Important:** `createdBy` is only set on insert (`$default`). `modifiedBy` is set on both insert and update (`$default` + `$onUpdate`).

#### `generatePrincipalColumnDefs()` -- Polymorphic Relations

```typescript
// Default discriminator name ('principal')
...generatePrincipalColumnDefs({ polymorphicIdType: 'number' })
// Columns: principal_id integer NOT NULL, principal_type text

// Custom discriminator
...generatePrincipalColumnDefs({
  discriminator: 'owner',
  polymorphicIdType: 'string',
  defaultPolymorphic: 'user',
})
// Columns: owner_id text NOT NULL, owner_type text DEFAULT 'user'
```

#### `generateDataTypeColumnDefs()` -- Multi-type Value Columns

For storing heterogeneous values (useful for key-value stores, settings tables):

```typescript
...generateDataTypeColumnDefs()
// Columns:
//   data_type text          -- type discriminator
//   n_value double precision -- numeric values
//   t_value text            -- text values
//   b_value bytea           -- binary values
//   j_value jsonb           -- JSON values
//   bo_value boolean        -- boolean values

// With defaults
...generateDataTypeColumnDefs({
  defaultValue: { dataType: 'text', tValue: 'default' },
})
```

---

## DataSources

### BaseDataSource

DataSources manage database connections and provide Drizzle connectors:

```typescript
abstract class BaseDataSource<Settings, Schema> extends AbstractDataSource {
  // Implemented by subclass
  abstract configure(): ValueOrPromise<void>;
  abstract getConnectionString(): ValueOrPromise<string>;

  // Auto-discovers schema from @repository bindings
  getSchema(): Schema;

  // Check if any repositories reference this datasource
  hasDiscoverableModels(): boolean;

  // Transaction support
  beginTransaction(opts?: ITransactionOptions): Promise<ITransaction>;
}
```

### Complete DataSource Configuration

```typescript
@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource<IDSConfigs> {
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
  await userRepo.create({
    data: { username: 'john', email: 'john@example.com' },
    options: { transaction: tx },
  });

  await auditRepo.create({
    data: { action: 'user_created', userId: newUser.id },
    options: { transaction: tx },
  });

  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
}
```

**How transactions work internally:**

1. `beginTransaction()` acquires a `PoolClient` from the `pg` Pool.
2. Executes `BEGIN TRANSACTION ISOLATION LEVEL <level>` on that client.
3. Creates a new Drizzle connector using that dedicated client.
4. Returns an `ITransaction` object with `connector`, `commit()`, `rollback()`, and `isActive`.
5. When `{ transaction: tx }` is passed to a repository method, `resolveConnector()` returns the transaction's connector instead of the default DataSource connector.
6. `commit()` runs `COMMIT`, sets `isActive = false`, and releases the client back to the pool.
7. `rollback()` runs `ROLLBACK`, sets `isActive = false`, and releases the client.
8. Attempting to use a committed/rolled-back transaction throws an error.

#### Isolation Levels

| Level | Constant | When to Use |
| --- | --- | --- |
| `READ COMMITTED` | `IsolationLevels.READ_COMMITTED` | Default. Each statement sees only data committed before it began. Sufficient for most CRUD operations. |
| `REPEATABLE READ` | `IsolationLevels.REPEATABLE_READ` | All statements in the transaction see a snapshot from the start. Use for consistent reads across multiple queries (e.g., generating reports). |
| `SERIALIZABLE` | `IsolationLevels.SERIALIZABLE` | Strictest. Transactions behave as if they ran sequentially. Use for financial operations or inventory management where absolute consistency is required. May cause serialization failures requiring retry. |

#### Connection Release

Connections are always released back to the pool in the `finally` block of both `commit()` and `rollback()`. This means even if the commit or rollback SQL fails, the connection is still released, preventing pool exhaustion.

---

## Services

Services encapsulate business logic and are registered in the DI container:

```typescript
import { BaseService, inject } from '@venizia/ignis';

export class UserService extends BaseService {
  constructor(
    @inject({ key: 'repositories.UserRepository' }) private userRepo: UserRepository,
    @inject({ key: 'repositories.AuditRepository' }) private auditRepo: AuditRepository,
  ) {
    super({ scope: UserService.name });
  }

  async createUser(data: CreateUserInput) {
    const tx = await this.userRepo.dataSource.beginTransaction();
    try {
      const { data: user } = await this.userRepo.create({
        data,
        options: { transaction: tx },
      });

      await this.auditRepo.create({
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
    const { count } = await this.userRepo.updateBy({
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
| **HealthCheckComponent** | `@venizia/ignis` | Health check endpoints (`GET /health`, `/health/live`, `/health/ready`) |
| **SwaggerComponent** | `@venizia/ignis` | OpenAPI documentation with Swagger UI or Scalar UI |
| **AuthenticateComponent** | `@venizia/ignis` | JWT + Basic authentication strategies, token services, auth middleware |
| **AuthorizeComponent** | `@venizia/ignis` | Casbin-based RBAC authorization with enforcers |
| **RequestTrackerComponent** | `@venizia/ignis` | `x-request-id` header injection, request body parsing |
| **StaticAssetComponent** | `@venizia/ignis` | File upload/download CRUD with MinIO or disk storage |
| **MailComponent** | `@venizia/ignis/mail` | Email sending via Nodemailer/Mailgun with Direct/BullMQ/InternalQueue executors |
| **SocketIOComponent** | `@venizia/ignis/socket-io` | Socket.IO server with Redis adapter for horizontal scaling |
| **WebSocketComponent** | `@venizia/ignis` | Native WebSocket support (Bun runtime) |

### Health Check Component

```typescript
import { HealthCheckComponent, HealthCheckBindingKeys, IHealthCheckOptions } from '@venizia/ignis';

// Optional: customize path (default: /health)
this.bind<IHealthCheckOptions>({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS }).toValue({
  restOptions: { path: '/health-check' },
});
this.component(HealthCheckComponent);
```

**Endpoints:**

| Endpoint | Description |
| --- | --- |
| `GET /health` | Basic health check -- returns `{ status: 'ok', uptime, timestamp }` |
| `GET /health/live` | Liveness probe -- returns 200 if server is running |
| `GET /health/ready` | Readiness probe -- returns 200 if server is ready to accept traffic |

### Swagger / OpenAPI Component

```typescript
import { SwaggerComponent, SwaggerBindingKeys, ISwaggerOptions } from '@venizia/ignis';

this.bind<ISwaggerOptions>({ key: SwaggerBindingKeys.SWAGGER_OPTIONS }).toValue({
  restOptions: {
    base: { path: '/doc' },
    doc: { path: '/openapi.json' },
    ui: { path: '/explorer', type: 'scalar' },  // 'scalar' or 'swagger'
  },
  explorer: { openapi: '3.0.0' },
});
this.component(SwaggerComponent);
```

The component auto-populates `info` from `getAppInfo()` and registers JWT/Basic security schemes in the OpenAPI registry. When `type: 'scalar'` is used, it serves Scalar UI; when `type: 'swagger'`, it serves Swagger UI.

**Endpoints:**

| Endpoint | Description |
| --- | --- |
| `GET /doc/openapi.json` | Raw OpenAPI spec in JSON |
| `GET /doc/explorer` | Interactive API explorer (Scalar or Swagger UI) |

### Authentication Component

Supports JWT and Basic authentication strategies with encrypted JWT payloads:

```typescript
import {
  AuthenticateComponent, AuthenticateBindingKeys,
  Authentication, AuthenticationStrategyRegistry,
  JWTAuthenticationStrategy, BasicAuthenticationStrategy,
  IJWTTokenServiceOptions, IBasicTokenServiceOptions,
  TAuthenticationRestOptions,
} from '@venizia/ignis';

// 1. Configure JWT options
this.bind<IJWTTokenServiceOptions>({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
  jwtSecret: process.env.JWT_SECRET!,           // Secret for signing JWTs
  applicationSecret: process.env.APP_SECRET!,   // Secret for AES encrypting payload fields
  headerAlgorithm: 'HS256',                     // JWT signing algorithm (default: HS256)
  aesAlgorithm: 'aes-256-cbc',                 // Payload encryption algorithm (default: aes-256-cbc)
  getTokenExpiresFn: () => 86400,               // Token expiration in seconds (24 hours)
});

// 2. Configure Basic auth options (optional)
this.bind<IBasicTokenServiceOptions>({ key: AuthenticateBindingKeys.BASIC_OPTIONS }).toValue({
  verifyCredentials: async ({ credentials, context }) => {
    const user = await userRepo.findOne({
      filter: { where: { username: credentials.username } },
    });
    if (user && await verifyPassword(credentials.password, user.password)) {
      return { userId: user.id, roles: user.roles };
    }
    return null;
  },
});

// 3. Optionally enable auth controller (sign-in, sign-up, change-password)
this.bind<TAuthenticationRestOptions>({ key: AuthenticateBindingKeys.REST_OPTIONS }).toValue({
  useAuthController: true,
  controllerOpts: {
    restPath: '/auth',
    payload: {
      signIn: { request: { schema: SignInSchema }, response: { schema: TokenSchema } },
      signUp: { request: { schema: SignUpSchema }, response: { schema: UserSchema } },
    },
  },
});

// 4. Register the component
this.component(AuthenticateComponent);

// 5. Register strategies
AuthenticationStrategyRegistry.getInstance().register({
  container: this,
  strategies: [
    { name: Authentication.STRATEGY_JWT, strategy: JWTAuthenticationStrategy },
    { name: Authentication.STRATEGY_BASIC, strategy: BasicAuthenticationStrategy },
  ],
});
```

#### JWT Token Service API

```typescript
// Generate a token
const token = await jwtTokenService.generate({
  payload: {
    userId: user.id,
    roles: [{ id: 1, identifier: 'admin', priority: 1 }],
    email: user.email,
  },
});

// Verify a token
const payload = await jwtTokenService.verify({
  type: 'Bearer',
  token: 'eyJhbGciOiJ...',
});
// payload = { userId: '...', roles: [...], email: '...' }
```

JWT payloads are AES-encrypted: all non-standard JWT fields (userId, roles, email, etc.) are encrypted with the `applicationSecret` before signing. This prevents payload inspection without the application secret.

#### Getting Current User from Context

After authentication middleware runs, the current user is available via context variables:

```typescript
@get({
  configs: {
    path: '/profile',
    authenticate: { strategies: ['jwt'], mode: 'any' },
    responses: jsonResponse({ schema: UserProfileSchema }),
  },
})
async getProfile(context: TRouteContext) {
  const user = context.get('auth.current.user');
  // user = { userId: '...', roles: [...], ... }

  const auditId = context.get('audit.user.id');
  // auditId = user.userId (set automatically for UserAuditEnricher)

  // ...
}
```

#### Authentication Modes

| Mode | Behavior |
| --- | --- |
| `any` (default) | At least one strategy must succeed. Tries each strategy in order; first success wins. |
| `all` | All specified strategies must succeed. All are tried; all must pass. |

#### Route-Level vs Controller-Level Authentication

```typescript
// Controller-level (via ControllerFactory)
const UserController = ControllerFactory.defineCrudController({
  authenticate: { strategies: ['jwt'] },  // Applied to ALL routes
  routes: {
    find: { authenticate: { skip: true } },  // Override: public
  },
});

// Route-level (via decorators)
@controller({ path: '/products' })
class ProductController extends BaseRestController {
  @get({
    configs: {
      path: '/',
      // No authenticate -- public route
      responses: jsonResponse({ schema: z.array(ProductSchema) }),
    },
  })
  async list(c: TRouteContext) { /* ... */ }

  @post({
    configs: {
      path: '/',
      authenticate: { strategies: ['jwt'] },  // Protected route
      responses: jsonResponse({ schema: ProductSchema }),
    },
  })
  async create(c: TRouteContext) { /* ... */ }
}
```

### Authorization Component

Casbin-based RBAC authorization:

```typescript
import {
  AuthorizeComponent, AuthorizeBindingKeys, IAuthorizeOptions,
  CasbinAuthorizationEnforcer,
} from '@venizia/ignis';

this.bind<IAuthorizeOptions>({ key: AuthorizeBindingKeys.OPTIONS }).toValue({
  enforcer: CasbinAuthorizationEnforcer,
  alwaysAllowRoles: ['superadmin'],         // Roles that bypass all authorization
  casbinOptions: {
    model: '/path/to/model.conf',           // Casbin model file
    adapter: myAdapter,                     // e.g., FileAdapter, PostgresAdapter
  },
});
this.component(AuthorizeComponent);
```

Use on routes:

```typescript
@get({
  configs: {
    path: '/admin/users',
    authenticate: { strategies: ['jwt'] },
    authorize: { action: 'read', resource: 'User' },
    responses: jsonResponse({ schema: z.array(UserSchema) }),
  },
})
async listUsers(context: TRouteContext) { /* ... */ }

// Multiple authorization specs (all must pass)
@del({
  configs: {
    path: '/admin/users/{id}',
    authenticate: { strategies: ['jwt'] },
    authorize: [
      { action: 'delete', resource: 'User' },
      { action: 'manage', resource: 'Admin' },
    ],
    // ...
  },
})
async deleteUser(context: TRouteContext) { /* ... */ }
```

### Static Asset Component

File upload/download with MinIO or disk storage:

```typescript
import {
  StaticAssetComponent, StaticAssetComponentBindingKeys,
  StaticAssetStorageTypes, TStaticAssetsComponentOptions,
} from '@venizia/ignis';
import { MinioHelper, DiskHelper } from '@venizia/ignis-helpers';

// MinIO backend
this.bind<TStaticAssetsComponentOptions>({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({
  staticAsset: {
    controller: { name: 'AssetController', basePath: '/assets' },
    storage: StaticAssetStorageTypes.MINIO,
    helper: new MinioHelper({
      endPoint: 'localhost',
      port: 9000,
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      useSSL: false,
    }),
  },
});
this.component(StaticAssetComponent);

// Disk backend
this.bind<TStaticAssetsComponentOptions>({
  key: StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS,
}).toValue({
  staticAsset: {
    controller: { name: 'AssetController', basePath: '/assets' },
    storage: StaticAssetStorageTypes.DISK,
    helper: new DiskHelper({ basePath: './uploads' }),
  },
});
```

### Mail Component

```typescript
import { MailComponent } from '@venizia/ignis/mail';
```

Supports:

- **Transporters**: Nodemailer (SMTP), Mailgun (API)
- **Executors**: Direct (synchronous send), BullMQ (background queue with Redis), InternalQueue (in-memory queue)

### Socket.IO Component

```typescript
import { SocketIOComponent, SocketIOBindingKeys } from '@venizia/ignis/socket-io';

this.bind({ key: SocketIOBindingKeys.OPTIONS }).toValue({
  cors: { origin: '*' },
  adapter: redisAdapter,  // Optional: Redis adapter for scaling
});
this.component(SocketIOComponent);
```

Provides Socket.IO server integration with:

- Bun and Node.js runtime handlers (auto-detected)
- Redis adapter support for horizontal scaling across multiple server instances

---

## Request Context

Access the Hono request context from anywhere using `useRequestContext()`:

```typescript
import { useRequestContext } from '@venizia/ignis';

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

Errors propagate through the layer stack and are caught by the global `appErrorHandler`:

```
Controller throws -> appErrorHandler catches -> JSON error response
Service throws   -> Controller doesn't catch -> appErrorHandler catches
Repository throws -> Service doesn't catch -> Controller doesn't catch -> appErrorHandler
```

### Error Response Format

```json
{
  "message": "Error description",
  "statusCode": 500,
  "requestId": "abc-123-def",
  "details": {
    "url": "http://localhost:3000/api/users",
    "path": "/api/users",
    "stack": "Error: ...\n    at ...",
    "cause": { "code": "23505", "detail": "Key (email)=(john@example.com) already exists." }
  }
}
```

In production (`NODE_ENV=production`), `stack` and `cause` are stripped from responses.

### PostgreSQL Constraint Errors

The error handler automatically recognizes PostgreSQL constraint violations and returns HTTP 400 instead of 500:

| Error Code | Description |
| --- | --- |
| `23505` | Unique constraint violation |
| `23503` | Foreign key constraint violation |
| `23502` | Not null constraint violation |
| `23514` | Check constraint violation |
| `23P01` | Exclusion constraint violation |
| `22P02` | Invalid text representation |
| `22003` | Numeric value out of range |
| `22001` | String data too long |

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

---

## Decorators Reference

| Decorator | Target | Parameters | Description |
| --- | --- | --- | --- |
| `@model({ type?, settings? })` | Class | `type`: entity type string; `settings.hiddenProperties`: string[]; `settings.defaultFilter`: TFilter | Register entity model with hidden properties and default filters |
| `@datasource({ driver?, autoDiscovery? })` | Class | `driver`: `'node-postgres'`; `autoDiscovery`: boolean (default true) | Register datasource with driver configuration |
| `@repository({ model, dataSource })` | Class | `model`: entity class; `dataSource`: datasource class | Bind repository to model and datasource; auto-injects datasource at param[0] |
| `@controller({ path, authenticate? })` | Class | `path`: base path string; `authenticate`: `{ strategies, mode }` | Register controller with base path and optional default auth |
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

```typescript
// models/user.model.ts
@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['password'],
    defaultFilter: { where: { isDeleted: false } },
  },
})
export class User extends BaseEntity<typeof User.schema> {
  static override schema = pgTable('User', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs({
      deleted: { enable: true, columnName: 'deleted_at', withTimezone: true },
    }),
    ...generateUserAuditColumnDefs({
      created: { dataType: 'string', columnName: 'created_by', allowAnonymous: true },
      modified: { dataType: 'string', columnName: 'modified_by', allowAnonymous: true },
    }),
    username: text('username').notNull().unique(),
    email: text('email').notNull().unique(),
    password: text('password'),
    role: text('role').default('user').notNull(),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    metadata: jsonb('metadata').$type<Record<string, any>>(),
  });

  static override relations = () => [];
  static TABLE_NAME = 'User';
}

// repositories/user.repository.ts
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {}

// services/user.service.ts
export class UserService extends BaseService {
  constructor(
    @inject({ key: 'repositories.UserRepository' }) private userRepo: UserRepository,
  ) {
    super({ scope: UserService.name });
  }

  async createUser(data: { username: string; email: string; password: string }) {
    const exists = await this.userRepo.existsWith({ where: { email: data.email } });
    if (exists) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.Conflict,
        message: 'Email already in use',
      });
    }

    const hashedPassword = await Bun.password.hash(data.password);
    return this.userRepo.create({
      data: { ...data, password: hashedPassword },
    });
  }

  async softDeleteUser(id: string) {
    return this.userRepo.updateById({
      id,
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }
}

// controllers/user.controller.ts
@controller({ path: '/users' })
export class UserController extends BaseRestController {
  constructor(
    @inject({ key: 'services.UserService' }) private userService: UserService,
    @inject({ key: 'repositories.UserRepository' }) private userRepo: UserRepository,
  ) {
    super({ scope: UserController.name });
  }

  override binding() {}

  @get({
    configs: {
      path: '/',
      description: 'List users with pagination',
      request: {
        query: z.object({
          filter: FilterSchema,
        }),
      },
      responses: jsonResponse({
        schema: z.object({
          data: z.array(z.object({
            id: z.string(),
            username: z.string(),
            email: z.string(),
            role: z.string(),
          })),
          range: z.object({ start: z.number(), end: z.number(), total: z.number() }),
        }),
      }),
    },
  })
  async list(context: TRouteContext) {
    const { filter = {} } = context.req.valid<{ filter?: any }>('query');
    const result = await this.userRepo.find({
      filter: { ...filter, fields: ['id', 'username', 'email', 'role'] },
      options: { shouldQueryRange: true },
    });
    return context.json(result, 200);
  }

  @post({
    configs: {
      path: '/',
      authenticate: { strategies: ['jwt'] },
      authorize: { action: 'create', resource: 'User' },
      request: {
        body: jsonContent({
          schema: z.object({
            username: z.string().min(3).max(50),
            email: z.string().email(),
            password: z.string().min(8),
          }),
        }),
      },
      responses: jsonResponse({
        schema: z.object({ count: z.number(), data: z.any() }),
      }),
    },
  })
  async create(context: TRouteContext) {
    const data = context.req.valid<{ username: string; email: string; password: string }>('json');
    const result = await this.userService.createUser(data);
    return context.json(result, 200);
  }

  @del({
    configs: {
      path: '/{id}',
      authenticate: { strategies: ['jwt'] },
      authorize: { action: 'delete', resource: 'User' },
      request: { params: idParamsSchema({ idType: 'string' }) },
      responses: jsonResponse({ schema: z.object({ count: z.number() }) }),
    },
  })
  async softDelete(context: TRouteContext) {
    const { id } = context.req.valid<{ id: string }>('param');
    const result = await this.userService.softDeleteUser(id);
    return context.json({ count: result.count }, 200);
  }
}
```

---

## Testing

### Testing Repositories

```typescript
import { describe, test, expect } from 'bun:test';

describe('UserRepository', () => {
  let repo: UserRepository;
  let dataSource: PostgresDataSource;

  beforeAll(async () => {
    dataSource = new PostgresDataSource();
    await dataSource.configure();
    repo = new UserRepository(dataSource, { entityClass: User });
  });

  test('create and find user', async () => {
    const { data: user } = await repo.create({
      data: { username: 'test', email: 'test@example.com' },
    });

    expect(user.id).toBeDefined();
    expect(user.username).toBe('test');

    const found = await repo.findById({ id: user.id });
    expect(found).not.toBeNull();
    expect(found!.email).toBe('test@example.com');
  });

  test('hidden fields are excluded', async () => {
    const { data: user } = await repo.create({
      data: { username: 'secret', email: 'secret@example.com', password: 'hash123' },
    });

    // password should not be in the returned data
    expect(user.password).toBeUndefined();
  });

  test('default filter excludes soft-deleted records', async () => {
    const { data: user } = await repo.create({
      data: { username: 'deleted', email: 'deleted@example.com', isDeleted: true },
    });

    // Default filter: { where: { isDeleted: false } }
    const found = await repo.findById({ id: user.id });
    expect(found).toBeNull();

    // Bypass default filter
    const foundAll = await repo.findById({
      id: user.id,
      options: { shouldSkipDefaultFilter: true },
    });
    expect(foundAll).not.toBeNull();
  });
});
```

### Testing Controllers

```typescript
import { describe, test, expect } from 'bun:test';

describe('UserController', () => {
  let app: Application;

  beforeAll(async () => {
    app = new Application();
    await app.initialize();
  });

  test('GET /api/users returns 200', async () => {
    const server = app.getServer();
    const res = await server.fetch(
      new Request('http://localhost/api/users'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test('POST /api/users validates request body', async () => {
    const server = app.getServer();
    const res = await server.fetch(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: '' }),  // Invalid: missing email, empty username
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.message).toBe('ValidationError');
  });
});
```

---

## Performance Tips

1. **Singleton DataSources** -- DataSources are registered with `BindingScopes.SINGLETON` by default. The connection pool is shared across all repository instances. Never create DataSource instances per-request.

2. **Lazy Entity Resolution** -- Entity instances are resolved from metadata only on first access. This avoids unnecessary construction during application startup.

3. **Hidden Fields at SQL Level** -- `hiddenProperties` are excluded in the SQL SELECT clause, not filtered post-query. This means sensitive data never leaves the database.

4. **Core API vs Query API** -- The repository automatically uses the faster Core API (15--20% faster) when your filter does not include relations or explicit field selection. No manual optimization needed.

5. **Visible Property Caching** -- The `FieldsVisibilityMixin` computes the visible property set once and caches it. Subsequent queries reuse the cached column selection.

6. **Parallel Count + Data** -- When `shouldQueryRange: true`, the data fetch and count query run in parallel via `Promise.all`, not sequentially.

7. **Schema Factory Sharing** -- `BaseEntity` uses a lazy singleton for the Drizzle-Zod schema factory, shared across all entity instances. Schema generation does not create redundant factory objects.

8. **Avoid `shouldReturn: true` for Bulk Inserts** -- When inserting large batches, pass `shouldReturn: false` to skip the `RETURNING` clause, which significantly reduces response payload size and memory usage.

9. **Use Transactions Wisely** -- Each transaction acquires a dedicated connection from the pool. Long-running transactions hold connections and can starve other requests. Keep transactions short and always release them (commit or rollback) in a try/finally block.

10. **Column Cache** -- The `FilterBuilder` and `UpdateBuilder` use `getCachedColumns()` to avoid repeatedly parsing table schema metadata. Columns are computed once per table and cached globally.

---

## Documentation

- [IGNIS Repository](https://github.com/VENIZIA-AI/ignis)
- [Getting Started](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/get-started/index.md)
- [Core Concepts](https://github.com/VENIZIA-AI/ignis/blob/main/docs/wiki/content/get-started/core-concepts/application.md)
- [Examples](https://github.com/VENIZIA-AI/ignis/tree/main/examples/vert)

---

## License

MIT
