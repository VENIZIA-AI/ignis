# 5-Minute Quickstart

Build your first Ignis API endpoint in 5 minutes. No database, no complex setup - just a working "Hello World" API.

**Time to Complete:** ~5 minutes

> **Prerequisites:** [Bun installed](./setup) and basic TypeScript knowledge.

## Step 1: Create Project (30 seconds)

```bash
mkdir my-app && cd my-app
bun init -y
bun add hono @hono/zod-openapi @scalar/hono-api-reference @venizia/ignis
bun add -d typescript @types/bun @venizia/dev-configs
```

## Step 2: Configure Development Tools (30 seconds)

Create `tsconfig.json`:

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

Create `eslint.config.mjs`:

```javascript
import { eslintConfigs } from "@venizia/dev-configs";

export default eslintConfigs;
```

Create `.prettierrc.mjs`:

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

## Step 3: Write Your API (2 minutes)

:::info What is a Decorator?
A decorator is a TypeScript feature that adds behavior to classes, methods, or properties. It's the `@something` syntax you see before definitions (like `@controller`, `@get`, `@inject`). Decorators in Ignis handle routing, dependency injection, and API documentation automatically.

[Learn more →](/guides/reference/glossary#decorators)
:::

:::info What is Binding?
"Binding" means registering a component (like a service or repository) with the application's dependency injection container. Think of it as telling the app: "Hey, this service exists and here's how to create it." Once bound, you can inject it anywhere using `@inject`.

[Learn more →](/guides/core-concepts/dependency-injection)
:::

Create `src/index.ts`:

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
  SwaggerComponent,
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
    this.component(SwaggerComponent);
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

Update `package.json` to add build scripts:

```json
{
  "name": "5-mins-qs",
  "version": "1.0.0",
  "description": "5-minute quickstart example",
  "private": true,
  "scripts": {
    "start": "bun run src/index.ts",
    "lint": "eslint --report-unused-disable-directives . && prettier \"**/*.{js,ts}\" -l",
    "lint:fix": "eslint --report-unused-disable-directives . --fix && prettier \"**/*.{js,ts}\" --write",
    "build": "tsc -p tsconfig.json && tsc-alias -p tsconfig.json",
    "clean": "sh ./scripts/clean.sh",
    "rebuild": "bun run clean && bun run build",
    "server:dev": "NODE_ENV=development bun run src/index.ts",
    "server:prod": "NODE_ENV=production bun run dist/index.js"
  },
  "dependencies": {
    "hono": "^4.4.12",
    "@hono/zod-openapi": "latest",
    "@scalar/hono-api-reference": "latest",
    "@venizia/ignis": "latest"
  },
  "devDependencies": {
    "typescript": "^5.5.3",
    "@types/bun": "latest",
    "@venizia/dev-configs": "latest",
    "eslint": "^9.36.0",
    "prettier": "^3.6.2",
    "tsc-alias": "^1.8.10"
  }
}
```

Create `scripts/clean.sh`:

```bash
#!/bin/bash

# Remove build artifacts
rm -rf dist/
rm -rf node_modules/.cache/

# Remove log files
rm -f *.log
rm -f .*.log
rm -f .*-audit.json

echo "Cleaned build artifacts and logs"
```

## Step 4: Run It (30 seconds)

```bash
bun run src/index.ts
```

Visit `http://localhost:3000/api/hello` in your browser!

**Response:**

```json
{ "message": "Hello from Ignis!" }
```

## View API Docs

Open `http://localhost:3000/doc/explorer` to see interactive Swagger UI documentation!

## What Just Happened?

### Framework Patterns

| Component | What It Does |
|-----------|--------------|
| `@controller` | Registers a class as an API controller at `/api/hello` |
| `@get` | Defines a GET endpoint with OpenAPI metadata |
| `Zod schema` | Validates request/response and auto-generates OpenAPI docs |
| `BaseController` | Provides lifecycle hooks and route binding capabilities |
| `BaseApplication` | Manages dependency injection, middleware, and server startup |
| `SwaggerComponent` | Generates interactive API docs at `/doc/explorer` |
| `app.start()` | Boots the DI container and starts HTTP server on port 3000 |

### Why Development Configs?

You might wonder why we set up TypeScript, ESLint, and Prettier configs in a "quickstart". Here's why:

**Ignis is opinionated about code quality.** We believe clean, consistent code from day one prevents technical debt later. The `@venizia/dev-configs` package provides pre-configured settings that:

| Config | Purpose |
|--------|---------|
| `tsconfig.json` | Strict TypeScript settings optimized for Ignis decorators and path aliases |
| `eslint.config.mjs` | Catches common errors, enforces best practices, works with TypeScript |
| `.prettierrc.mjs` | Consistent formatting across your team — no more style debates |

**Benefits of starting with Ignis code style:**

- **Consistency** — Same patterns across all Ignis projects
- **IDE Support** — Better autocomplete, error detection, and refactoring
- **Team Ready** — New developers can onboard faster with familiar structure
- **CI/CD Friendly** — Lint and format checks work out of the box

> [!TIP]
> All configs extend from `@venizia/dev-configs`, so you get updates automatically. Customize by overriding specific rules in your local config files.

## Next Steps

**You have a working API!**

**Want more?**

- **Add a database?** → [Building a CRUD API](../tutorials/building-a-crud-api.md)
- **Production setup?** → [Complete Setup Guide](../tutorials/complete-installation.md) (ESLint, Prettier, etc.)
- **Understand the architecture?** → [Core Concepts](../core-concepts/application/)

**Quick additions:**

**Add a POST endpoint:**

```typescript
@post({
  configs: {
    path: '/greet',
    request: {
      body: jsonContent({
        schema: z.object({ name: z.string() }),
      }),
    },
    responses: {
      [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
        schema: z.object({ greeting: z.string() }),
      }),
    },
  },
})
async greet(c: Context) {
  const { name } = await c.req.json();
  return c.json({ greeting: `Hello, ${name}!` }, HTTP.ResultCodes.RS_2.Ok);
}
```

Test it:

```bash
curl -X POST http://localhost:3000/api/hello/greet \
  -H "Content-Type: application/json" \
  -d '{"name":"World"}'
```
