# 5-Minute Quickstart

Build a working IGNIS API: one controller, one route, dependency injection, and generated API docs - no database required.

**Time to complete:** ~5 minutes

> **Prerequisite:** [Install Bun](./setup) 1.4 or later before you start.

## 1. Create the project

Scaffold a project and install IGNIS:

```bash
mkdir my-app && cd my-app
bun init -y
bun add hono @hono/zod-openapi @scalar/hono-api-reference @venizia/ignis @venizia/ignis-helpers \
  @venizia/ignis-boot winston winston-transport winston-daily-rotate-file
bun add -d typescript @types/bun @venizia/dev-configs
```

Both commands finish in a few seconds. You now have a `package.json` with IGNIS in `dependencies`.

- `@venizia/ignis-boot` supplies `AutoArtifacts`, which finds your decorated classes so you never register them by hand (Bun only).
- `bun init` writes `"type": "module"` into `package.json`. Delete that line: an IGNIS app extends `@venizia/dev-configs/tsconfig.common.json` (module `nodenext`), so without `"type": "module"` it is CommonJS, and the rest of the guides assume that.
- `winston` and its two companions are the default logger. The application refuses to start without a logger provider - [use pino instead](/extensions/helpers/logger/) if you prefer.

## 2. Configure TypeScript for decorators

IGNIS controllers use TypeScript's legacy decorators (`@controller`, `@get`). Set the decorator options directly in your own `tsconfig.json`. Bun ignores an `extends` that names a package, and a missing flag drops your routes silently.

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
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": false
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

## 3. Write the API

Create `src/hello.controller.ts`:

```typescript
import { z } from '@hono/zod-openapi';
import { BaseRestController, controller, get, jsonContent } from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';
import { Context } from 'hono';

@controller({ path: '/hello' })
export class HelloController extends BaseRestController {
  constructor() {
    super({ scope: HelloController.name, path: '/hello' });
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
```

Create `src/application.ts`:

```typescript
import { ApiReferenceComponent, BaseApplication, IApplicationInfo } from '@venizia/ignis';
import AutoArtifacts from '@venizia/ignis-boot/auto';
import packageJson from '../package.json';

export class Application extends BaseApplication {
  getAppInfo(): IApplicationInfo {
    return packageJson;
  }

  staticConfigure() {}

  preConfigure() {
    this.component(ApiReferenceComponent);
  }

  postConfigure() {}

  setupMiddlewares() {}
}

export const application = new Application({
  scope: 'Application',
  config: {
    host: '0.0.0.0',
    port: Number(process.env.PORT ?? 3000),
    path: { base: '/api', isStrict: false },
    artifacts: AutoArtifacts,
  },
});
```

Create `src/index.ts`:

```typescript
import { application } from './application';

const main = async () => {
  application.init();
  await application.start();
};

main().catch((error: unknown) => {
  console.error('[main] Application start failed | Error:', error);
  process.exit(1);
});
```

`@controller` groups routes under `/hello`, and `@get` registers a GET route together with its OpenAPI schema. `artifacts: AutoArtifacts` scans `src` when the application starts and registers every decorated class it finds, so `application.ts` never names `HelloController`. `preConfigure()` is left for what a decorator cannot express - here, the API docs component. `application.init()` registers the application's core bindings - call it before `application.start()`.

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

A running IGNIS REST API: one controller, one route, dependency injection wired through `BaseApplication`, and OpenAPI docs served automatically. You registered nothing by hand: the decorator marks the class and `AutoArtifacts` finds it.

## Next steps

- Add a database: [Building a CRUD API](../tutorials/building-a-crud-api.md)
- Add lint, formatting, and build scripts: [Complete Installation](../tutorials/complete-installation.md)
- Add more routes and methods: [REST Controllers](../core-concepts/rest-controllers.md)
- Ship a single-file binary: [Registering artifacts](../core-concepts/application/bootstrapping.md#compiling-with-bun-build-compile)
- Understand the application lifecycle: [Core Concepts: Application](../core-concepts/application/)
