<div align="center">

<br />

# :fire: IGNIS

**Enterprise-grade TypeScript server infrastructure built on Hono.**

[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](LICENSE.md)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.3-f472b6.svg?style=flat-square&logo=bun&logoColor=white)](https://bun.sh)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-5FA04E.svg?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen.svg?style=flat-square)](#)
[![Docs](https://img.shields.io/badge/Docs-venizia--ai.github.io%2Fignis-2563EB.svg?style=flat-square)](https://venizia-ai.github.io/ignis)
[![Ask DeepWiki](https://img.shields.io/badge/Ask-DeepWiki-blue.svg?style=flat-square)](https://deepwiki.com/VENIZIA-AI/ignis)

<br />

| Package | Version |
| :--- | :--- |
| `@venizia/ignis` | [![npm](https://img.shields.io/npm/v/@venizia/ignis.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis) |
| `@venizia/ignis-boot` | [![npm](https://img.shields.io/npm/v/@venizia/ignis-boot.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-boot) |
| `@venizia/ignis-inversion` | [![npm](https://img.shields.io/npm/v/@venizia/ignis-inversion.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-inversion) |
| `@venizia/ignis-helpers` | [![npm](https://img.shields.io/npm/v/@venizia/ignis-helpers.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-helpers) |
| `@venizia/dev-configs` | [![npm](https://img.shields.io/npm/v/@venizia/dev-configs.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/dev-configs) |
| `@venizia/ignis-docs` | [![npm](https://img.shields.io/npm/v/@venizia/ignis-docs.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-docs) |

<br />

Ignis brings together the structured, enterprise development experience of **LoopBack 4** with the
blazing speed and simplicity of **Hono** -- giving you the best of both worlds. Think LoopBack 4's
decorator-driven DI, repository pattern, and component system, running on Hono's ~140k req/s engine
with Drizzle ORM's type-safe SQL.

<br />

[Getting Started](#installation) &#8226;
[Documentation](https://venizia-ai.github.io/ignis) &#8226;
[Examples](#examples) &#8226;
[Contributing](#contributing)

<br />

</div>

---

## Table of Contents

- [Key Features](#key-features)
- [When Should You Use Ignis?](#when-should-you-use-ignis)
- [Framework Comparison](#framework-comparison)
- [Monorepo Packages](#monorepo-packages)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start----hello-world)
- [Architecture Flow](#architecture-flow)
- [Application Lifecycle](#application-lifecycle)
- [Built-in Components](#built-in-components)
- [Helpers Ecosystem](#helpers-ecosystem)
- [Project Structure](#project-structure)
- [Monorepo Development](#monorepo-development)
- [Examples](#examples)
- [FAQ](#frequently-asked-questions)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Key Features

- **High Performance** -- Built on Hono, one of the fastest web frameworks (~140k req/s on Bun)
- **Enterprise Architecture** -- Layered architecture with Controllers, Services, Repositories, and DataSources
- **Dependency Injection** -- Lightweight IoC container (~350 lines) with constructor and property injection
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
| :--- | :--- | :--- | :--- |
| **Performance** | ~150k req/s | ~25k req/s | **~140k req/s** |
| **Architecture** | Flexible (DIY) | Strict conventions | Guided conventions |
| **Learning Curve** | Low | High | Medium |
| **Dependency Injection** | Manual / 3rd party | Built-in (complex) | Built-in (simple) |
| **ORM** | BYO | TypeORM / Prisma | Drizzle (type-safe SQL) |
| **OpenAPI Docs** | Manual setup | Swagger module | Auto-generated |
| **Auth** | BYO | Passport / Guards | JWT + Basic built-in |
| **Community** | Large (Express) / Growing (Hono) | Very large | Growing |
| **Best For** | Microservices, serverless | Large teams, enterprise | Growing APIs, small teams |

### Same Endpoint in Ignis

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

> [!TIP]
> See the [Philosophy page](packages/docs/wiki/guides/get-started/philosophy.md) for detailed Express vs NestJS vs Ignis code comparisons.

---

## Monorepo Packages

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

| Package | npm | Description |
| :--- | :--- | :--- |
| **[@venizia/ignis](packages/core/)** | `@venizia/ignis` | Main framework -- Application, Controllers, Repositories, Models, DataSources, Components, Auth |
| **[@venizia/ignis-boot](packages/boot/)** | `@venizia/ignis-boot` | Convention-based auto-discovery and bootstrapping (configure -> discover -> load) |
| **[@venizia/ignis-inversion](packages/inversion/)** | `@venizia/ignis-inversion` | Standalone DI/IoC container (~350 lines) -- Container, Binding, MetadataRegistry, decorators |
| **[@venizia/ignis-helpers](packages/helpers/)** | `@venizia/ignis-helpers` | Production utilities -- Logger, Redis, Queue, Storage, Crypto, Cron, Socket.IO, UID, Network |
| **[@venizia/dev-configs](packages/dev-configs/)** | `@venizia/dev-configs` | Shared ESLint v9, Prettier, and TypeScript configs |
| **[@venizia/ignis-docs](packages/docs/)** | `@venizia/ignis-docs` | VitePress documentation site and MCP server |

> [!TIP]
> Each package has its own detailed README with API reference, usage examples, and configuration options.

---

## Prerequisites

| Tool | Version | Purpose |
| :--- | :---: | :--- |
| **Bun** | >= 1.3.0 | JavaScript runtime (recommended) |
| **Node.js** | >= 18.x | Alternative runtime (optional) |
| **PostgreSQL** | >= 14.x | Database server |

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

> [!IMPORTANT]
> Both `experimentalDecorators` and `emitDecoratorMetadata` must be `true` in your `tsconfig.json`. The easiest way is to extend `@venizia/dev-configs/tsconfig.common.json`.

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

> [!TIP]
> See the [complete CRUD tutorial](https://venizia-ai.github.io/ignis) and [5-minute quickstart example](examples/5-mins-qs/) for a full working API with database, models, repositories, and auto-generated CRUD endpoints.

---

## Architecture Flow

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

Bindings are namespaced: `"controllers.UserController"`, `"services.AuthService"`, `"repositories.UserRepo"`. The namespace automatically becomes a tag for discovery.

> [!NOTE]
> See the [Core Concepts documentation](https://venizia-ai.github.io/ignis) for DI flow details, boot sequence, request lifecycle, repository pattern, transaction support, and models with enrichers.

---

## Application Lifecycle

| Phase | Method | What to do |
| :---: | :--- | :--- |
| 1 | `staticConfigure()` | Serve static files, pre-DI setup |
| 2 | `preConfigure()` | Register controllers, services, components |
| 3 | `registerDataSources()` | *[AUTOMATIC]* Configure all datasources |
| 4 | `registerComponents()` | *[AUTOMATIC]* Configure all components |
| 5 | `registerControllers()` | *[AUTOMATIC]* Mount all controller routes |
| 6 | `postConfigure()` | Post-registration hooks, inspection, seeding |
| 7 | `setupMiddlewares()` | Register Hono middlewares (CORS, body limit) |
| 8 | `start()` | Start HTTP server (Bun or Node) |
| 9 | `executePostStartHooks()` | *[AUTOMATIC]* Run post-start hooks |

Phases 3, 4, 5, and 9 are automatic -- you only need to implement the others.

---

## Built-in Components

Register components in `preConfigure()`:

```typescript
class App extends BaseApplication {
  preConfigure() {
    this.component(HealthCheckComponent);
    this.component(SwaggerComponent);
    this.component(AuthenticateComponent);
  }
}
```

### Component Catalog

| Component | What It Provides | Endpoints |
| :--- | :--- | :--- |
| **HealthCheckComponent** | Health, liveness, and readiness probes | `GET /health`, `/health/live`, `/health/ready` |
| **SwaggerComponent** | Interactive API documentation (Swagger UI or Scalar UI) | `GET /doc/explorer`, `/doc/openapi.json` |
| **AuthenticateComponent** | JWT + Basic auth strategies, token services, auth middleware | Configurable |
| **AuthorizationComponent** | Casbin-based RBAC, permission mapping, `authorize()` middleware | N/A (middleware) |
| **RequestTrackerComponent** | `x-request-id` header injection, request body parsing | N/A (middleware) |
| **StaticAssetComponent** | File upload/download CRUD with MinIO, Disk, or Memory backend | Configurable CRUD |
| **MailComponent** | Email via Nodemailer or Mailgun with Direct, BullMQ, or InternalQueue executors | N/A (service) |
| **SocketIOComponent** | Socket.IO server with Redis adapter for horizontal scaling | WebSocket |

> [!TIP]
> See the [Core README](packages/core/README.md) for detailed component configuration, authentication setup, and ControllerFactory auto-generated CRUD.

---

## Helpers Ecosystem

The `@venizia/ignis-helpers` package provides production-ready infrastructure utilities. Each helper extends `BaseHelper` and follows the same pattern:

| Helper | Import Path | Description |
| :--- | :--- | :--- |
| **LoggerFactory** | `@venizia/ignis-helpers` | Winston-based logger with daily file rotation, UDP transport, and scoped logging |
| **RedisHelper** | `@venizia/ignis-helpers/redis` | Redis Single + Cluster mode, pub/sub with zlib compression |
| **QueueHelper (BullMQ)** | `@venizia/ignis-helpers/bullmq` | Redis-backed job queue with delayed jobs, retries, concurrency |
| **QueueHelper (InMem)** | `@venizia/ignis-helpers/in-mem-queue` | In-memory generator-based queue for development/testing |
| **QueueHelper (MQTT)** | `@venizia/ignis-helpers/mqtt` | MQTT message queue for IoT and lightweight pub/sub |
| **QueueHelper (Kafka)** | `@venizia/ignis-helpers/kafka` | Apache Kafka producer/consumer/admin (experimental) |
| **MinioHelper** | `@venizia/ignis-helpers/minio` | S3-compatible object storage with bucket management |
| **DiskHelper** | `@venizia/ignis-helpers/disk-storage` | Local filesystem storage with common IStorageHelper interface |
| **CryptoHelper** | `@venizia/ignis-helpers/crypto` | AES-256-CBC/GCM encryption, RSA with DER keys, ECDH P-256 |
| **UIDHelper** | `@venizia/ignis-helpers/uid` | Snowflake 70-bit unique IDs, Base62 encoding |
| **CronHelper** | `@venizia/ignis-helpers/cron` | Cron job scheduling with modification and duplication |
| **SocketIOHelper** | `@venizia/ignis-helpers/socket-io` | Socket.IO server with Redis adapter, auth, room management |
| **NetworkHelper** | `@venizia/ignis-helpers/network` | HTTP client, TCP server/client with TLS, UDP with multicast |
| **WorkerHelper** | `@venizia/ignis-helpers/worker` | Thread pool management (max = CPU cores) |

[Full helpers documentation ->](packages/helpers/README.md)

---

## Project Structure

```
my-ignis-app/
  src/
    application.ts            # Application configuration and lifecycle
    index.ts                  # Entry point
    migration.ts              # Drizzle migration configuration
    controllers/              # HTTP request handlers
    services/                 # Business logic
    repositories/             # Data access layer
    models/entities/          # Database models (Drizzle pgTable + BaseEntity)
    datasources/              # Database connections
    components/               # Reusable modules
  .env.development
  tsconfig.json
```

The boot system auto-discovers files by convention:

- `controllers/*.controller.{ts,js}` -> Registered as transient bindings
- `services/*.service.{ts,js}` -> Registered as transient bindings
- `repositories/*.repository.{ts,js}` -> Registered as transient bindings
- `datasources/*.datasource.{ts,js}` -> Registered as **singleton** bindings

---

## Monorepo Development

### Key Commands

```bash
# Build all packages (respects dependency order)
make build

# Build specific package (includes all dependencies)
make core        # Builds dev-configs -> inversion -> helpers -> boot -> core
make boot        # Builds dev-configs -> inversion -> helpers -> boot

# Clean all build artifacts
make clean

# Lint
make lint        # Lint all packages
make lint-all    # Lint packages and examples

# Test (from package directory)
cd packages/core && bun test

# Build individual package
cd packages/core && bun run rebuild
```

| Target | Description |
| :--- | :--- |
| `make build` | Rebuild all packages in dependency order |
| `make install` | Install all dependencies with bun |
| `make clean` | Clean build artifacts from all packages |
| `make core` | Rebuild `@venizia/ignis` (and all dependencies) |
| `make lint` | Lint all packages |
| `make lint-all` | Lint packages and examples |

---

## Examples

The `examples/` directory contains reference implementations:

| Example | Description | Complexity |
| :--- | :--- | :---: |
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

Drizzle ORM supports MySQL and SQLite, but Ignis repositories are built around `pgTable` (PostgreSQL table definitions). The where operators, filter builders, and query generation assume PostgreSQL semantics. Using MySQL or SQLite would require building custom repository implementations.

### How does Ignis compare to LoopBack 4?

| Aspect | LoopBack 4 | Ignis |
| :--- | :--- | :--- |
| Performance | ~15-20k req/s | **~140k req/s** |
| HTTP Engine | Express | Hono |
| ORM | Juggler (custom) | Drizzle (type-safe SQL) |
| Maintenance | Abandoned (IBM) | Actively developed |
| IoC Container | ~2000 lines, complex | ~350 lines, simple |
| Runtime | Node.js only | Bun primary, Node.js secondary |

### Is Ignis production-ready?

Ignis is at version 0.x, which means the API may have breaking changes between minor versions. However, it is used internally in production at VENIZIA AI. The core patterns (controllers, repositories, DI, components) are stable. We recommend pinning exact versions and testing thoroughly before upgrading.

> [!TIP]
> See the [full documentation](https://venizia-ai.github.io/ignis) for more FAQs covering middleware, relations, route patterns, and deployment.

---

## Documentation

**Online Documentation**: [https://venizia-ai.github.io/ignis](https://venizia-ai.github.io/ignis)

The documentation covers getting started, core concepts (application lifecycle, controllers, DI, repositories, components), best practices (architecture, security, performance), API references, and deployment guides.

Key links: [Philosophy](packages/docs/wiki/guides/get-started/philosophy.md) &#8226; [5-Minute Quickstart](packages/docs/wiki/guides/get-started/5-minute-quickstart.md) &#8226; [Building a CRUD API](packages/docs/wiki/guides/tutorials/building-a-crud-api.md) &#8226; [Core Concepts](packages/docs/wiki/references/base/application.md) &#8226; [Best Practices](packages/docs/wiki/best-practices/architectural-patterns.md)

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
