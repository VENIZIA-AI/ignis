---
title: The HTTP Connector Writes
description: "HttpRepository gains create, updateById, updateAll/updateBy, deleteById and deleteAll/deleteBy over the IGNIS CRUD routes, and HttpDataSource.request takes a body and headers on any method, PUT included."
---

# Changelog - 2026-10-02

## `@venizia/ignis-connectors/http` writes

<Badge type="tip" text="Feature" />

**In one line.** `HttpRepository` is no longer read-only: it writes through the CRUD routes another IGNIS server generates, and `HttpDataSource` can send a body on any method.

```ts
const products = new HttpRepository<TProduct>({ dataSource, resource: 'products' });

const { data: product } = await products.create({ data: { name: 'Lamp' } });
await products.updateById({ id: product.id, data: { name: 'Desk lamp' } });
await products.updateBy({ where: { status: 'draft' }, data: { status: 'published' } });
await products.deleteAll({ where: { id: { inq: staleIds } } });

// A route the verbs do not cover:
await dataSource.write({ paths: ['products', product.id], method: 'PUT', body: replacement });
```

## What is new

| Method | Request |
|---|---|
| `create({ data })` | `POST /<resource>` |
| `updateById({ id, data })` | `PATCH /<resource>/:id` |
| `updateAll` / `updateBy({ where, data })` | `PATCH /<resource>`, `where` in the body beside the data |
| `deleteById({ id })` | `DELETE /<resource>/:id` |
| `deleteAll` / `deleteBy({ where })` | `DELETE /<resource>`, `where` in the body |

- **`HttpDataSource.request()`** takes `body` and per-request `headers`, on any method. A plain object or array goes out as JSON with `content-type: application/json`; a string, `FormData`, `Blob`, `URLSearchParams`, `ArrayBuffer` or typed array goes as it is. The 401 retry resends the same body.
- **`HttpDataSource.write()`** answers `{ data, count }` - the rows and the server's `x-response-count`.
- **Server errors come back as the server said them.** A failed read or write throws an `ApplicationError` with the server's status, its `message` appended to the connector's, and its `normalized.code` as the message code.
- **`HttpRepository<E, P = Partial<E>>`**: the second type parameter is what a write sends; the server fills ids and defaults.

## Rules worth knowing

- The id in `/:id` is URL-encoded, for reads and writes alike.
- A bulk `where` travels in the body, so a long `inq` does not hit the URL limit. An empty bulk `where` is refused before any request - the IGNIS route would refuse it - and `force` cannot cross HTTP.
- `shouldReturn: false` answers `{ count, data: null }`.
- There is no `createAll`: the IGNIS REST contract has no bulk-create route.
- A per-request `x-request-count` is refused, as the setting already was: the connector owns it.

## Who is affected

- **Code that wrote with bare `fetch` beside the connector.** Move to the repository verbs or `write()`; the auth token, the 401 retry and the error mapping come with them.
- **Code that matched a read error message exactly.** A failed read now appends the server's message after the URL.
- **Everyone else.** Nothing changes; the read verbs are untouched.

**Files:**

- [`packages/connectors/src/http/datasource.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/http/datasource.ts)
- [`packages/connectors/src/http/repository.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/http/repository.ts)
