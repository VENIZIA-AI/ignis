---
title: Fixes Found While Rebuilding the Examples
description: "Valid OpenAPI error keys, a working path.isStrict, search controllers that inject their repository, nested JSON-path updates on PostgreSQL, CRUD routes that ignore audit fields in the body, and stop() closing every datasource, among other fixes."
packages: ['@venizia/ignis-connectors', '@venizia/ignis', '@venizia/ignis-kernel']
---

# Changelog - 2026-09-23

Rebuilding every example against the current framework exposed these defects. Each one is fixed at its root.

## Error responses use valid OpenAPI keys

<Badge type="info" text="Bug Fix" />

`jsonResponse()`, `htmlResponse()` and the static-asset routes declared the error body under `'4xx | 5xx'`, which OpenAPI does not accept, so openapi-typescript and openapi-fetch typed every error as `never`. The body is now declared under `4XX` and `5XX`.

- **Generated clients:** `error` is now typed. Regenerate the client.
- **Code that reads** `responses['4xx | 5xx']` from a `jsonResponse()` result: read `4XX` or `5XX`.

## One helper and one component for error responses

<Badge type="tip" text="Enhancement" />

`errorResponses()` returns both error keys. Spread it in a route of your own instead of copying the error line:

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

```typescript
// Before
['4xx | 5xx']: jsonContent({ description: 'Error Response', schema: ErrorSchema }),

// After
...errorResponses(),
```

`ErrorSchema` is now the named component `ErrorResponse`, and both keys reference `#/components/schemas/ErrorResponse`.

- **Generated clients:** the error type becomes `components['schemas']['ErrorResponse']`, with the same fields. Regenerate the client.
- **Hand-written error responses:** replace the error line with the spread, then drop the `ErrorSchema` and `jsonContent` imports if nothing else uses them.
- **A schema of your own named `ErrorResponse`** now shares the framework's component name. Rename yours.
- **A schema that extends `ErrorSchema`** is documented as `allOf` the `ErrorResponse` reference plus its own fields.

## `path.isStrict` controls trailing-slash matching

<Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Breaking Change" />

`path.isStrict` was never read, so `path: { isStrict: false }` still answered `/api/` with 404. It now decides trailing-slash matching. The default stays `true`.

- **An app with `path.isStrict: false`:** `/api/users/` now reaches `/api/users` instead of answering 404.
- **Declare routes without a trailing slash** under `isStrict: false`. A route declared as `/users/` answers neither `/users` nor `/users/`.
- **`strictPath` is removed.** Replace `strictPath: X` with `path: { base, isStrict: X }`. An app whose config still carries `strictPath` refuses to start and names the replacement.
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

Before, the subclass got `undefined` and failed at the first request. An explicit `@inject` constructor still wins. An empty `repository.name` now throws when the controller is defined.

## Controller factories share one repository injection

<Badge type="tip" text="Enhancement" />

`defineCrudController` and `defineSearchController` now call one exported helper, `registerFactoryRepositoryInjection`. Use it in a controller factory of your own instead of writing the injection metadata by hand:

```typescript
import { registerFactoryRepositoryInjection } from '@venizia/ignis';

registerFactoryRepositoryInjection({
  target: GeneratedController,
  factoryName: 'defineReportController',
  controllerName: 'ReportController',
  repositoryName: ReportRepository.name,
});
```

- It records `repositories.<repositoryName>` at constructor parameter 0, as a required injection. A subclass with its own `@inject` at parameter 0 still wins.
- `target` takes the generated class itself (`TClass<unknown>`). TypeScript refuses a bare function or an abstract class.
- An empty `repositoryName` throws a message that names the factory.
- The two built-in factories inject exactly as before.

## CRUD routes ignore audit fields in the request body

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior Change" />

A client could forge the audit trail through a generated CRUD route. `POST` stored whatever `createdBy` the body named, `PATCH` could rewrite the creator of an existing row, and a `PATCH /{id}` body with an `id` renamed the row.

The default bodies now leave out the keys the entity says the server fills (ask with `getServerStampedKeys()`). On a relational entity (`BaseEntity`, `defineEntity`) that is `createdBy`, `modifiedBy`, `createdAt` and `modifiedAt`, each one whose column has a default or `$onUpdate`. A search entity and any other entity leave out none. Update bodies also leave out `id`.

A client that still sends one of these keys gets no error. Validation strips the key:

```typescript
// PATCH /configurations/42, signed in as user 7
{ "description": "edited", "createdBy": 999, "id": 43 }
// Stored: description 'edited', createdBy unchanged, modifiedBy 7, id still 42
```

