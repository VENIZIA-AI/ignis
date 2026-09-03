---
type: Package
title: core-worker
description: The browser half of IGNIS - a Backend for Frontend that runs an IGNIS application inside a dedicated Worker and answers its own REST routes over postMessage.
resource: packages/core-worker
tags: [packages, core-worker, browser, bff, worker, isomorphic]
---

`@venizia/ignis-worker` runs a whole IGNIS application inside a browser Worker. The UI calls it
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
export const bff = new SharedBffTransport({
  createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
});

const response = await bff.fetch({ request: new Request('http://ignis.internal/api/notes') });
```

## The package is small on purpose

Eighteen source files, three subsystems, one export entry.

| Subsystem | What it holds |
|---|---|
| `applications/` | `WorkerApplication` - extends the kernel's `RestApplication`, adds `listen()` and `stop()` |
| `envelope/` | `BffEnvelope` - `encodeRequest`/`decodeRequest`, `encodeResponse`/`decodeResponse`, `encodeError`/`decodeError`, `toSyntheticUrl` - plus `BFF_SYNTHETIC_ORIGIN` and the envelope types |
| `transport/` | `IBffTransport` and its three implementations - `WorkerBffTransport` (one Worker), `SharedBffTransport` (one Worker per origin), `InProcessBffTransport` (no Worker at all) - plus `installBffFetch` |

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

## `SharedBffTransport` - one Worker per origin, not per tab

Use it by default. `WorkerBffTransport` is the right choice only when the BFF touches no
origin-exclusive resource.

The constraint is storage, not framework. PGlite in `opfs-ahp://` mode holds an exclusive OPFS
access handle, and access handles are exclusive per **origin**. Measured in Chromium with two tabs:
the first works, the second never boots its database - `Access Handles cannot be created if there is
another open Access Handle or Writable stream associated with the same file`. The first tab is
unaffected, and closing it lets the second recover on reload.

So exactly one tab may own the database. `SharedBffTransport` elects that tab with the Web Locks
API, calls `createWorker()` **only** in the winner, and forwards every other tab's request over a
`BroadcastChannel` in the same envelope the Worker speaks.

| Decision | Why |
|---|---|
| Web Locks, not a heartbeat | the browser releases the lock when the tab goes away, a crash included - no stale-leader window to reason about |
| `createWorker` is a factory, not a `Worker` | a follower must never construct one; passing an instance would start it before the election |
| `{ ifAvailable: true }`, then a second queued request | the first tells this tab it is a follower without hanging; the second is the promotion, and it resolves on its own when the leader dies |
| Promotion rejects everything in flight | those requests were addressed to a leader that is gone, and a write may already have been applied - replaying is not safe, and waiting out the timeout says nothing |
| `close()` aborts the queued lock request | otherwise a closed transport stays in the queue and is handed leadership over a tab that could have served |
| BOTH lock callbacks check `isClosed` | a real `LockManager` grants from a queued task, so `close()` can land between the constructor and the grant. Unguarded, a closed transport booted a worker and held the lock for the life of the page - `close()` clears `releaseLeadership` before `heldUntilClosed()` assigns it, so nothing could resolve it |
| `close()` terminates the worker BEFORE releasing the lock | `WorkerBffTransport.close()` leaves a worker running by design (it did not create it); this class did. Releasing first promotes a tab that opens the same database while the old worker still holds the access handle |
| No "new leader is ready" broadcast | `BroadcastChannel` does not order messages across senders, so a request posted around a promotion may still be answered - a follower acting on the announcement would turn those successes into errors. The request timeout is the honest answer for that window |

A host with no `navigator.locks` runs single-tab, and that is not a compromise: measured on a
plain-http origin, `navigator.locks` and `navigator.storage.getDirectory` are **both** undefined,
because both are secure-context only. Wherever OPFS works the lock exists, and where it does not the
database could not have started either.

Bun has `BroadcastChannel` but no `navigator.locks`, so
`src/__tests__/shared-transport.test.ts` drives a `LockManagerStub` - without it every test would
take the single-tab branch, which is the one branch the suite is not about.

## `installBffFetch` - the seam that makes the swap invisible

```ts
installBffFetch({ transport: bff, basePath: '/api' });
```

Routes the page's own `fetch` into a transport for anything under `basePath`, and leaves every other
call on the network. It returns an uninstall function, and refuses a second install rather than
stacking bridges.

This exists because HTTP clients do not take a custom fetcher. A data provider, an SDK or a
generated client reaches the network through the global `fetch`, so answering that `fetch` is the
only place an in-browser backend is a drop-in swap rather than a fork of the client. Install it
**before** the application that uses it boots.

The one non-obvious line is `resolveRequestUrl`, which reads the URL without constructing a
`Request`. `new Request(existingRequest)` marks the original body disturbed in Chromium - `bodyUsed`
flips to `true` and `text()` then throws - so building one just to read `.url` breaks the very
pass-through it is deciding about. Bun does **not** disturb it, so no test under the Bun runner can
guard this; the test that covers it says so in its own comment.

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

It emits a **UUID v4** - the same shape `hono/request-id`'s default produces - but never by calling
`crypto.randomUUID()` unguarded, which is what that default does. Browsers gate that one API on a
**secure context**. Measured in Chrome on `http://<lan-ip>`: the page and a Worker both report
`crypto` present and `getRandomValues` working, while `randomUUID` and `subtle` are `undefined` and
the call throws `TypeError`; on `http://localhost`, a secure origin, all four are there. The gate
follows the ORIGIN, not the Worker - testing from a phone over the LAN is enough to lose it.

So the strategy is resolved once in the constructor: `crypto.randomUUID()` when the host exposes it,
otherwise an RFC 9562 v4 assembled from `crypto.getRandomValues()`, which carries no such gate. Both
paths return the identical 36-character shape, so nothing downstream can tell them apart. Measured:
51 ns/op native, 128 ns/op on the fallback, against 609 ns/op for the Snowflake this replaced.

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

- **This package dual-builds**, CommonJS and ESM, and the purity gate fails if the `import`
  condition disappears. It shipped CommonJS only once, and a Vite consumer then needed an
  `optimizeDeps.include` line per sub-path - see [browser-bff](/examples/browser-bff.md).
- **`IWorkerMessageScope` is a structural type, not `DedicatedWorkerGlobalScope`.** Not because this
  package lacks `lib.webworker` - `tsconfig.json` sets `lib: ["ES2024", "WebWorker"]` and
  `browser-purity.test.ts` asserts it. Naming the DOM type in a public signature would force
  `lib.webworker` on every **consumer**.
- **`WorkerApplication` has no `initialize()`.** `AbstractApplication` declares it abstract and the
  only implementation is `BaseApplication`'s, in `packages/core-server`, which a browser cannot import. A
  browser application restates the phase order by hand today.
- **A browser has no `NODE_ENV`,** so the error middleware fails closed and sanitises. Set it on the
  Hono env binding from a middleware to see unsanitised errors while developing.
- The Worker and the server stamp the SAME `requestId` format, a UUID v4, because both go through
  `RequestIdGenerator`. They once differed - the Worker minted a base62 Snowflake while the server
  kept hono's default - and correlating one request across the two halves meant knowing which end
  produced which shape.

## Related

- [kernel](/packages/kernel.md)
- [core](/packages/core-server.md)
- [browser-bff](/examples/browser-bff.md)
- [Error handling flow](/architecture/error-handling-flow.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
