# Complete Installation

This guide walks you through creating a new web application with Ignis and setting up a professional development environment.

> **Prerequisites:** Ensure you have [Bun installed and basic TypeScript knowledge](./setup) before starting.

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
bun add -d typescript @types/bun @venizia/dev-configs eslint prettier tsc-alias
```

**What `@venizia/dev-configs` provides:**
- Centralized ESLint configuration
- Centralized Prettier configuration
- Shared TypeScript base configs
- Consistent code style across all Ignis projects

> **Note:** Database dependencies (drizzle-orm, pg, etc.) will be added later in the [CRUD Tutorial](./building-a-crud-api).

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

> **Deep Dive:** See [Code Style Standards](/best-practices/code-style-standards) for detailed configuration options.

:::tip Coming from Express/Hono/Fastify?
This setup might seem verbose compared to minimal frameworks. The trade-off: ~50 lines of config upfront gives you scalable architecture for 10-1000+ endpoints without spaghetti code. For quick prototypes (< 5 endpoints), use plain Hono instead.
:::

## 4. Build Your First Application

### Create Project Structure

```bash
mkdir -p src/{common,components,configurations,controllers,datasources,helpers,models/{entities,requests,responses},repositories,services,utilities}
```

Your structure will look like:
```
src/
├── index.ts                # Entry point
├── application.ts          # Application class
├── common/
│   └── index.ts            # Shared constants, types, bindings
├── components/
│   └── index.ts            # Reusable modules (auth, swagger, etc.)
├── configurations/
│   └── index.ts            # App configuration files
├── controllers/
│   ├── index.ts            # Export all controllers
│   └── hello.controller.ts
├── datasources/
│   └── index.ts            # Database connections
├── helpers/
│   └── index.ts            # Helper functions and classes
├── models/
│   ├── index.ts            # Export all models
│   ├── entities/           # Drizzle schema definitions
│   ├── requests/           # Request DTOs (Zod schemas)
│   └── responses/          # Response DTOs (Zod schemas)
├── repositories/
│   └── index.ts            # Data access layer
├── services/
│   └── index.ts            # Business logic
└── utilities/
    └── index.ts            # Utility functions
