# @venizia/ignis

The IGNIS server framework for Bun and Node.js. Install this package to build a REST API: it brings
the application class, controllers, repositories, the built-in components, and the Bun or Node server
that runs them.

IGNIS takes its application model from LoopBack 4 - an IoC container with binding keys, components,
and the controller, service, repository, datasource layering - and runs it on Hono. Drizzle ORM builds
the SQL. Zod schemas, through `@hono/zod-openapi`, validate each request and generate the OpenAPI
document.

## Install

```bash
bun add @venizia/ignis hono @hono/zod-openapi @asteasolutions/zod-to-openapi drizzle-orm drizzle-zod jose
bun add @scalar/hono-api-reference   # the API explorer UI in the example
```

The first line is the package and its required peers. Every other peer is optional - install the
one a component or a database driver needs (see [Entry points](#entry-points)). On Node.js, add
`@hono/node-server`.

In your `tsconfig.json`, set these two flags directly in `compilerOptions`:

```json
{ "compilerOptions": { "experimentalDecorators": true, "emitDecoratorMetadata": true } }
```

Bun ignores them when they only arrive through an `extends` of a package path, and then drops
`@inject` parameter decorators without an error.

## Example

```typescript
import { z } from '@hono/zod-openapi';
import {
  ApiReferenceComponent,
  BaseApplication,
  BaseRestController,
  controller,
  get,
  jsonResponse,
} from '@venizia/ignis';
import type { Context } from 'hono';

@controller({ path: '/hello' })
class HelloController extends BaseRestController {
  constructor() {
    super({ scope: HelloController.name });
  }

  override binding() {}

  @get({
    configs: {
      path: '/',
      responses: jsonResponse({ schema: z.object({ message: z.string() }) }),
    },
  })
  sayHello(context: Context) {
    return context.json({ message: 'Hello from IGNIS' });
  }
}

class Application extends BaseApplication {
  getAppInfo() {
    return { name: 'hello', version: '1.0.0', description: 'The smallest IGNIS application' };
  }

  staticConfigure() {}
  setupMiddlewares() {}
  postConfigure() {}

  preConfigure() {
    this.component(ApiReferenceComponent);
    this.controller(HelloController);
  }
}

const application = new Application({
  scope: Application.name,
  config: { host: '0.0.0.0', port: 3000, path: { base: '/api', isStrict: false } },
});

application.init();
await application.start();
```

```bash
bun run src/index.ts
curl http://localhost:3000/api/hello   # {"message":"Hello from IGNIS"}
```

The OpenAPI document is at `/api/doc/openapi.json` and the explorer at `/api/doc/explorer`.

Three things to notice:

- `getAppInfo`, `staticConfigure`, `preConfigure`, `postConfigure` and `setupMiddlewares` are
  abstract. Implement all five, even when empty.
- `application.init()` registers the application's own bindings. Call it before `start()`, or the
  first component that injects the application fails the boot.
- `preConfigure()` is where you register components, controllers, services, repositories and
  datasources by hand. The `ignis-artifacts` generator in `@venizia/ignis-boot` can write that list
  for you at build time.

## Built-in components

Register a component with `this.component(...)` in `preConfigure()`.

| Component | Import from | What it adds |
|---|---|---|
| `ApiReferenceComponent` | `@venizia/ignis` | The OpenAPI document and a Scalar or Swagger UI explorer (`@scalar/hono-api-reference` or `@hono/swagger-ui`) |
| `HealthCheckComponent` | `@venizia/ignis` | `GET /health`, `POST /health/ping`, and `GET /health/stats` (closed outside development unless you enable it) |
| `AuthenticateComponent` | `@venizia/ignis` | JWT, Basic, and service-to-service authentication strategies |
| `AuthorizeComponent` | `@venizia/ignis` | Casbin-based authorization (`casbin`) |
| `RequestTrackerComponent` | `@venizia/ignis` | Logs each request and response - registered for you by `BaseApplication` |
| `GrpcComponent` | `@venizia/ignis/grpc` | ConnectRPC transport for `@rpc` controllers (`@connectrpc/connect`) |
| `MailComponent` | `@venizia/ignis/mail` | Mail through Nodemailer, Mailgun or Amazon SES, with an optional BullMQ queue |
| `SocketIOComponent` | `@venizia/ignis/socket-io` | A Socket.IO server with the Redis adapter |
| `WebSocketComponent` | `@venizia/ignis/websocket` | Bun's native WebSocket server |
| `StaticAssetComponent` | `@venizia/ignis/static-asset` | Upload and download controllers over object storage, with a file-record table |

To serve files from disk, you need no component. Call `this.static({ restPath: '/public/*', folderPath: '.' })`
in `staticConfigure()`: the request path is resolved under `folderPath`, so `/public/logo.png` serves
`./public/logo.png`.

## Entry points

The root barrel leaves out the optional transports and engines, so a bundle only pulls in the peers
you use.

| Import | What it gives | Extra peers |
|---|---|---|
| `@venizia/ignis` | `BaseApplication`, the kernel in full, the root components, and everything in `/postgres` | none |
| `/postgres` | Postgres datasources, entities, repositories, `ModelFactory` | none |
| `/postgres/node-postgres` | `NodePostgresDriver` | `pg` |
| `/postgres/postgres-js` | `PostgresJsDriver` | `postgres` |
| `/postgres/pglite` | `PGliteDriver` | `@electric-sql/pglite` |
| `/postgres/supabase` | Supabase auth context and pooler helpers | none |
| `/relational` | The engine-neutral SQL tier (`DefaultRelationalRepository`, `BaseRelationalDataSource`) | none |
| `/sqlite` | SQLite datasources and repositories | none |
| `/sqlite/libsql` | `LibSqlDriver` | `@libsql/client` |
| `/search`, `/search/controllers` | The engine-neutral search tier and its controllers | none |
| `/typesense`, `/typesense/controllers` | The Typesense engine, and the search controllers | `typesense` for `/typesense` |
| `/meilisearch` | The Meilisearch engine | `meilisearch` |
| `/grpc` | `GrpcComponent` (`BaseGrpcController` and `@rpc` come from the root) | none to load |
| `/mail` | `MailComponent` | none to load |
| `/socket-io` | `SocketIOComponent` | `socket.io`, `@socket.io/redis-adapter`, `@socket.io/redis-emitter` |
| `/websocket` | `WebSocketComponent` | none |
| `/static-asset` | `StaticAssetComponent` | none |

"None to load" means the entry imports cleanly; the component loads its client library (for example
`nodemailer` or `@connectrpc/connect`) when you configure it.

The connector entries re-export `@venizia/ignis-connectors` under the same names. The kernel is
re-exported in full from the root.

## Where it sits

Top of the chain. Depends on `@venizia/ignis-kernel`, `@venizia/ignis-connectors`,
`@venizia/ignis-filter`, `@venizia/ignis-helpers` and `@venizia/ignis-inversion`.
`@venizia/ignis-boot` is separate - add it as a dev dependency for the artifact generator.

## Links

- [5-minute quickstart](https://ignis.venizia.ai/guides/get-started/5-minute-quickstart)
- [Philosophy](https://ignis.venizia.ai/guides/get-started/philosophy)
- [Application](https://ignis.venizia.ai/references/base/application)
- [Bootstrapping](https://ignis.venizia.ai/references/base/bootstrapping)
- [Components](https://ignis.venizia.ai/extensions/components/)
- [All changelogs](https://ignis.venizia.ai/changelogs/)

IGNIS is 0.x: a minor version can break. Pin exact versions and read the changelog before upgrading.

MIT licensed - see [LICENSE.md](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/LICENSE.md).
