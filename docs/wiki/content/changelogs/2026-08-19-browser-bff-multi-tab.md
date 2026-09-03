---
title: A Browser BFF That Survives a Second Tab
description: SharedBffTransport runs one Worker per origin instead of one per tab, and the framework audit fixes 18 defects - five of them breaking.
---

# Changelog - 2026-08-19

## Multi-tab support for the browser BFF

<Badge type="tip" text="New Feature" /> <Badge type="info" text="Bug Fix" />

**In one line.** Open your browser BFF in a second tab and it works - one tab runs the Worker, the rest are forwarded to it.

```ts
import { SharedBffTransport, installBffFetch } from '@venizia/ignis-worker';

export const bff = new SharedBffTransport({
  createWorker: () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  channelName: 'my-app',
});

installBffFetch({ transport: bff, basePath: '/api' });
```

## What changed

- **`SharedBffTransport` is new.** It elects one tab to run the Worker and forwards every other tab's request to it. Use it wherever you used `WorkerBffTransport`.
- **`installBffFetch` moved into the package.** It routes the page's own `fetch` into a BFF for one or more path prefixes, and leaves every other call on the network. It used to be example code.
- **A promoted tab takes over in place.** Close the tab that holds the Worker and another one picks it up, no reload.

## Who is affected

- **Anyone running a browser BFF over PGlite in OPFS.** Switch to `SharedBffTransport`. Without it a second tab renders its UI and then fails every call, because the database file is already held.
- **Anyone hand-rolling a `fetch` interceptor for a BFF.** Delete it and call `installBffFetch`. The hand-rolled version most likely has the body bug described below.
- **Everyone else.** No action needed. `WorkerBffTransport` is unchanged and still exported.

## Details

### Why one tab has to own the database

PGlite in `opfs-ahp://` mode holds an exclusive OPFS access handle, and those handles are exclusive per **origin**, not per tab. Measured in Chromium: the first tab works normally, the second never boots its database, and every call there fails with `Access Handles cannot be created if there is another open Access Handle or Writable stream associated with the same file`.

So the fix is not to make the database sharable. It is to make sure only one tab opens it.

### How the election works

`SharedBffTransport` takes the Web Locks API's word for who leads. The tab holding the lock calls `createWorker()`; the others never do. Requests reach the leader over a `BroadcastChannel`, in the same envelope the Worker already speaks.

The browser releases a lock when its tab goes away - a crash included - so promotion needs no heartbeat and there is no stale-leader window.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `createWorker` | `() => Worker` | required | Called only in the tab that wins the election |
| `channelName` | `string` | `'ignis.bff'` | Distinguishes independent BFFs on one origin; the lock name derives from it |
| `timeoutMs` | `number` | `30000` | How long a follower waits for the leader to answer |
| `scope` | `string` | class name | Logger scope |

A host without `navigator.locks` runs single-tab, and loses nothing: `navigator.locks` and `navigator.storage.getDirectory` are both secure-context only, so wherever OPFS works the lock exists.

### The `fetch` bridge, and the bug it fixes

HTTP clients rarely accept a custom fetcher. A data provider or a generated client reaches the network through the global `fetch`, so answering that `fetch` is the only place an in-browser backend is a drop-in swap rather than a fork of the client.

`installBffFetch` returns an uninstall function, accepts several prefixes, and refuses a second install rather than stacking bridges. Install it before the application that uses it boots.

It also reads a request's URL **without** constructing a `Request`. In Chromium, `new Request(existingRequest)` marks the original body disturbed - `bodyUsed` flips to `true` and the next read throws - so a hand-rolled bridge that builds one just to inspect the URL breaks the very pass-through it is deciding about. Any POST it decided to send to the network arrived unreadable.

| File | Package |
|------|---------|
| `src/transport/shared.ts` | worker |
| `src/transport/fetch-bridge.ts` | worker |

## Also in this release - the framework audit

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Bug Fix" />

An audit of kernel, connectors, helpers and core fixed 18 defects. Five change behaviour a running application can notice.

> [!WARNING]
> Read this section before upgrading. Each item below can turn a call that worked yesterday into a 400 or a thrown error.

- **HTTPS certificates are verified.** `AxiosFetcher` defaulted `rejectUnauthorized` to `false`, so every HTTPS request the framework made accepted any certificate. It is `true` now. A partner endpoint with a broken chain **fails loudly** instead of silently trusting it. Set `rejectUnauthorized: false` explicitly on that one fetcher if you must keep talking to it.
- **Request bodies stop leaking outside development.** `RequestSpyMiddleware` tested `env !== 'production'`, which logged full bodies in `staging`, `uat`, `alpha`, `beta`, and with `NODE_ENV` unset. It now logs bodies only in `local`, `debug`, `development`, `dev`, `sit`.
- **`limit` is bounded at both ends.** A negative limit removed Drizzle's LIMIT clause entirely and returned the whole table. Negative and fractional limits are now a 400, `@model settings.maxLimit` is enforced on the relational tier, and a request above the framework default of 1000 throws. A relation scope's limit is checked too.
- **A malformed `filter` or `where` query string is a 400, not a 500.** A `SyntaxError` escaped zod's `safeParse`, bypassing the controller's validation hook.
- **`Authorization.RULES` is a `Map` keyed by enforcer name.** It was a single slot shared by every enforcer, so one enforcer's rules could answer another's check. Code reading that context value gets a `Map` now.

Two more worth knowing about: `include[].shouldSkipDefaultFilter` is no longer accepted from a client (it would erase the `@model` defaultFilter behind soft-delete), and log redaction now covers `%o`/`%O`, placeholder-less arguments, and the `*Secret`, `*_password`, `connection_string`, `dsn` spellings.