```

> **Note:** For this guide, we only use `controllers/`. Other folders will be used in the [CRUD Tutorial](./building-a-crud-api) when you add database support.

### Create Application Class

Create `src/application.ts` - this is where you configure and register all your application resources:

```typescript
import { BaseApplication, IApplicationConfigs, IApplicationInfo, SwaggerComponent, ValueOrPromise } from '@venizia/ignis';
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
    // Option 1: Read from package.json (recommended for consistency)
    return packageJson;

    // Option 2: Static app info (if package.json doesn't have correct fields)
    // return {
    //   name: 'my-app',
    //   version: '1.0.0',
    //   description: 'My Ignis application',
    // };
  }

  // Hook 1: Configure static file serving (e.g., serve images from /public)
  staticConfigure(): void {
    // Example: this.static({ folderPath: './public' })
  }

  // Hook 2: Add global middlewares (CORS, etc.)
  override async setupMiddlewares(): Promise<void> {
    const server = this.getServer();
    const { cors } = await import('hono/cors');

    server.use('*', cors({
      origin: '*',
      allowMethods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      maxAge: 86_400,
      credentials: true,
    }));
  }

  // Hook 3: Register your resources (THIS IS THE MOST IMPORTANT ONE)
  preConfigure(): ValueOrPromise<void> {
    // Register SwaggerComponent for API documentation at /doc/explorer
    this.component(SwaggerComponent);

    // As your app grows, you'll add:
    // this.dataSource(PostgresDataSource);    // Database connection
    // this.repository(UserRepository);        // Data access layer
    // this.service(UserService);              // Business logic
    // this.component(AuthComponent);          // Auth setup

    // Register our controller
    this.controller(HelloController);
  }

  // Hook 4: Do cleanup or extra work after everything is set up
  postConfigure(): ValueOrPromise<void> {
    // Example: Seed database, start background jobs, etc.
  }
}
```

::: info IApplicationInfo
**Required fields in `package.json`:**
- `name` — App name (shown in API docs title)
- `version` — App version (shown in API docs)
- `description` — App description (shown in API docs)

**No proper `package.json`?** Use static app info instead (see Option 2 in code above).

**Recommendation:** Read from `package.json` for consistency between app metadata and API docs.
:::

**Key takeaway:** You'll mostly work in `preConfigure()` when building your app. The other hooks are there when you need them.

**Application Lifecycle Hooks:**
| Hook | Purpose | Usage |
|------|---------|-------|
| `getAppInfo()` | Application metadata | Required - used for API docs |
| `staticConfigure()` | Static file serving | Optional |
| `setupMiddlewares()` | Global middlewares | Optional |
| `preConfigure()` | **Register resources** | **Main hook** - register controllers, services, etc. |
| `postConfigure()` | Post-initialization | Optional - seed data, background jobs |

> **Deep Dive:** See [Application Class Reference](./core-concepts/application) for detailed lifecycle documentation.

### Create Controller

Create `src/controllers/hello.controller.ts` - controllers handle HTTP requests and return responses:

```typescript
import {
  BaseController,
  controller,
  api,
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

  // Required: Override binding() to register routes or dependencies
  override binding() {
    // Option 1: Use bindRoute() or defineRoute() for programmatic route registration
    // this.bindRoute({ method: 'get', path: '/programmatic', handler: this.myHandler });

    // Option 2: Use @api decorator on methods (shown below) - recommended
  }

  // The @api decorator defines a route (prefer @api with method over @get/@post)
  @api({
    configs: {
      method: HTTP.Methods.GET,
      path: '/',
      // This 'responses' config does two things:
      // 1. Generates OpenAPI/Swagger documentation automatically
      // 2. Validates that your handler returns the correct shape
      responses: {
        [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
          description: 'A simple hello message',
          schema: z.object({ message: z.string() }),
        }),
      },
    },
  })
  sayHello(c: Context) {
    return c.json({ message: 'Hello, World!' }, HTTP.ResultCodes.RS_2.Ok);
  }

  // For authenticated endpoints, add 'authStrategies':
  // @api({ configs: { method: HTTP.Methods.GET, path: '/secure', authStrategies: [Authentication.STRATEGY_JWT] } })
}
```

**Controller Patterns:**

| Pattern | Description |
|---------|-------------|
| `@controller` | Registers the class as a controller with a base path |
| `@api` | Defines a route with `method` specified (recommended) |
| `@get`, `@post`, etc. | Shorthand decorators (also work) |
| `binding()` | Required override — use `bindRoute()` or `defineRoute()` for programmatic routes |
| Zod schemas | Provide automatic validation and OpenAPI docs |

> **Deep Dive:** See [Controllers Reference](./core-concepts/controllers) for advanced routing patterns and validation.

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
    "clean": "sh ./scripts/clean.sh",
    "rebuild": "bun run clean && bun run build",
    "server:dev": "NODE_ENV=development bun .",
    "server:prod": "NODE_ENV=production bun ."
}
```

> **Note:** Database migration scripts (`migrate:dev`, `generate-migration:dev`) will be added in the [CRUD Tutorial](./building-a-crud-api) when you set up Drizzle ORM.

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

**View API Documentation:**

Open [http://localhost:3000/doc/explorer](http://localhost:3000/doc/explorer) to see interactive Swagger UI with your endpoints.

Congratulations! You have successfully created and configured your first application with the `Ignis` framework.

## Continue Your Journey

✅ You now have a working Ignis application!

**Next steps:**

1. **[Building a CRUD API](./building-a-crud-api)** - Add database, create full REST API with CRUD operations
2. **[Core Concepts](./core-concepts/application)** - Deep dive into application architecture
3. **[Best Practices](/best-practices/architectural-patterns)** - Learn recommended patterns and practices

> **Deep Dive:** See [API Usage Examples](/best-practices/api-usage-examples) for more routing patterns and controller techniques.
