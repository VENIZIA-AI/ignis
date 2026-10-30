---
title: List Responses Share One Contract - respond Takes a Range on BaseRestController, and POST /search Gets Its Headers
description: Every list endpoint answers with Content-Range, X-Response-Count and X-Response-Format through one respond call on BaseRestController, and POST /search now sends them too.
packages: ['@venizia/ignis-connectors', '@venizia/ignis-kernel']
---

# Changelog - 2026-09-05

## One list-response contract

<Badge type="tip" text="New Feature" /> <Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Breaking Change" />

**In one line.** `respond({ context, format, payload, range })` on `BaseRestController` writes the list headers and the `{ count, data }` envelope for any controller, and the search controller now sends those headers.

## What changed

- **`respond`, `normalizeCountData` and `setListHeaders` live on `BaseRestController`.** The first two moved up from the CRUD factory. `respond` takes an optional `range`; with it, the call also writes `Content-Range`. Nothing changes on the wire for generated controllers.
- **`format` is a const class, and the envelope option is `payload`.** `ResponseFormats.ARRAY` and `ResponseFormats.OBJECT` (`TResponseFormat`) replace string literals, and `respond` and `normalizeCountData` take `payload` where they took `responseData`.
- **`POST /search` sends the list headers.** `AbstractSearchController` used to answer without them. `start` comes from `filter.skip` or `filter.offset` (raw mode: the engine's `offset`, or `page` with `per_page`) and `total` from `found`. The body is unchanged: `{ found, isFoundExact, hits }`.
- **`POST /multi-search` is unchanged.** It returns one result per collection, which one `Content-Range` cannot describe.

| Header or body | Value |
|---|---|
| `Content-Range` | `records <start>-<end>/<total>`, or `records */<total>` for an empty page. `total` is the exact count of the scope, never `*` |
| `X-Response-Count` | rows in this response, never the total |
| `X-Response-Format` | `array` |
| Body | `{ count, data }`, or the bare array when the client sends `x-request-count: false` |

A list never depends on a `/count` route. The CRUD factory keeps its `count` verb as an opt-in.

```typescript
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

## Who is affected

- **Hand-written list routes that set the headers themselves.** Replace your own `normalizeCountableData(rs)` and `applyListResponseHeaders(...)` copies: `context.json(normalizeCountableData(rs), Ok)` becomes `context.json(this.respond({ context, format: ResponseFormats.ARRAY, payload: { count: rs.data.length, data: rs.data }, range: rs.range }), Ok)`. A body that is not `{ count, data }` calls `this.setListHeaders(...)` instead. No wire change.
- **Callers of `respond({ ..., responseData })` or `normalizeCountData({ context, responseData })`.** Rename the option to `payload`. The compiler points at each one.
- **Clients of `POST /search`.** New headers only. Read `Content-Range` for paging; when the body says `isFoundExact: false`, the engine stopped counting early and more may exist.
- **Generated CRUD controllers.** No action needed.

## Breaking changes

> [!WARNING]
> The `responseData` option is renamed `payload` on `respond` and `normalizeCountData`.

**Before:**

```typescript
this.respond({ context, format: 'array', responseData: { count, data } });
```

**After:**

```typescript
this.respond({ context, format: ResponseFormats.ARRAY, payload: { count, data } });
```

## Details

- Reference: [Controllers](/references/base/controllers#baserestcontroller). Style: [Route definitions](/best-practices/code-style-standards/route-definitions#list-responses).
