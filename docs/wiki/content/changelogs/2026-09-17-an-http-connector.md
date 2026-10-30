---
title: An HTTP Connector
description: "@venizia/ignis-connectors/http reads an IGNIS REST server through the repository contract, with the same filter vocabulary and Content-Range envelope, in 12.8 KB gzipped."
packages: ['@venizia/ignis-connectors', '@venizia/ignis-filter']
---

# Changelog - 2026-09-17

## `@venizia/ignis-connectors/http`

<Badge type="tip" text="Feature" />

**In one line.** Read another IGNIS REST server through the repository contract, with no drizzle and no zod in the bundle (12.8 KB gzipped, against 144.2 KB for the connectors root).

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

## What changed

- **IGNIS to IGNIS only.** It targets the IGNIS REST contract and promises nothing about an arbitrary REST API.
- **No header means no total.** A list with no `Content-Range` has no total, and `count()` throws rather than report the page size. Pass `countPath` if the API publishes a count route. An empty page or a page past the end still has a total (`records */0`, `records */137`), and `count()` reads it.
- **Auth is configuration.** `authTokenResolver` is a seam for a server secret or browser storage. An explicit `authToken` is consulted first. `onUnauthorized` is a hook that runs on a 401: `true` retries once, `false` lets the 401 stand.
- **Both list shapes.** `x-request-count` is the connector's own header and always goes out `false`; a `headers` setting that carries it throws at construction. A list answered as a count envelope is accepted too. `read({ shape: 'one' })` is never unwrapped.
- **Caller headers** are read as unique lowercase pairs, last spelling winning.

## Who is affected

- **Nobody.** A new sub-path; nothing existing changed.

## Details

- **A long `inq` does not fit in a URL.** The filter travels in the GET query string. Past about 16 KB (about 400 UUIDs) the server answers 431. Split the ids.
- **An unknown total is not a total.** `records 0-24/*` makes `count()` and a ranged `find` throw with a message naming the header. Plain `find` and `existsWith` need no total and keep working.
