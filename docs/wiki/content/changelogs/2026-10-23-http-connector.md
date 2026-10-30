---
title: The HTTP Connector Writes, Follows the Session and Keeps the Server's Errors
description: "connectors/http can create, update and delete over the IGNIS CRUD routes, follows the session's headers and token, keeps the server's error, and HttpResponseReader is available without the connector."
packages: ['@venizia/ignis-connectors', '@venizia/ignis-kernel']
---

# Changelog - 2026-10-23

## The HTTP connector

<Badge type="tip" text="Feature" /> <Badge type="tip" text="Enhancement" /> <Badge type="info" text="Bug Fix" /> <Badge type="danger" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** `@venizia/ignis-connectors/http` now reads and writes through the CRUD and search routes of another IGNIS server, follows the session in a browser app, and throws the error the server threw.

```typescript
const products = new HttpRepository<TProduct>({ dataSource, resource: 'products' });

const { data: product } = await products.create({ data: { name: 'Lamp' } });
await products.updateById({ id: product.id, data: { name: 'Desk lamp' } });
await products.updateBy({ where: { status: 'draft' }, data: { status: 'published' } });
await products.deleteAll({ where: { id: { inq: staleIds } } });

// A route the verbs do not cover:
await dataSource.write({ paths: ['products', product.id], method: 'PUT', body: replacement });
```

## What changed

- **Writes.** `HttpRepository` is no longer read-only. `create({ data })` is `POST /<resource>`; `updateById({ id, data })` is `PATCH /<resource>/:id`; `updateAll` / `updateBy({ where, data })` is `PATCH /<resource>` with `where` in the body; `deleteById({ id })` is `DELETE /<resource>/:id`; `deleteAll` / `deleteBy({ where })` is `DELETE /<resource>` with `where` in the body.
- **`HttpDataSource.request()`** takes `body` and per-request `headers` on any method. A plain object or array goes out as JSON; a string, `FormData`, `Blob`, `URLSearchParams`, `ArrayBuffer` or typed array goes as it is. The 401 retry resends the same body. **`HttpDataSource.write()`** answers `{ data, count }`.
- **The session.** `settings.headers` is read once, when the datasource is built. `headersResolver` runs on every send, the 401 retry included. `authTokenResolver` and `onUnauthorized` receive the request they serve (`{ paths, method, url, signal }`), so a public route can send no token and skip the refresh. A throw from a resolver fails that request.
- **One call.** Every repository verb, `read()`, `write()` and `request()` take `headers` and `signal` in their options. A call aborted while `onUnauthorized` runs is not retried.
- **Errors are the server's.** A failed read or write throws an `ApplicationError` with `statusCode` (the response status), `normalized.code`, `normalized.args` and `normalized.text` (a response with no text reads as `HTTP 502`), `extra` (the server's, with `requestId` added; the ids of relayed upstream requests are kept in `upstreamRequestIds`), `cause` (the server's `details.cause`, such as a 422's per-field issues), and a `message` of the server's text prefixed with the verb, status and path. The host and query are left out of the message. Before, the connector dropped `normalized.args`, so a UI that translates by code showed placeholders unfilled.
- **`errorRootKey`.** A server with `error.rootKey` wraps its envelope. Set `errorRootKey` to the same key, or every error reads as `core.system_error`.
- **Requests that named the wrong route are refused.** An empty, `.` or `..` id throws 400 before any request (`deleteById({ id: '.' })` used to send `DELETE /users/`, the bulk route). A `baseUrl` is absolute or starts with `/`; anything else throws at construction (this also covers `'api'` and `'localhost:3000'`). A `FormData` body always carries the multipart content-type `fetch` writes. An empty list body, a non-JSON answer or a bigint in a query throws an `ApplicationError` (500, 502, 400) instead of a bare `SyntaxError` or `TypeError`.
- **`HttpResponseReader`** is exported from `@venizia/ignis-kernel/repository`, beside `buildDataRange`, so a client that reads an IGNIS server without the connector does not copy the parsing. `@venizia/ignis-connectors/http` still exports the same class. Its `parseContentRange`, `readErrorEnvelope`, `readError`, `isPlainObject` and `toText` are public, and `toApplicationError({ response, context, rootKey? })` turns a failed response into the same `ApplicationError` the connector throws. A missing `Content-Range` now names the likely cross-origin cause: the server must list it in `Access-Control-Expose-Headers`.
- **Reads.** `find`, `findOne`, `findById`, `count` and `existsWith` take `query: { merchantId: 'm1', q: 'abc' }` and send it next to the filter; the filter and `where` win over a key of the same name. A subclass can override the protected `buildQuery({ method, query, params })` to reshape one verb.
- **`defaultLimit`.** `new HttpRepository({ dataSource, resource, defaultLimit: 50 })` makes `find` ask for 50 rows when its filter names no `limit`. A filter's own limit wins. `findOne`, `count` and `existsWith` keep their limit of 1. A value that is not a positive integer throws at construction.
- **`search({ input, query?, options? })`** POSTs `input` to `<resource>/search` and returns `{ found, isFoundExact, hits }`. `found` is the total; `isFoundExact` is `false` when the engine estimates it. A body that is not that envelope throws instead of reading as no match. `searchPath` renames the segment after the resource; a subclass overrides `getSearchPaths()` to move the whole route.
- **`findOnePath`.** Opt in with `findOnePath: 'find-one'` and `findOne` reads `GET /<resource>/find-one`, the route `defineCrudController` generates. A missing row answers HTTP 200 and `findOne` returns `null`. Off by default, `findOne` asks the list route for one row, as before; a backend that is not an IGNIS controller may not have the route.

