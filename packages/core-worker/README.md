# @venizia/ignis-worker

Runs an IGNIS application inside a browser Web Worker. The page calls it like an HTTP API, and
nothing crosses a network: requests travel over `postMessage`.

Use it to build a Backend for Frontend (BFF) - a backend that serves one user interface and lives in
that interface's own tab. Your controllers, services and repositories are the same classes a server
application uses; only the host changes.

## Install

```bash
bun add @venizia/ignis-worker @venizia/ignis-kernel hono @hono/zod-openapi
```

Add `@venizia/ignis-connectors` and a driver when the BFF needs a database, for example
`@electric-sql/pglite` for Postgres stored in the browser.

## Example

Inside the Worker, extend `WorkerApplication` and call `listen()` instead of `start()`:

```typescript
// worker.ts
import { z } from '@hono/zod-openapi';
import { BaseRestController, controller, get, jsonResponse } from '@venizia/ignis-kernel';
import { WorkerApplication } from '@venizia/ignis-worker';
import type { Context } from 'hono';

@controller({ path: '/notes' })
class NoteController extends BaseRestController {
  constructor() {
    super({ scope: NoteController.name });
  }

  override binding() {}

  @get({
    configs: {
      path: '/',
      responses: jsonResponse({ schema: z.array(z.object({ title: z.string() })) }),
    },
  })
  list(context: Context) {
    return context.json([{ title: 'Answered inside the Worker' }]);
  }
}

class BffApplication extends WorkerApplication {
  getAppInfo() {
    return { name: 'bff', version: '1.0.0', description: 'A BFF in a Worker' };
  }

  staticConfigure() {}
  setupMiddlewares() {}
  postConfigure() {}

  preConfigure() {
    this.controller(NoteController);
  }
}

const application = new BffApplication({
  scope: BffApplication.name,
  config: { path: { base: '/api', isStrict: false }, error: { environment: 'development' } },
});
application.init();
await application.listen();
```

On the page, create a transport and send it a `Request`:

```typescript
// page.ts
import { SharedBffTransport } from '@venizia/ignis-worker';

const bff = new SharedBffTransport({
  createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
});

const response = await bff.fetch({ request: new Request('http://ignis.internal/api/notes') });
console.log(response.status, await response.json()); // 200 [ { title: 'Answered inside the Worker' } ]
```

A Worker has no `process.env`, so set `config.error.environment` yourself. `listen()` queues any
request that arrives while the application is still booting.

## Make an existing client use it

Most HTTP clients do not accept a custom fetcher. `installBffFetch` answers the page's global `fetch`
for every URL under `basePath` and leaves every other call on the network:

```typescript
import { installBffFetch } from '@venizia/ignis-worker';

installBffFetch({ transport: bff, basePath: '/api' });

await fetch('/api/notes'); // answered by the Worker
```

Install it before the code that calls `fetch` starts. It returns a function that uninstalls it.

## What it exports

| Export | What it does |
|---|---|
| `WorkerApplication` | A `RestApplication` host with `listen({ scope? })` and `stop()` in place of a socket |
| `SharedBffTransport` | One Worker per origin. It elects one tab with the Web Locks API and forwards the other tabs' requests over a `BroadcastChannel`. Use it by default |
| `WorkerBffTransport` | One Worker per transport, for a BFF that holds no origin-exclusive resource |
| `InProcessBffTransport` | No Worker - the same envelope round trip in one thread, for tests |
| `installBffFetch` | Routes the global `fetch` into a transport |
| `BffEnvelope`, `BFF_SYNTHETIC_ORIGIN` | The request, response and error envelopes that cross `postMessage` |

`SharedBffTransport` exists because a database like PGlite in OPFS holds an exclusive per-origin
handle. A second tab starting its own Worker could not open it.

The package has one entry point, `@venizia/ignis-worker`. `hono` and `@hono/zod-openapi` are its only
peers, and both are required.

## Where it sits

Depends on `@venizia/ignis-kernel`, `@venizia/ignis-helpers` and `@venizia/ignis-inversion`. It is the
browser sibling of `@venizia/ignis`; neither depends on the other, and it does not depend on
`@venizia/ignis-connectors`.

## Links

- [Example: browser-bff](https://github.com/VENIZIA-AI/ignis/tree/main/examples/browser-bff) - a controller answering from PGlite in OPFS, with no server
- [Changelog: the browser-pure kernel](https://ignis.venizia.ai/changelogs/2026-08-13-browser-pure-kernel)
- [Changelog: a BFF shared across tabs](https://ignis.venizia.ai/changelogs/2026-08-19-browser-bff-multi-tab)
- [All changelogs](https://ignis.venizia.ai/changelogs/)

MIT licensed - see [LICENSE.md](https://github.com/VENIZIA-AI/ignis/blob/main/LICENSE.md).
