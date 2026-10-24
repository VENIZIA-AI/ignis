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

- Writes the monorepo, with a root `.dockerignore` that keeps `.env` files out of every image.
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

The command produces this tree, plus the files of the coding agents on your machine (`CLAUDE.md`, `.claude/` and `.mcp.json` for Claude Code), which VULCAN keeps out of git:

```text
./.agents/knowledge/index.md
./.agents/knowledge/packages/core-api.md
./.agents/rules.md
./.agents/vulcan.manifest.json
./.configs/vulcan.config.mts
./.dockerignore
./.gitignore
./AGENTS.md
./Makefile
./README.md
./bun.lock
./package.json
./services/core-api/.configs/builders/Dockerfile
./services/core-api/.configs/builders/compile.ts
./services/core-api/.configs/formatters/.ignore
./services/core-api/.configs/lints/.ignore
./services/core-api/.configs/lints/eslint.config.mjs
./services/core-api/.configs/lints/oxlint.config.mts
./services/core-api/.env.example
./services/core-api/package.json
./services/core-api/src/application.ts
./services/core-api/src/controllers/hello.controller.ts
./services/core-api/src/index.ts
./services/core-api/src/smoke.test.ts
./services/core-api/tsconfig.json
```

The app root holds only `.configs/`, `src/`, `package.json`, `tsconfig.json` and `.env.example`. Every other setting lives in `.configs/`: `lints/` for oxlint and ESLint, `formatters/` for the `bun fmt` ignore list, `builders/` for the compile script and the Dockerfile.

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
- `services/core-api/.env.example` - lists every `APP_ENV_*` key the app reads (application, server, logger), each with a comment. Copy it to `.env` for a local run: bun loads `.env` on start.
- `services/core-api/.configs/lints/.ignore`, `.configs/formatters/.ignore` - paths `devz lint` skips, one pattern per line. They ship with comments only.
- `services/core-api/tsconfig.json` - restates decorator flags because Bun ignores a package-scoped `extends`.
- `services/core-api/.configs/` - holds the lint and format configs and the build files.

The app's scripts are the same in every IGNIS and ARDOR app:

| Script | Runs |
|---|---|
| `server:dev` | `NODE_ENV=development bun run src/index.ts` |
| `compile` | `bun .configs/builders/compile.ts` - one binary, `dist/bin` |
| `typecheck` | `bun check` |
| `lint`, `lint:fix` | `devz lint`, `devz lint --fix` |
| `test` | `bun test` |
| `clean` | `devz clean` |

## 4. Build the image

The app ships its Dockerfile. Build it from the project root, and pass the commit the image runs:

```bash
docker build -f services/core-api/.configs/builders/Dockerfile -t core-api \
  --build-arg APP_BUILD_COMMIT="$(git rev-parse HEAD)" .
docker run -p 3000:3000 core-api
```

The project needs a commit first: `git init && git add -A && git commit -m init`. See [Docker deployment](/best-practices/deployment-strategies#docker-deployment-recommended) for the build arguments.

## 5. Add more apps

Each new app or package comes from a preset, never by hand. Add a frontend that calls `core-api`, and a shared library:

```bash
bun x --no-install vulcan add --preset ardor --app web --frontend-dir apps --api core-api
bun x --no-install vulcan add --preset ignis --lib billing --dir libs
```

A frontend needs `--api <app>` (the backend it calls) or `--no-api`. Run `vulcan add` with neither `--app` nor `--lib` in a terminal and it asks what to create.

## Next steps

- Add a database: [Building a CRUD API](../tutorials/building-a-crud-api.md)
- Add lint, formatting, and build scripts: [Complete Installation](../tutorials/complete-installation.md)
- Add more routes and methods: [REST Controllers](../core-concepts/rest-controllers.md)
- Ship a single-file binary: [Registering artifacts](../core-concepts/application/bootstrapping.md#compiling-with-bun-build-compile)
- Understand the application lifecycle: [Core Concepts: Application](../core-concepts/application/)