```typescript
super({ dataSource, resource: 'products', findOnePath: 'find-one' });

const product = await productRepository.findOne({ filter: { where: { sku: 'LAMP-1' } } });
// GET /products/find-one?filter=...  ->  the row, or null
```

```typescript
new HttpDataSource({
  baseUrl: '/api',
  errorRootKey: 'error',
  headersResolver: () => ({ 'x-locale': session.locale }),
  authTokenResolver: ({ paths }) => (paths[0] === 'auth' ? undefined : session.token),
  onUnauthorized: ({ paths }) => (paths[0] === 'auth' ? false : session.refresh()),
});

await products.find({ filter, options: { headers: { 'x-trace': id }, signal } });
```

## Who is affected

- **Code that wrote with bare `fetch` beside the connector.** Move to the repository verbs or `write()`; the auth token, the 401 retry and the error mapping come with them.
- **An app with run-time session headers or public routes.** Move them into `headersResolver` and `authTokenResolver`.
- **A server with `error.rootKey`.** Set `errorRootKey`.
- **An app with a path-relative `baseUrl`.** Change `api` to `/api`.
- **Code that read `error.extra`, or parsed the URL out of `error.message`.** `extra` now holds the server's `extra` beside `requestId`, and the message names the path only. Code that matched a read error message exactly sees the server's message after the path.
- **Code that wrote `where` into a `findById` filter literal.** It no longer type-checks: the server always replaced it with the id.
- **A subclass that overrides `resolveAuthToken()`.** It now receives `{ context }`.
- **A subclass that overrides `request()` to wrap every call.** `read()` and `write()` no longer go through it; override `sendRequest()`, which every call reaches.
- **A client that copied the Content-Range or error-envelope parsing.** Import `HttpResponseReader` from `@venizia/ignis-kernel/repository`.
- **Everyone else.** No action needed; every new argument and setting is optional, and the read verbs are otherwise unchanged.

## Details

- The id in `/:id` is URL-encoded, for reads and writes alike.
- A bulk `where` travels in the body, so a long `inq` does not hit the URL limit. An empty bulk `where` is refused before any request, and `force` cannot cross HTTP.
- `shouldReturn: false` answers `{ count, data: null }`.
- There is no `createAll`: the IGNIS REST contract has no bulk-create route.
- A per-request `x-request-count` is refused; the connector owns it.
- `HttpRepository<E, P = Partial<E>>`: the second type parameter is what a write sends; the server fills ids and defaults.
- IGNIS generates `POST <resource>/search` and `POST <resource>/multi-search`, and no `search/count` route; the total of a search is `found`. A route of any other shape stays a call to `dataSource.read`.
