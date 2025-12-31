# Quickstart Guide

This guide walks you through creating a new web application with Ignis and setting up a professional development environment.

> **Prerequisites:** Ensure you have [Bun installed and basic TypeScript knowledge](./prerequisites.md) before starting.

## 1. Initialize Your Project

```bash
mkdir my-app
cd my-app
bun init -y
```

## 2. Install Dependencies

### Production Dependencies

```bash
bun add hono @hono/zod-openapi @scalar/hono-api-reference @venizia/ignis dotenv-flow
```

**What each package does:**
- `hono` - High-performance web framework
- `@hono/zod-openapi` - OpenAPI schema generation with Zod validation
- `@scalar/hono-api-reference` - Interactive API documentation UI
- `@venizia/ignis` - Core Ignis framework
- `dotenv-flow` - Environment variable management

### Development Dependencies

```bash
bun add -d typescript @types/bun @venizia/dev-configs tsc-alias tsconfig-paths
```

**What `@venizia/dev-configs` provides:**
- Centralized ESLint configuration
- Centralized Prettier configuration
- Shared TypeScript base configs
- Consistent code style across all Ignis projects

> **Note:** Database dependencies (drizzle-orm, pg, etc.) will be added later in the [CRUD Tutorial](./building-a-crud-api.md).

## 3. Configure Development Tools

All development configurations are centralized in the `@venizia/dev-configs` package for consistency and ease of maintenance.

### TypeScript

Create `tsconfig.json` in your project root:

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
  "include": ["src", "./*.config.*", ".prettierrc.*"],
  "exclude": ["node_modules", "dist"]
}
```

> **Note:** The `extends` field pulls in all TypeScript configuration from `@venizia/dev-configs/tsconfig.common.json`, which includes decorator support, strict mode, and ES2022 target settings.

### Prettier

Create `.prettierrc.mjs` for code formatting:

```javascript
import { prettierConfigs } from '@venizia/dev-configs';

export default prettierConfigs;
```

Create `.prettierignore`:
```
dist
node_modules
*.log
.*-audit.json
```

> **Customization:** To override Prettier settings, merge with the base config:
> ```javascript
> import { prettierConfigs } from '@venizia/dev-configs';
> export default { ...prettierConfigs, printWidth: 120 };
> ```

### ESLint

Create `eslint.config.mjs` for code linting:

```javascript
import { eslintConfigs } from '@venizia/dev-configs';

export default eslintConfigs;
```

> **Customization:** To add project-specific rules:
> ```javascript
> import { eslintConfigs } from '@venizia/dev-configs';
> export default [...eslintConfigs, { rules: { 'no-console': 'warn' } }];
> ```

> **Deep Dive:** See [Code Style Standards](./best-practices/code-style-standards.md) for detailed configuration options.

:::tip Coming from Express/Hono/Fastify?
This setup might seem verbose compared to minimal frameworks. The trade-off: ~50 lines of config upfront gives you scalable architecture for 10-1000+ endpoints without spaghetti code. For quick prototypes (< 5 endpoints), use plain Hono instead.
:::

## 4. Build Your First Application

### Create Project Structure

```bash
mkdir -p src/controllers
```

Your structure will look like:
```
src/
├── application.ts
├── index.ts
└── controllers/
    └── hello.controller.ts
```

### Create Application Class

Create `src/application.ts` - this is where you configure and register all your application resources:

```typescript
import { BaseApplication, IApplicationConfigs, IApplicationInfo, ValueOrPromise } from '@venizia/ignis';
import { HelloController } from './controllers/hello.controller';
import packageJson from '../package.json';

// Define application configurations
export const appConfigs: IApplicationConfigs = {
  host: process.env.HOST ?? '0.0.0.0',        // Where your server listens
  port: +(process.env.PORT ?? 3000),          // Port number
  path: { base: '/api', isStrict: true },      // All routes will be under /api
};

export class Application extends BaseApplication {
  // Required: Tell the framework about your app (used for API docs)
  override getAppInfo(): ValueOrPromise<IApplicationInfo> {
    return packageJson;
  }

  // Hook 1: Configure static file serving (e.g., serve images from /public)
  staticConfigure(): void {
    // Example: this.static({ folderPath: './public' })
  }

  // Hook 2: Add global middlewares (CORS, compression, etc.)
  setupMiddlewares(): ValueOrPromise<void> {
    // Example: this.server.use(cors())
  }

  // Hook 3: Register your resources (THIS IS THE MOST IMPORTANT ONE)
  preConfigure(): ValueOrPromise<void> {
    // As your app grows, you'll add:
    // this.dataSource(PostgresDataSource);    // Database connection
    // this.repository(UserRepository);        // Data access layer
    // this.service(UserService);              // Business logic
    // this.component(AuthComponent);          // Auth setup

    // For now, just register our controller
    this.controller(HelloController);
  }