- **Regenerate generated clients.** The server now stamps these keys. Edit forms that send the whole record back record the real editor and time.
- **A search collection keeps its fields.** A required `createdAt` stays in the `POST` body.
- **An audit column you declared without a default** stays in the body.
- **A `z.strictObject` entity schema** answers `422` to a client that sends a left-out key.
- **A refined entity schema** is used as it is when it holds none of the left-out keys. A refined schema that holds one, and any transformed schema, make defining the controller fail with a message naming `routes.<route>.request.body`. Pass your own body there. A transformed update schema always fails.
- **A custom `request.body` is not covered.** Built from `createInsertSchema` or `createUpdateSchema`, it still carries these keys - `.omit()` them yourself.
- **Server code is not affected.** `repository.create()` and `repository.updateById()` still accept every column. `deletedAt` is unchanged.
- **A `PATCH` body left with nothing to write answers 400** with code `core.request.nothing_to_update`, instead of a 500. That covers `{}`, a `where` alone on `PATCH /`, and a body holding only left-out keys, including with a custom `request.body`.
- **Bump `@venizia/ignis-kernel` and `@venizia/ignis-connectors` together.** A new kernel with an older connectors leaves the audit keys writable.
- **`resolveCreateConfig` called directly** now types its default `request.body` as `TAnyObjectSchema`, not your create schema.

See [Default request bodies](/references/base/controllers#default-request-bodies).

## Nested JSON-path updates create missing objects

<Badge type="info" text="Bug Fix" />

On PostgreSQL, updating `'metadata.a.b.c'` on a row whose `metadata` is `{}` reported `count: 1` and left `{}`. It now writes `{ a: { b: { c: ... } } }` and keeps existing keys. SQLite already did this.

- A scalar parent or a `NULL` column leaves the column unchanged. A scalar root still raises on PostgreSQL.
- An array index in the middle of a path appends when it names the next free slot, on both engines. Past that slot, PostgreSQL still appends and SQLite leaves the value unchanged.

## A rejected Socket.IO client receives `unauthenticated`

<Badge type="info" text="Bug Fix" />

When `authenticateFn` returned `false` or threw, the disconnect arrived before the notice, so the client never saw the event. `SocketIOServerHelper` now emits the notice on the client's own socket, then disconnects it. `onUnauthenticated(message)` fires before `onDisconnected('io server disconnect')`. No API change.

## postgres-js loads under Bun next to `postgres`

<Badge type="info" text="Bug Fix" />

An app that imported `PostgresJsDriver` from `@venizia/ignis/postgres/postgres-js` and then `postgres` itself crashed at load with `TypeError: require() async module ".../postgres/src/index.js" is unsupported`. The subpath now has an `import` condition, so it loads. `require()` consumers and the types are unchanged.

## Apps that import `jose` load reliably

<Badge type="info" text="Bug Fix" />

An app that imported `jose` itself could crash at load under Bun with `require() async module ".../jose/dist/webapi/index.js" is unsupported`. With `@venizia/ignis` imported first, every load crashed; with `jose` first, one in five. The token services now load `jose` with `import()`, once per process. With JWT or service authentication configured, the authentication component loads it at boot.

- **No API change.** Compiled binaries still carry `jose`.
- **A missing or broken `jose` fails the boot**, with an error naming `jose`, when JWT or service authentication is configured. Before, every token check answered 401. `jose` stays a required peer; a Basic-only app does not load it.
- **A failed load is retried.** A token service you construct yourself loads `jose` at its first token operation, and tries again after a failure.
- **A subclass of `AuthenticateComponent`** that overrides `binding()` must `return super.binding()`. Otherwise a missing `jose` becomes an unhandled rejection instead of a failed boot.

## The change-password document lists every required field

<Badge type="info" text="Bug Fix" />

The OpenAPI document for `POST /auth/change-password` listed only `oldCredential` and `newCredential` as required, while validation also requires `scheme` and `userId`. Generated clients let callers omit them and those calls failed with 422. The document now lists all four.

- **Requests are unchanged.**
- **Regenerate an OpenAPI client:** `scheme` and `userId` become required in its types.
- **Your own `payload.changePassword.request.schema`** is unaffected.

## `stop()` closes the datasources

<Badge type="info" text="Bug Fix" />

`application.stop()` stopped the server and left every datasource open, so tests leaked and a Node process could hang. `stop()` now closes every datasource the boot configured, after the server stops.

```typescript
await application.stop(); // post-stop hooks -> server -> close() on every configured datasource
```

- **`close()` is new on every datasource.** It runs once; a later call returns the same promise. A search datasource keeps the root `close()`, which does nothing.
- **A failed or stuck `close()`** is logged and does not stop the others. `stop()` waits at most `dataSourceCloseTimeoutMs` (default `10_000`) for each one, then logs `Close timed out` and moves on. `0` waits without limit.
- **The datasources close even when the server fails to**, and `stop()` still reports that server error. A second `stop()` is harmless.
- **`WorkerApplication.stop()`** closes its datasources too, so a Vite hot-reload `dispose` releases the PGlite OPFS lock.
- **Remove your own close** from a post-stop hook when it ends a configured datasource's client: the hook runs first, and a second end fails (logged). A datasource you configure by hand in `postConfigure()` is still yours to close.
