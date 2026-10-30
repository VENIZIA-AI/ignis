---
title: A Browser BFF That Survives a Second Tab
description: SharedBffTransport runs one Worker per origin instead of one per tab, and a framework audit fixes defects including HTTPS certificate verification and unbounded limits.
packages: ['@venizia/ignis-worker']
---

# Changelog - 2026-08-19

## Multi-tab support for the browser BFF

<Badge type="tip" text="New Feature" /> <Badge type="info" text="Bug Fix" />

**In one line.** Open your browser BFF in a second tab and it works: one tab runs the Worker, the rest are forwarded to it.

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
- **`installBffFetch` moved into the package.** It routes the page's own `fetch` into a BFF for one or more path prefixes, and leaves every other call on the network. It returns an uninstall function and refuses a second install. Install it before the application that uses it boots.
- **A promoted tab takes over in place.** Close the tab that holds the Worker and another one picks it up, with no reload.

## Who is affected

- **Anyone running a browser BFF over PGlite in OPFS.** Switch to `SharedBffTransport`. Without it a second tab renders its UI and then fails every call, because the database file is already held by the first tab.
- **Anyone hand-rolling a `fetch` interceptor for a BFF.** Delete it and call `installBffFetch`. A hand-rolled one that builds a `Request` to inspect the URL marks the original body as used in Chromium, so a POST sent on to the network arrives unreadable.
- **Everyone else.** No action needed. `WorkerBffTransport` is unchanged and still exported.

## Details

| Option | Type | Default | Meaning |
|---|---|---|---|
| `createWorker` | `() => Worker` | required | Called only in the tab that wins the election |
| `channelName` | `string` | `'ignis.bff'` | Distinguishes independent BFFs on one origin |
| `timeoutMs` | `number` | `30000` | How long a follower waits for the leader to answer |
| `scope` | `string` | class name | Logger scope |

- The tab holding the Web Locks lock runs the Worker. A closed or crashed tab releases the lock, so promotion needs no heartbeat.
- A host without `navigator.locks` runs single-tab.

## Also in this release - the framework audit

<Badge type="danger" text="Security" /> <Badge type="warning" text="Breaking Change" /> <Badge type="info" text="Bug Fix" />

An audit of kernel, connectors, helpers and core fixed 18 defects. Five change behaviour a running application can notice.

> [!WARNING]
> Read this section before upgrading. Each item below can turn a call that worked yesterday into a 400 or a thrown error.

- **HTTPS certificates are verified.** `AxiosFetcher` defaulted `rejectUnauthorized` to `false`, so every HTTPS request accepted any certificate. It is `true` now. A partner endpoint with a broken chain fails loudly. Set `rejectUnauthorized: false` explicitly on that one fetcher if you must keep talking to it.
- **Request bodies stop leaking outside development.** `RequestSpyMiddleware` logged full bodies in `staging`, `uat`, `alpha`, `beta`, and with `NODE_ENV` unset. It now logs bodies only in `local`, `debug`, `development`, `dev`, `sit`.
- **`limit` is bounded at both ends.** A negative limit used to remove the LIMIT clause and return the whole table. Negative and fractional limits are now a 400, `@model settings.maxLimit` is enforced on the relational tier, and a request above the framework default of 1000 throws. A relation scope's limit is checked too.
- **A malformed `filter` or `where` query string is a 400, not a 500.**
- **`Authorization.RULES` is a `Map` keyed by enforcer name.** It was a single slot shared by every enforcer, so one enforcer's rules could answer another's check. Code reading that context value gets a `Map` now.

Also: `include[].shouldSkipDefaultFilter` is no longer accepted from a client (it would erase the `@model` defaultFilter behind soft-delete), and log redaction now covers `%o`/`%O`, placeholder-less arguments, and the `*Secret`, `*_password`, `connection_string`, `dsn` spellings.
