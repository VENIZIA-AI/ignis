---
title: An HTTP Connector
description: "connectors/http reads an IGNIS REST server through the repository contract - same filter vocabulary in, same Content-Range envelope out, 12.8 KB with no SQL stack."
---

# Changelog - 2026-09-17

## `@venizia/ignis-connectors/http`

<Badge type="tip" text="Feature" />

```ts
import { HttpDataSource, HttpRepository } from '@venizia/ignis-connectors/http';

const dataSource = new HttpDataSource({
  baseUrl: 'https://tickets.internal',
  authTokenResolver: () => ({ value: readServiceToken() }),
  onUnauthorized: async () => {
    await refreshServiceToken();
    return true; // retry once; false lets the 401 stand
  },
});

const tickets = new HttpRepository<ITicket>({ dataSource, resource: 'tickets' });
await tickets.find({ filter: { where: { status: 'open' }, limit: 20 } });
```

| Entry | Browser bundle |
|---|---|
| `@venizia/ignis-connectors` | 144.2 KB gzipped |
| `@venizia/ignis-connectors/http` | **12.8 KB gzipped** - no drizzle, no zod |

## Why a datasource

A repository talks to a datasource, and `AbstractDataSource` is engine-neutral - its only required
member is `configure()`. A request to another server is a datasource in the same sense
Drizzle-over-Postgres is one: same role, different transport. The query goes out as the
`@venizia/ignis-filter` vocabulary either way, so nothing is translated at the boundary.

It targets **the IGNIS REST contract** and promises nothing about an arbitrary REST API. How a filter
serialises and which header carries the total are one API's conventions; IGNIS talking to IGNIS is
both ends speaking its own.

## No header means no total

A list with no `Content-Range` has **no total**, which is a different answer from "the total is this
page". `count()` says so rather than reporting the page size:

```
The response carried no Content-Range, so there is no total to report - answering with the page
size would claim 1. Give this repository a countPath if the API publishes a count route.
```

A count of 1 for a table of 7000 reads as healthy in every screen that consumes it. Generated IGNIS
CRUD routes always send the header (`factory/crud/readable.ts` passes `shouldQueryRange: true`); a
hand-written route need not, which is exactly when this fires.

`countPath` is opt-in for an API that publishes a count route - one publishes `/count`, another
`/search/count`, another deleted it and told callers to read the header. That is convention, so it is
named rather than assumed.

## Auth is configuration, not an assumption

`authTokenResolver` is a seam: a server resolver reads a secret, a browser resolver reads storage,
and neither is baked in. An explicit `authToken` is consulted **first** - a caller that supplied one
is never overridden by a lookup.

`onUnauthorized` is a **hook, not a flag**. It runs on a 401 and its answer decides: `true` retries
once, `false` lets the 401 stand. Recovery is the host policy - one refreshes a token, another logs
the user out, a third does both in an order only it knows. A boolean could only have meant "ask the
resolver again", which reads like recovery and is not.

## Both IGNIS list shapes

`x-request-count` decides whether a list answers a bare array or a count envelope, and its
**default is on** - so an IGNIS list route answers the envelope unless asked otherwise. This
datasource asks for the array and accepts either, because a hand-written route that never reaches
`normalizeCountData` can still answer the envelope. Handing an envelope back as one row is fifty
records reported as one, with no error anywhere.

The shape is **asked for, not sniffed**: `read({ shape: 'one' })` is never unwrapped, because
structure alone cannot tell an envelope from a record carrying a `data` column and a `count` column.

## Auth

The retry rebuilds headers through the same builder. That matters: a second header-building path is where a guard gets forgotten, and
`x-auth-provider` is only set when there IS a provider - `fetch` turns an `undefined` value into the
literal string `"undefined"`, which a server reads as a provider by that name.

## Who is affected

**Nobody.** A new sub-path; nothing existing changed.

**Files:**

- [`packages/connectors/src/http/datasource.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/http/datasource.ts)
- [`packages/connectors/src/http/repository.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/http/repository.ts)
