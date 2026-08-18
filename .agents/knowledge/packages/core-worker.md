---
type: Package
title: core-worker
description: The browser half of IGNIS - a Backend for Frontend that runs an IGNIS application inside a dedicated Worker and answers its own REST routes over postMessage.
resource: packages/core-worker
tags: [packages, core-worker, browser, bff, worker, isomorphic]
---

`@venizia/ignis-core-worker` runs a whole IGNIS application inside a browser Worker. The UI calls it
like an HTTP API; nothing crosses a network. It is the browser sibling of `packages/core-server`, and both
sit on `@venizia/ignis-kernel`.

It is a **Backend for Frontend**, not the server relocated. A BFF serves one user interface and
shapes data for that interface alone. Judge design questions here against that, not against server
parity: aggregating several upstreams into the one shape a UI renders is the point.

```ts
// worker.ts - inside the Worker
class BrowserBffApplication extends WorkerApplication {
  /* configure, bind controllers */
}
await new BrowserBffApplication().listen();

// bff.ts - on the page
export const bff = new WorkerBffTransport({
  worker: new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
});

const response = await bff.fetch({ request: new Request('http://ignis.internal/api/notes') });
```

## The package is small on purpose

Thirteen source files, four subsystems, one export entry.

| Subsystem | What it holds |
|---|---|
| `applications/` | `WorkerApplication` - extends the kernel's `RestApplication`, adds `listen()` and `stop()` |
| `envelope/` | `BffEnvelope` - `encodeRequest`/`decodeRequest`, `encodeResponse`/`decodeResponse`, `encodeError`/`decodeError`, `toSyntheticUrl` - plus `BFF_SYNTHETIC_ORIGIN` and the envelope types |
| `transport/` | `IBffTransport`, `WorkerBffTransport` (the page side), `InProcessBffTransport` (no worker at all) |

Everything else comes from the kernel. `hono` and `@hono/zod-openapi` are the only peers.

## The HTTP contract is the seam

`Request`, `Response` and `Headers` all throw `DataCloneError` under structured clone, so nothing
crosses `postMessage` as itself. The envelope is what crosses.

| Type | Carries |
|---|---|
| `IBffRequestEnvelope` | `id`, `method`, `url`, headers as tuples, body as `ArrayBuffer` |
| `IBffResponseEnvelope` | `id`, `status`, `statusText`, headers as tuples, body as `ArrayBuffer` |
| `IBffErrorEnvelope` | `id`, `statusCode`, and the error's normalised `{ text, code, args }` |

Headers are tuples because a `Headers` instance is not cloneable. Bodies are buffered because
`ReadableStream` does not transfer in any shipped Safari.

An `ApplicationError` cannot cross as itself either - a custom `Error` subclass loses its name, its
own properties and its prototype through structured clone. It crosses as its normalised shape and
`fromError` rebuilds it on the far side. The envelope carries `statusCode` explicitly because
`ApplicationError` defaults an absent one to **400**, and this envelope is only produced when
something escaped Hono's `onError` - exactly the 500-class failures a UI must not retry as client
errors. A foreign error gets 500.

`BFF_SYNTHETIC_ORIGIN` is `http://ignis.internal`. A Worker has no origin of its own, and Hono needs
an absolute URL to route.

## `listen()` and what it registers

`listen({ scope })` defaults `scope` to `globalThis`. It accepts a `MessagePort` too, and calls
`scope.start?.()` after attaching the listener - a port's message queue starts **disabled**, and only
`start()` or assigning `onmessage` enables it. `addEventListener` does not. Bun auto-starts a port,
so no Bun test can catch a missing `start()`; the call is there because the HTML spec requires it.

**The listener attaches synchronously, before the first await.** A dedicated worker's message queue
is enabled at module **evaluation**, which for a module with top-level await happens while the await
is still pending - so attaching after `initialize()` would drop everything posted during boot, and
the caller could not tell that from a slow answer. Envelopes that arrive early wait on one shared
serving promise; a failed boot answers with an error envelope rather than silence. Applications do
not need a ready handshake.

`listen()` is idempotent, and `stop()` detaches. Both matter under Vite HMR, which re-evaluates the
worker module without tearing down the Worker: without the guard one envelope would run the route
handler twice, and without `stop()` the PGlite OPFS lock would never be released.

`registerDefaultMiddlewares()` is **inherited from the kernel's `RestApplication`**, not written
here - the server calls the same method, so the two hosts cannot drift. It installs three things, in
this order:

