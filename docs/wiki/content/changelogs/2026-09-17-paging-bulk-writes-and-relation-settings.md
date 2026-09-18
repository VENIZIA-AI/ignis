---
title: Paging, Bulk Writes and Relation Settings
description: "Pages over a tied order no longer repeat or skip rows, bulk update and delete take where in the body, and an included relation keeps its hidden columns and row scope whatever its table is named."
---

# Changelog - 2026-09-17

## Paging over a tied order returns every row once

<Badge type="tip" text="Fix" />

`order: ['status ASC']` leaves rows with the same `status` to the database, and Postgres breaks those
ties per page. Measured on PGlite: 60 rows read 7 at a time came back as 60 rows, **50 distinct**.

The relational repository now appends `id ASC` when the order does not name `id`:

```ts
await repository.find({ filter: { order: ['status ASC'], skip: 7, limit: 7 } });
// ORDER BY "status" ASC, "id" ASC
```

Rows with equal `status` now come back in `id` order. `toOrderBy` also got faster: it builds each
column's `asc`/`desc` node once and reuses it (`build()` with one include: 870 -> 446 ns).

## `PATCH /` and `DELETE /` take `where` in the body

<Badge type="warning" text="Contract" />

A `where` with a few hundred ids does not fit in a URL: a server answers 431 past ~16 KB, a proxy
sooner. The generated bulk routes now read it from the query **or** the JSON body.

```http
PATCH /products
{ "where": { "id": { "inq": ["...2000 ids"] } }, "status": "ACTIVE" }

DELETE /products
{ "where": { "id": { "inq": ["...2000 ids"] } } }
```

| Request | Answer |
|---|---|
| `where` in the query | as before |
| `where` in the body | same as the query |
| `where` in both | `400` - which one was meant is a guess |
| `where` in neither | `400` |

`DELETE /` declares no body schema: one would make `@hono/zod-openapi` gate the media type, and a
client sending `content-type: application/json` with no body would get `400` where it used to get
`200`. The handler reads the body itself. Name `routes.deleteBy.request.body` to get the Swagger
editor back - and to accept that gate.

In a `PATCH /` body, `where` is reserved: it selects rows and is never written. A controller that
overrides `updateBy`/`deleteBy` and reads `valid('query')` itself still sees only the query - use
`resolveBulkWhere({ context, where: { fromQuery, fromBody } })` to accept both. Without it, a body-only request
reaches the repository with no `where`, and the repository refuses it (`400`).

## An included relation keeps its model settings

<Badge type="danger" text="Security" />

`include` looked a relation's `@model` settings up by SQL table name, while `@model` registers the
class name unless `TABLE_NAME` says otherwise. A model whose table name differed lost its settings
inside `include`:

| Setting | Read directly | Included, before |
|---|---|---|
| `hiddenProperties` | hidden | **returned** |
| `scopeFilter` | applied | **ignored** - other tenants' rows |
| `defaultFilter`, `defaultLimit` | applied | ignored |

Models are now found by their schema object first, so the table name no longer matters. A model
whose `TABLE_NAME` matches its table was never affected.
