<div align="center">

<br />

# :fire: IGNIS

**LoopBack 4's architecture. Hono's speed.**

[![Docs](https://img.shields.io/badge/Docs-ignis.venizia.ai-2563EB.svg?style=flat-square)](https://ignis.venizia.ai)
[![npm](https://img.shields.io/npm/v/@venizia/ignis.svg?style=flat-square&color=cb3837&label=@venizia/ignis)](https://www.npmjs.com/package/@venizia/ignis)
[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](LICENSE.md)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.3-f472b6.svg?style=flat-square&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[Documentation](https://ignis.venizia.ai) &#8226;
[Quickstart](https://ignis.venizia.ai/guides/get-started/5-minute-quickstart) &#8226;
[Core API](https://ignis.venizia.ai/references/) &#8226;
[Examples](#examples) &#8226;
[Changelog](https://ignis.venizia.ai/changelogs/)

</div>

---

Enterprise TypeScript server infrastructure: decorator-driven dependency injection, the repository
pattern, and a component system - running on Hono at ~140k req/s with Drizzle's type-safe SQL.

You write controllers, services, and repositories. IGNIS wires them, validates every request against
Zod, and generates the OpenAPI spec from the same schemas.

## Install

```bash
bun add @venizia/ignis @venizia/ignis-helpers hono @hono/zod-openapi drizzle-orm pg
bun add -d typescript tsc-alias @venizia/dev-configs @types/bun
```

> [!IMPORTANT]
> `experimentalDecorators` and `emitDecoratorMetadata` must be `true` in your `tsconfig.json`, declared
> **inline** - Bun does not resolve them through `extends`, and `@inject` is silently dropped without them.
> Copy them from `@venizia/dev-configs/tsconfig.common.json`.

## Hello world

```typescript
import { z } from '@hono/zod-openapi';
import {
  ApiReferenceComponent, BaseApplication, BaseRestController,
  controller, get, IApplicationInfo, jsonContent,
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
    this.component(ApiReferenceComponent); // interactive docs at /doc/explorer
    this.controller(HelloController);
  }
}

new App({
  scope: 'App',
  config: { host: '0.0.0.0', port: 3000, path: { base: '/api', isStrict: false } },
})
  .start()
  .catch((error: unknown) => {
    console.error('[main] Application start failed | Error:', error);
    process.exit(1);
  });
```

```bash
bun run src/index.ts
curl http://localhost:3000/api/hello   # {"message":"Hello from IGNIS!"}
```

Full walkthrough: [5-minute quickstart](https://ignis.venizia.ai/guides/get-started/5-minute-quickstart) -
then [build a CRUD API](https://ignis.venizia.ai/guides/tutorials/building-a-crud-api).

## What you get

| | |
| :--- | :--- |
| **Layered architecture** | Controller -> Service -> Repository -> DataSource, each a DI binding |
| **Dependency injection** | ~350-line IoC container; `@inject` by namespaced key, tags for discovery |
| **Type-safe data access** | Drizzle + PostgreSQL, inferred types, transactions, relations, soft delete |
| **Validation & OpenAPI** | One Zod schema validates the request and generates the spec |
| **Convention boot** | Auto-discovers `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `*.datasource.ts` |
| **Components** | Auth (JWT/Basic), Casbin RBAC, API reference, health, mail, storage, Socket.IO, gRPC |
| **Production helpers** | Logger, Redis, BullMQ, MinIO/S3, crypto, cron, Snowflake UID, TCP/UDP |
| **Multi-runtime** | Bun first (`Bun.serve`), Node.js 18+ supported via `@hono/node-server` |

[Core API](https://ignis.venizia.ai/references/) &#8226;
[Components & helpers](https://ignis.venizia.ai/extensions/) &#8226;
[Best practices](https://ignis.venizia.ai/best-practices/)

## Packages

In release order - each builds on the ones above it, so a change in `inversion` reaches everything.

| Package | Role | Latest | Highest |
| :--- | :--- | ---: | ---: |
| [`@venizia/dev-configs`](packages/dev-configs/) | Shared ESLint, Prettier and TypeScript configs | [![npm](https://img.shields.io/npm/v/@venizia/dev-configs.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/dev-configs) | [![npm highest](https://img.shields.io/npm/v/@venizia/dev-configs/highest.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/dev-configs) |
| [`@venizia/ignis-inversion`](packages/inversion/) | Standalone IoC container, decorators and the error shape | [![npm](https://img.shields.io/npm/v/@venizia/ignis-inversion.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-inversion) | [![npm highest](https://img.shields.io/npm/v/@venizia/ignis-inversion/highest.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis-inversion) |
| [`@venizia/ignis-filter`](packages/filter/) | The query filter language shared by every connector | [![npm](https://img.shields.io/npm/v/@venizia/ignis-filter.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-filter) | [![npm highest](https://img.shields.io/npm/v/@venizia/ignis-filter/highest.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis-filter) |
| [`@venizia/ignis-helpers`](packages/helpers/) | Logger, Redis, queues, storage, crypto, network, UID | [![npm](https://img.shields.io/npm/v/@venizia/ignis-helpers.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-helpers) | [![npm highest](https://img.shields.io/npm/v/@venizia/ignis-helpers/highest.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis-helpers) |
| [`@venizia/ignis-boot`](packages/boot/) | Artifact discovery and the generated index | [![npm](https://img.shields.io/npm/v/@venizia/ignis-boot.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-boot) | [![npm highest](https://img.shields.io/npm/v/@venizia/ignis-boot/highest.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis-boot) |
| [`@venizia/ignis-kernel`](packages/kernel/) | Browser-pure core: DI, lifecycle, controllers, repositories | [![npm](https://img.shields.io/npm/v/@venizia/ignis-kernel.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-kernel) | [![npm highest](https://img.shields.io/npm/v/@venizia/ignis-kernel/highest.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis-kernel) |
| [`@venizia/ignis-connectors`](packages/connectors/) | Relational and search datasources and repositories | [![npm](https://img.shields.io/npm/v/@venizia/ignis-connectors.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-connectors) | [![npm highest](https://img.shields.io/npm/v/@venizia/ignis-connectors/highest.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis-connectors) |
| [`@venizia/ignis-worker`](packages/core-worker/) | The browser Worker host for a BFF | [![npm](https://img.shields.io/npm/v/@venizia/ignis-worker.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-worker) | [![npm highest](https://img.shields.io/npm/v/@venizia/ignis-worker/highest.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis-worker) |
| [`@venizia/ignis`](packages/core-server/) | The server framework: application, components, static assets | [![npm](https://img.shields.io/npm/v/@venizia/ignis.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis) | [![npm highest](https://img.shields.io/npm/v/@venizia/ignis/highest.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis) |
| [`@venizia/ignis-atlas`](packages/atlas/) | MCP server over the wiki, changelogs, symbols and releases | [![npm](https://img.shields.io/npm/v/@venizia/ignis-atlas.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis-atlas) | [![npm highest](https://img.shields.io/npm/v/@venizia/ignis-atlas/highest.svg?style=flat-square&color=f59e0b)](https://www.npmjs.com/package/@venizia/ignis-atlas) |

**Latest** is the stable line. **Highest** is the newest published version, prerelease included, and
it is the tag this repository releases to today. The documentation site lives in [`docs/wiki`](docs/wiki/)
and is not published to npm.

## Is IGNIS for you?

**Yes** if you are building a growing API - 10+ endpoints, real auth, several models - and want the
structure to hold up as the team grows.

**Probably not** for a webhook receiver, a prototype, or a 3-endpoint service. Plain Hono is lighter.

| | Hono / Express | NestJS / LoopBack 4 | **IGNIS** |
| :--- | :--- | :--- | :--- |
| Throughput | ~150k req/s | ~25k req/s | **~140k req/s** |
| Structure | do it yourself | strict | guided |
| DI | manual | built-in, heavy | built-in, ~350 lines |
| ORM | bring your own | TypeORM / Prisma | Drizzle |
| OpenAPI | manual | module | from your Zod schemas |

Longer comparison with real code: [Philosophy](https://ignis.venizia.ai/guides/get-started/philosophy).

> [!NOTE]
> IGNIS is 0.x: minor versions can break. It runs in production at VENIZIA AI, and the core patterns
> are stable - pin exact versions and read the [changelog](https://ignis.venizia.ai/changelogs/) before upgrading.

## Examples

| Example | What it shows |
| :--- | :--- |
| [5-mins-qs](examples/5-mins-qs/) | The single-file hello world above |
| [vert](examples/vert/) | Production reference: CRUD, auth, RBAC, transactions, relations |
| [typesense-search](examples/typesense-search/) | Search connector alongside PostgreSQL |
| [supabase](examples/supabase/) | Supabase driver and RLS auth context |
| [rpc-api-server](examples/rpc-api-server/) + [rpc-client-app](examples/rpc-client-app/) | gRPC server with a React frontend |
| [socket-io-test](examples/socket-io-test/) / [websocket-test](examples/websocket-test/) | Real-time transports |

```bash
cd examples/vert
cp .env.example .env.development   # add your PostgreSQL credentials
bun install && bun run migrate:dev && bun run server:dev
```

## Contributing

```bash
git clone https://github.com/venizia-ai/ignis.git && cd ignis
bun install
make build          # or: make core - builds it and everything it depends on
make lint-all
```

Conventional Commits (`feat:`, `fix:`, `docs:`, ...), branches `feature/*` / `fix/*`, and **PRs target
`develop`**. Bun only - never npm, yarn, or pnpm. See [CONTRIBUTING.md](CONTRIBUTING.md),
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and [SECURITY.md](SECURITY.md).

## Credits

Standing on [LoopBack 4](https://loopback.io/) (patterns), [Hono](https://hono.dev/) (speed),
[Drizzle](https://orm.drizzle.team/) (type-safe SQL), plus ideas from
[NestJS](https://nestjs.com/) and [Spring Boot](https://spring.io/projects/spring-boot).

MIT licensed - see [LICENSE.md](LICENSE.md).
Questions: [GitHub Issues](https://github.com/VENIZIA-AI/ignis/issues) &#8226; developer@venizia.ai
