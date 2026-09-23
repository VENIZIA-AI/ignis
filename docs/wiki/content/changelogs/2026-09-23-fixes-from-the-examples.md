---
title: Fixes Found While Rebuilding the Examples
description: "Valid OpenAPI error keys, path.isStrict that works, search controllers that inject their repository, nested JSON-path updates on PostgreSQL, the Socket.IO unauthenticated notice, postgres-js under Bun, one repository injection for controller factories, one ErrorResponse component, CRUD routes that ignore audit fields in the body, apps that import jose loading reliably, an honest change-password document, and stop() closing every datasource."
---

# Changelog - 2026-09-23

Rebuilding every example against the current framework exposed these defects. Each one is fixed at its root.

| Fix | Who is affected |
|---|---|
| [Error responses use valid OpenAPI keys](#error-responses-use-valid-openapi-keys) | Generated OpenAPI clients; hand-written `'4xx \| 5xx'` keys |
| [`path.isStrict` controls trailing-slash matching](#path-isstrict-controls-trailing-slash-matching) | Apps that set `path.isStrict: false` |
| [Search controllers inject their repository](#search-controllers-inject-their-repository) | `defineSearchController` subclasses |
| [Nested JSON-path updates create missing objects](#nested-json-path-updates-create-missing-objects) | PostgreSQL updates with a multi-level JSON path |
| [A rejected Socket.IO client receives `unauthenticated`](#a-rejected-socket-io-client-receives-unauthenticated) | Socket.IO clients that handle the notice |
| [postgres-js loads under Bun next to `postgres`](#postgres-js-loads-under-bun-next-to-postgres) | Apps importing `PostgresJsDriver` and `postgres` |
| [Controller factories share one repository injection](#controller-factories-share-one-repository-injection) | Authors of their own controller factory |
| [One helper and one component for error responses](#one-helper-and-one-component-for-error-responses) | Generated OpenAPI clients; hand-written error responses |
| [CRUD routes ignore audit fields in the request body](#crud-routes-ignore-audit-fields-in-the-request-body) | Clients that send `createdBy`, `modifiedBy`, `createdAt`, `modifiedAt`, or an `id` on update |
| [Apps that import `jose` load reliably](#apps-that-import-jose-load-reliably) | Apps importing `jose` and `@venizia/ignis` under Bun |
| [The change-password document lists every required field](#the-change-password-document-lists-every-required-field) | OpenAPI clients generated from the built-in `POST /auth/change-password` |
| [`stop()` closes the datasources](#stop-closes-the-datasources) | Every app and test that calls `stop()` |

## Error responses use valid OpenAPI keys

<Badge type="info" text="Bug Fix" />

`jsonResponse()`, `htmlResponse()` and the static-asset routes declared the error body under `'4xx | 5xx'`. OpenAPI does not accept that key, so openapi-typescript and openapi-fetch typed every error as `never`. The error body is now declared under `4XX` and `5XX`, with the same `ErrorSchema`.

```typescript
// Before
['4xx | 5xx']: jsonContent({ description: 'Error Response', schema: ErrorSchema }),

// After
'4XX': jsonContent({ description: 'Error Response', schema: ErrorSchema }),
'5XX': jsonContent({ description: 'Error Response', schema: ErrorSchema }),
```

- **Generated clients:** `error` is now typed. Regenerate the client.
- **Hand-written definitions** that copied `['4xx | 5xx']`: switch to `...errorResponses()`, as in [One helper and one component for error responses](#one-helper-and-one-component-for-error-responses).
- **Code that reads** `responses['4xx | 5xx']` from a `jsonResponse()` result: read `4XX` or `5XX`.

## `path.isStrict` controls trailing-slash matching

<Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Breaking Change" />

`path.isStrict` was required but never read, so `path: { isStrict: false }` still answered `/api/` with 404. It now decides trailing-slash matching. The default stays `true`.

- **Who is affected:** an app with `path.isStrict: false`. `/api/users/` now reaches `/api/users` instead of answering 404.
- **Declare routes without a trailing slash** under `isStrict: false`. A route declared as `/users/` answers neither `/users` nor `/users/`.
- **`strictPath` is removed.** Replace `strictPath: X` with `path: { base, isStrict: X }`. An application whose config still carries `strictPath` refuses to start and names the replacement, so no app silently changes how it matches slashes.
- **Controller-level `isStrict`** has no effect once the controller is mounted: the application's value decides.

> [!WARNING]
> Under non-strict routing, a `..` segment is normalized away before routing, so `.../objects/..` reaches the parent route. For the static-asset controller that parent is the bucket route. Keep `isStrict: true` when clients build URLs from untrusted names.

## Search controllers inject their repository

<Badge type="tip" text="Enhancement" />

`SearchControllerFactory.defineSearchController` now injects the repository named in `repository.name`, the same as `defineCrudController`. A bare subclass works:

```typescript
@controller({ path: '/articles' })
export class ArticleSearchController extends BaseArticleSearchController {}
```

Before, the subclass got `undefined` and failed at the first request. An explicit `@inject` constructor still wins, so existing code keeps working. An empty `repository.name` now throws when the controller is defined.

## Nested JSON-path updates create missing objects

<Badge type="info" text="Bug Fix" />

On PostgreSQL, updating `'metadata.a.b.c'` on a row whose `metadata` is `{}` reported `count: 1` and left `{}`. It now writes `{ a: { b: { c: ... } } }` and keeps existing keys. SQLite already did this.

- A single-component path emits the same SQL as before.
- A scalar parent or a `NULL` column leaves the column unchanged; a scalar root still raises on PostgreSQL, as before.
- An array index in the middle of a path appends when it names the next free slot, on both engines. Past that slot, PostgreSQL still appends (`jsonb_set`'s own array rule) and SQLite leaves the value unchanged.

## A rejected Socket.IO client receives `unauthenticated`

<Badge type="info" text="Bug Fix" />

When `authenticateFn` returned `false` or threw, `SocketIOServerHelper` published the notice through the Redis emitter and disconnected on the next tick. The disconnect always arrived first, so the client never saw the event.

The helper now emits the notice on the client's own socket, then disconnects it. `onUnauthenticated(message)` fires before `onDisconnected('io server disconnect')`. No API change.

## postgres-js loads under Bun next to `postgres`

<Badge type="info" text="Bug Fix" />

An app that imported `PostgresJsDriver` from `@venizia/ignis/postgres/postgres-js` and then `postgres` itself crashed at load:

```
TypeError: require() async module ".../postgres/src/index.js" is unsupported
```

The subpath was CommonJS only, so its `require('postgres')` hit the ESM copy Bun was still loading. The subpath now has an `import` condition that re-exports the ESM build of `@venizia/ignis-connectors/postgres/postgres-js`. `require()` consumers and the types are unchanged.

## Controller factories share one repository injection

<Badge type="tip" text="Enhancement" />

`defineCrudController` and `defineSearchController` each carried a copy of the code that injects the repository named in `repository.name`. Both now call one helper, `registerFactoryRepositoryInjection`, exported by `@venizia/ignis` and `@venizia/ignis-kernel`:

```typescript
import { registerFactoryRepositoryInjection } from '@venizia/ignis';

registerFactoryRepositoryInjection({
  target: GeneratedController,
  factoryName: 'defineReportController',
  controllerName: 'ReportController',
  repositoryName: ReportRepository.name,
});
```

The helper records `repositories.<repositoryName>` at constructor parameter 0, as a required injection. A subclass with its own `@inject` at parameter 0 still wins, and a sibling subclass keeps the factory's key.

- **Who is affected:** nobody who calls the two factories. They inject exactly as before.
- **A controller factory of your own** can call the helper instead of writing the injection metadata by hand.
- **`target` takes the generated class itself,** typed `TClass<unknown>`. TypeScript refuses a bare function and refuses an abstract class - generated controllers are concrete.
- **An empty `repositoryName` throws** a message that names the factory: `[defineCrudController] Invalid repository name | controller: ...`.

## One helper and one component for error responses

<Badge type="tip" text="Enhancement" />

The `4XX` and `5XX` error body was built in three places, and hand-written routes copied it. `errorResponses()` now returns both keys. `jsonResponse()`, `htmlResponse()` and the static-asset routes spread it, and a route of your own can too:

```typescript
import { errorResponses } from '@venizia/ignis';

responses: {
  [HTTP.ResultCodes.RS_2.Ok]: {
    description: 'PNG frame',
    content: { 'image/png': { schema: { type: 'string', format: 'binary' } } },
  },
  ...errorResponses(),
},
```

`ErrorSchema` is now the named component `ErrorResponse`. Before, every route inlined the schema twice. Now both keys reference `#/components/schemas/ErrorResponse`.

- **Generated clients:** the error type becomes `components['schemas']['ErrorResponse']`, with the same fields. Regenerate the client.
- **Hand-written error responses:** replace the error line with one spread. Then drop the `ErrorSchema` and `jsonContent` imports if nothing else uses them.

```typescript
// Before
['4xx | 5xx']: jsonContent({ description: 'Error Response', schema: ErrorSchema }),

// After
...errorResponses(),
```

- **A schema of your own named `ErrorResponse`** now shares the framework's component name. A document keeps one schema per name, so rename yours.
- **A schema that extends `ErrorSchema`** is documented as `allOf` the `ErrorResponse` reference plus its own fields.

## CRUD routes ignore audit fields in the request body

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior Change" />

A client could forge the audit trail through a generated CRUD route. `POST` stored whatever `createdBy` the body named, and `PATCH` could rewrite the creator of an existing row. A `PATCH /{id}` body with an `id` even renamed the row.

The default bodies leave out the keys the entity says the server fills. Ask any entity with `getServerStampedKeys()`:

| Entity | Keys left out of create and update bodies |
|---|---|
| Relational (`BaseEntity`, `defineEntity`) | `createdBy`, `modifiedBy`, `createdAt`, `modifiedAt` - each one whose column has a default or `$onUpdate` |
| Search (`BaseSearchEntity`) and any other entity | none |

Update bodies also leave out `id`: the path or the `where` names the rows.

A client that still sends one of these keys gets no error. Validation strips the key, and the request goes on without it:

```typescript
// PATCH /configurations/42, signed in as user 7
{ "description": "edited", "createdBy": 999, "id": 43 }
// Stored: description 'edited', createdBy unchanged, modifiedBy 7, id still 42
```

- **Who is affected:** a client that sets these keys through a generated route on a relational entity. The enrichers stamp them now. Regenerate generated clients.
- **Edit forms that send the whole record back** now record the real editor and time. Before, the echoed `modifiedBy` and `modifiedAt` won over the values the server stamps.
- **A search collection keeps its fields.** Nothing stamps a document, so a required `createdAt` stays in the `POST` body.
- **An audit column you declared without a default** stays in the body, so a client can still send it.
- **A strict schema stays strict.** On a `z.strictObject` entity schema, a client that sends a left-out key gets `422` instead of the key being dropped.
- **A refined entity schema** is used as it is when it holds none of the keys to leave out. A refined schema that holds one, and any transformed schema, make defining the controller fail with a message naming `routes.<route>.request.body` - pass your own body there. A transformed update schema always fails, because the update routes always leave out `id`.
- **A custom `request.body` replaces the default and is not covered by this fix.** Built from an insert or update schema (`createInsertSchema`, `createUpdateSchema`), it still carries these keys - `.omit()` them yourself.
- **Server code is not affected.** `repository.create()` and `repository.updateById()` still accept every column.
- **A `PATCH` body left with nothing to write answers 400**, with code `core.request.nothing_to_update`. That covers `{}`, a `where` alone on `PATCH /`, and a body holding only keys the entity reports. Before, the repository failed with a 500. The check runs before the repository, and it applies to a custom `request.body` too.
- **Bump `@venizia/ignis-kernel` and `@venizia/ignis-connectors` together.** A new kernel with an older connectors leaves the audit keys writable, as they were before this release.
- **`resolveCreateConfig` called directly** now types its default `request.body` as `TAnyObjectSchema`, not your create schema: the keys left out are known only at run time.
- **`deletedAt` is unchanged.** It is soft-delete state, not a stamp, so a `PATCH` body can still set it.

See [Default request bodies](/references/base/controllers#default-request-bodies).

## Apps that import `jose` load reliably

<Badge type="info" text="Bug Fix" />

An app that imported `jose` itself could crash at load under Bun with
`require() async module ".../jose/dist/webapi/index.js" is unsupported`. `@venizia/ignis` is
CommonJS, and its token services called `require('jose')` while the app was still loading `jose` as
ESM. With `@venizia/ignis` imported first, every load crashed; with `jose` first, one in five.

The token services now load `jose` with `import()`, once per process, never at import. With JWT or
service authentication configured, the authentication component loads it at boot.

- **No API change.** Every export and type is the same.
- **Compiled binaries** still carry `jose`: a `Bun.build` binary signs and verifies with no
  `node_modules` beside it.
- **A missing or broken `jose` fails the boot**, with an error naming `jose`, when JWT or service
  authentication is configured. Before, every token check would have answered 401. `jose` stays a
  required peer; a Basic-only app does not load it.
- **A failed load is retried.** A token service you construct yourself loads `jose` at its first
  token operation, and tries again on the next one after a failure.
- **A subclass of `AuthenticateComponent`** that overrides `binding()` must `return super.binding()`.
  Calling it without returning drops the boot load, and a missing `jose` becomes an unhandled
  rejection instead of a failed boot.

## The change-password document lists every required field

<Badge type="info" text="Bug Fix" />

`ChangePasswordRequestSchema` told OpenAPI that only `oldCredential` and `newCredential` were
required, while validation also requires `scheme` and `userId`. Generated clients let callers omit
the two fields, and those calls failed with 422. The document now lists all four, and its example
includes `userId`.

- **Requests are unchanged:** the route accepts and refuses exactly what it did.
- **Regenerate an OpenAPI client:** `scheme` and `userId` become required in its types.
- **Your own `payload.changePassword.request.schema`** is unaffected.

## `stop()` closes the datasources

<Badge type="info" text="Bug Fix" />

`application.stop()` stopped the server and left every datasource open. Pools, sockets and PGlite
instances outlived the app, so tests leaked and a Node process could hang. `stop()` now closes every
datasource the boot configured, after the server stops.

```typescript
await application.stop(); // post-stop hooks -> server -> close() on every configured datasource
```

- **`close()` is new on every datasource.** A relational one ends its client through the driver, so
  PGlite also clears the exit status it plants on the host. It runs once; a later call returns the
  same promise. A search datasource keeps the root `close()`, which does nothing.
- **A failed or stuck `close()`** is logged and does not stop the others. `stop()` waits at most
  `dataSourceCloseTimeoutMs` (default `10_000`) for each one, then logs `Close timed out` and moves
  on - a pool with a client that was never released used to hold `stop()` forever. `0` waits
  without limit. The datasources close even when the server fails to, and `stop()` still reports
  that server error. A second `stop()` is harmless.
- **A driver without `end()`** - a hand-made one cast past `IRelationalDriver` - no longer fails
  the close: the datasource drains its client instead.
- **`WorkerApplication.stop()`** closes its datasources too, so a Vite hot-reload `dispose` releases
  the PGlite OPFS lock.
- **Remove your own close** from a post-stop hook when it ends a configured datasource's client: the
  hook runs first, and a second end fails (logged). A datasource you configure by hand in
  `postConfigure()` is still yours to close.
