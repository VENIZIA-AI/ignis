---
title: A List Answers Extras Only When They Are Asked For
description: "respond({ extra }) offers figures beside a list's rows - facets, counts - computed only when the client names them in x-request-extra, as one group pass when they are grouped, or always when they are a default. The http connector asks for them, typed."
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

Before, a list with facets or counts built its own body, like `{ facets, data }`. Every request computed the figures, needed or not. The body was an object even when the client asked for the bare array, so the http connector refused it.

**The route offers extras in `respond({ extra })`, in three kinds:**

| Kind | Declared as | Runs |
|---|---|---|
| Plain | `() => value` | When the client names it |
| Default | `{ isDefault: true, compute }` | Always, unless the client switches it off |
| Group | `{ keys: [...], compute: ({ keys }) => value }` | When the client names it with keys; `compute` gets exactly those keys, so one aggregate pass serves them all. A group is never a default |

**The client names them in `x-request-extra`:**

| Entry | Meaning |
|---|---|
| `summary` | A plain extra |
| `facets(status,tag)` | A group, with the keys it wants |
| `-counts` | A default switched off |
| `-*` | Every default switched off |

**The response:**

| Request | Body |
|---|---|
| Nothing asked, and no default | Unchanged: `{ count, data }`, or the bare array with `x-request-count: false` |
| Anything computed | `{ data, extra }`, plus `count` unless `x-request-count: false`. The response carries `x-response-extra` naming what was computed |
| An unknown name or key, a group with no keys, keys on a plain extra or on a `-name`, or a malformed entry | 400, naming what the route offers |

A group named with no keys is a 400, not "every key". A client cannot trigger every dimension by accident. Names and keys are only matched against what the route declares, never evaluated.

**The connector:**
- `find({ options: { extra: { facets: ['status'], counts: false, summary: true } } })` sends `facets(status),-counts,summary`.
- The result's `extra` is typed by what was asked for. Every entry is optional, since a route that offers none, or an older server, answers nothing.
- With a range, `find` answers `{ data, range, extra }`; without one, `{ data, extra }`. Asked for, `extra` is always there, empty when nothing came back.
- `read({ extra })` and `write({ extra })` take the same request object and return `extra`.
- The connector unwraps `{ data, extra }` only when the response carries `x-response-extra`. A row that happens to have `data` and `extra` columns is never misread.
- `count` (by `Content-Range` or by `countPath`), `existsWith` and `findOne` send `-*`, so a default is not computed for a read that throws it away. They always ask for the rows alone, replacing any `x-request-extra` the call set by hand.
- The header builder and the reader live in `@venizia/ignis-kernel/repository`: `HttpExtraRequest.toHeader({ extra, isEveryDefaultOff })`, and `HttpResponseReader.readExtra({ body, headers })`. A client that reads the server without the connector uses the same code. `readExtra` returns `extra` and the body as the route answers it without extras: the `{ count, data }` envelope when the count was asked for in the body, the rows otherwise (from kernel 0.2.1-5; 0.2.1-4 dropped `count`).

To read extras without rows, send `limit: 0`.

**CORS.** `HTTP.CorsHeaders.ALLOW` and `HTTP.CorsHeaders.EXPOSE` list every header IGNIS adds to a request and to a response, `x-request-extra` and `x-response-extra` included. Spread them into a CORS configuration that lists headers by hand; then a header IGNIS adds later needs no change there.

## Who is affected

- **A route that hand-builds a `{ facets, data }`-style body.** Move the figures into `respond({ extra })`: cheap, always-shown figures as defaults; per-dimension figures as a group; the rest plain. Clients read `extra.facets` instead of `facets`.
- **A route that adds a DEFAULT extra.** Its list body becomes `{ data, extra }` for every client. A connector older than this release reads only a bare array or `{ count, data }`, so it fails on that route; upgrade the client first.
- **A server that lists its CORS headers by hand.** Add `...HTTP.CorsHeaders.ALLOW` and `...HTTP.CorsHeaders.EXPOSE`, or at least `x-request-extra` and `x-response-extra`. Otherwise the browser preflight fails.
- **A subclass of `HttpRepository` that overrides `find`.** `find` now has five overloads, one per combination of range and `extra`, plus one for a range or `extra` decided at run time. An override that declares only the old two fails with TS2416. Declare the same five overloads in the subclass.
- **Everyone else.** No change. Routes that offer no extras ignore `x-request-extra`, and `respond` and `find` without `extra` behave as before.

**Files:** [`packages/kernel/src/base/controllers/rest/extras.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/controllers/rest/extras.ts), [`packages/kernel/src/base/controllers/rest/base.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/controllers/rest/base.ts), [`packages/connectors/src/http/datasource.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/http/datasource.ts), [`packages/connectors/src/http/repository.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/http/repository.ts)
