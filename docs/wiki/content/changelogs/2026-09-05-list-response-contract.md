---
title: List Responses Share One Contract - respond Takes a Range on BaseRestController, and POST /search Gets Its Headers
description: Every list endpoint answers with Content-Range, X-Response-Count and X-Response-Format through the one respond call on BaseRestController; POST /search now sends them too.
---

# Changelog - 2026-09-05

## One list-response contract

<Badge type="tip" text="New Feature" /> <Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Breaking Change" />

**In one line.** `respond({ context, format, payload, range })` on `BaseRestController` writes the list headers and the `{ count, data }` envelope for any controller, generated or hand-written, and the search controller finally sends those headers.

```typescript
// A hand-written list route
async listOrders(opts: { context: TRouteContext }) {
  const { context } = opts;
  const { filter = {} } = context.req.valid<{ filter?: TFilter<TOrder> }>('query');

  const { data, range } = await this.repository.find({
    filter,
    options: { shouldQueryRange: true },
  });

  return context.json(
    this.respond({
      context,
      format: ResponseFormats.ARRAY,
      payload: { count: data.length, data },
      range,
    }),
    HTTP.ResultCodes.RS_2.Ok,
  );
}
```

## The contract

| Header or body | Value |
|---|---|
| `Content-Range` | `records <start>-<end>/<total>`, or `records */<total>` for an empty page. `total` is the exact count of the scope, never `*` |
| `X-Response-Count` | rows in this response, never the total |
| `X-Response-Format` | `array` |
| Body | `{ count, data }`, or the bare array when the client sends `x-request-count: false` |

A list never depends on a `/count` route. The CRUD factory keeps its `count` verb as an opt-in for callers that want a count alone.

## What changed

- **`respond`, `normalizeCountData` and `setListHeaders` live on `BaseRestController`.** The first two moved up from the CRUD factory, so every controller that extends `BaseRestController` has them. `respond` takes an optional `range`: with it, the call also writes `Content-Range`, so a list is the same call as a single record. The CRUD `find()` passes its range. Nothing changes on the wire for generated controllers.
- **`format` is a const class, and the envelope option is `payload`.** `ResponseFormats.ARRAY` / `ResponseFormats.OBJECT` (`TResponseFormat`) replace the string literals, and `respond` / `normalizeCountData` take `payload` where they took `responseData`.
- **`POST /search` sends the list headers.** `AbstractSearchController` used to answer with a bare `context.json()`, so a client reading `Content-Range` there got nothing. `start` comes from `filter.skip` or `filter.offset` (raw mode: the engine's `offset`, or `page` with `per_page`) and `total` from `found`. The body is unchanged: `{ found, isFoundExact, hits }`, and `isFoundExact` stays the one signal that `found` is an estimate.
- **`POST /multi-search` is unchanged.** It returns one result per collection, and a single `Content-Range` cannot describe that.

## Who is affected

- **Hand-written list routes that set the headers themselves.** nx-seller's per-request `normalizeCountableData(rs)` closure and `applyListResponseHeaders(...)` produce the same headers and body: inside a controller, `context.json(normalizeCountableData(rs), Ok)` becomes `context.json(this.respond({ context, format: ResponseFormats.ARRAY, payload: { count: rs.data.length, data: rs.data }, range: rs.range }), Ok)`, and a body that is not `{ count, data }` calls `this.setListHeaders(...)` instead. Then delete the copies. No wire change.
- **Callers of `respond({ ..., responseData })` or `normalizeCountData({ context, responseData })`.** Rename the option to `payload` (nx-seller: 11 call sites - identity role and permission controllers, the sale-item controller, and mq-pay's transaction controller). The compiler points at each one.
- **Clients of `POST /search`.** New headers only. Read `Content-Range` for paging; when the body says `isFoundExact: false`, the engine stopped counting early and more may exist.
- **Generated CRUD controllers.** No action needed.

## Details

| Symbol | Change | Package |
|---|---|---|
| `BaseRestController.respond({ context, format, payload, range? })` | Moved from `AbstractCrudController`; `range` added; `responseData` renamed `payload`; `format` typed `TResponseFormat` | kernel |
| `BaseRestController.normalizeCountData({ context, payload })` | Moved from `AbstractCrudController`; `responseData` renamed `payload` | kernel |
| `BaseRestController.setListHeaders({ context, range, count })` | New | kernel |
| `ResponseFormats` (`OBJECT`, `ARRAY`), `TResponseFormat` | New | kernel |
| `AbstractSearchController.search()` | Sets the list headers | connectors |

The total behind `Content-Range` still comes from the repository's own count query, run beside the page query (in parallel outside a transaction, one after the other inside one). Folding it into the page query with a window function looks free on a small table and costs seconds on a large one.

- Reference: [Controllers](/references/base/controllers#baserestcontroller). Style: [Route definitions](/best-practices/code-style-standards/route-definitions#list-responses).