  // Hook 4: Do cleanup or extra work after everything is set up
  postConfigure(): ValueOrPromise<void> {
    // Example: Seed database, start background jobs, etc.
  }
}
```

**Key takeaway:** You'll mostly work in `preConfigure()` when building your app. The other hooks are there when you need them.

**Application Lifecycle Hooks:**
| Hook | Purpose | Usage |
|------|---------|-------|
| `getAppInfo()` | Application metadata | Required - used for API docs |
| `staticConfigure()` | Static file serving | Optional |
| `setupMiddlewares()` | Global middlewares | Optional |
| `preConfigure()` | **Register resources** | **Main hook** - register controllers, services, etc. |
| `postConfigure()` | Post-initialization | Optional - seed data, background jobs |

> **Deep Dive:** See [Application Class Reference](./core-concepts/application.md) for detailed lifecycle documentation.

### Create Controller

Create `src/controllers/hello.controller.ts` - controllers handle HTTP requests and return responses:

```typescript
import {
  BaseController,
  controller,
  get, // Import the 'get' decorator
  HTTP,
  jsonContent,
} from '@venizia/ignis';
import { z } from '@hono/zod-openapi';
import { Context } from 'hono';

const BASE_PATH = '/hello';

// The @controller decorator registers this class as a controller
// All routes in this controller will be under /api/hello (remember path.base: '/api')
@controller({ path: BASE_PATH })
export class HelloController extends BaseController {
  constructor() {
    super({ scope: HelloController.name, path: BASE_PATH });
  }

  // The @get decorator defines a GET route at /api/hello/
  @get({
    configs: {
      path: '/',
      // This 'responses' config does two things:
      // 1. Generates OpenAPI/Swagger documentation automatically
      // 2. Validates that your handler returns the correct shape
      responses: {
        [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
          description: 'A simple hello message',
          schema: z.object({ message: z.string() }), // Zod schema for validation
        }),
      },
    },
  })
  sayHello(c: Context) {
    // This looks just like Hono! Because it IS Hono under the hood.
    return c.json({ message: 'Hello, World!' }, HTTP.ResultCodes.RS_2.Ok);
  }

  // You can add more routes here:
  // @post({ configs: { ... } })
  // createSomething(c: Context) { ... }

  // For authenticated endpoints, add 'authStrategies' to the configs:
  // @get({ configs: { path: '/secure', authStrategies: [Authentication.STRATEGY_JWT] } })
  // secureMethod(c: Context) { /* ... */ }

  // For database CRUD operations, use ControllerFactory (covered in the CRUD tutorial)
}
```

**Controller Decorators:**
- `@controller` - Registers the class as a controller with a base path
- `@get`, `@post`, `@put`, `@patch`, `@del` - Define HTTP endpoints
- Zod schemas provide automatic validation and OpenAPI docs

> **Deep Dive:** See [Controllers Reference](./core-concepts/controllers.md) for advanced routing patterns and validation.

### Create Entry Point

Create `src/index.ts` - this starts your application:

```typescript
import { Application, appConfigs } from './application';
import { LoggerFactory } from '@venizia/ignis';

const logger = LoggerFactory.getLogger(['main']);

const main = async () => {
  const application = new Application({
    scope: 'MyApp',
    config: appConfigs,
  });

  const applicationName = process.env.APP_ENV_APPLICATION_NAME?.toUpperCase() ?? 'My-App';
  logger.info('[main] Getting ready to start up %s Application...', applicationName);
  await application.start();
  return application;
};

export default main();
```

## 5. Run Your Application

Add common application scripts to your `package.json`:

```json
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
```

Create a cleanup script at `scripts/clean.sh`:

```bash
#!/bin/bash

echo "START | Clean up..."

rm -rf dist *.tsbuildinfo .eslintcache
rm -rf artifact.zip

echo "DONE | Clean up..."

```

Now, start your application:

```bash
bun run server:dev
```

Your server will be running on `http://localhost:3000`. You can access your new endpoint at `http://localhost:3000/api/hello`.

Test with curl:
```bash
curl http://localhost:3000/api/hello
```

Response:
```json
{"message":"Hello, World!"}
```

Congratulations! You have successfully created and configured your first application with the `Ignis` framework.

## Continue Your Journey

✅ You now have a working Ignis application!

**Next steps:**

1. **[Building a CRUD API](./building-a-crud-api.md)** - Add database, create full REST API with CRUD operations
2. **[Core Concepts](./core-concepts/application.md)** - Deep dive into application architecture
3. **[Best Practices](./best-practices/architectural-patterns.md)** - Learn recommended patterns and practices

> **Deep Dive:** See [API Usage Examples](./best-practices/api-usage-examples.md) for more routing patterns and controller techniques.
