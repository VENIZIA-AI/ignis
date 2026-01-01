# 🔥 IGNIS

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE.md)
[![Bun Version](https://img.shields.io/badge/bun-%3E%3D1.3-black)](https://bun.sh)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![Documentation](https://img.shields.io/badge/docs-venizia--ai.github.io%2Fignis-blue)](https://venizia-ai.github.io/ignis)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/VENIZIA-AI/ignis)

> A TypeScript Server Infrastructure combining enterprise-grade patterns with high performance.

Ignis brings together the structured, enterprise development experience of **LoopBack 4** with the blazing speed and simplicity of **Hono** - giving you the best of both worlds.

---

## 🚀 Key Features

- ⚡ **High Performance** - Built on Hono, one of the fastest web frameworks
- 🏗️ **Enterprise Architecture** - Layered architecture with Controllers, Services, and Repositories
- 💉 **Dependency Injection** - Built-in DI container for loosely coupled, testable code
- 🔐 **Type Safety** - Full TypeScript support with excellent type inference
- 📝 **Auto-Generated API Docs** - OpenAPI/Swagger documentation out of the box
- 🗃️ **Database ORM** - Integrated with Drizzle ORM for type-safe database operations
- 🧩 **Component-Based** - Modular, reusable components (Authentication, Logging, Health Checks, etc.)
- 🎯 **Decorator-Based Routing** - Clean, declarative route definitions with `@get`, `@post`, etc.
- ✅ **Built-in Validation** - Zod schema validation for requests and responses
- 🔄 **Multi-Runtime** - Works on Node.js, Bun, Deno, and Cloudflare Workers

---

## 📋 Table of Contents

- [When Should You Use Ignis?](#-when-should-you-use-ignis)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Project Structure](#-project-structure)
- [Available Scripts](#-available-scripts)
- [Core Concepts](#-core-concepts)
- [Documentation](#-documentation)
- [Examples](#-examples)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🎯 When Should You Use Ignis?

### ✅ Perfect For

- **E-commerce Backends** - Complex business logic, multiple controllers, auth, payments
- **SaaS Platform APIs** - Multi-tenant architecture, modular components
- **Enterprise Tools** - Team collaboration with clear architectural patterns
- **Growing APIs** - 10+ endpoints that need structure and maintainability

### ❌ Not Recommended For

- **Simple Proxies/Webhooks** - Too much structure for tiny services
- **Quick Prototypes** - Use plain Hono for maximum speed
- **3-5 Endpoint APIs** - Consider plain Hono unless you plan to grow

### 🔄 Framework Comparison

| Aspect | Minimal (Hono, Express) | Enterprise (NestJS, LoopBack) | **Ignis** |
| --- | --- | --- | --- |
| **Performance** | ⚡ ~150k req/s | ~25k req/s | ⚡ ~140k req/s |
| **Architecture** | Flexible (DIY) | Strict conventions | Guided conventions |
| **Learning Curve** | Low | High | Medium |
| **Dependency Injection** | Manual/3rd party | Built-in (complex) | Built-in (simple) |
| **Community** | Large (Express) / Growing (Hono) | Very large | Small (new) |
| **Best For** | Microservices, serverless | Large teams, enterprise | Growing APIs, small teams |

**Choose wisely:** Each approach has genuine strengths. See [Philosophy](packages/docs/wiki/get-started/philosophy.md) for detailed comparison.

---

## 📦 Prerequisites

Before starting with Ignis, ensure you have:

| Tool           | Version | Purpose                          |
| -------------- | ------- | -------------------------------- |
| **Bun**        | ≥ 1.3.0 | JavaScript runtime (recommended) |
| **Node.js**    | ≥ 18.x  | Alternative runtime (optional)   |
| **PostgreSQL** | ≥ 14.x  | Database server                  |

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

## ⚙️ Installation

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

**TypeScript** - Create `tsconfig.json`:

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

**ESLint** - Create `eslint.config.mjs`:

```javascript
import { eslintConfigs } from "@venizia/dev-configs";

export default eslintConfigs;
```

**Prettier** - Create `.prettierrc.mjs`:

```javascript
import { prettierConfigs } from "@venizia/dev-configs";

export default prettierConfigs;
```

Create `.prettierignore`:

```
dist
node_modules
*.log
.*-audit.json
```

---

## 🚀 Quick Start

### Minimal Example (Single File)

Create `index.ts`:

```typescript
import { z } from "@hono/zod-openapi";
import {
  BaseApplication,
  BaseController,
  controller,
  get,
  HTTP,
  IApplicationInfo,
  jsonContent,
} from "@venizia/ignis";
import { Context } from "hono";
import appInfo from "./../package.json";

// 1. Define a controller
@controller({ path: "/hello" })
class HelloController extends BaseController {
  constructor() {
    super({ scope: "HelloController", path: "/hello" });
  }

  // NOTE: This is a function that must be overridden.
  override binding() {
    // Bind dependencies here (if needed)
    // Extra binding routes with functional way, use `bindRoute` or `defineRoute`
  }

  @get({
    configs: {
      path: "/",
      method: HTTP.Methods.GET,
      responses: {
        [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
          description: "Says hello",
          schema: z.object({ message: z.string() }),
        }),
      },
    },
  })
  sayHello(c: Context) {
    return c.json({ message: "Hello from Ignis!" }, HTTP.ResultCodes.RS_2.Ok);
  }
}

// 2. Create the application
class App extends BaseApplication {
  getAppInfo(): IApplicationInfo {
    return appInfo;
  }

  staticConfigure() {
    // Static configuration before dependency injection
  }

  preConfigure() {
    this.controller(HelloController);
  }

  postConfigure() {
    // Configuration after all bindings are complete
  }

  setupMiddlewares() {
    // Custom middleware setup (optional)
  }
}

// 3. Start the server
const app = new App({
  scope: "App",
  config: {
    host: "0.0.0.0",
    port: 3000,
    path: { base: "/api", isStrict: false },
  },
});

app.start();
```

### Run the Application

```bash
bun run index.ts
```

**Test the endpoint:**

```bash
curl http://localhost:3000/api/hello
# Response: {"message":"Hello from Ignis!"}
```

**View API Documentation:**

Open `http://localhost:3000/doc/explorer` in your browser to see interactive Swagger UI documentation!

---

## 📁 Project Structure

For production applications, organize your code like this:

```
my-ignis-app/
├── src/
│   ├── application.ts          # Application configuration
│   ├── index.ts                # Entry point
│   ├── controllers/            # HTTP request handlers
│   │   └── todo.controller.ts
│   ├── services/               # Business logic
│   │   └── todo.service.ts
│   ├── repositories/           # Data access layer
│   │   └── todo.repository.ts
│   ├── models/                 # Database models
│   │   └── todo.model.ts
│   ├── datasources/            # Database connections
│   │   └── postgres.datasource.ts
│   └── components/             # Reusable modules
│       └── auth.component.ts
├── scripts/
│   └── clean.sh                # Cleanup script
├── package.json
├── tsconfig.json               # Extends @venizia/dev-configs/tsconfig.common.json
├── eslint.config.mjs           # Uses eslintConfigs from @venizia/dev-configs
└── .prettierrc.mjs             # Uses prettierConfigs from @venizia/dev-configs
```

---

## 🔧 Available Scripts

Add these scripts to your `package.json`:

| Script                   | Command                                                                                                  | Description                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Development**          |                                                                                                          |                                    |
| `server:dev`             | `NODE_ENV=development bun .`                                                                             | Start development server           |
| `rebuild`                | `bun run clean && bun run build`                                                                         | Clean and rebuild project          |
| **Building**             |                                                                                                          |                                    |
| `build`                  | `tsc -p tsconfig.json && tsc-alias -p tsconfig.json`                                                     | Compile TypeScript to JavaScript   |
| `compile:linux`          | `bun build --compile --minify --sourcemap --target=bun-linux-x64 ./src/index.ts --outfile ./dist/my_app` | Create standalone binary for Linux |
| `clean`                  | `sh ./scripts/clean.sh`                                                                                  | Remove build artifacts             |
| **Database**             |                                                                                                          |                                    |
| `migrate:dev`            | `NODE_ENV=development drizzle-kit push --config=src/migration.ts`                                        | Apply database migrations          |
| `generate-migration:dev` | `NODE_ENV=development drizzle-kit generate --config=src/migration.ts`                                    | Generate migration files           |
| **Code Quality**         |                                                                                                          |                                    |
| `lint`                   | `bun run eslint && bun run prettier:cli`                                                                 | Check code style                   |
| `lint:fix`               | `bun run eslint --fix && bun run prettier:fix`                                                           | Auto-fix code style issues         |
| `eslint`                 | `eslint --report-unused-disable-directives .`                                                            | Run ESLint                         |
| `prettier:cli`           | `prettier "**/*.{js,ts}" -l`                                                                             | Check formatting                   |
| `prettier:fix`           | `prettier "**/*.{js,ts}" --write`                                                                        | Auto-format code                   |
| **Production**           |                                                                                                          |                                    |
| `server:prod`            | `NODE_ENV=production bun .`                                                                              | Start production server            |

### Example `package.json` Scripts Section

```json
{
  "scripts": {
    "lint": "bun run eslint && bun run prettier:cli",
    "lint:fix": "bun run eslint --fix && bun run prettier:fix",
    "prettier:cli": "prettier \"**/*.{js,ts}\" -l",
    "prettier:fix": "bun run prettier:cli --write",
    "eslint": "eslint --report-unused-disable-directives .",
    "build": "tsc -p tsconfig.json && tsc-alias -p tsconfig.json",
    "compile:linux": "bun build --compile --minify --sourcemap --target=bun-linux-x64 ./src/index.ts --outfile ./dist/my_app",
    "clean": "sh ./scripts/clean.sh",
    "rebuild": "bun run clean && bun run build",
    "migrate:dev": "NODE_ENV=development drizzle-kit push --config=src/migration.ts",
    "generate-migration:dev": "NODE_ENV=development drizzle-kit generate --config=src/migration.ts",
    "preserver:dev": "bun run rebuild",
    "server:dev": "NODE_ENV=development bun .",
    "server:prod": "NODE_ENV=production bun ."
  }
}
```

---

## 💡 Core Concepts

### Architecture Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     HTTP Request                             │
│              GET /api/todos/:id                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
           ┌──────────────────┐
           │  Controller      │  ← Handles HTTP, validates input
           │  @get('/...')    │
           └─────────┬────────┘
                     │ calls service/repository
                     ▼
           ┌──────────────────┐
           │  Service         │  ← Business logic (optional)
           │  (optional)      │
           └─────────┬────────┘
                     │ uses repository
                     ▼
           ┌──────────────────┐
           │  Repository      │  ← Type-safe data access
           │  findById(id)    │
           └─────────┬────────┘
                     │ uses dataSource
                     ▼
           ┌──────────────────┐
           │  DataSource      │  ← Database connection
           │  (Drizzle ORM)   │
           └─────────┬────────┘
                     │ executes SQL
                     ▼
           ┌──────────────────┐
           │   PostgreSQL     │  ← Database
           └──────────────────┘
```

### Key Components

1. **Controllers** - Handle HTTP requests and responses
2. **Services** - Contain business logic (optional layer)
3. **Repositories** - Abstract data access operations
4. **DataSources** - Manage database connections
5. **Models** - Define data structures and schemas
6. **Components** - Reusable, pluggable modules

### Dependency Injection

Ignis uses decorator-based dependency injection:

```typescript
@controller({ path: "/todos" })
export class TodoController extends BaseController {
  constructor(
    @inject("repositories.TodoRepository")
    private todoRepository: TodoRepository,
  ) {
    super({ scope: "TodoController", path: "/todos" });
  }
}
```

---

## 📚 Documentation

**Online Documentation**: [https://venizia-ai.github.io/ignis](https://venizia-ai.github.io/ignis)

Comprehensive documentation is also available in the `packages/docs/wiki` directory:

### Getting Started

- [Philosophy](packages/docs/wiki/get-started/philosophy.md) - Understand the "why" behind Ignis
- [Prerequisites](packages/docs/wiki/get-started/prerequisites.md) - Required tools and setup
- [5-Minute Quickstart](packages/docs/wiki/get-started/5-minute-quickstart.md) - Fastest path to a working API
- [Complete Setup Guide](packages/docs/wiki/get-started/quickstart.md) - Production-ready setup
- [Building a CRUD API](packages/docs/wiki/get-started/building-a-crud-api.md) - Complete tutorial

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

### Interactive Documentation

Run the documentation server locally:

```bash
bun run docs:dev
```

Then visit `http://localhost:5173` in your browser.

---

## 🎓 Examples

### Complete CRUD Example

See [Building a CRUD API](packages/docs/wiki/get-started/building-a-crud-api.md) for a full tutorial on creating a Todo API with:

- Database models and migrations
- Repository pattern for data access
- Auto-generated CRUD endpoints
- Request/response validation
- OpenAPI documentation

### POST Endpoint with Validation

```typescript
@post({
  configs: {
    path: '/todos',
    request: {
      body: jsonContent({
        schema: z.object({
          title: z.string().min(1),
          description: z.string().optional(),
        }),
      }),
    },
    responses: {
      [HTTP.ResultCodes.RS_2.Created]: jsonContent({
        schema: z.object({
          id: z.string(),
          title: z.string(),
          description: z.string().nullable(),
          isCompleted: z.boolean(),
        }),
      }),
    },
  },
})
async createTodo(c: Context) {
  const body = await c.req.json();
  const todo = await this.todoRepository.create(body);
  return c.json(todo, HTTP.ResultCodes.RS_2.Created);
}
```

---

## 🤝 Contributing

Contributions are welcome! Please read our:

- [Contributing Guide](CONTRIBUTING.md) - How to contribute
- [Code of Conduct](CODE_OF_CONDUCT.md) - Community guidelines
- [Security Policy](SECURITY.md) - Reporting vulnerabilities

### Development Setup

```bash
# Clone the repository
git clone https://github.com/venizia-ai/ignis.git
cd ignis

# Install dependencies
bun install

# Rebuild core packages
bun run rebuild:ignis

# Run documentation
bun run docs:dev
```

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE.md](LICENSE.md) file for details.

---

## 🙏 Acknowledgments

Ignis is inspired by:

- **[LoopBack 4](https://loopback.io/)** - Enterprise patterns and architecture
- **[Hono](https://hono.dev/)** - Performance and modern API design

---

## 📞 Support

- **Documentation**: [https://venizia-ai.github.io/ignis](https://venizia-ai.github.io/ignis)
- **GitHub Issues**: [https://github.com/VENIZIA-AI/ignis/issues](https://github.com/VENIZIA-AI/ignis/issues)
- **Author**: VENIZIA AI Developer <developer@venizia.ai>

---

**Built with ❤️ using TypeScript, Hono, and enterprise patterns.**
