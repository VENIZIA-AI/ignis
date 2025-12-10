# 5-Minute Quickstart

Build your first Ignis API endpoint in 5 minutes. No database, no complex setup - just a working "Hello World" API.

> **Prerequisites:** [Bun installed](./prerequisites.md#installation-quick-links) and basic TypeScript knowledge.

## Step 1: Create Project (30 seconds)

```bash
mkdir my-app && cd my-app
bun init -y
bun add hono @hono/zod-openapi @scalar/hono-api-reference @vez/ignis
bun add -d typescript @types/bun @vez/dev-configs
```

## Step 2: Configure Development Tools (30 seconds)

Create `tsconfig.json`:

```json
{
  "$schema": "http://json.schemastore.org/tsconfig",
  "extends": "@vez/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "baseUrl": "src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

Create `eslint.config.mjs`:

```javascript
import configs from '@vez/dev-configs/eslint';
export default configs;
```

Create `.prettierrc.mjs`:

```javascript
import config from '@vez/dev-configs/prettier';
export default config;
```

## Step 3: Write Your API (2 minutes)

Create `index.ts`:

```typescript
import { BaseApplication, IApplicationInfo, controller, get, HTTP, jsonContent } from '@vez/ignis';
import { BaseController } from '@vez/ignis';
import { Context } from 'hono';
import { z } from '@hono/zod-openapi';

// 1. Define a controller
@controller({ path: '/hello' })
class HelloController extends BaseController {
  constructor() {
    super({ scope: 'HelloController', path: '/hello' });
  }

  binding() {
    // Bind dependencies here (if needed)
  }

  @get({
    configs: {
      path: '/',
      responses: {
        [HTTP.ResultCodes.RS_2.Ok]: jsonContent({
          description: 'Says hello',
          schema: z.object({ message: z.string() }),
        }),
      },
    },
  })
  sayHello(c: Context) {
    return c.json({ message: 'Hello from Ignis!' });
  }
}

// 2. Create the application
class App extends BaseApplication {
  getAppInfo(): IApplicationInfo {
    return { name: 'my-app', version: '1.0.0' };
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
  scope: 'App',
  config: {
    host: '0.0.0.0',
    port: 3000,
    path: { base: '/api' }
  }
});

app.start();
```

## Step 4: Run It (30 seconds)

```bash
bun run index.ts
```

Visit `http://localhost:3000/api/hello` in your browser!

**Response:**
```json
{"message":"Hello from Ignis!"}
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
