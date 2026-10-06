---
title: The HTTP Connector Follows the Session and Keeps the Server's Errors
description: "connectors/http gains per-request hooks, per-call headers and abort, and an error that is the one the server threw - including under error.rootKey. Ids and baseUrls that name the wrong route are refused."
---

# Changelog - 2026-10-06

## The HTTP connector follows the session and keeps the server's errors

<Badge type="tip" text="Feature" /> <Badge type="danger" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

**In one line.** `@venizia/ignis-connectors/http` now works the way a browser app needs: its headers and token follow the session, one call can add headers or abort, and a failure is the error the server threw.

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

## What changed

**The session.** `settings.headers` is read once, when the datasource is built. `headersResolver` runs on every send, the 401 retry included. `authTokenResolver` and `onUnauthorized` now receive the request they serve (`{ paths, method, url, signal }`), so a public route can send no token and skip the refresh. A throw from a resolver fails that request.

**One call.** Every repository verb, `read()`, `write()` and `request()` take `headers` and `signal` in their options. A call aborted while `onUnauthorized` runs is not retried.

**Errors.** A server with `error.rootKey` wraps its error envelope, and the connector read every such failure as `core.system_error`. Set `errorRootKey` to the same key. The thrown error now carries:

| Field | Value |
|---|---|
| `statusCode` | The response status |
| `normalized.code`, `normalized.args`, `normalized.text` | The server's own. A server that sent no text (a proxy's HTML 502) reads as `HTTP 502` |
| `extra` | The server's `extra`, with `requestId` added. A relaying server's own upstream id is kept as `upstreamRequestId` |
| `cause` | The server's `details.cause` - a 422's per-field issues, `{ path, message, code }` |
| `message` | The server's text, prefixed with the verb, status and path, for logs. The host and query are left out: a server that relays the error would send them to its own clients |

**Requests that named the wrong route.**

| Before | Now |
|---|---|
| `deleteById({ id: '.' })` sent `DELETE /users/` - the bulk route, behind a router or proxy that ignores the trailing slash | An empty, `.` or `..` id throws 400 before any request |
| `baseUrl: 'api'` followed the current page route; `'localhost:3000'` was taken as absolute | A `baseUrl` is absolute or starts with `/`; anything else throws at construction |
| A `FormData` body went out as `application/json`, with no boundary, when a content-type was configured | A `FormData` body always carries the multipart content-type `fetch` writes |
| An empty list body, a non-JSON answer or a bigint in a query threw a bare `SyntaxError` or `TypeError` | They throw an `ApplicationError` (500, 502, 400) |

**Readers.** `HttpResponseReader` is exported - `parseContentRange`, `readErrorEnvelope` and `readError` - for a client that talks to the same server without the connector.

A missing `Content-Range` now names the likely cross-origin cause: the server must list it in `Access-Control-Expose-Headers`.

## Who is affected

- **An app with run-time session headers or public routes.** Move them into `headersResolver` and `authTokenResolver`.
- **A server with `error.rootKey`.** Set `errorRootKey`, or every error reads as `core.system_error`.
- **An app with a path-relative `baseUrl`.** Change `api` to `/api`.
- **Code that read `error.extra`.** It now holds the server's `extra` beside `requestId`.
- **Code that parsed the URL out of `error.message`.** The message names the path only.
- **Code that wrote `where` into a `findById` filter literal.** It no longer type-checks: the server always replaced it with the id.
- **A subclass that overrides `resolveAuthToken()`.** It now receives `{ context }`.
- **A subclass that overrides `request()` to wrap every call.** `read()` and `write()` no longer go through it; override `sendRequest()`, which every call reaches.

**Files:** [`packages/connectors/src/http/datasource.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/http/datasource.ts), [`packages/connectors/src/http/repository.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/http/repository.ts), [`packages/connectors/src/http/common/readers.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/connectors/src/http/common/readers.ts)
