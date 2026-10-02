---
title: Reads Whose Filter Rides in the Body
description: "Every generated CRUD controller answers POST /find and POST /count with the filter or where in the body, so a long inq no longer overflows the URL, and the http connector switches to it on its own."
---

# Changelog - 2026-10-02

## `POST /find` and `POST /count`

<Badge type="tip" text="Feature" />

**In one line.** A long `inq` no longer overflows the URL: every generated CRUD controller also reads with the filter in a JSON body, and the http connector moves a read there when its URL would be too long.

## What is new

| Method | Path | Body | Answers |
|---|---|---|---|
| `POST` | `/<resource>/find` | `{ filter }` | what `GET /<resource>` answers - the same rows, the same `Content-Range` |
| `POST` | `/<resource>/count` | `{ where }` | what `GET /<resource>/count` answers |

```ts
await fetch('/api/items/find', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ filter: { where: { id: { inq: twoThousandIds } }, limit: 2000 } }),
});
```

- **Same rules as the GET.** Each POST rides its GET's route key: `routes.find` and `routes.count` - `enabled`, `authenticate`, `authorize`, the request schema - govern both, `enabledRoutes: ['find']` turns on both, and `getBaseWhere` scopes both. Disabling `find` never leaves a POST door open.
- **A readonly controller keeps them.** They only read.
- **`RestPaths.FIND`** (`'/find'`) names the new path.
- **The http connector switches on its own.** `HttpRepository`'s `find`, `findOne`, `count` and `existsWith` stay on GET while the URL is under 6,000 characters, and use `POST /<resource>/find` past that.

## A hand-written list route

The generated routes do not reach a route you wrote yourself. Give it a POST twin: the same `authenticate`/`authorize`, `request.body: jsonContent({ schema: FilterQuerySchema })` - `FilterQuerySchema` already accepts an object - and a handler that reads `context.req.valid('json')` where the GET reads `'query'`.

## Who is affected

- **Every generated CRUD controller** gains two routes, under the permissions its `find` and `count` already have. Its OpenAPI document lists them.
- **A test that pins the exact set of generated routes** sees two more.
- **An http connector client reading a very long filter from an older server** gets a 404 instead of the 414/431 that read would have hit before. Shorter reads are unchanged.

**Files:**

- [`packages/kernel/src/base/controllers/factory/crud/readable.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/controllers/factory/crud/readable.ts)
- [`packages/kernel/src/base/controllers/factory/definition.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/kernel/src/base/controllers/factory/definition.ts)
- [`packages/connectors/src/http/repository.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/http/repository.ts)
