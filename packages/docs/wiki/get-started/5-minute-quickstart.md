# 5-Minute Quickstart

Build your first Ignis API endpoint in 5 minutes. No database, no complex setup - just a working "Hello World" API.

> **Prerequisites:** [Bun installed](./prerequisites.md#installation-quick-links) and basic TypeScript knowledge.

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
    "tsc-alias": "^1.8.10",
    "tsconfig-paths": "^4.2.0"
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
bun run index.ts
```

Visit `http://localhost:3000/api/hello` in your browser!

**Response:**

```json
{ "message": "Hello from Ignis!" }
```

## What Just Happened?

1. **`@controller`** - Registered a controller at `/api/hello`
2. **`@get`** - Created a GET endpoint
3. **Zod schema** - Auto-validates response and generates OpenAPI docs
4. **`app.start()`** - Started HTTP server on port 3000

## View API Docs

Open `http://localhost:3000/doc/explorer` to see interactive Swagger UI documentation!

## Next Steps

✅ **You have a working API!**

**Want more?**

- **Add a database?** → [Building a CRUD API](./building-a-crud-api.md)
- **Production setup?** → [Complete Setup Guide](./quickstart.md) (ESLint, Prettier, etc.)
- **Understand the architecture?** → [Core Concepts](./core-concepts/application.md)

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
  return c.json({ greeting: `Hello, ${name}!` });
}
```

Test it:

```bash
curl -X POST http://localhost:3000/api/hello/greet \
  -H "Content-Type: application/json" \
  -d '{"name":"World"}'
```
