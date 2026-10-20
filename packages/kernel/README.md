# @venizia/ignis-kernel

The browser-pure core of IGNIS: the dependency injection container, the application lifecycle, REST
controllers, the repository and datasource contracts, and the authentication and authorization seams.
It imports no Node builtin, so the same code runs in a Bun server and in a browser Worker.

Most applications never install it directly. `@venizia/ignis` (the server) re-exports all of it, and
`@venizia/ignis-worker` (the browser host) builds on it. Install it yourself when you write code that
must run on both hosts, or when you only need the DI decorators or the repository contract.

## Install

```bash
bun add @venizia/ignis-kernel hono @hono/zod-openapi
```

`hono` and `@hono/zod-openapi` are needed by the root entry only. The `./metadata` and
`./repository` entries load without them.

## Example

Bind a class, then let the container build another class that depends on it:

```typescript
import {
  BaseService,
  BindingKeys,
  BindingNamespaces,
  Container,
  inject,
} from '@venizia/ignis-kernel';

const GREETING_SERVICE = BindingKeys.build({
  namespace: BindingNamespaces.SERVICE,
  key: 'GreetingService',
});

class GreetingService extends BaseService {
  constructor() {
    super({ scope: GreetingService.name });
  }

  greet(opts: { name: string }) {
    return `Hello, ${opts.name}`;
  }
}

class WelcomeService extends BaseService {
  constructor(@inject({ key: GREETING_SERVICE }) private greetingService: GreetingService) {
    super({ scope: WelcomeService.name });
  }

  welcome() {
    return this.greetingService.greet({ name: 'IGNIS' });
  }
}

const container = new Container({ scope: 'demo' });
container.bind({ key: GREETING_SERVICE }).toClass(GreetingService);

const welcomeService = container.resolve(WelcomeService);
console.log(welcomeService.welcome()); // Hello, IGNIS
```

`@inject` is a parameter decorator. Set `experimentalDecorators` and `emitDecoratorMetadata` in your
own `tsconfig.json`; Bun drops parameter decorators when those flags only arrive through an `extends`
of a package path.

## Entry points

| Import | What it gives | Extra peers |
|---|---|---|
| `@venizia/ignis-kernel` | Everything: `Container`, `AbstractApplication`, `RestApplication`, `BaseRestController`, `ControllerFactory`, `BaseComponent`, `BaseService`, the route and artifact decorators, `AbstractRepository`, `CoreBindings`, the auth seams | `hono`, `@hono/zod-openapi` |
| `@venizia/ignis-kernel/metadata` | How a class is marked as an artifact: `@injectable`, `@service`, `@component`, `@configuration`, `@provide`, `@model`, `@datasource`, `@repository`, `@inject`, `BindingNamespaces`, `BindingKeys`, `ArtifactTypes`, `MetadataRegistry` | none |
| `@venizia/ignis-kernel/repository` | The persistence contract without the OpenAPI layer: `AbstractRepository`, `AbstractDataSource`, `AbstractEntity`, the CRUD repository interfaces, `DEFAULT_LIMIT`, `DEFAULT_MAX_LIMIT`, the repository error codes, and the `TFilter`/`TWhere` vocabulary from `@venizia/ignis-filter` | none |

`drizzle-orm`, `casbin` and `jose` are optional peers reached through type imports only. Install them
for the connectors or components that use them, not for the kernel.

Use `./repository` to put another transport behind the repository contract. The HTTP connector in
`@venizia/ignis-connectors/http` is built that way.

## Logging

With the kernel alone, loggers write to the console. To get the configured logger, import
`LoggerFactory` from `@venizia/ignis-helpers` once at startup. A logger created before that import
switches to the configured one on its next call - nothing needs rebuilding. `@venizia/ignis` does this
for you.

## Where it sits

Depends on `@venizia/ignis-inversion`, `@venizia/ignis-filter` and `@venizia/ignis-helpers`. Used by
`@venizia/ignis-connectors`, `@venizia/ignis-worker` and `@venizia/ignis`.

## Links

- [Dependency injection](https://ignis.venizia.ai/references/base/dependency-injection)
- [Application](https://ignis.venizia.ai/references/base/application)
- [Controllers](https://ignis.venizia.ai/references/base/controllers)
- [Changelog: the browser-pure kernel](https://ignis.venizia.ai/changelogs/2026-08-13-browser-pure-kernel)
- [Changelog: a repository entry for other transports](https://ignis.venizia.ai/changelogs/2026-09-17-a-repository-entry-for-other-transports)
- [All changelogs](https://ignis.venizia.ai/changelogs/)

MIT licensed - see [LICENSE.md](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/LICENSE.md).
