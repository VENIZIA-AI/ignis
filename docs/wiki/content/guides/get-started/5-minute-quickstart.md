# 5-Minute Quickstart

Build a working IGNIS API: one controller, one route, dependency injection, and generated API docs - no database required.

**Time to complete:** ~5 minutes

> **Prerequisite:** [Install Bun](./setup) 1.3 or later before you start.

## 1. Create the project

Scaffold a project and install IGNIS:

```bash
mkdir my-app && cd my-app
bun init -y
bun add hono @hono/zod-openapi @scalar/hono-api-reference @venizia/ignis @venizia/ignis-helpers
bun add -d typescript @types/bun @venizia/dev-configs
```

Both commands finish in a few seconds. You now have a `package.json` with IGNIS in `dependencies`.

## 2. Configure TypeScript for decorators

IGNIS controllers use TypeScript's legacy decorators (`@controller`, `@get`). Set the two decorator flags directly in your own `tsconfig.json`. Bun does not reliably resolve them through an `extends` chain, and a missing flag drops your routes silently.

Create `tsconfig.json`:

```json
{
  "$schema": "http://json.schemastore.org/tsconfig",
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "paths": {
      "@/*": ["./src/*"]
    },
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

## 3. Write the API

Create `src/index.ts`:

```typescript
import { z } from '@hono/zod-openapi';
import {
  BaseApplication,
  BaseRestController,
  controller,
  get,
  IApplicationInfo,
  jsonContent,
  ApiReferenceComponent,
} from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';
import { Context } from 'hono';
import appInfo from './../package.json';

@controller({ path: '/hello' })
class HelloController extends BaseRestController {
  constructor() {
    super({ scope: 'HelloController', path: '/hello' });
  }

  // binding() is abstract - leave it empty when every route uses @get/@post decorators.
  override binding() {}

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
    return c.json({ message: 'Hello from IGNIS!' }, HTTP.ResultCodes.RS_2.Ok);
  }
}

class App extends BaseApplication {
  getAppInfo(): IApplicationInfo {
    return appInfo;
  }

  staticConfigure() {}

  preConfigure() {
    this.component(ApiReferenceComponent);
    this.controller(HelloController);
  }

  postConfigure() {}

  setupMiddlewares() {}
}

const app = new App({
  scope: 'App',
  config: {
    host: '0.0.0.0',
    port: 3000,
    path: { base: '/api', isStrict: false },
  },
});

app.init();
await app.start();
```

`@controller` groups routes under `/hello`. `@get` registers a GET route together with its OpenAPI schema. `preConfigure()` wires the controller and the API docs component into dependency injection before the server starts. `app.init()` registers the application's core bindings - call it before `app.start()`.

New to decorators or dependency injection? See the [glossary](/guides/reference/glossary#decorators) and [Dependency Injection](../core-concepts/dependency-injection.md).

## 4. Run it

Start the server:

```bash
bun run src/index.ts
```

After a moment you'll see:

```
[App-start] Server STARTED | Address: 0.0.0.0:3000
```

In a new terminal, request the endpoint:

```bash
curl http://localhost:3000/api/hello
```

You get:

```json
{"message":"Hello from IGNIS!"}
```

## 5. View the API docs

Open `http://localhost:3000/api/doc/explorer` in your browser. You'll see an interactive Scalar API reference listing `GET /hello`, generated from the Zod schema you wrote.

## What you built

A running IGNIS REST API: one controller, one route, dependency injection wired through `BaseApplication`, and OpenAPI docs served automatically - all in a single file.

## Next steps

- Add a database: [Building a CRUD API](../tutorials/building-a-crud-api.md)
- Add lint, formatting, and build scripts: [Complete Installation](../tutorials/complete-installation.md)
- Add more routes and methods: [REST Controllers](../core-concepts/rest-controllers.md)
- Understand the application lifecycle: [Core Concepts: Application](../core-concepts/application/)
