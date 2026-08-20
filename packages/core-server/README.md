<div align="center">

# :fire: @venizia/ignis

**The IGNIS framework core - LoopBack 4's architecture on Hono's speed.**

[![npm](https://img.shields.io/npm/v/@venizia/ignis.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/@venizia/ignis)
[![Docs](https://img.shields.io/badge/Docs-ignis.venizia.ai-2563EB.svg?style=flat-square)](https://ignis.venizia.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-3DA639.svg?style=flat-square)](LICENSE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6.svg?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

[Documentation](https://ignis.venizia.ai) &#8226;
[Quickstart](https://ignis.venizia.ai/guides/get-started/5-minute-quickstart) &#8226;
[API Reference](https://ignis.venizia.ai/references/)

</div>

---

This is the framework itself: the application class, controllers, repositories, models, datasources,
the decorator set, and the component system. You extend the base classes; IGNIS wires them through
its IoC container, validates every request against Zod, and generates the OpenAPI spec from the same
schemas.

Reach for it when you are building a structured API - real auth, several models, more than a handful
of endpoints - and you want that structure to survive team growth. For a 3-endpoint service, plain
Hono is lighter.

## Install

```bash
bun add @venizia/ignis @venizia/ignis-helpers hono @hono/zod-openapi drizzle-orm pg
bun add -d typescript tsc-alias @venizia/dev-configs @types/bun
```

`@venizia/ignis-boot`, `@venizia/ignis-helpers` and `@venizia/ignis-inversion` come along as
dependencies. `hono`, `@hono/zod-openapi`, `@asteasolutions/zod-to-openapi`, `drizzle-orm` and
`drizzle-zod` are required peers. Everything else in `peerDependencies` is optional - install only
what the components and connectors you actually use need.

> [!IMPORTANT]
> `experimentalDecorators` and `emitDecoratorMetadata` must be `true` in your `tsconfig.json`,
> declared **inline**. Bun does not resolve them through `extends`, and `@inject` metadata is
> silently dropped without them - bindings then fail at boot with no obvious cause. Copy them from
> `@venizia/dev-configs/tsconfig.common.json`.

## Minimal application

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

`getAppInfo`, `preConfigure`, `postConfigure`, `staticConfigure` and `setupMiddlewares` are abstract -
implement all five, even when empty.

## The surface

| Layer | Extend / use | Docs |
| :--- | :--- | :--- |
| Application | `BaseApplication` - lifecycle, config, `component()`, `controller()`, `start()` | [Application](https://ignis.venizia.ai/references/base/application) |
| REST controller | `BaseRestController` - decorated routes, or `bindRoute` / `defineRoute` | [Controllers](https://ignis.venizia.ai/references/base/controllers) |
| gRPC controller | `BaseGrpcController` with `@rpc` - pair it with `GrpcComponent` | [Controllers](https://ignis.venizia.ai/references/base/controllers) |
| CRUD controller | `ControllerFactory.defineCrudController({ controller, entity, routes })` | [Controllers](https://ignis.venizia.ai/references/base/controllers) |
| Service | `BaseService` | [References](https://ignis.venizia.ai/references/) |
| Repository | `DefaultRelationalRepository`, or the readable / persistable / soft-deletable variants | [Repositories](https://ignis.venizia.ai/references/base/repositories/) |
| Model | `BaseRelationalEntity` over a Drizzle `pgTable` | [Repositories](https://ignis.venizia.ai/references/base/repositories/) |
| DataSource | `BaseRelationalDataSource` | [Repositories](https://ignis.venizia.ai/references/base/repositories/) |
| Component | `BaseComponent` - bundle bindings, controllers and middlewares as one unit | [Components](https://ignis.venizia.ai/extensions/components/) |
| Provider | `BaseProvider<T>` - a lazily resolved binding value | [DI](https://ignis.venizia.ai/references/base/dependency-injection) |

Decorators, all from the root barrel:

| Decorator | Target | Purpose |
| :--- | :--- | :--- |
| `@controller({ path })` | class | Register a controller under a base path |
| `@get` `@post` `@put` `@patch` `@del` `@api` | method | Declare a REST route from a Zod-typed config |
| `@rpc` | method | Declare a gRPC method |
| `@model` `@datasource` `@repository` | class | Register persistence classes for boot discovery |
| `@inject({ key, isOptional })` | constructor parameter | Resolve a binding by namespaced key |

> [!WARNING]
> **Every** constructor parameter of a container-instantiated class must carry `@inject`. Mixing
> decorated and undecorated parameters is refused at boot - the container has no channel to supply an
> undecorated one. Options a controller needs belong in `super({ scope })`.

`BaseRelationalEntity`, `DefaultRelationalRepository` and `BaseRelationalDataSource` are the
canonical, paradigm-family names. `BasePostgresEntity`, `DefaultCRUDRepository`,
`BasePostgresDataSource`, `BaseEntity` and `BaseDataSource` still resolve to the same classes as
back-compat aliases - prefer the family names in new code.

## Components

Register with `this.component(X)` in `preConfigure()`.

| Component | Import from | What it adds |
| :--- | :--- | :--- |
| `ApiReferenceComponent` | `@venizia/ignis` | OpenAPI spec plus a Scalar or Swagger UI explorer |
| `AuthenticateComponent` | `@venizia/ignis` | JWT and Basic authentication strategies |
| `AuthorizeComponent` | `@venizia/ignis` | Casbin-backed authorization enforcement |
| `HealthCheckComponent` | `@venizia/ignis` | Liveness and readiness endpoints |
| `RequestTrackerComponent` | `@venizia/ignis` | Request IDs and body parsing - registered automatically |
| `RestComponent` | `@venizia/ignis` | Binds discovered REST controllers - internal, registered automatically |
| `GrpcComponent` | `@venizia/ignis/grpc` | ConnectRPC transport for `@rpc` controllers |
| `MailComponent` | `@venizia/ignis/mail` | Nodemailer and Mailgun senders |
| `SocketIOComponent` | `@venizia/ignis/socket-io` | Socket.IO server with an optional Redis adapter |
| `WebSocketComponent` | `@venizia/ignis/websocket` | Native WebSocket transport |
| `StaticAssetComponent` | `@venizia/ignis/static-asset` | Static file serving and asset controllers |


Full configuration for each: [Components](https://ignis.venizia.ai/extensions/components/).

## Sub-path exports

The root barrel deliberately excludes optional transports and connectors, so a bundler never pulls in
a peer you did not install.

| Sub-path | Contents |
| :--- | :--- |
| `@venizia/ignis/postgres` | Relational models, datasources, repositories, dialect |
| `@venizia/ignis/postgres/node-postgres` | `pg` driver (the supported default) |
| `@venizia/ignis/postgres/postgres-js` | `postgres` driver |
| `@venizia/ignis/postgres/supabase` | Supabase driver and RLS auth context |
| `@venizia/ignis/search` (+ `/controllers`) | Engine-agnostic search connector |
| `@venizia/ignis/typesense` (+ `/controllers`) | Typesense engine |
| `@venizia/ignis/meilisearch` | Meilisearch engine |
| `@venizia/ignis/grpc`, `/socket-io`, `/websocket`, `/mail`, `/static-asset` | Optional components |

Note that `@venizia/ignis/postgres` is also re-exported from the root barrel; the other sub-paths are
not.

## Things that will burn you

- **Errors**: always `getError()` / `ApplicationError` from `@venizia/ignis-helpers`, never raw
  `new Error`. The error shape is one object - `{ text, code, args }`. Across package boundaries use
  `isApplicationError()`, never `instanceof`.
- **Logging**: type your loggers as `ILogger`. Get one from `BaseHelper.logger`,
  `LoggerFactory.getLogger(['A','B'])` or `ApplicationLogger.get('Scope')`, and `.for('method')` for a
  method-scoped child. Five levels only: `debug`, `info`, `warn`, `error`, `emerg`.
- **Runtime**: Bun >= 1.3 first-class. Node.js works through the optional `@hono/node-server` peer.
- **Version**: 0.x - minor versions can break. Pin exact versions and read the
  [changelog](https://ignis.venizia.ai/changelogs/) before upgrading.

## Links

[Quickstart](https://ignis.venizia.ai/guides/get-started/5-minute-quickstart) &#8226;
[API reference](https://ignis.venizia.ai/references/) &#8226;
[Bootstrapping](https://ignis.venizia.ai/references/base/bootstrapping) &#8226;
[Dependency injection](https://ignis.venizia.ai/references/base/dependency-injection) &#8226;
[Extensions](https://ignis.venizia.ai/extensions/) &#8226;
[Helpers](https://ignis.venizia.ai/extensions/helpers/) &#8226;
[Best practices](https://ignis.venizia.ai/best-practices/) &#8226;
[Changelog](https://ignis.venizia.ai/changelogs/)

MIT licensed - see [LICENSE.md](LICENSE.md).
Questions: [GitHub Issues](https://github.com/VENIZIA-AI/ignis/issues) &#8226; developer@venizia.ai
