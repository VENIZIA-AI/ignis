<div align="center">

<br />

# <img src="https://ignis.venizia.ai/logo.svg" alt="" height="32" align="top"> IGNIS

**A structured TypeScript server on Hono, with Drizzle for SQL.**

[![Docs](https://img.shields.io/badge/Docs-ignis.venizia.ai-2563EB.svg?style=flat-square)](https://ignis.venizia.ai)
[![npm](https://img.shields.io/npm/v/@venizia/ignis.svg?style=flat-square&color=cb3837&label=@venizia/ignis)](https://www.npmjs.com/package/@venizia/ignis)
[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](LICENSE.md)
[![Bun](https://img.shields.io/badge/Bun-%E2%89%A51.4-f472b6.svg?style=flat-square&logo=bun&logoColor=white)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-5%20%7C%206-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[Documentation](https://ignis.venizia.ai) &#8226;
[Quickstart](https://ignis.venizia.ai/guides/get-started/5-minute-quickstart) &#8226;
[Core API](https://ignis.venizia.ai/references/) &#8226;
[Examples](examples/) &#8226;
[Changelog](https://ignis.venizia.ai/changelogs/)

</div>

---

IGNIS is a TypeScript server framework for APIs that outgrow a single file. You write controllers,
services and repositories; IGNIS wires them through a dependency injection container, serves them
with Hono, validates each request against the route's Zod schema, and builds the OpenAPI document from
the same schemas. It is 0.x: a patch release can carry a breaking change, labeled in the
[changelog](https://ignis.venizia.ai/changelogs/) with how to migrate.

## Get started

```bash
bun x @venizia/vulcan init --preset ignis   # a project with one controller, tests and API docs
cd my-product && make dev                   # http://localhost:3000/api/hello
```

The generated `HelloController`:

```typescript
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

Next: the [5-minute quickstart](https://ignis.venizia.ai/guides/get-started/5-minute-quickstart), or
[add IGNIS to an existing project](https://ignis.venizia.ai/guides/tutorials/complete-installation).

## What you get

- **Layers and dependency injection** - controller, service, repository and datasource, each a container binding: [the application](https://ignis.venizia.ai/guides/core-concepts/application/), [dependency injection](https://ignis.venizia.ai/guides/core-concepts/dependency-injection).
- **One schema per route** - the same Zod schema validates the request and feeds the OpenAPI document: [REST controllers](https://ignis.venizia.ai/guides/core-concepts/rest-controllers).
- **Data access** - PostgreSQL, SQLite, Typesense, Meilisearch and an HTTP connector behind one repository contract and one filter language: [persistence](https://ignis.venizia.ai/guides/core-concepts/persistent/).
- **Row-level access** - a scope with a write guard on each model, so a caller stays inside its own rows: [model settings](https://ignis.venizia.ai/guides/core-concepts/persistent/model-settings).
- **Components and helpers** - authentication, Casbin authorization, health check, mail, Socket.IO, WebSocket, Redis, queues, storage: [extensions](https://ignis.venizia.ai/extensions/).
- **Bun, Node and the browser** - `Bun.serve`, Node 20+ through `@hono/node-server`, and a browser Worker: [browser and Web Worker](https://ignis.venizia.ai/guides/core-concepts/browser-and-web-worker).

## Packages

| Package | Role |
| :--- | :--- |
| [`@venizia/ignis`](packages/core-server/) | The server framework: `BaseApplication` on Bun or Node, the components |
| [`@venizia/ignis-kernel`](packages/kernel/) | The browser-pure core: DI, lifecycle, REST controllers, repository and datasource abstractions |
| [`@venizia/ignis-connectors`](packages/connectors/) | PostgreSQL, SQLite, Typesense, Meilisearch and HTTP datasources and repositories |
| [`@venizia/ignis-inversion`](packages/inversion/) | The standalone IoC container and the shared error type |
| [`@venizia/ignis-filter`](packages/filter/) | The query filter language and its Zod schemas |
| [`@venizia/ignis-helpers`](packages/helpers/) | Logger, Redis, queues, storage, crypto, network, IDs, secrets, time zones |
| [`@venizia/ignis-boot`](packages/boot/) | Build-time tools: the artifact index and the build stamp |
| [`@venizia/ignis-worker`](packages/core-worker/) | Runs an IGNIS application inside a browser Worker, with no server |
| [`@venizia/dev-configs`](packages/dev-configs/) | Shared oxlint, ESLint and TypeScript presets, and the `devz` CLI |

The documentation site lives in [`docs/wiki`](docs/wiki/) and is not published to npm. Runnable
projects are in [`examples/`](examples/).

## Contributing

Bun 1.4 or later; pull requests target `develop`. See [CONTRIBUTING.md](CONTRIBUTING.md). MIT
licensed - see [LICENSE.md](LICENSE.md). Questions: [GitHub Issues](https://github.com/VENIZIA-AI/ignis/issues).

---

<p align="center">
  <a href="https://venizia.ai">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://venizia.ai/assets/logo-white.svg">
      <img src="https://venizia.ai/assets/logo.svg" alt="VENIZIA" height="28">
    </picture>
  </a>
  <br>
  <sub>IGNIS is built and maintained by <a href="https://venizia.ai">VENIZIA</a>.</sub>
</p>
