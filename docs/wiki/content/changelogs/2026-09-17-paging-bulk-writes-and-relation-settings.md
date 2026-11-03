---
title: Paging, Bulk Writes and Relation Settings
description: "Pages over a tied order no longer repeat or skip rows, bulk update and delete take where in the body, and an included relation keeps its hidden columns and row scope whatever its table is named."
packages: ['@venizia/ignis-connectors', '@venizia/ignis-kernel']
---

# Changelog - 2026-09-17

## Paging, bulk writes and relation settings

<Badge type="tip" text="Fix" /> <Badge type="warning" text="Contract" /> <Badge type="danger" text="Security" />

**In one line.** Paging stays stable, bulk routes accept long id lists, and an included relation no longer leaks hidden columns or other tenants' rows.

## What changed

- **Paging over a tied order returns every row once (Fix).** `order: ['status ASC']` left ties to the database, and 60 rows read 7 at a time came back as 50 distinct. The relational repository now appends `id ASC` when the order does not name `id`, so equal rows come back in `id` order.
- **`PATCH /` and `DELETE /` take `where` in the body (Contract).** A `where` with hundreds of ids does not fit in a URL. The generated bulk routes read it from the query or the JSON body.
- **Included relations keep their model settings (Security).** `include` looked a relation's `@model` settings up by SQL table name, so a model whose table name differed lost `hiddenProperties` (returned), `scopeFilter` (ignored, so other tenants' rows came back), `defaultFilter` and `defaultLimit`. Models are now found by their schema object. A model whose `TABLE_NAME` matches its table was never affected.

| Request | Answer |
|---|---|
| `where` in the query | as before |
| `where` in the body | same as the query |
| `where` in both | `400` |
| `where` in neither | `400` |

```http
PATCH /products
{ "where": { "id": { "inq": ["...2000 ids"] } }, "status": "ACTIVE" }

DELETE /products
{ "where": { "id": { "inq": ["...2000 ids"] } } }
```

## Who is affected

- **Anyone paging with a non-unique order.** Rows with equal sort values now come back in `id` order.
- **Anyone using `include` with a model whose `TABLE_NAME` differs from its table.** Its hidden columns and row scope now apply.
- **You override `updateBy` or `deleteBy` and read `valid('query')` yourself.** You still see only the query. Use `resolveBulkWhere({ context, where: { fromQuery, fromBody } })` to accept both. Without it, a body-only request reaches the repository with no `where`, and the repository refuses it (`400`).

## Details

- In a `PATCH /` body, `where` is reserved: it selects rows and is never written.
- `DELETE /` declares no body schema, so a client sending `content-type: application/json` with no body still gets `200`. Name `routes.deleteBy.request.body` to get the Swagger editor back, and accept that the media type is then gated.
