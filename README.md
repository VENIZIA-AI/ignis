# IGNIS

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)
[![Bun Version](https://img.shields.io/badge/bun-%3E%3D1.3-black)](https://bun.sh)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![Documentation](https://img.shields.io/badge/docs-venizia--ai.github.io%2Fignis-blue)](https://venizia-ai.github.io/ignis)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/VENIZIA-AI/ignis)

> A TypeScript Server Infrastructure combining enterprise-grade patterns with high performance.

Ignis brings together the structured, enterprise development experience of **LoopBack 4** with the blazing speed and simplicity of **Hono** -- giving you the best of both worlds. Think LoopBack 4's decorator-driven DI, repository pattern, and component system, running on Hono's ~140k req/s engine with Drizzle ORM's type-safe SQL.

---

## Table of Contents

- [Key Features](#key-features)
- [When Should You Use Ignis?](#when-should-you-use-ignis)
- [Framework Comparison](#framework-comparison)
- [Monorepo Packages](#monorepo-packages)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start -- Hello World](#quick-start----hello-world)
- [Quick Start -- Full CRUD API in 5 Minutes](#quick-start----full-crud-api-in-5-minutes)
- [Complete Tutorial -- Todo API](#complete-tutorial----todo-api)
- [Project Structure](#project-structure)
- [Available Scripts](#available-scripts)
- [Core Concepts](#core-concepts)
  - [Architecture Flow](#architecture-flow)
  - [Dependency Injection](#dependency-injection)
  - [DI Flow in Detail](#di-flow-in-detail)
  - [Boot Sequence](#boot-sequence)
  - [Request Lifecycle](#request-lifecycle)
  - [Repository Pattern](#repository-pattern)
  - [Transaction Support](#transaction-support)
  - [Models with Enrichers](#models-with-enrichers)
  - [OpenAPI and Swagger Auto-Generation](#openapi-and-swagger-auto-generation)
  - [Application Lifecycle](#application-lifecycle)
- [Complete Configuration Reference](#complete-configuration-reference)
- [Built-in Components](#built-in-components)
- [Helpers Ecosystem](#helpers-ecosystem)
- [Code Comparison -- Ignis vs Express vs NestJS](#code-comparison----ignis-vs-express-vs-nestjs)
- [Deployment](#deployment)
- [Monorepo Development](#monorepo-development)
- [Examples](#examples)
- [Frequently Asked Questions](#frequently-asked-questions)
- [Contributing](#contributing)
- [License](#license)
- [Acknowledgments](#acknowledgments)
- [Support](#support)

---

## Key Features

- **High Performance** -- Built on Hono, one of the fastest web frameworks (~140k req/s on Bun)
- **Enterprise Architecture** -- Layered architecture with Controllers, Services, Repositories, and DataSources
- **Dependency Injection** -- Lightweight IoC container (~350 lines) with constructor + property injection
- **Type Safety** -- Full TypeScript with Drizzle ORM type inference and Zod validation
- **Auto-Generated API Docs** -- OpenAPI/Swagger documentation out of the box via `@hono/zod-openapi`
- **Decorator-Based Routing** -- Clean, declarative route definitions with `@get`, `@post`, `@controller`
- **Component System** -- Pluggable modules for Auth (JWT/Basic), Health Checks, Swagger, Mail, Socket.IO, Static Assets
- **Convention-Based Boot** -- Auto-discovers controllers, services, repositories, datasources by file conventions
- **Production Utilities** -- Logger, Redis, BullMQ queues, MinIO storage, Crypto, Cron, Snowflake UID, and more
- **Multi-Runtime** -- Primary support for Bun, secondary support for Node.js

---

## When Should You Use Ignis?

### Perfect For

- **E-commerce Backends** -- Complex business logic, multiple controllers, auth, payments
- **SaaS Platform APIs** -- Multi-tenant architecture, modular components
- **Enterprise Tools** -- Team collaboration with clear architectural patterns
- **Growing APIs** -- 10+ endpoints that need structure and maintainability

### Not Recommended For

- **Simple Proxies/Webhooks** -- Too much structure for tiny services
- **Quick Prototypes** -- Use plain Hono for maximum speed
- **3-5 Endpoint APIs** -- Consider plain Hono unless you plan to grow

---

## Framework Comparison

### Feature Matrix

| Aspect | Minimal (Hono, Express) | Enterprise (NestJS, LoopBack) | **Ignis** |
| --- | --- | --- | --- |
| **Performance** | ~150k req/s | ~25k req/s | ~140k req/s |
| **Architecture** | Flexible (DIY) | Strict conventions | Guided conventions |
| **Learning Curve** | Low | High | Medium |
| **Dependency Injection** | Manual/3rd party | Built-in (complex) | Built-in (simple) |
| **ORM** | BYO | TypeORM/Prisma | Drizzle (type-safe SQL) |
| **OpenAPI Docs** | Manual setup | Swagger module | Auto-generated |
| **Auth** | BYO | Passport/Guards | JWT + Basic built-in |
| **Community** | Large (Express) / Growing (Hono) | Very large | Growing |
| **Best For** | Microservices, serverless | Large teams, enterprise | Growing APIs, small teams |

### Code Comparison -- Same Endpoint in Three Frameworks

**Express -- manual everything:**

```typescript
// express + manual setup
import express from 'express';
const app = express();
app.use(express.json());

app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    res.json(user.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000);
```

**NestJS -- modules, providers, decorators, pipes:**

```typescript
// nest requires: module, controller, service, entity, DTO files
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  @UseGuards(AuthGuard('jwt'))
  @UsePipes(new ValidationPipe())
  findOne(@Param('id', ParseIntPipe) id: number): Promise<User> {
    return this.usersService.findOne(id);
  }
}

// Plus: UsersModule, UsersService, User entity, CreateUserDto, UpdateUserDto...
```

**Ignis -- structured but lightweight:**

```typescript
@controller({ path: '/users' })
export class UserController extends BaseController {
  constructor(
    @inject({ key: 'repositories.UserRepository' }) private userRepo: UserRepository,
  ) {
    super({ scope: 'UserController', path: '/users' });
  }

  @get({
    configs: {
      path: '/:id',
      method: HTTP.Methods.GET,
      request: { params: z.object({ id: z.string() }) },
      responses: jsonResponse({
        description: 'Get user by ID',
        schema: z.object({ id: z.string(), name: z.string(), email: z.string() }),
      }),
    },
  })
  async findById(c: TRouteContext) {
    const { id } = c.req.valid('param');
    const user = await this.userRepo.findById({ id });
    return c.json(user, HTTP.ResultCodes.RS_2.Ok);
  }
}
```

### DI Comparison -- NestJS Modules vs Ignis Container

**NestJS -- requires explicit module wiring:**

```typescript
// users.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

// app.module.ts
@Module({
  imports: [UsersModule, AuthModule, DatabaseModule],
})
export class AppModule {}
```

**Ignis -- convention-based auto-discovery:**

```typescript
// No module files needed. Boot system auto-discovers:
//   controllers/*.controller.ts -> controllers.{Name}
//   services/*.service.ts       -> services.{Name}
//   repositories/*.repository.ts -> repositories.{Name}
//   datasources/*.datasource.ts -> datasources.{Name}

class App extends BaseApplication {
  preConfigure() {
    // Components registered here; everything else is auto-discovered by boot
    this.component(HealthCheckComponent);
    this.component(SwaggerComponent);
  }
}
```

See [Philosophy](packages/docs/wiki/get-started/philosophy.md) for a detailed comparison.

---

## Monorepo Packages

Ignis is organized as a Bun workspace monorepo with five core packages and a documentation package.

### Dependency Graph

```
                    +-------------------+
                    |   dev-configs     |   Shared ESLint / Prettier / TypeScript configs
                    +--------+----------+
                             |
                    +--------v----------+
                    |    inversion      |   IoC container, @inject, @injectable
                    +--------+----------+
                             |
                    +--------v----------+
                    |     helpers       |   Logger, Redis, Queue, Storage, Crypto, ...
                    +--------+----------+
                             |
                    +--------v----------+
                    |      boot         |   Convention-based auto-discovery & bootstrapping
                    +--------+----------+
                             |
                    +--------v----------+
                    |      core         |   Application, Controllers, Repositories, Components
                    +-------------------+
```

Each package builds on the previous. Changing `inversion` affects everything downstream.

### Package Overview

| Package | npm | Version | Key Exports | Description |
| --- | --- | --- | --- | --- |
| **[@venizia/ignis](packages/core/)** | `@venizia/ignis` | 0.0.7 | `BaseApplication`, `BaseController`, `DefaultCRUDRepository`, `BaseEntity`, `BaseDataSource`, `ControllerFactory`, decorators, components | Main framework -- Application, Controllers, Repositories, Models, DataSources, Components, Auth |
| **[@venizia/ignis-boot](packages/boot/)** | `@venizia/ignis-boot` | 0.0.3 | `BootMixin`, `Bootstrapper`, `BaseArtifactBooter`, `ControllerBooter`, `ServiceBooter` | Convention-based auto-discovery and bootstrapping (configure -> discover -> load) |
| **[@venizia/ignis-inversion](packages/inversion/)** | `@venizia/ignis-inversion` | 0.0.5 | `Container`, `Binding`, `MetadataRegistry`, `@inject`, `@injectable` | Standalone DI/IoC container (~350 lines) -- Container, Binding, MetadataRegistry, decorators |
| **[@venizia/ignis-helpers](packages/helpers/)** | `@venizia/ignis-helpers` | 0.0.6 | `LoggerFactory`, `RedisHelper`, `QueueHelper`, `StorageHelper`, `CryptoHelper`, `UIDHelper` | Production utilities -- Logger, Redis, Queue, Storage, Crypto, Cron, Socket.IO, UID, Network |
| **[@venizia/dev-configs](packages/dev-configs/)** | `@venizia/dev-configs` | 0.0.6 | `eslintConfigs`, `prettierConfigs`, `tsconfig.common.json` | Shared ESLint v9, Prettier, and TypeScript configs for the entire monorepo |
| **[@venizia/ignis-docs](packages/docs/)** | `@venizia/ignis-docs` | 0.0.6 | VitePress site, MCP server | VitePress documentation site and MCP server |

### Package Details

#### `@venizia/ignis` (Core)

The main framework package. Provides:

- **BaseApplication** -- 8-phase lifecycle (staticConfigure -> preConfigure -> registerDataSources -> registerComponents -> registerControllers -> postConfigure -> setupMiddlewares -> start)
- **Controllers** -- Three route definition patterns: decorator (`@get`, `@post`), imperative (`defineRoute`), fluent (`bindRoute().to()`)
- **Repository Hierarchy** -- AbstractRepository -> ReadableRepository -> PersistableRepository -> DefaultCRUDRepository with full filter/where operators
- **Models** -- `@model` decorator with BaseEntity, schema enrichers (ID, timestamps, soft delete, user audit)
- **DataSources** -- Drizzle ORM + `node-postgres`, schema auto-discovery, transaction support with isolation levels
- **9 Built-in Components** -- HealthCheck, Swagger/Scalar, Authentication (JWT + Basic), Authorization (Casbin), RequestTracker, StaticAsset, Mail, Socket.IO
- **ControllerFactory** -- Auto-generates CRUD endpoints from a model + repository

Use this package when: You are building any Ignis application (always required).

[Full documentation ->](packages/core/README.md)

#### `@venizia/ignis-inversion` (IoC Container)

Standalone dependency injection container inspired by LoopBack 4, but significantly simpler (~350 lines of core logic):

- **Container** -- Binding registration, dependency resolution, tag-based discovery
- **Binding** -- Fluent API with `toClass()`, `toValue()`, `toProvider()`, singleton/transient scopes
- **Decorators** -- `@inject({ key })` for constructor + property injection, `@injectable({ scope, tags })`
- **MetadataRegistry** -- Central metadata storage using `reflect-metadata`
- **Namespace Auto-Tagging** -- Key `"services.UserService"` auto-tags binding with `"services"`

Use this package when: You need DI without the full framework, or you are building a library that integrates with Ignis.

[Full documentation ->](packages/inversion/README.md)

#### `@venizia/ignis-helpers` (Utilities)

Production-ready utility library with 14+ modules:

| Module | Description |
| --- | --- |
| **Logger** | Winston-based with daily rotation, UDP transport, scoped logging |
| **Redis** | Single + Cluster mode, pub/sub with zlib compression, hash operations |
| **Queue** | BullMQ (Redis-backed), in-memory generator-based queue, MQTT, Kafka |
| **Storage** | MinIO (S3-compatible), local disk, in-memory -- common IStorageHelper interface |
| **Crypto** | AES-256-CBC/GCM, RSA with DER keys, ECDH P-256, file encryption |
| **UID** | Snowflake 70-bit IDs (48-bit timestamp + 10-bit worker + 12-bit sequence), Base62 encoding |
| **Cron** | Cron scheduling with modification and duplication |
| **Socket.IO** | Server helper with Redis adapter, authentication flow, room management |
| **WebSocket** | Bun-native WebSocket with Redis pub/sub and encryption |
| **Network** | HTTP (Axios/fetch), TCP server/client with TLS, UDP with multicast |
| **Environment** | Runtime detection (Bun/Node), prefixed env var management |
| **Worker Thread** | Thread pool management (max = CPU cores) |

Use this package when: You need production infrastructure utilities (logging, caching, queues, file storage).

[Full documentation ->](packages/helpers/README.md)

#### `@venizia/ignis-boot` (Bootstrapping)

Convention-based auto-discovery system with a three-phase lifecycle:

1. **Configure** -- Merge user options with defaults (directories, extensions, glob patterns)
2. **Discover** -- Glob filesystem for matching artifact files
3. **Load** -- Dynamic import, filter class exports, bind to IoC container

Built-in booters for `controllers/`, `services/`, `repositories/`, `datasources/` with customizable patterns. Extensible via custom booters using the Template Method pattern.

Use this package when: You want auto-discovery of controllers, services, and repositories (recommended for all production apps).

[Full documentation ->](packages/boot/README.md)

#### `@venizia/dev-configs` (Shared Configs)

Single source of truth for development tooling:

- **ESLint** -- Flat config (v9+) based on `@minimaltech/eslint-node` + `eslint-plugin-unicorn`
- **Prettier** -- `printWidth: 100`, `singleQuote: true`, `trailingComma: "all"`
- **TypeScript** -- `experimentalDecorators` + `emitDecoratorMetadata` (critical for DI), `useDefineForClassFields: false`, `strict: true`

Use this package when: You want consistent linting, formatting, and TypeScript settings across your project.

[Full documentation ->](packages/dev-configs/README.md)

---

## Prerequisites

| Tool | Version | Purpose |
| --- | --- | --- |
| **Bun** | >= 1.3.0 | JavaScript runtime (recommended) |
| **Node.js** | >= 18.x | Alternative runtime (optional) |
| **PostgreSQL** | >= 14.x | Database server |

### Installation Commands

**Bun (Recommended):**

```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Windows (requires WSL)
# Install WSL first, then run the command above
```

**PostgreSQL:**

```bash
# macOS
brew install postgresql@14

# Ubuntu/Debian
sudo apt-get install postgresql-14

# Windows
# Download from https://www.postgresql.org/download/windows/
```

**Verify Installation:**

```bash
bun --version    # Expected: 1.3.0 or higher
psql --version   # Expected: psql (PostgreSQL) 14.x or higher
```

---

## Installation

### 1. Create a New Project

```bash
mkdir my-ignis-app
cd my-ignis-app
bun init -y
```

### 2. Install Dependencies

**Production Dependencies:**

```bash
bun add hono @hono/zod-openapi @scalar/hono-api-reference @venizia/ignis dotenv-flow
bun add drizzle-orm drizzle-zod pg lodash
```

**Development Dependencies:**

```bash
bun add -d typescript @types/bun @venizia/dev-configs
bun add -d tsc-alias
bun add -d drizzle-kit @types/pg @types/lodash
```

### 3. Configure Development Tools

**TypeScript** -- Create `tsconfig.json`:

```json
{
  "$schema": "http://json.schemastore.org/tsconfig",
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": "src",
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

**ESLint** -- Create `eslint.config.mjs`:

```javascript
import { eslintConfigs } from '@venizia/dev-configs';

export default eslintConfigs;
```

**Prettier** -- Create `.prettierrc.mjs`:

```javascript
import { prettierConfigs } from '@venizia/dev-configs';

export default prettierConfigs;
```

---

## Quick Start -- Hello World

### Minimal Example (Single File)

Create `src/index.ts`:

```typescript
import { z } from '@hono/zod-openapi';
import {
  BaseApplication,
  BaseController,
  controller,
  get,
  HTTP,
  IApplicationInfo,
  jsonContent,
} from '@venizia/ignis';
import { Context } from 'hono';

// 1. Define a controller
@controller({ path: '/hello' })
class HelloController extends BaseController {
  constructor() {
    super({ scope: 'HelloController', path: '/hello' });
  }

  override binding() {}

  @get({
    configs: {
      path: '/',
      method: HTTP.Methods.GET,
      responses: {
        [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
          description: 'Says hello',
          schema: z.object({ message: z.string() }),
        }),
      },
    },
  })
  sayHello(c: Context) {
    return c.json({ message: 'Hello from Ignis!' }, HTTP.ResultCodes.RS_2.Ok);
  }
}

// 2. Create the application
class App extends BaseApplication {
  getAppInfo(): IApplicationInfo {
    return { name: 'my-app', version: '1.0.0', description: 'My first Ignis app' };
  }

  staticConfigure() {}

  preConfigure() {
    this.controller(HelloController);
  }

  postConfigure() {}
  setupMiddlewares() {}
}

// 3. Start the server
const app = new App({
  scope: 'App',
  config: {
    host: '0.0.0.0',
    port: 3000,
    path: { base: '/api', isStrict: false },
  },
});

app.start();
```

### Run the Application

```bash
bun run src/index.ts
```

**Test the endpoint:**

```bash
curl http://localhost:3000/api/hello
# Response: {"message":"Hello from Ignis!"}
```

**View API Documentation:**

Open `http://localhost:3000/doc/explorer` in your browser for interactive Swagger UI documentation.

---

## Quick Start -- Full CRUD API in 5 Minutes

This section walks you through creating a working CRUD API with a database, model, repository, and auto-generated endpoints. No boilerplate, no ceremony.

### File Structure

```
my-crud-app/
  src/
    index.ts                        # Entry point + application + all code
    migration.ts                    # Drizzle migration config
  .env.development                  # Database credentials
  package.json
  tsconfig.json
```

### Step 1: Environment Variables

Create `.env.development`:

```env
NODE_ENV=development

APP_ENV_APPLICATION_NAME=my-crud-app
APP_ENV_SERVER_HOST=0.0.0.0
APP_ENV_SERVER_PORT=3000
APP_ENV_SERVER_BASE_PATH=/api

APP_ENV_POSTGRES_HOST=localhost
APP_ENV_POSTGRES_PORT=5432
APP_ENV_POSTGRES_USERNAME=postgres
APP_ENV_POSTGRES_PASSWORD=password
APP_ENV_POSTGRES_DATABASE=my_crud_db
```

### Step 2: Create the Database

```bash
createdb my_crud_db
```

### Step 3: Single-File CRUD Application

Create `src/index.ts`:

```typescript
import 'dotenv-flow/config';

import { z } from '@hono/zod-openapi';
import {
  applicationEnvironment,
  BaseApplication,
  BaseDataSource,
  BaseEntity,
  controller,
  ControllerFactory,
  datasource,
  DefaultCRUDRepository,
  generateIdColumnDefs,
  generateTzColumnDefs,
  HealthCheckComponent,
  IApplicationInfo,
  inject,
  int,
  model,
  repository,
  SwaggerComponent,
} from '@venizia/ignis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

// ---------------------------------------------------------------------------
// 1. MODEL -- Define database schema
// ---------------------------------------------------------------------------
@model({ type: 'entity' })
class Todo extends BaseEntity<typeof Todo.schema> {
  static override schema = pgTable('todos', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    title: text('title').notNull(),
    description: text('description'),
  });
}

// ---------------------------------------------------------------------------
// 2. DATASOURCE -- Database connection
// ---------------------------------------------------------------------------
@datasource({ driver: 'node-postgres' })
class PostgresDS extends BaseDataSource<{
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}> {
  constructor() {
    super({
      name: PostgresDS.name,
      config: {
        host: applicationEnvironment.get('APP_ENV_POSTGRES_HOST'),
        port: int(applicationEnvironment.get('APP_ENV_POSTGRES_PORT')),
        database: applicationEnvironment.get('APP_ENV_POSTGRES_DATABASE'),
        user: applicationEnvironment.get('APP_ENV_POSTGRES_USERNAME'),
        password: applicationEnvironment.get('APP_ENV_POSTGRES_PASSWORD'),
      },
    });
  }

  override configure() {
    const schema = this.getSchema();
    this.pool = new Pool(this.settings);
    this.connector = drizzle({ client: this.pool, schema });
  }

  override getConnectionString() {
    const { host, port, user, password, database } = this.settings;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}

// ---------------------------------------------------------------------------
// 3. REPOSITORY -- Data access layer (zero boilerplate)
// ---------------------------------------------------------------------------
@repository({ model: Todo, dataSource: PostgresDS })
class TodoRepository extends DefaultCRUDRepository<typeof Todo.schema> {}

// ---------------------------------------------------------------------------
// 4. CONTROLLER -- Auto-generated CRUD endpoints
// ---------------------------------------------------------------------------
const _TodoController = ControllerFactory.defineCrudController({
  entity: () => Todo,
  repository: { name: TodoRepository.name },
  controller: { name: 'TodoController', basePath: '/todos' },
});

@controller({ path: '/todos' })
class TodoController extends _TodoController {
  constructor(
    @inject({ key: 'repositories.TodoRepository' }) repo: TodoRepository,
  ) {
    super(repo);
  }
}

// ---------------------------------------------------------------------------
// 5. APPLICATION -- Wire everything together
// ---------------------------------------------------------------------------
class App extends BaseApplication {
  getAppInfo(): IApplicationInfo {
    return { name: 'my-crud-app', version: '1.0.0', description: 'CRUD in 5 minutes' };
  }

  staticConfigure() {}

  preConfigure() {
    this.component(HealthCheckComponent);
    this.component(SwaggerComponent);
    this.controller(TodoController);
  }

  postConfigure() {}
  setupMiddlewares() {}
}

// ---------------------------------------------------------------------------
// 6. START
// ---------------------------------------------------------------------------
const app = new App({
  scope: 'App',
  config: {
    host: process.env.APP_ENV_SERVER_HOST ?? '0.0.0.0',
    port: int(process.env.APP_ENV_SERVER_PORT ?? '3000'),
    path: { base: process.env.APP_ENV_SERVER_BASE_PATH ?? '/api', isStrict: false },
  },
});

app.start();
```

### Step 4: Database Migration

Create `src/migration.ts`:

```typescript
import 'dotenv-flow/config';

import { int } from '@venizia/ignis';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  out: './migration',
  schema: './src/index.ts',      // Points to files containing pgTable definitions
  dbCredentials: {
    host: process.env.APP_ENV_POSTGRES_HOST ?? 'localhost',
    port: int(process.env.APP_ENV_POSTGRES_PORT ?? '5432'),
    database: process.env.APP_ENV_POSTGRES_DATABASE ?? 'my_crud_db',
    user: process.env.APP_ENV_POSTGRES_USERNAME ?? 'postgres',
    password: process.env.APP_ENV_POSTGRES_PASSWORD ?? 'password',
    ssl: false,
  },
});
```

Push the schema to your database:

```bash
NODE_ENV=development drizzle-kit push --config=src/migration.ts
```

### Step 5: Run and Test

```bash
bun run src/index.ts
```

**Test the auto-generated CRUD endpoints:**

```bash
# Create a todo
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "Learn Ignis", "description": "Build a CRUD API in 5 minutes"}'

# List all todos
curl http://localhost:3000/api/todos

# Get a specific todo (replace <id> with actual ID from create response)
curl http://localhost:3000/api/todos/<id>

# Update a todo
curl -X PUT http://localhost:3000/api/todos/<id> \
  -H "Content-Type: application/json" \
  -d '{"title": "Learn Ignis (done!)"}'

# Delete a todo
curl -X DELETE http://localhost:3000/api/todos/<id>

# Count todos
curl http://localhost:3000/api/todos/count

# Health check
curl http://localhost:3000/api/health
```

**View auto-generated Swagger docs:**

Open `http://localhost:3000/doc/explorer` -- every CRUD endpoint is documented with request/response schemas.

---

## Complete Tutorial -- Todo API

This is a self-contained, production-quality tutorial. Follow it to build a complete Todo API with proper file separation, validation, hidden fields, timestamps, and custom business logic.

### Final File Structure

```
todo-app/
  src/
    application.ts
    index.ts
    migration.ts
    models/
      todo.model.ts
    datasources/
      postgres.datasource.ts
    repositories/
      todo.repository.ts
    controllers/
      todo.controller.ts
  .env.development
  package.json
  tsconfig.json
```

### Step 1: Model Definition

Create `src/models/todo.model.ts`:

```typescript
import {
  BaseEntity,
  generateIdColumnDefs,
  generateTzColumnDefs,
  model,
} from '@venizia/ignis';
import { boolean, pgTable, text } from 'drizzle-orm/pg-core';

@model({
  type: 'entity',
  settings: {
    // Soft delete: all queries auto-filter isDeleted = false
    defaultFilter: {
      where: { isDeleted: false },
    },
  },
})
export class Todo extends BaseEntity<typeof Todo.schema> {
  static override schema = pgTable('todos', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),   // UUID primary key
    ...generateTzColumnDefs(),                                   // createdAt, updatedAt

    title: text('title').notNull(),
    description: text('description'),
    isCompleted: boolean('is_completed').notNull().default(false),
    isDeleted: boolean('is_deleted').notNull().default(false),
  });
}
```

### Step 2: DataSource Configuration

Create `src/datasources/postgres.datasource.ts`:

```typescript
import {
  applicationEnvironment,
  BaseDataSource,
  datasource,
  int,
  ValueOrPromise,
} from '@venizia/ignis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

@datasource({ driver: 'node-postgres' })
export class PostgresDataSource extends BaseDataSource<{
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}> {
  constructor() {
    super({
      name: PostgresDataSource.name,
      config: {
        host: applicationEnvironment.get('APP_ENV_POSTGRES_HOST'),
        port: int(applicationEnvironment.get('APP_ENV_POSTGRES_PORT')),
        database: applicationEnvironment.get('APP_ENV_POSTGRES_DATABASE'),
        user: applicationEnvironment.get('APP_ENV_POSTGRES_USERNAME'),
        password: applicationEnvironment.get('APP_ENV_POSTGRES_PASSWORD'),
        ssl: false,
      },
    });
  }

  override configure(): ValueOrPromise<void> {
    // Schema is auto-discovered from @repository bindings -- no manual config needed
    const schema = this.getSchema();

    this.logger.debug(
      '[configure] Auto-discovered schema: %o',
      Object.keys(schema),
    );

    this.pool = new Pool(this.settings);
    this.connector = drizzle({ client: this.pool, schema });
  }

  override getConnectionString(): ValueOrPromise<string> {
    const { host, port, user, password, database } = this.settings;
    return `postgresql://${user}:${password}@${host}:${port}/${database}`;
  }
}
```

### Step 3: Repository

Create `src/repositories/todo.repository.ts`:

```typescript
import { PostgresDataSource } from '@/datasources/postgres.datasource';
import { Todo } from '@/models/todo.model';
import { DefaultCRUDRepository, repository } from '@venizia/ignis';

@repository({ model: Todo, dataSource: PostgresDataSource })
export class TodoRepository extends DefaultCRUDRepository<typeof Todo.schema> {
  // Zero boilerplate: DataSource auto-injected, full CRUD inherited

  // Add custom query methods as needed
  async findCompleted() {
    return this.find({
      filter: {
        where: { isCompleted: true },
        order: [{ createdAt: 'desc' }],
      },
    });
  }

  async findPending() {
    return this.find({
      filter: {
        where: { isCompleted: false },
        order: [{ createdAt: 'asc' }],
      },
    });
  }
}
```

### Step 4: Controller with Decorators

Create `src/controllers/todo.controller.ts`:

```typescript
import { z } from '@hono/zod-openapi';
import {
  BaseController,
  controller,
  del,
  get,
  HTTP,
  inject,
  jsonContent,
  jsonResponse,
  post,
  put,
  TRouteContext,
} from '@venizia/ignis';
import { TodoRepository } from '@/repositories/todo.repository';

// Request/Response schemas for OpenAPI documentation
const TodoSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  isCompleted: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const CreateTodoSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});

const UpdateTodoSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  isCompleted: z.boolean().optional(),
});

@controller({ path: '/todos' })
export class TodoController extends BaseController {
  constructor(
    @inject({ key: 'repositories.TodoRepository' })
    private todoRepo: TodoRepository,
  ) {
    super({ scope: 'TodoController', path: '/todos' });
  }

  override binding() {}

  // -------------------------------------------------------------------------
  // GET /todos -- List all todos
  // -------------------------------------------------------------------------
  @get({
    configs: {
      path: '/',
      method: HTTP.Methods.GET,
      responses: jsonResponse({
        description: 'List all todos',
        schema: z.array(TodoSchema),
      }),
    },
  })
  async list(c: TRouteContext) {
    const todos = await this.todoRepo.find({
      filter: {
        order: [{ createdAt: 'desc' }],
        limit: 100,
      },
    });
    return c.json(todos, HTTP.ResultCodes.RS_2.Ok);
  }

  // -------------------------------------------------------------------------
  // GET /todos/:id -- Get a single todo
  // -------------------------------------------------------------------------
  @get({
    configs: {
      path: '/:id',
      method: HTTP.Methods.GET,
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: jsonResponse({
        description: 'Get todo by ID',
        schema: TodoSchema,
      }),
    },
  })
  async findById(c: TRouteContext) {
    const { id } = c.req.valid<{ id: string }>('param');
    const todo = await this.todoRepo.findById({ id });
    if (!todo) {
      return c.json({ error: 'Todo not found' }, HTTP.ResultCodes.RS_4.NotFound);
    }
    return c.json(todo, HTTP.ResultCodes.RS_2.Ok);
  }

  // -------------------------------------------------------------------------
  // POST /todos -- Create a new todo
  // -------------------------------------------------------------------------
  @post({
    configs: {
      path: '/',
      method: HTTP.Methods.POST,
      request: {
        body: jsonContent({
          description: 'Create todo request body',
          schema: CreateTodoSchema,
        }),
      },
      responses: {
        [HTTP.ResultCodes.RS_2.Created]: jsonContent({
          description: 'Created todo',
          schema: TodoSchema,
        }),
      },
    },
  })
  async create(c: TRouteContext) {
    const data = c.req.valid<z.infer<typeof CreateTodoSchema>>('json');
    const result = await this.todoRepo.create({ data });
    return c.json(result.data, HTTP.ResultCodes.RS_2.Created);
  }

  // -------------------------------------------------------------------------
  // PUT /todos/:id -- Update a todo
  // -------------------------------------------------------------------------
  @put({
    configs: {
      path: '/:id',
      method: HTTP.Methods.PUT,
      request: {
        params: z.object({ id: z.string().uuid() }),
        body: jsonContent({
          description: 'Update todo request body',
          schema: UpdateTodoSchema,
        }),
      },
      responses: jsonResponse({
        description: 'Updated todo',
        schema: TodoSchema,
      }),
    },
  })
  async updateById(c: TRouteContext) {
    const { id } = c.req.valid<{ id: string }>('param');
    const data = c.req.valid<z.infer<typeof UpdateTodoSchema>>('json');
    const result = await this.todoRepo.updateById({ id, data });
    return c.json(result.data, HTTP.ResultCodes.RS_2.Ok);
  }

  // -------------------------------------------------------------------------
  // DELETE /todos/:id -- Soft-delete a todo
  // -------------------------------------------------------------------------
  @del({
    configs: {
      path: '/:id',
      method: HTTP.Methods.DELETE,
      request: { params: z.object({ id: z.string().uuid() }) },
      responses: jsonResponse({
        description: 'Deleted todo',
        schema: z.object({ message: z.string() }),
      }),
    },
  })
  async deleteById(c: TRouteContext) {
    const { id } = c.req.valid<{ id: string }>('param');
    // Soft delete: mark as deleted instead of removing
    await this.todoRepo.updateById({
      id,
      data: { isDeleted: true },
      options: { shouldSkipDefaultFilter: true },
    });
    return c.json({ message: 'Todo deleted' }, HTTP.ResultCodes.RS_2.Ok);
  }
}
```

### Step 5: Application Wiring

Create `src/application.ts`:

```typescript
import {
  BaseApplication,
  HealthCheckComponent,
  IApplicationConfigs,
  IApplicationInfo,
  int,
  SwaggerComponent,
} from '@venizia/ignis';
import { TodoController } from '@/controllers/todo.controller';

export const appConfigs: IApplicationConfigs = {
  host: process.env.APP_ENV_SERVER_HOST ?? '0.0.0.0',
  port: int(process.env.APP_ENV_SERVER_PORT ?? '3000'),
  path: {
    base: process.env.APP_ENV_SERVER_BASE_PATH ?? '/api',
    isStrict: false,
  },
};

export class TodoApplication extends BaseApplication {
  getAppInfo(): IApplicationInfo {
    return {
      name: 'todo-app',
      version: '1.0.0',
      description: 'A Todo API built with Ignis',
    };
  }

  staticConfigure() {}

  preConfigure() {
    // Register components
    this.component(HealthCheckComponent);
    this.component(SwaggerComponent);

    // Register controllers
    this.controller(TodoController);
  }

  postConfigure() {}
  setupMiddlewares() {}
}
```

### Step 6: Entry Point

Create `src/index.ts`:

```typescript
import 'dotenv-flow/config';

import { TodoApplication, appConfigs } from './application';

const app = new TodoApplication({
  scope: 'TodoApplication',
  config: appConfigs,
});

app.start();
```

### Step 7: Migration and Run

```bash
# Push schema to PostgreSQL
NODE_ENV=development drizzle-kit push --config=src/migration.ts

# Start the server
NODE_ENV=development bun run src/index.ts
```

### Step 8: Test Your API

```bash
# Create todos
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "Buy groceries", "description": "Milk, eggs, bread"}'

curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title": "Write documentation"}'

# List todos (isDeleted = false auto-applied by defaultFilter)
curl http://localhost:3000/api/todos

# Mark as completed
curl -X PUT http://localhost:3000/api/todos/<id> \
  -H "Content-Type: application/json" \
  -d '{"isCompleted": true}'

# Soft delete (sets isDeleted = true, disappears from list queries)
curl -X DELETE http://localhost:3000/api/todos/<id>

# Verify: list only shows non-deleted todos
curl http://localhost:3000/api/todos

# View interactive API docs
# Open http://localhost:3000/doc/explorer
```

---

## Project Structure

For production applications, organize your code like this:

```
my-ignis-app/
  src/
    application.ts            # Application configuration and lifecycle
    index.ts                  # Entry point (minimal: create app + start)
    migration.ts              # Drizzle migration configuration
    common/                   # Shared types, constants, environment keys
      environments.ts
    controllers/              # HTTP request handlers
      todo.controller.ts
    services/                 # Business logic
      todo.service.ts
    repositories/             # Data access layer
      todo.repository.ts
    models/                   # Database models (Drizzle pgTable + BaseEntity)
      entities/               # Entity definitions
        todo.model.ts
      requests/               # Zod request schemas (optional)
      responses/              # Zod response schemas (optional)
    datasources/              # Database connections
      postgres.datasource.ts
    components/               # Reusable modules (auth, mail, etc.)
      auth.component.ts
    providers/                # Custom DI providers
    helpers/                  # App-specific helper utilities
    utilities/                # Pure utility functions
  scripts/
    clean.sh
  .env.development            # Development environment variables
  .env.example                # Template for environment variables
  package.json
  tsconfig.json               # Extends @venizia/dev-configs/tsconfig.common.json
  eslint.config.mjs           # Uses eslintConfigs from @venizia/dev-configs
  .prettierrc.mjs             # Uses prettierConfigs from @venizia/dev-configs
```

The boot system auto-discovers files by convention:
- `controllers/*.controller.{ts,js}` -> Registered as transient bindings
- `services/*.service.{ts,js}` -> Registered as transient bindings
- `repositories/*.repository.{ts,js}` -> Registered as transient bindings
- `datasources/*.datasource.{ts,js}` -> Registered as **singleton** bindings (connection pooling)

---

## Available Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json && tsc-alias -p tsconfig.json",
    "clean": "sh ./scripts/clean.sh",
    "rebuild": "bun run clean && bun run build",
    "server:dev": "NODE_ENV=development bun .",
    "server:prod": "NODE_ENV=production bun .",
    "compile:linux": "bun build --compile --minify --sourcemap --target=bun-linux-x64 ./src/index.ts --outfile ./dist/app",
    "migrate:dev": "NODE_ENV=development drizzle-kit push --config=src/migration.ts",
    "generate-migration:dev": "NODE_ENV=development drizzle-kit generate --config=src/migration.ts",
    "lint": "bun run eslint && bun run prettier:cli",
    "lint:fix": "bun run eslint --fix && bun run prettier:fix",
    "eslint": "eslint --report-unused-disable-directives .",
    "prettier:cli": "prettier \"**/*.{js,ts}\" -l",
    "prettier:fix": "bun run prettier:cli --write"
  }
}
```

| Script | Command | Description |
| --- | --- | --- |
| `server:dev` | `NODE_ENV=development bun .` | Start development server |
| `server:prod` | `NODE_ENV=production bun .` | Start production server |
| `build` | `tsc -p tsconfig.json && tsc-alias -p tsconfig.json` | Compile TypeScript |
| `rebuild` | `bun run clean && bun run build` | Clean and rebuild |
| `compile:linux` | `bun build --compile --minify ...` | Standalone binary for Linux |
| `clean` | `sh ./scripts/clean.sh` | Remove build artifacts |
| `migrate:dev` | `NODE_ENV=development drizzle-kit push ...` | Push schema to dev database |
| `generate-migration:dev` | `NODE_ENV=development drizzle-kit generate ...` | Generate migration SQL files |
| `lint` | `bun run eslint && bun run prettier:cli` | Check code style |
| `lint:fix` | `bun run eslint --fix && bun run prettier:fix` | Auto-fix code style |

---

## Core Concepts

### Architecture Flow

```
  HTTP Request
  GET /api/todos/:id
        |
        v
  +------------------+
  |  Hono Router      |  <-- OpenAPIHono with Zod schema validation
  +--------+---------+
           |
           v
  +------------------+
  |  Auth Middleware   |  <-- JWT/Basic token verification (optional per route)
  +--------+---------+
           |
           v
  +------------------+
  |  Controller       |  <-- Handles HTTP, validates input, OpenAPI specs
  |  @get('/...')     |
  +--------+---------+
           |
           v
  +------------------+
  |  Service          |  <-- Business logic (optional layer)
  |  (optional)       |
  +--------+---------+
           |
           v
  +------------------+
  |  Repository       |  <-- Type-safe data access (find, create, update, delete)
  |  findById(id)     |      Mixins: FieldsVisibility, DefaultFilter
  +--------+---------+
           |
           v
  +------------------+
  |  DataSource       |  <-- Drizzle ORM + node-postgres connection pool
  |  (singleton)      |      Schema auto-discovery from @repository bindings
  +--------+---------+
           |
           v
  +------------------+
  |   PostgreSQL      |
  +------------------+
```

### Dependency Injection

Ignis uses decorator-based DI with an options-object convention:

```typescript
@controller({ path: '/users' })
export class UserController extends BaseController {
  constructor(
    @inject({ key: 'services.UserService' }) private userService: UserService,
  ) {
    super({ scope: 'UserController', path: '/users' });
  }
}
```

Bindings are namespaced: `"controllers.UserController"`, `"services.AuthService"`, `"repositories.UserRepo"`. The namespace (`controllers`, `services`, etc.) automatically becomes a tag for discovery.

### DI Flow in Detail

Understanding how decorators, metadata, and the IoC container work together:

```
1. DECORATION PHASE (at class definition time)
   @controller({ path: '/users' })     --> MetadataRegistry stores controller metadata
   @inject({ key: 'services.X' })      --> MetadataRegistry stores injection metadata
   @repository({ model, dataSource })  --> MetadataRegistry stores model-datasource binding

2. REGISTRATION PHASE (during app.preConfigure or boot)
   app.controller(UserController)
     --> container.bind('controllers.UserController')
                  .toClass(UserController)
                  .tag('controllers')

3. RESOLUTION PHASE (when container.get is called)
   container.get({ key: 'controllers.UserController' })
     --> Reads constructor metadata from MetadataRegistry
     --> Recursively resolves @inject dependencies:
         container.get({ key: 'services.UserService' })
           --> container.get({ key: 'repositories.UserRepo' })
               --> container.get({ key: 'datasources.PostgresDS' })  (singleton!)
     --> Instantiates UserController with resolved dependencies

4. SINGLETON vs TRANSIENT
   DataSources: singleton (one connection pool, shared)
   Repositories: transient (new instance per resolution)
   Services: transient
   Controllers: transient
```

### Boot Sequence

When using the `BootMixin` for auto-discovery:

```
app.boot()
  |
  v
BootMixin --> Bootstrapper
  |
  v
  For each Booter (Controller, Service, Repository, DataSource):
    1. CONFIGURE -- Merge defaults with user options
       Default dirs: controllers/, services/, repositories/, datasources/
       Default ext:  *.controller.ts, *.service.ts, *.repository.ts, *.datasource.ts
    |
    v
    2. DISCOVER -- Glob filesystem for matching files
       Pattern: {projectRoot}/{dir}/**/*.{ext}
    |
    v
    3. LOAD -- For each discovered file:
       a. Dynamic import (await import(filePath))
       b. Filter class exports (skip non-class, non-matching exports)
       c. Bind to IoC container with namespace key
          e.g., UserController --> 'controllers.UserController'
```

### Request Lifecycle

Full lifecycle of a single HTTP request through the framework:

```
Client --> HTTP Request
  |
  v
[Hono Server] -- Receives raw HTTP request
  |
  v
[Global Middlewares] -- CORS, body limit, request ID injection
  |
  v
[OpenAPIHono Router] -- Matches route via path + method
  |
  v
[Zod Validation] -- Validates params, query, body against schemas
  |                   (returns 400 if invalid)
  v
[Auth Middleware] -- If route has 'authenticate' config:
  |                   - Extract token from Authorization header
  |                   - Verify via JWT/Basic strategy
  |                   - Set 'currentUser' in Hono context
  |                   - Returns 401/403 if invalid
  v
[Controller Method] -- Business logic executes
  |                     - Access validated input via c.req.valid()
  |                     - Access current user via c.get(Authentication.CURRENT_USER)
  v
[Repository] -- Data access with type-safe filters
  |              - FieldsVisibilityMixin strips hidden fields
  |              - DefaultFilterMixin applies default where clause
  v
[DataSource] -- Drizzle ORM generates SQL
  |              - Executes via node-postgres Pool
  v
[PostgreSQL] -- Database query
  |
  v
[Response] -- c.json(data, statusCode)
  |            - OpenAPI-compliant response
  v
Client <-- HTTP Response
```

### Repository Pattern

The repository hierarchy provides progressive capability:

```
AbstractRepository        -- Base + FieldsVisibility + DefaultFilter mixins
  ReadableRepository      -- find, findOne, findById, count, existsWith
    PersistableRepository -- + create, updateById, updateAll
      DefaultCRUDRepository -- + deleteById, deleteAll
```

Choose the right base class for your needs:
- **ReadableRepository** -- Read-only access (reference data, lookup tables)
- **PersistableRepository** -- Read + write, no deletes (audit logs, events)
- **DefaultCRUDRepository** -- Full CRUD (most common choice)

```typescript
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  // Zero boilerplate -- DataSource auto-injected from @repository decorator
  // Inherits full CRUD: find, findOne, findById, create, updateById, deleteById, etc.
}
```

**Filter system with where operators:**

```typescript
await this.userRepo.find({
  filter: {
    where: {
      status: 'active',
      age: { gte: 18, lte: 65 },
      name: { ilike: '%john%' },
      role: { inq: ['admin', 'manager'] },
    },
    fields: ['id', 'name', 'email'],
    order: [{ name: 'asc' }],
    limit: 20,
    skip: 0,
  },
});
```

**Complete list of where operators:**

| Operator | Description | Example |
| --- | --- | --- |
| `eq` | Equals | `{ status: { eq: 'active' } }` or `{ status: 'active' }` |
| `neq` | Not equals | `{ status: { neq: 'deleted' } }` |
| `gt` | Greater than | `{ age: { gt: 18 } }` |
| `gte` | Greater than or equal | `{ age: { gte: 18 } }` |
| `lt` | Less than | `{ age: { lt: 65 } }` |
| `lte` | Less than or equal | `{ age: { lte: 65 } }` |
| `like` | Pattern match (case-sensitive) | `{ name: { like: '%john%' } }` |
| `ilike` | Pattern match (case-insensitive) | `{ name: { ilike: '%john%' } }` |
| `inq` | In array | `{ role: { inq: ['admin', 'user'] } }` |
| `nin` | Not in array | `{ status: { nin: ['deleted', 'banned'] } }` |
| `and` | Logical AND | `{ and: [{ age: { gt: 18 } }, { status: 'active' }] }` |
| `or` | Logical OR | `{ or: [{ role: 'admin' }, { role: 'manager' }] }` |

**Include relations:**

```typescript
await this.productRepo.findOne({
  filter: {
    where: { id: productId },
    include: [
      {
        relation: 'saleChannelProducts',
        scope: {
          include: [{ relation: 'saleChannel' }],
        },
      },
    ],
  },
});
```

**Dual Query API:**

The repository provides two internal query paths:
- **Core API** (default) -- 15-20% faster, no relation support. Used when `include` is not specified.
- **Query API** -- Supports `include` for eager-loading relations. Automatically selected when `include` is present in the filter.

### Transaction Support

Repositories support seamless transaction switching. The same API works with or without transactions -- just pass `{ transaction }` in options:

```typescript
const tx = await this.dataSource.beginTransaction({
  isolationLevel: 'READ COMMITTED',
});

try {
  await this.userRepo.create({
    data: userData,
    options: { transaction: tx },
  });
  await this.auditRepo.create({
    data: auditEntry,
    options: { transaction: tx },
  });
  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
}
```

**Supported isolation levels:** `READ UNCOMMITTED`, `READ COMMITTED`, `REPEATABLE READ`, `SERIALIZABLE`

### Models with Enrichers

Models combine Drizzle's `pgTable` with Ignis's `@model` decorator for metadata. Schema enrichers provide common column patterns:

```typescript
@model({
  type: 'entity',
  settings: {
    hiddenProperties: ['password'],      // Excluded at SQL level, not post-query
    defaultFilter: { isDeleted: false },  // Auto-applied to all queries
  },
})
export class User extends BaseEntity<typeof User.schema> {
  static schema = pgTable('users', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),  // UUID primary key
    ...generateTzColumnDefs(),                                  // createdAt, updatedAt
    ...generateUserAuditColumnDefs({                            // createdBy, modifiedBy
      created: { dataType: 'string', columnName: 'created_by' },
      modified: { dataType: 'string', columnName: 'modified_by' },
    }),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    password: varchar('password', { length: 255 }).notNull(),
  });
}
```

**Available enrichers:**

| Enricher | Function | Columns Added |
| --- | --- | --- |
| ID | `generateIdColumnDefs({ id: { dataType: 'string' } })` | `id` (UUID or serial) |
| Timestamps | `generateTzColumnDefs()` | `createdAt`, `updatedAt` (with timezone) |
| User Audit | `generateUserAuditColumnDefs(opts)` | `createdBy`, `modifiedBy` |
| Soft Delete | `withSoftDelete()` | `isDeleted`, `deletedAt` |
| Data Type | `generateDataTypeColumnDefs()` | `type`, `description`, `metadata` |
| Extra User | `extraUserColumns({ idType })` | Additional user-specific columns |

**Model settings:**

| Setting | Type | Description |
| --- | --- | --- |
| `hiddenProperties` | `string[]` | Fields excluded from ALL query results at SQL level (not post-filtering). Use for passwords, secrets, internal fields. |
| `defaultFilter` | `{ where?, limit? }` | Auto-applied to all read queries. Commonly used for soft delete (`{ isDeleted: false }`). Skippable via `shouldSkipDefaultFilter: true`. |

### OpenAPI and Swagger Auto-Generation

Every route decorator automatically generates OpenAPI documentation. The combination of `@hono/zod-openapi` + Ignis decorators means your API is always documented:

```typescript
@get({
  configs: {
    path: '/:id',
    method: HTTP.Methods.GET,
    // These Zod schemas become OpenAPI parameter/response definitions
    request: {
      params: z.object({ id: z.string().uuid() }),
    },
    responses: jsonResponse({
      description: 'Get user by ID',
      schema: z.object({
        id: z.string().uuid(),
        name: z.string(),
        email: z.string().email(),
      }),
    }),
  },
})
```

This produces a full OpenAPI 3.0 spec that powers:
- **Swagger UI** -- Interactive documentation at `/doc/explorer`
- **Scalar UI** -- Modern alternative at `/doc/explorer` (configurable)
- **OpenAPI JSON** -- Raw spec at `/doc/openapi.json`

**Response helper functions:**

| Helper | Description |
| --- | --- |
| `jsonContent({ schema, description })` | JSON body specification for a single status code |
| `jsonResponse({ schema, description })` | Full response specification including error fallback responses |
| `htmlResponse({ description })` | HTML response specification |
| `idParamsSchema({ idType })` | Standard path parameter schema for `:id` routes |

### Application Lifecycle

The application goes through a strict lifecycle. Understanding this is important for knowing where to put your code:

```
Phase                        | What to do here
-----------------------------|----------------------------------------------
1. staticConfigure()         | Serve static files, pre-DI setup
2. preConfigure()            | Register controllers, services, components
                             |   this.controller(XController)
                             |   this.component(HealthCheckComponent)
                             |   Bind configuration values
3. registerDataSources()     | [AUTOMATIC] Configure all discovered datasources
                             |   Auto-discovers schema from @repository bindings
4. registerComponents()      | [AUTOMATIC] Configure all registered components
5. registerControllers()     | [AUTOMATIC] Mount all controller routes to Hono
6. postConfigure()           | Post-registration hooks, inspection, seeding
7. setupMiddlewares()        | Register Hono middlewares (CORS, body limit, etc.)
8. start()                   | Start HTTP server (Bun.serve or @hono/node-server)
9. executePostStartHooks()   | [AUTOMATIC] Run post-start hooks
```

Phases 3, 4, 5, and 9 are automatic -- you only need to implement the others.

---

## Complete Configuration Reference

### Application Configuration (IApplicationConfigs)

```typescript
const config: IApplicationConfigs = {
  // Server binding
  host: '0.0.0.0',           // Listen address (default: '0.0.0.0')
  port: 3000,                 // Listen port (default: 3000)

  // URL path configuration
  path: {
    base: '/api',              // Base path prefix for all routes
    isStrict: false,           // If true, trailing slashes matter
  },

  // Request ID tracking
  requestId: {
    isStrict: boolean,         // Require x-request-id header
  },

  // Favicon path (optional)
  favicon: '/path/to/favicon.ico',

  // Error response format
  error: {
    rootKey: 'error',          // Root key in error JSON responses
  },

  // Async context support (for request-scoped DI)
  asyncContext: {
    enable: false,             // Enable async local storage context
  },

  // Boot options (for auto-discovery)
  bootOptions: {
    // Override default boot directories and extensions
  },

  // Debug options
  debug: {
    shouldShowRoutes: true,    // Log all registered routes at startup
  },
};
```

### Environment Variables Reference

All framework environment variables follow the `APP_ENV_*` prefix convention:

**Application:**

| Variable | Description | Example |
| --- | --- | --- |
| `NODE_ENV` | Runtime environment | `development`, `production` |
| `DEBUG` | Enable debug logging | `true` |
| `TZ` | Timezone | `Asia/Ho_Chi_Minh` |
| `APP_ENV_APPLICATION_NAME` | Application name | `my-api` |
| `APP_ENV_APPLICATION_TIMEZONE` | App timezone | `Asia/Ho_Chi_Minh` |
| `APP_ENV_APPLICATION_SECRET` | Application secret (for crypto) | `secret_value` |
| `APP_ENV_APPLICATION_ROLES` | Roles for this instance | `api` |

**Server:**

| Variable | Description | Example |
| --- | --- | --- |
| `APP_ENV_SERVER_HOST` | Listen host | `0.0.0.0` |
| `APP_ENV_SERVER_PORT` | Listen port | `3000` |
| `APP_ENV_SERVER_BASE_PATH` | API base path | `/api` or `/v1/api` |

**Database (PostgreSQL):**

| Variable | Description | Example |
| --- | --- | --- |
| `APP_ENV_POSTGRES_HOST` | Database host | `localhost` |
| `APP_ENV_POSTGRES_PORT` | Database port | `5432` |
| `APP_ENV_POSTGRES_USERNAME` | Database user | `postgres` |
| `APP_ENV_POSTGRES_PASSWORD` | Database password | `password` |
| `APP_ENV_POSTGRES_DATABASE` | Database name | `my_db` |
| `APP_ENV_DATASOURCE_NAME` | DataSource identifier | `pg_core` |

**Authentication (JWT):**

| Variable | Description | Example |
| --- | --- | --- |
| `APP_ENV_JWT_SECRET` | JWT signing secret | `jwt_secret_key` |
| `APP_ENV_JWT_EXPIRES_IN` | Token expiration (seconds) | `86400` |

**Logger:**

| Variable | Description | Example |
| --- | --- | --- |
| `APP_ENV_LOGGER_FOLDER_PATH` | Log file directory | `./app_data/logs` |
| `APP_ENV_LOGGER_FORMAT` | Log format | `json` |

**Use `dotenv-flow` for environment-specific files:**

```
.env                  # Shared defaults (committed to git)
.env.development      # Development overrides
.env.production       # Production overrides
.env.local            # Local machine overrides (gitignored)
```

### Database Migration Configuration

Create `src/migration.ts` to use with `drizzle-kit`:

```typescript
import 'dotenv-flow/config';

import { int } from '@venizia/ignis';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  out: './migration',                    // Output directory for generated SQL
  schema: './src/models/entities',       // Directory containing pgTable definitions
  dbCredentials: {
    host: process.env.APP_ENV_POSTGRES_HOST ?? 'localhost',
    port: int(process.env.APP_ENV_POSTGRES_PORT ?? '5432'),
    database: process.env.APP_ENV_POSTGRES_DATABASE ?? 'postgres',
    user: process.env.APP_ENV_POSTGRES_USERNAME ?? 'postgres',
    password: process.env.APP_ENV_POSTGRES_PASSWORD ?? 'password',
    ssl: false,
  },
});
```

**Migration commands:**

```bash
# Push schema directly to database (development)
NODE_ENV=development drizzle-kit push --config=src/migration.ts

# Generate migration SQL files (production)
NODE_ENV=development drizzle-kit generate --config=src/migration.ts

# View current schema status
NODE_ENV=development drizzle-kit studio --config=src/migration.ts
```

---

## Built-in Components

Components are pluggable modules that add functionality to your application. Register them in `preConfigure()`:

```typescript
class App extends BaseApplication {
  preConfigure() {
    this.component(HealthCheckComponent);
    this.component(SwaggerComponent);
    this.component(AuthenticateComponent);
    // ...
  }
}
```

### Component Catalog

| Component | What It Provides | Endpoints | Binding Key |
| --- | --- | --- | --- |
| **HealthCheckComponent** | Health, liveness, and readiness probes for container orchestration | `GET /health`, `/health/live`, `/health/ready` | `HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS` |
| **SwaggerComponent** | Interactive API documentation with Swagger UI or Scalar UI | `GET /doc/explorer`, `/doc/openapi.json` | `SwaggerBindingKeys.SWAGGER_OPTIONS` |
| **AuthenticateComponent** | JWT + Basic auth strategies, token services, strategy registry, auth middleware | Auth endpoints configurable | `AuthenticateBindingKeys.REST_OPTIONS`, `.JWT_OPTIONS`, `.BASIC_OPTIONS` |
| **AuthorizationComponent** | Casbin-based RBAC, permission mapping, `authorize()` middleware | N/A (middleware only) | `AuthorizationBindingKeys.*` |
| **RequestTrackerComponent** | `x-request-id` header injection, request body parsing for logging | N/A (middleware only) | N/A |
| **StaticAssetComponent** | File upload/download CRUD with MinIO, Disk, or Memory storage backend | Configurable CRUD endpoints | `StaticAssetComponentBindingKeys.STATIC_ASSET_COMPONENT_OPTIONS` |
| **MailComponent** | Email sending via Nodemailer or Mailgun with Direct, BullMQ, or InternalQueue executors | N/A (service only) | `MailBindingKeys.*` |
| **SocketIOComponent** | Socket.IO server with Redis adapter for horizontal scaling | WebSocket endpoint | `SocketIOBindingKeys.*` |

### Authentication Example

```typescript
import {
  AuthenticateComponent,
  AuthenticateBindingKeys,
  Authentication,
  AuthenticationStrategyRegistry,
  JWTAuthenticationStrategy,
  BasicAuthenticationStrategy,
} from '@venizia/ignis';

class App extends BaseApplication {
  preConfigure() {
    // Configure JWT options
    this.bind({ key: AuthenticateBindingKeys.JWT_OPTIONS }).toValue({
      jwtSecret: process.env.APP_ENV_JWT_SECRET,
      applicationSecret: process.env.APP_ENV_APPLICATION_SECRET,
      getTokenExpiresFn: () => 86400, // 24 hours
    });

    // Register the component
    this.component(AuthenticateComponent);

    // Register strategies
    AuthenticationStrategyRegistry.getInstance().register({
      container: this,
      strategies: [
        { name: Authentication.STRATEGY_JWT, strategy: JWTAuthenticationStrategy },
        { name: Authentication.STRATEGY_BASIC, strategy: BasicAuthenticationStrategy },
      ],
    });
  }
}
```

**Protect routes with authentication:**

```typescript
@get({
  configs: {
    path: '/profile',
    method: HTTP.Methods.GET,
    authenticate: { strategies: [Authentication.STRATEGY_JWT] },
    responses: jsonResponse({ description: 'User profile', schema: UserSchema }),
  },
})
async getProfile(c: TRouteContext) {
  const currentUser = c.get(Authentication.CURRENT_USER);
  return c.json(currentUser, HTTP.ResultCodes.RS_2.Ok);
}
```

### ControllerFactory -- Auto-Generated CRUD

For maximum productivity, `ControllerFactory` auto-generates all CRUD endpoints:

```typescript
const _Controller = ControllerFactory.defineCrudController({
  entity: () => Configuration,
  repository: { name: ConfigurationRepository.name },
  controller: { name: 'ConfigurationController', basePath: '/configurations' },
  authenticate: { strategies: [Authentication.STRATEGY_JWT] },
  routes: {
    count: { skipAuth: true },                                    // Public endpoint
    create: { authenticate: { strategies: ['basic'] } },         // Override auth per route
    deleteById: { authenticate: { strategies: ['jwt'] } },      // JWT only
  },
});

@controller({ path: '/configurations' })
export class ConfigurationController extends _Controller {
  constructor(
    @inject({ key: 'repositories.ConfigurationRepository' }) repo: ConfigurationRepository,
  ) {
    super(repo);
  }

  // Override any auto-generated method for custom logic
  override async create(opts: { context: TRouteContext }) {
    const currentUser = opts.context.get(Authentication.CURRENT_USER);
    this.logger.info('Creating configuration | user: %s', currentUser);
    return super.create(opts);
  }
}
```

This generates: `GET /`, `GET /count`, `GET /:id`, `POST /`, `PUT /:id`, `PATCH /:id`, `DELETE /:id` -- all with OpenAPI documentation.

---

## Helpers Ecosystem

The `@venizia/ignis-helpers` package provides production-ready infrastructure utilities. Each helper extends `BaseHelper` and follows the same pattern:

| Helper | Import Path | Description |
| --- | --- | --- |
| **LoggerFactory** | `@venizia/ignis-helpers` | Winston-based logger with daily file rotation, UDP transport, and scoped logging (`logger.for('method')`) |
| **RedisHelper** | `@venizia/ignis-helpers/redis` | Redis Single + Cluster mode, pub/sub with zlib compression, hash operations, key expiry |
| **QueueHelper (BullMQ)** | `@venizia/ignis-helpers/bullmq` | Redis-backed job queue with delayed jobs, retries, concurrency, and dashboard support |
| **QueueHelper (InMem)** | `@venizia/ignis-helpers/in-mem-queue` | In-memory generator-based queue for development and testing |
| **QueueHelper (MQTT)** | `@venizia/ignis-helpers/mqtt` | MQTT message queue for IoT and lightweight pub/sub |
| **QueueHelper (Kafka)** | `@venizia/ignis-helpers/kafka` | Apache Kafka producer/consumer/admin (experimental) |
| **MinioHelper** | `@venizia/ignis-helpers/minio` | S3-compatible object storage (MinIO) with bucket management |
| **DiskHelper** | `@venizia/ignis-helpers/disk-storage` | Local filesystem storage with the same IStorageHelper interface |
| **MemoryHelper** | `@venizia/ignis-helpers/memory-storage` | In-memory storage for testing |
| **CryptoHelper** | `@venizia/ignis-helpers/crypto` | AES-256-CBC/GCM encryption, RSA with DER keys, ECDH P-256 key exchange |
| **UIDHelper** | `@venizia/ignis-helpers/uid` | Snowflake 70-bit unique IDs (48-bit timestamp + 10-bit worker + 12-bit seq), Base62 encoding |
| **CronHelper** | `@venizia/ignis-helpers/cron` | Cron job scheduling with modification and duplication support |
| **SocketIOHelper** | `@venizia/ignis-helpers/socketio` | Socket.IO server with Redis adapter, authentication, room management |
| **NetworkHelper** | `@venizia/ignis-helpers/network` | HTTP client (Axios/fetch), TCP server/client with TLS, UDP with multicast |
| **WorkerHelper** | `@venizia/ignis-helpers/worker` | Thread pool management (max = CPU cores) for CPU-intensive tasks |
| **EnvironmentHelper** | `@venizia/ignis-helpers` | Runtime detection (Bun/Node), prefixed environment variable management |

[Full helpers documentation ->](packages/helpers/README.md)

---

## Code Comparison -- Ignis vs Express vs NestJS

### Repository Pattern: TypeORM (NestJS) vs Drizzle (Ignis)

**NestJS + TypeORM -- entity + repository + service + module:**

```typescript
// user.entity.ts
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ select: false })  // Hidden field
  password: string;
}

// users.service.ts
@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private usersRepo: Repository<User>) {}

  findAll() {
    return this.usersRepo.find();
  }

  findOne(id: number) {
    return this.usersRepo.findOneBy({ id });
  }
}

// users.module.ts (required boilerplate)
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  controllers: [UsersController],
})
export class UsersModule {}
```

**Ignis + Drizzle -- model + repository (no module, no service required):**

```typescript
// user.model.ts
@model({
  type: 'entity',
  settings: { hiddenProperties: ['password'] },   // Excluded at SQL level
})
export class User extends BaseEntity<typeof User.schema> {
  static schema = pgTable('users', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    ...generateTzColumnDefs(),
    name: text('name').notNull(),
    password: text('password').notNull(),
  });
}

// user.repository.ts (no module file needed)
@repository({ model: User, dataSource: PostgresDataSource })
export class UserRepository extends DefaultCRUDRepository<typeof User.schema> {
  // Full CRUD inherited. Zero boilerplate. Auto-discovered by boot.
}
```

Key differences:
- Ignis hidden fields are excluded at SQL level (never fetched), not post-filtered
- No module files -- boot auto-discovers repositories by file convention
- No separate service file needed for basic CRUD -- repository provides it all
- Type safety from Drizzle schema flows through to repository methods

---

## Deployment

### Bun Standalone Binary

Compile your application into a single executable with no runtime dependencies:

```bash
# Linux x64
bun build --compile --minify --sourcemap \
  --target=bun-linux-x64 \
  ./src/index.ts \
  --outfile ./dist/app

# Linux ARM64 (Raspberry Pi, AWS Graviton)
bun build --compile --minify --sourcemap \
  --target=bun-linux-arm64 \
  ./src/index.ts \
  --outfile ./dist/app

# Run the binary directly (no bun, no node required on target machine)
./dist/app
```

### Docker Deployment

**Dockerfile:**

```dockerfile
# -- Build stage --
FROM oven/bun:1.3 AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ ./src/

RUN bun run build

# -- Production stage --
FROM oven/bun:1.3-slim
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Environment
ENV NODE_ENV=production
ENV APP_ENV_SERVER_HOST=0.0.0.0
ENV APP_ENV_SERVER_PORT=3000

EXPOSE 3000

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["bun", "dist/index.js"]
```

**Docker Compose with PostgreSQL:**

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      APP_ENV_SERVER_HOST: 0.0.0.0
      APP_ENV_SERVER_PORT: 3000
      APP_ENV_SERVER_BASE_PATH: /api
      APP_ENV_POSTGRES_HOST: postgres
      APP_ENV_POSTGRES_PORT: 5432
      APP_ENV_POSTGRES_USERNAME: postgres
      APP_ENV_POSTGRES_PASSWORD: ${DB_PASSWORD}
      APP_ENV_POSTGRES_DATABASE: app_db
      APP_ENV_JWT_SECRET: ${JWT_SECRET}
      APP_ENV_APPLICATION_SECRET: ${APP_SECRET}
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: app_db
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
```

### Standalone Binary in Docker (Smallest Image)

For the smallest possible production image, compile to a standalone binary:

```dockerfile
# -- Build stage --
FROM oven/bun:1.3 AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ ./src/

# Compile to standalone binary
RUN bun build --compile --minify \
  --target=bun-linux-x64 \
  ./src/index.ts \
  --outfile ./dist/app

# -- Production stage (no bun runtime needed) --
FROM debian:bookworm-slim
WORKDIR /app

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist/app ./app

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["./app"]
```

### Health Check for Container Orchestration

Register the `HealthCheckComponent` for Kubernetes/Docker health probes:

```typescript
import { HealthCheckComponent, HealthCheckBindingKeys } from '@venizia/ignis';

class App extends BaseApplication {
  preConfigure() {
    this.bind({ key: HealthCheckBindingKeys.HEALTH_CHECK_OPTIONS }).toValue({
      restOptions: { path: '/health' },
    });
    this.component(HealthCheckComponent);
  }
}
```

**Endpoints provided:**

| Endpoint | Purpose | Kubernetes Probe |
| --- | --- | --- |
| `GET /health` | General health status | `startupProbe` |
| `GET /health/live` | Is the process alive? | `livenessProbe` |
| `GET /health/ready` | Is the service ready to accept traffic? | `readinessProbe` |

**Kubernetes deployment example:**

```yaml
apiVersion: apps/v1
kind: Deployment
spec:
  template:
    spec:
      containers:
        - name: app
          image: my-ignis-app:latest
          ports:
            - containerPort: 3000
          livenessProbe:
            httpGet:
              path: /api/health/live
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/health/ready
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
```

### Environment-Based Configuration

Use `dotenv-flow` to manage different environments:

```
.env                   # Shared defaults (committed)
.env.development       # Development settings (committed)
.env.production        # Production settings (committed, no secrets)
.env.local             # Local machine overrides (gitignored)
.env.development.local # Local dev overrides (gitignored)
.env.production.local  # Local prod overrides (gitignored)
```

`dotenv-flow` loads files in order of specificity. Start your app with:

```bash
# Development
NODE_ENV=development bun .

# Production
NODE_ENV=production bun .
```

---

## Monorepo Development

### Build All Packages

```bash
# Build all packages (respects dependency order)
make build

# Build specific package (includes all dependencies)
make core        # Builds dev-configs -> inversion -> helpers -> boot -> core
make boot        # Builds dev-configs -> inversion -> helpers -> boot

# Clean all build artifacts
make clean
```

### All Makefile Targets

**Main targets:**

| Target | Description |
| --- | --- |
| `make build` | Rebuild all packages in dependency order |
| `make install` | Install all dependencies with bun |
| `make clean` | Clean build artifacts from all packages |
| `make setup-hooks` | Configure git to use `.githooks` directory |

**Individual package builds:**

| Target | Description |
| --- | --- |
| `make core` | Rebuild `@venizia/ignis` (and all dependencies) |
| `make boot` | Rebuild `@venizia/ignis-boot` (and dependencies) |
| `make helpers` | Rebuild `@venizia/ignis-helpers` (and dependencies) |
| `make inversion` | Rebuild `@venizia/ignis-inversion` (and dependencies) |
| `make dev-configs` | Rebuild `@venizia/dev-configs` |
| `make docs` | Build VitePress documentation site |
| `make docs-mcp` | Build MCP server for documentation |

**Force update targets (fetch latest from npm):**

| Target | Description |
| --- | --- |
| `make update` | Force update all packages from npm registry |
| `make update-core` | Force update core package dependencies |
| `make update-helpers` | Force update helpers package dependencies |
| `make update-inversion` | Force update inversion package dependencies |
| `make update-boot` | Force update boot package dependencies |
| `make update-dev-configs` | Force update dev-configs dependencies |

**Lint targets:**

| Target | Description |
| --- | --- |
| `make lint` | Lint all packages |
| `make lint-all` | Lint all packages AND examples |
| `make lint-packages` | Lint packages/ directory only |
| `make lint-examples` | Lint examples/ directory only |
| `make lint-core` | Lint `@venizia/ignis` only |
| `make lint-helpers` | Lint `@venizia/ignis-helpers` only |
| `make lint-inversion` | Lint `@venizia/ignis-inversion` only |
| `make lint-boot` | Lint `@venizia/ignis-boot` only |

### Build Individual Package

```bash
cd packages/core
bun run rebuild
```

### Lint

```bash
# Lint all packages
make lint

# Lint packages and examples
make lint-all

# Auto-fix in a specific package
cd packages/core
bun run lint:fix
```

### Test

```bash
# Run tests in a specific package
cd packages/core
bun test

# Run specific test file
bun test src/__tests__/path/to/test.ts
```

---

## Examples

The `examples/` directory contains reference implementations:

| Example | Description | Complexity |
| --- | --- | --- |
| **[5-mins-qs](examples/5-mins-qs/)** | Minimal single-file quickstart -- hello world | Beginner |
| **[vert](examples/vert/)** | Production-ready reference with full CRUD, auth, components, transactions, multiple models with relations | Advanced |
| **[rpc-api-server](examples/rpc-api-server/)** | RPC-style API server | Intermediate |
| **[rpc-client-app](examples/rpc-client-app/)** | React 19 + Vite + Ant Design frontend consuming RPC API | Frontend |
| **[socket-io-test](examples/socket-io-test/)** | Socket.IO real-time integration example | Intermediate |
| **[websocket-test](examples/websocket-test/)** | Native WebSocket integration example | Intermediate |

### Running the Reference Example

```bash
cd examples/vert

# Copy environment template
cp .env.example .env.development

# Edit .env.development with your PostgreSQL credentials

# Install and run
bun install
bun run migrate:dev    # Push schema to database
bun run server:dev     # Start development server
```

---

## Frequently Asked Questions

### Can I use Ignis with Node.js instead of Bun?

Yes. Bun is the primary runtime and provides the best performance, but Ignis supports Node.js >= 18 as a secondary runtime. The framework detects the runtime automatically and uses `@hono/node-server` when running on Node.js instead of `Bun.serve`. Some helpers (like Bun-native WebSocket) are Bun-specific, but the core framework, controllers, repositories, and components all work on Node.js.

### Can I use MySQL or SQLite instead of PostgreSQL?

Drizzle ORM supports MySQL and SQLite, but Ignis repositories are built around `pgTable` (PostgreSQL table definitions). The where operators, filter builders, and query generation assume PostgreSQL semantics. Using MySQL or SQLite would require building custom repository implementations. If you need MySQL/SQLite, consider using Hono directly with Drizzle without the Ignis repository layer.

### How does Ignis compare to LoopBack 4?

Ignis is directly inspired by LoopBack 4's architecture -- decorator-based DI, repository pattern, boot system, and component model. Key differences:

| Aspect | LoopBack 4 | Ignis |
| --- | --- | --- |
| Performance | ~15-20k req/s | ~140k req/s |
| HTTP Engine | Express | Hono |
| ORM | Juggler (custom) | Drizzle (type-safe SQL) |
| Maintenance | Abandoned (IBM) | Actively developed |
| IoC Container | ~2000 lines, complex | ~350 lines, simple |
| Runtime | Node.js only | Bun primary, Node.js secondary |
| OpenAPI | Decorators + manual schemas | Auto-generated from Zod schemas |

### Can I use Ignis without the DI container?

It is not recommended. The entire framework is built around the DI container -- controllers, repositories, datasources, and components all depend on it. If you need a minimal setup without DI, consider using Hono directly. That said, you can use the minimal approach shown in the [Quick Start](#quick-start----hello-world) where you manually instantiate controllers without the boot system.

### Is Ignis production-ready?

Ignis is at version 0.x, which means the API may have breaking changes between minor versions. However, it is used internally in production at VENIZIA AI. The core patterns (controllers, repositories, DI, components) are stable. We recommend pinning exact versions in production and testing thoroughly before upgrading.

### How do I add custom middleware?

Override the `setupMiddlewares()` method in your application:

```typescript
class App extends BaseApplication {
  async setupMiddlewares() {
    const server = this.getServer();

    // CORS middleware
    const { cors } = await import('hono/cors');
    server.use('*', cors({
      origin: '*',
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    }));

    // Body limit middleware
    const { bodyLimit } = await import('hono/body-limit');
    server.use('*', bodyLimit({
      maxSize: 100 * 1024 * 1024, // 100MB
    }));

    // Custom middleware
    server.use('*', async (c, next) => {
      const start = Date.now();
      await next();
      const duration = Date.now() - start;
      c.header('X-Response-Time', `${duration}ms`);
    });
  }
}
```

### How do I define relations between models?

Use the static `relations` method on your model class:

```typescript
@model({ type: 'entity' })
export class Product extends BaseEntity<typeof Product.schema> {
  static override schema = pgTable('Product', {
    ...generateIdColumnDefs({ id: { dataType: 'string' } }),
    name: text('name').notNull(),
  });

  static override relations = (): TRelationConfig[] => [
    {
      name: 'saleChannelProducts',
      type: RelationTypes.MANY,
      schema: SaleChannelProduct.schema,
      metadata: {
        relationName: 'product',
      },
    },
  ];
}
```

Then query with `include`:

```typescript
const product = await this.productRepo.findOne({
  filter: {
    where: { id: productId },
    include: [
      {
        relation: 'saleChannelProducts',
        scope: { include: [{ relation: 'saleChannel' }] },
      },
    ],
  },
});
```

### What are the three ways to define routes?

Ignis supports three route definition patterns in controllers. Use whichever fits your style:

**1. Decorator pattern (recommended):**

```typescript
@get({
  configs: {
    path: '/',
    method: HTTP.Methods.GET,
    responses: { 200: jsonContent({ schema: z.object({ message: z.string() }) }) },
  },
})
getItems(c: TRouteContext) {
  return c.json({ message: 'Hello' }, 200);
}
```

**2. Imperative pattern (in `binding()` method):**

```typescript
override binding() {
  this.defineRoute({
    configs: { path: '/items', method: 'get', responses: { ... } },
    handler: (c) => c.json({ message: 'Hello' }, 200),
  });
}
```

**3. Fluent pattern (in `binding()` method):**

```typescript
override binding() {
  this.bindRoute({
    configs: { path: '/items', method: 'get', responses: { ... } },
  }).to({
    handler: (c) => c.json({ message: 'Hello' }, 200),
  });
}
```

All three produce identical OpenAPI documentation and runtime behavior.

---

## Documentation

**Online Documentation**: [https://venizia-ai.github.io/ignis](https://venizia-ai.github.io/ignis)

### Getting Started

- [Philosophy](packages/docs/wiki/get-started/philosophy.md) -- Understand the "why" behind Ignis
- [Prerequisites](packages/docs/wiki/get-started/prerequisites.md) -- Required tools and setup
- [5-Minute Quickstart](packages/docs/wiki/get-started/5-minute-quickstart.md) -- Fastest path to a working API
- [Complete Setup Guide](packages/docs/wiki/get-started/quickstart.md) -- Production-ready setup
- [Building a CRUD API](packages/docs/wiki/get-started/building-a-crud-api.md) -- Complete tutorial

### Core Concepts

- [Application Lifecycle](packages/docs/wiki/get-started/core-concepts/application.md)
- [Controllers](packages/docs/wiki/get-started/core-concepts/controllers.md)
- [Dependency Injection](packages/docs/wiki/get-started/core-concepts/dependency-injection.md)
- [Services](packages/docs/wiki/get-started/core-concepts/services.md)
- [Persistent Layer](packages/docs/wiki/get-started/core-concepts/persistent.md)
- [Components](packages/docs/wiki/get-started/core-concepts/components.md)

### Best Practices

- [Architectural Patterns](packages/docs/wiki/get-started/best-practices/architectural-patterns.md)
- [Security Guidelines](packages/docs/wiki/get-started/best-practices/security-guidelines.md)
- [Performance Optimization](packages/docs/wiki/get-started/best-practices/performance-optimization.md)
- [Code Style Standards](packages/docs/wiki/get-started/best-practices/code-style-standards.md)

### API Reference

- [Components](packages/docs/wiki/references/components/)
- [Base Abstractions](packages/docs/wiki/references/base/)
- [Helpers](packages/docs/wiki/references/helpers/)
- [Utilities](packages/docs/wiki/references/utilities/)

---

## Contributing

Contributions are welcome! Please read our:

- [Contributing Guide](CONTRIBUTING.md) -- How to contribute
- [Code of Conduct](CODE_OF_CONDUCT.md) -- Community guidelines
- [Security Policy](SECURITY.md) -- Reporting vulnerabilities

### Development Setup

```bash
# Clone the repository
git clone https://github.com/venizia-ai/ignis.git
cd ignis

# Install dependencies
bun install

# Build all packages
make build

# Run documentation locally
bun run docs:dev
```

### Code Conventions

- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`
- **Branch naming**: `feature/*`, `fix/*`, `docs/*`, `chore/*`
- **PRs target `develop`** -- never `main` directly
- **Options objects**: `fn({ key, value })` not `fn(key, value)`
- **Package manager**: Bun only -- never npm, yarn, or pnpm
- **Build tool**: `tsc` directly -- never `npx`, `bunx`, or `bun x`

---

## License

This project is licensed under the **MIT License** -- see the [LICENSE.md](LICENSE.md) file for details.

---

## Acknowledgments

Ignis is inspired by:

- **[LoopBack 4](https://loopback.io/)** -- Enterprise patterns, decorator-based DI, repository pattern, component system
- **[Hono](https://hono.dev/)** -- Performance, modern API design, multi-runtime support
- **[Drizzle ORM](https://orm.drizzle.team/)** -- Type-safe SQL, schema-first approach
- **[NestJS](https://nestjs.com/)** -- Module system concepts, decorator patterns
- **[Spring Boot](https://spring.io/projects/spring-boot)** -- IoC/DI container design, auto-configuration patterns

---

## Support

- **Documentation**: [https://venizia-ai.github.io/ignis](https://venizia-ai.github.io/ignis)
- **GitHub Issues**: [https://github.com/VENIZIA-AI/ignis/issues](https://github.com/VENIZIA-AI/ignis/issues)
- **Author**: VENIZIA AI Developer <developer@venizia.ai>
