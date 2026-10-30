---
title: A List Answers Extras Only When They Are Asked For
description: "respond({ extra }) offers figures beside a list's rows, such as facets and counts, computed only when the client names them in x-request-extra. The http connector asks for them, typed."
packages: ['@venizia/ignis-kernel']
---

# Changelog - 2026-10-07

## A list answers extras only when they are asked for

<Badge type="tip" text="Feature" />

**In one line.** A list route offers figures beside its rows. The client names the ones it wants, and the server computes exactly those.

```typescript
// Server
const body = await this.respond({
  context,
  format: ResponseFormats.ARRAY,
  payload: { count: data.length, data },
  range,
  extra: {
    counts: { isDefault: true, compute: () => this.productService.counts({ where }) },
    facets: {
      keys: ['status', 'category', 'saleChannel', 'tag'],
      compute: ({ keys }) => this.productService.facets({ where, dimensions: keys }),
    },
  },
});

// Client
const { data, range, extra } = await products.find({
  filter,
  options: { shouldQueryRange: true, extra: { facets: ['status', 'category'] } },
});
extra.facets.status; // keys typed from what was asked for
```

## What changed

Before, a list with facets or counts built its own body, like `{ facets, data }`, and computed the figures on every request.

**The route offers extras in `respond({ extra })`:**

- **Plain:** `() => value`. Runs when the client names it.
- **Default:** `{ isDefault: true, compute }`. Always runs, unless the client switches it off.
- **Group:** `{ keys: [...], compute: ({ keys }) => value }`. Runs when the client names it with keys, and `compute` gets exactly those keys, so one aggregate pass serves them all. A group is never a default.

**The client names them in `x-request-extra`:** `summary` (a plain extra), `facets(status,tag)` (a group with its keys), `-counts` (a default switched off), `-*` (every default switched off).

**The response:**

- Nothing asked and no default: unchanged, `{ count, data }`, or the bare array with `x-request-count: false`.
- Anything computed: `{ data, extra }`, plus `count` unless `x-request-count: false`, and an `x-response-extra` header naming what was computed.
- An unknown name or key, a group with no keys, keys on a plain extra or on a `-name`, or a malformed entry: 400, naming what the route offers. A group named with no keys is a 400, not "every key".

**The connector:**

- `find({ options: { extra: { facets: ['status'], counts: false, summary: true } } })` sends `facets(status),-counts,summary`. The result's `extra` is typed by what was asked for, with every entry optional.
- With a range, `find` answers `{ data, range, extra }`; without one, `{ data, extra }`. `read({ extra })` and `write({ extra })` take the same request and return `extra`.
- The connector unwraps `{ data, extra }` only when the response carries `x-response-extra`, so a row with `data` and `extra` columns is never misread.
- `count`, `existsWith` and `findOne` send `-*`, replacing any `x-request-extra` the call set by hand.
- A client that reads the server without the connector can use `HttpExtraRequest.toHeader({ extra, isEveryDefaultOff })` and `HttpResponseReader.readExtra({ body, headers })` from `@venizia/ignis-kernel/repository`. `readExtra` returns `extra` and the body as the route answers it without extras (from kernel 0.2.1-5; 0.2.1-4 dropped `count`).
- To read extras without rows, send `limit: 0`.

**CORS.** `HTTP.CorsHeaders.ALLOW` and `HTTP.CorsHeaders.EXPOSE` list every header IGNIS adds to a request and a response, `x-request-extra` and `x-response-extra` included. Spread them into a CORS configuration that lists headers by hand.

## Who is affected

- **A route that hand-builds a `{ facets, data }`-style body.** Move the figures into `respond({ extra })`: cheap, always-shown figures as defaults; per-dimension figures as a group; the rest plain. Clients read `extra.facets` instead of `facets`.
- **A route that adds a DEFAULT extra.** Its list body becomes `{ data, extra }` for every client. A connector older than this release reads only a bare array or `{ count, data }` and fails on that route; upgrade the client first.
- **A server that lists its CORS headers by hand.** Add `...HTTP.CorsHeaders.ALLOW` and `...HTTP.CorsHeaders.EXPOSE`, or at least `x-request-extra` and `x-response-extra`. Otherwise the browser preflight fails.
- **A subclass of `HttpRepository` that overrides `find`.** `find` now has five overloads, one per combination of range and `extra`, plus one for a range or `extra` decided at run time. An override that declares only the old two fails with TS2416. Declare the same five.
- **Everyone else.** No change. Routes that offer no extras ignore `x-request-extra`.
