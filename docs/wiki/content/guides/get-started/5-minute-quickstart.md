# 5-Minute Quickstart

Build a working IGNIS API in one command: monorepo layout, one controller, one route, tests, and generated API docs.

**Time to complete:** ~5 minutes

> **Prerequisite:** [Install Bun](./setup) 1.4 or later before you start.

## 1. Create the project

Run the initializer:

```bash
bun x @venizia/vulcan init --preset ignis
```

In a terminal it asks four names:

```console
? Project name (the monorepo folder) > my-product
? Backend folder (holds every backend app) > services
? Name of this backend app > core-api
? Shared code folder (empty to skip) >
```

You can pass the same names as flags for scripts: `--project`, `--backend-dir`, `--app`, `--shared-dir`.

The command runs these steps in order:

- Writes the monorepo.
- Installs dependencies.
- Copies the IGNIS app.
- Sets up the agent files.
- Runs the app's checks (typecheck, lint, test).
- Runs vulcan doctor.

## 2. Run it

Start the dev server:

```bash
cd my-product && make dev
```

Open the endpoints in your browser:

- `http://localhost:3000/api/hello` - answers `{"message":"Hello from IGNIS!"}`
- `http://localhost:3000/api/doc/explorer` - the API reference

Note: the app serves under `/api`.

## 3. What it created

The command produces this tree:

```text
./.agents/knowledge/index.md
./.agents/knowledge/log.md
./.agents/knowledge/packages/core-api.md
./AGENTS.md
./.agents/rules.md
./.configs/vulcan.config.mts
./.gitignore
./Makefile
./.mcp.json
./package.json
./README.md
./services/core-api/.configs/lints/eslint.config.mjs
./services/core-api/.configs/formatters/oxfmt.config.mts
./services/core-api/.configs/lints/oxlint.config.mts
./services/core-api/.env.example
./services/core-api/package.json
./services/core-api/README.md
./services/core-api/src/application.ts
./services/core-api/src/controllers/hello.controller.ts
./services/core-api/src/index.ts
./services/core-api/src/smoke.test.ts
./services/core-api/tsconfig.json
```

Important files:

- `package.json` - defines workspaces and the catalog of package versions.
- `Makefile` - the Makefile has `make dev` (starts every app) and VULCAN's shared targets; `make help` lists them.
- `AGENTS.md` / `.agents/` - stores rules and knowledge for coding agents.
- `.configs/vulcan.config.mts` - configures VULCAN tooling for the repo.
- `services/core-api/src/application.ts` - defines the application: `AutoArtifacts` finds decorated classes, and `ApiReferenceComponent` serves the docs.
- `services/core-api/src/controllers/hello.controller.ts` - defines the sample controller:

```ts
import { z } from '@hono/zod-openapi';
import {
  BaseRestController,
  controller,
  get,
  jsonContent,
  type TRouteContext,
} from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';

@controller({ path: '/hello' })
export class HelloController extends BaseRestController {
  constructor() {
    super({ scope: HelloController.name });
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
  sayHello(context: TRouteContext) {
    return context.json({ message: 'Hello from IGNIS!' }, HTTP.ResultCodes.RS_2.Ok);
  }
}
```

- `services/core-api/src/index.ts` - initializes and starts the application.
- `services/core-api/src/smoke.test.ts` - exercises the running server with an end-to-end smoke test.
- `services/core-api/.env.example` - documents runtime environment variables such as `PORT`.
- `services/core-api/tsconfig.json` - restates decorator flags because Bun ignores a package-scoped `extends`.
- `services/core-api/.configs/` - holds lint and format configurations.

## Next steps

- Add a database: [Building a CRUD API](../tutorials/building-a-crud-api.md)
- Add lint, formatting, and build scripts: [Complete Installation](../tutorials/complete-installation.md)
- Add more routes and methods: [REST Controllers](../core-concepts/rest-controllers.md)
- Ship a single-file binary: [Registering artifacts](../core-concepts/application/bootstrapping.md#compiling-with-bun-build-compile)
- Understand the application lifecycle: [Core Concepts: Application](../core-concepts/application/)