1. `requestId()` - without it `context.get(REQUEST_ID_KEY)` is `undefined` and `context.json` drops
   the field from the body entirely, so every error response would be missing the one key that
   correlates it to a log line.
2. The framework error handler, so a thrown `ApplicationError` renders the same envelope it does on
   the server.
3. `notFoundHandler`, so an unrouted path returns JSON rather than Hono's `text/plain` default. A UI
   calling `response.json()` on that 404 would otherwise get a `SyntaxError`.

`RequestIdGenerator` (`@venizia/ignis-helpers/core`, beside `SnowflakeUidHelper`) is the single id
rule - used by the transports here, by the Worker application, and by the server, which is the point:
it began as a BFF-only class while the server half kept hono's default, and the two ends of one
request stamped different formats.

It wraps `SnowflakeUidHelper.nextId()` in a try/catch: `nextId()` throws when the clock jumps
backwards beyond `MAX_CLOCK_BACKWARD_MS` - rare on a server, routine in a browser tab across sleep,
resume and NTP. Unguarded, that throw escapes into `onError` with no id: the same bug, plus a 500 on
every request in the window. A request id is a correlation token, not a key.

Never `crypto.randomUUID()`, which is `hono/request-id`'s default. Browsers expose it only in a
**secure context**, so on a plain-http LAN origin - and in several WebView configurations - it is
`undefined`. Snowflake needs nothing but `Date.now()`.

## Browser purity is enforced by ESLint, not by tsc

The spec once promised that `process.env` here would be a compile error. It is not, and no tsconfig
knob can make it one. `types: []` disables only **automatic** `@types/*` inclusion; it cannot cancel a
`/// <reference types="node" />` inside a `.d.ts` the program already reached, and two first-party
paths reach one:

- `@venizia/ignis-helpers/core` reaches `ioredis`
- `@venizia/ignis-kernel` reaches `casbin`

Both are type-only, so `make purity` stays green - which is why nobody noticed. See
[gotchas](/conventions/gotchas.md).

So the author-time defence is a `no-restricted-globals` and `no-restricted-imports` block in
`eslint.config.mjs`, scoped to `src/**/*.{ts,tsx,mts,cts}` and pinned by
`src/__tests__/browser-purity.test.ts`, which drives the real tsc and the real ESLint against
committed fixtures. `tsconfig.build.json` still sets `types: []`, which does remove the `Bun`
namespace. `scripts/rebuild.sh` type-checks the production graph **before** cleaning `dist/`.

What no static rule reaches: computed member access (`globalThis['process']`), a variable import
specifier, and an inline `eslint-disable`. `make purity` backstops the first two at bundle level;
nothing catches the computed form.

## Testing without a browser

`InProcessBffTransport` takes a handler and drives it through the **same envelope** the Worker
transport uses - synthetic origin, buffered body, normalised error - behind the same `IBffTransport`
interface. No worker and no browser, but not a bare pass-through: a seam that skips the envelope
would let a route pass in-process and hang over a real Worker, which spends the only thing the seam
is for.

## Gotchas

- **This package ships CommonJS only**, like every IGNIS package except `inversion` and `filter`. A
  Vite consumer needs `optimizeDeps.include` lines for each one.
- **`IWorkerMessageScope` is a structural type, not `DedicatedWorkerGlobalScope`.** Not because this
  package lacks `lib.webworker` - `tsconfig.json` sets `lib: ["ES2024", "WebWorker"]` and
  `browser-purity.test.ts` asserts it. Naming the DOM type in a public signature would force
  `lib.webworker` on every **consumer**.
- **`WorkerApplication` has no `initialize()`.** `AbstractApplication` declares it abstract and the
  only implementation is `BaseApplication`'s, in `packages/core-server`, which a browser cannot import. A
  browser application restates the phase order by hand today.
- **A browser has no `NODE_ENV`,** so the error middleware fails closed and sanitises. Set it on the
  Hono env binding from a middleware to see unsanitised errors while developing.
- The Worker's `requestId` is a base62 Snowflake; the server's is a UUID. The shape contract holds -
  the field is present and non-empty on both - but the formats differ.

## Related

- [kernel](/packages/kernel.md)
- [core](/packages/core-server.md)
- [browser-bff](/examples/browser-bff.md)
- [Error handling flow](/architecture/error-handling-flow.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
