<div align="center">

<br />

# :fire: IGNIS

**LoopBack 4's architecture, on Hono, with Drizzle for SQL.**

[![Docs](https://img.shields.io/badge/Docs-ignis.venizia.ai-2563EB.svg?style=flat-square)](https://ignis.venizia.ai)
[![npm](https://img.shields.io/npm/v/@venizia/ignis/next.svg?style=flat-square&color=cb3837&label=@venizia/ignis@next)](https://www.npmjs.com/package/@venizia/ignis)
[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](LICENSE.md)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.3-f472b6.svg?style=flat-square&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%20%7C%206-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[Documentation](https://ignis.venizia.ai) &#8226;
[Quickstart](https://ignis.venizia.ai/guides/get-started/5-minute-quickstart) &#8226;
[Core API](https://ignis.venizia.ai/references/) &#8226;
[Examples](#examples) &#8226;
[Changelog](https://ignis.venizia.ai/changelogs/)

</div>

---

IGNIS is a TypeScript server framework. You write controllers, services and repositories. IGNIS
wires them through a dependency injection container, serves them with Hono, validates each request
against the route's Zod schema, and builds the OpenAPI document from the same schemas.

## Install

```bash
bun init -y
bun add @venizia/ignis@next @venizia/ignis-helpers@next hono @hono/zod-openapi \
  @scalar/hono-api-reference winston winston-transport winston-daily-rotate-file
bun add -d typescript@^6 @types/bun @venizia/dev-configs@next
```

`winston` is the default logger - the application refuses to start without a logger provider
(register pino instead if you prefer). `@scalar/hono-api-reference` renders the API docs page.
`@next` is the line this repository and the docs track; `latest` still points at the older 0.1 line.

Replace the generated `tsconfig.json`:

```json
{
  "extends": "@venizia/dev-configs/tsconfig.common.json",
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  },
  "include": ["src"]
}
```

> [!IMPORTANT]
> Declare `experimentalDecorators` and `emitDecoratorMetadata` **inline**, even though the shared
> config already sets them. Bun does not read them through `extends`, and without them `@inject` and
> the route decorators are dropped silently.

## Hello world

`src/index.ts`:

```typescript
import { z } from '@hono/zod-openapi';
import {
  ApiReferenceComponent,
  BaseApplication,
  BaseRestController,
  controller,
  get,
  IApplicationInfo,
  jsonContent,
} from '@venizia/ignis';
import { HTTP } from '@venizia/ignis-helpers';
import { Context } from 'hono';

@controller({ path: '/hello' })
class HelloController extends BaseRestController {
  constructor() {
    super({ scope: 'HelloController', path: '/hello' });
  }

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
    return { name: 'my-app', version: '1.0.0', description: 'My first IGNIS app' };
  }

  staticConfigure() {}
  postConfigure() {}
  setupMiddlewares() {}

  preConfigure() {
    this.component(ApiReferenceComponent); // API docs at /api/doc/explorer
    this.controller(HelloController);
  }
}

const app = new App({
  scope: 'App',
  config: { host: '0.0.0.0', port: 3000, path: { base: '/api', isStrict: false } },
});

app.init(); // binds the application instance - call it before start()
await app.start();
```

```bash
bun run src/index.ts
curl http://localhost:3000/api/hello   # {"message":"Hello from IGNIS!"}
```

Open `http://localhost:3000/api/doc/explorer` for the generated API reference. Next:
the [5-minute quickstart](https://ignis.venizia.ai/guides/get-started/5-minute-quickstart), then
[build a CRUD API](https://ignis.venizia.ai/guides/tutorials/building-a-crud-api).

## What you get

| | |
| :--- | :--- |
| **Layered architecture** | Controller -> Service -> Repository -> DataSource, each one a container binding |
| **Dependency injection** | `@inject` by namespaced key (`services.UserService`), singleton and transient scopes, tag-based lookup. The container is its own package, `@venizia/ignis-inversion` |
| **Data access** | Drizzle-based repositories on PostgreSQL (node-postgres, postgres-js, PGlite, Supabase) and SQLite (libsql); search repositories on Typesense and Meilisearch; an HTTP connector that reads another IGNIS server. One filter language (`where`, `order`, `include`, ...) across them |
| **Validation and OpenAPI** | One Zod schema per route validates the request and feeds the OpenAPI document; Scalar or Swagger UI renders it |
| **Artifact registration** | Mark a class with `@controller`, `@service`, `@repository`, `@datasource`, `@component` or `@configuration`. `ignis-artifacts generate` writes a static index at build time, or `discoverArtifacts: true` registers every decorated class the application imports. No file-naming rule |
| **Components** | Authentication (JWT, Basic, JWKS, service-to-service), Casbin authorization, API reference, health check, request tracker, mail, static assets and uploads, Socket.IO, WebSocket, gRPC over ConnectRPC |
| **Helpers** | Logger (winston or pino), Redis (single, cluster, sentinel), BullMQ, MQTT and Kafka, MinIO, disk and Bun S3 storage, AES/RSA/ECDH crypto, cron, Snowflake, UUID v4/v5/v7 and opaque IDs, TCP/TLS/UDP, HTTP client, secrets with HashiCorp Vault, worker-thread pools, time zones |
| **Runtimes** | Bun first (`Bun.serve`). Node.js 20+ through the optional `@hono/node-server`. A browser Worker through `@venizia/ignis-worker`. `bun build --compile` produces a single binary |

[Core API](https://ignis.venizia.ai/references/) &#8226;
[Components and helpers](https://ignis.venizia.ai/extensions/) &#8226;
[Best practices](https://ignis.venizia.ai/best-practices/)

## Packages

Each package builds on the ones it depends on, so a change in `inversion` reaches everything:

```
dev-configs -> inversion -> {filter, helpers} -> kernel -> connectors -> ignis
                                      helpers -> {boot, atlas}
                                       kernel -> worker
```

| Package | Role | Latest | Next |
| :--- | :--- | ---: | ---: |
| [`@venizia/dev-configs`](packages/dev-configs/) | Shared ESLint, Prettier and TypeScript configs | [![npm](https://img.shields.io/npm/v/@venizia/dev-configs.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/dev-configs) | [![npm next](https://img.shields.io/npm/v/@venizia/dev-configs/next.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/dev-configs) |
| [`@venizia/ignis-inversion`](packages/inversion/) | The standalone IoC container, its decorators, and the shared error type | [![npm](https://img.shields.io/npm/v/@venizia/ignis-inversion.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-inversion) | [![npm next](https://img.shields.io/npm/v/@venizia/ignis-inversion/next.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis-inversion) |
| [`@venizia/ignis-filter`](packages/filter/) | The query filter language and its Zod schemas, shared by every connector | [![npm](https://img.shields.io/npm/v/@venizia/ignis-filter.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-filter) | [![npm next](https://img.shields.io/npm/v/@venizia/ignis-filter/next.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis-filter) |
| [`@venizia/ignis-helpers`](packages/helpers/) | Logger, Redis, queues, storage, crypto, network, IDs, secrets, time zones | [![npm](https://img.shields.io/npm/v/@venizia/ignis-helpers.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-helpers) | [![npm next](https://img.shields.io/npm/v/@venizia/ignis-helpers/next.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis-helpers) |
| [`@venizia/ignis-boot`](packages/boot/) | Build-time CLIs: `ignis-artifacts` (the artifact index) and `ignis-build-info` | [![npm](https://img.shields.io/npm/v/@venizia/ignis-boot.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-boot) | [![npm next](https://img.shields.io/npm/v/@venizia/ignis-boot/next.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis-boot) |
| [`@venizia/ignis-kernel`](packages/kernel/) | The browser-pure core: DI, lifecycle, REST controllers, repository and datasource abstractions, auth seams | [![npm](https://img.shields.io/npm/v/@venizia/ignis-kernel.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-kernel) | [![npm next](https://img.shields.io/npm/v/@venizia/ignis-kernel/next.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis-kernel) |
| [`@venizia/ignis-connectors`](packages/connectors/) | Relational (PostgreSQL, SQLite), search (Typesense, Meilisearch) and HTTP datasources and repositories | [![npm](https://img.shields.io/npm/v/@venizia/ignis-connectors.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-connectors) | [![npm next](https://img.shields.io/npm/v/@venizia/ignis-connectors/next.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis-connectors) |
| [`@venizia/ignis-worker`](packages/core-worker/) | Runs an IGNIS application inside a browser Worker, with no server | [![npm](https://img.shields.io/npm/v/@venizia/ignis-worker.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-worker) | [![npm next](https://img.shields.io/npm/v/@venizia/ignis-worker/next.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis-worker) |
| [`@venizia/ignis`](packages/core-server/) | The server framework: `BaseApplication` on Bun or Node, the components; re-exports the kernel and the connector sub-paths | [![npm](https://img.shields.io/npm/v/@venizia/ignis.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis) | [![npm next](https://img.shields.io/npm/v/@venizia/ignis/next.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis) |
| [`@venizia/ignis-atlas`](packages/atlas/) | MCP server: search the wiki, changelogs and knowledge bundle, look up a symbol, diff two versions | [![npm](https://img.shields.io/npm/v/@venizia/ignis-atlas.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-atlas) | [![npm next](https://img.shields.io/npm/v/@venizia/ignis-atlas/next.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis-atlas) |

**Latest** is the older stable line. **Next** is the newest release, prerelease included, and the
tag this repository publishes to today. An application installs `@venizia/ignis` and adds `boot`
for the artifact generator; the other framework packages come with it. The documentation site lives
in [`docs/wiki`](docs/wiki/) and is not published to npm.

## Is IGNIS for you?

**Yes** if you are building a growing API - 10+ endpoints, real auth, several models - and want the
structure to hold as the team grows.

**Probably not** for a webhook receiver, a prototype, or a 3-endpoint service. Plain Hono is lighter.

| | Hono alone | IGNIS on Hono |
| :--- | :--- | :--- |
| Structure | yours to design | controllers, services, repositories, datasources |
| Dependency injection | none | a container with `@inject` |
| Data access | bring your own | Drizzle-based repositories and one filter language |
| OpenAPI | wire `@hono/zod-openapi` yourself | generated from each route's schemas, UI included |
| Auth | middleware you write | authentication and Casbin authorization components |

The longer comparison, with NestJS and LoopBack 4: [Philosophy](https://ignis.venizia.ai/guides/get-started/philosophy).

> [!NOTE]
> IGNIS is 0.x: minor versions can break. Pin exact versions and read the
> [changelog](https://ignis.venizia.ai/changelogs/) before upgrading.

## What IGNIS borrows, and from where

IGNIS is LoopBack 4's architecture rebuilt on a different engine. These are the design ideas it
takes, and the projects it runs on.

**Design ideas**

| Platform | What IGNIS takes from it | Where it lives in IGNIS |
| :--- | :--- | :--- |
| [LoopBack 4](https://loopback.io/) | Injection by binding key (`@inject`, `Binding.toClass` / `toValue` / `toProvider`, tags, `controllers.*` / `services.*` / `repositories.*` / `datasources.*` namespaces); the Controller -> Repository -> DataSource layering and `@repository`; `@model` with `hiddenProperties`; components that own bindings; the filter object (`where`, `fields`, `include`, `order`, `limit`, `skip`, `offset`) and its operators (`neq`, `inq`, `nin`, `between`, ...). LoopBack's run-time booter became a build-time generator | `inversion`; `kernel` (metadata, repositories, components, binding namespaces); `filter`; `boot` |
| [Spring](https://spring.io/projects/spring-boot) | Stereotype decorators (`@component`, `@service`, `@repository`, `@controller`); `@configuration` classes whose `@provide` methods supply bindings, ordered with `after`; conditional registration with `when`; rebuilding a connection pool when a Vault credential rotates (the Spring Cloud Vault + HikariCP pattern) | `kernel` (`@injectable` and the stereotypes, configurations, the artifact index); `helpers` secrets; `connectors` PostgreSQL datasource |
| [InversifyJS](https://inversify.io/) | Named beside LoopBack 4 as the model for a small, standalone container | `inversion` |

**Built on**

| Project | What IGNIS uses it for | Where it lives in IGNIS |
| :--- | :--- | :--- |
| [Hono](https://hono.dev/) | The HTTP engine: routing, middleware, `Context`, request IDs, context storage; served by `Bun.serve` or `@hono/node-server` | `kernel` controllers and applications; `ignis` server application |
| [@hono/zod-openapi](https://github.com/honojs/middleware/tree/main/packages/zod-openapi) and [Zod](https://zod.dev/) | Route definitions, request validation, the OpenAPI document | `kernel` controllers |
| [Drizzle ORM](https://orm.drizzle.team/) | Table schemas, SQL, relations, and Zod schemas from tables (`drizzle-zod`) | `connectors` relational tier |
| [Casbin](https://casbin.org/) | Policy enforcement for authorization (optional peer) | `ignis` authorize component |
| [jose](https://github.com/panva/jose) | JWT signing and verification, JWKS | `kernel` and `ignis` authentication |
| [Scalar](https://scalar.com/) and [Swagger UI](https://swagger.io/tools/swagger-ui/) | The API reference page (optional peers) | `ignis` API reference component |
| [Model Context Protocol](https://modelcontextprotocol.io/) | The protocol atlas serves over stdio, with its own transport | `atlas` |

NestJS appears in the [Philosophy](https://ignis.venizia.ai/guides/get-started/philosophy) page as
a point of comparison, not as a source.

## Examples

Every example lives in [`examples/`](examples/).

| Example | What it shows |
| :--- | :--- |
| [5-mins-qs](examples/5-mins-qs/) | The single-file hello world |
| [vert](examples/vert/) | The production reference: PostgreSQL CRUD, authentication, scoped Casbin authorization, transactions, relations, a generated artifact index |
| [pglite-quickstart](examples/pglite-quickstart/) | CRUD on PGlite - PostgreSQL in-process, no database server |
| [sqlite-quickstart](examples/sqlite-quickstart/) | CRUD on SQLite through libsql |
| [supabase](examples/supabase/) | The postgres-js driver with Row Level Security driven by the request's user |
| [typesense-search](examples/typesense-search/) | A search API on Typesense alone, no PostgreSQL |
| [browser-bff](examples/browser-bff/) | The same controllers answering from PGlite inside a browser Worker, with no server |
| [grpc-test](examples/grpc-test/) | gRPC (ConnectRPC) and REST controllers on one application |
| [rpc-api-server](examples/rpc-api-server/) + [rpc-client-app](examples/rpc-client-app/) | A REST API with JWT and JSX pages, and a React client using hooks generated from its OpenAPI document |
| [socket-io-test](examples/socket-io-test/) / [websocket-test](examples/websocket-test/) | Socket.IO and raw WebSocket components with Redis and authentication |

The examples run against the local packages, so build those first:

```bash
bun install && make core boot
cd examples/vert
cp .env.example .env.development   # add your PostgreSQL credentials
bun run migrate:dev && bun run server:dev
```

## Contributing

```bash
git clone https://github.com/VENIZIA-AI/ignis.git && cd ignis
bun install
make build          # every package in dependency order, then the wiki and its checks
make test-all
make lint-all
```

Contributing needs Bun 1.4 or later: `make test-all` runs `bun test --parallel`. Applications need Bun 1.3 or later.

Conventional Commits (`feat:`, `fix:`, `docs:`, ...), branches `feature/*` / `fix/*`, and **pull
requests target `develop`**. Bun only - never npm, yarn, or pnpm. See
[CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and
[SECURITY.md](SECURITY.md).

MIT licensed - see [LICENSE.md](LICENSE.md).
Questions: [GitHub Issues](https://github.com/VENIZIA-AI/ignis/issues) &#8226; developer@venizia.ai
