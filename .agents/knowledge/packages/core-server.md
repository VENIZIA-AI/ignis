---
type: Package
title: core-server
description: "The main IGNIS framework package - the server layer on top of the browser-pure kernel: application lifecycle, connectors, and the built-in components."
resource: packages/core-server
tags: [packages, core-server, framework]
---

<!-- okf:generated:contents start -->
**Contents**

- [Core and the kernel](#core-and-the-kernel)
- [Application lifecycle](#application-lifecycle)
- [Controllers](#controllers)
- [Repository hierarchy](#repository-hierarchy)
- [DataSources and connectors](#datasources-and-connectors)
- [Components](#components)
- [Gotchas](#gotchas)
- [Related](#related)
<!-- okf:generated:contents end -->

`@venizia/ignis` is the main framework package - the top of the dependency chain
(`dev-configs -> inversion -> {filter, helpers} -> kernel -> connectors -> core`). `filter` is
isomorphic and depends on `inversion` only; `kernel` is the browser-pure tree; `boot` is a leaf beside
`kernel` that core does not depend on (an application declares it itself for the generator). Core is built on Hono for HTTP and
Drizzle ORM for SQL access, with `hono`, `drizzle-orm`, `zod`, `@hono/zod-openapi`, and `jose` as
required peers.

`jose` is required but never loaded at import: the token services reach it through `JoseLoader`
(`components/auth/authenticate/services/jose-loader.ts`, internal, not exported), a string-literal
`import()` cached once per process, so `jose` loads on first use, not at import. The literal keeps `jose` in a compiled binary;
`ModuleUtility.load` would not. A failed load is not cached. `AuthenticateComponent` preloads `jose`
at boot when JWT or service options are set, so a missing `jose` fails the boot instead of turning
every token check into a 401. Tests reach the private `importer` seam by bracket
access.

Database clients (`pg`, `postgres`, `@libsql/client`, `typesense`, `meilisearch`)
and `socket.io` are optional peers installed only by apps that need them.

## Core and the kernel

The engine-neutral, browser-pure half of the framework lives in `@venizia/ignis-kernel`: the DI
`Container`, `AbstractApplication` / `RestApplication`, the base component, controller, datasource,
model, provider, repository and service classes, the `@controller` / `@repository` / `@datasource` /
`@model` decorator layer, `MetadataRegistry`, the binding-key namespaces, and the authentication and
authorization seams. `packages/core-server/src/index.ts` re-exports the kernel barrel wholesale, so
`@venizia/ignis` keeps its published name and its full public surface - no consumer import changed.

Core keeps only what needs node or a server peer: `ServerApplication` and `BaseApplication`, the
gRPC controller tier, the connectors, the built-in components, and the app-error and request-spy
middlewares.

## Application lifecycle

`BaseApplication` (`src/base/applications/base.ts`) extends `ServerApplication`, which extends the
kernel's `RestApplication` and `AbstractApplication`. It runs twelve ordered phases:
`staticConfigure`, `preConfigure`, `hydrateSecrets`, `registerDataSources`, `registerComponents`,
`wireSecretRotatables`, `registerControllers`, `postConfigure`, `verifyBindings` (opt-in through
`configs.bootChecks.binding.doVerify`), `setupMiddlewares`, `start`, `executePostStartHooks`.
The full server boot sequence is 16 named steps, ending `postConfigure -> verifyBindings ->
validateScopeFilterSupport`. See [Application lifecycle](/architecture/application-lifecycle.md) for the
full contract.

`IServerApplicationConfigs` adds `host`, `port`, `projectRoot` and `server` on top of the kernel's shape.
`projectRoot` is read by `getProjectRoot()` inside the base constructor (before `preConfigure`), default
`process.cwd()`; an override of the method still wins. The value has real readers since 0.2.0-21:
`getProjectRoot()` calls `ModuleUtility.setProjectRoot()`, so optional-peer lookups and the gRPC
adapter's `@connectrpc/connect` resolution happen under `<projectRoot>/node_modules`.
`configs.server` (`idleTimeout` in seconds, `maxRequestBodySize` in bytes) is spread into
`Bun.serve` by `startBunModule`; unset keys keep Bun's defaults. Override `getServerRuntimeOptions()` for anything beyond those two
keys instead of re-implementing `startBunModule`.

`EnvironmentKeys` (`src/common/environments.ts`) is the env vocabulary, split into what the
framework reads (`APP_ENV_APPLICATION_NAME`, `APP_ENV_APPLICATION_TIMEZONE`,
`APP_ENV_LOGGER_FOLDER_PATH`, `APP_ENV_SERVER_HOST`, `APP_ENV_SERVER_PORT`) and what is a
convention an application reads for itself (the rest - setting them changes nothing).
`APP_ENV_APPLICATION_TIMEZONE` feeds the startup banner line and nothing else (unset, the banner prints `UTC`; the preset `.env.example` sets `UTC` too): no date operation
reads it, since `@venizia/ignis-helpers` stopped setting a dayjs default zone from it (dates take
their zone from `TemporalHelper`'s `timeZone` - see [helpers](/packages/helpers.md)).
`printStartUpInfo` reads every value through those constants at CALL time, not at module load, so
a `.env` the entrypoint loads after importing `base.ts` is still seen. The `APP_ENV_*_DS_*` names
were deleted on 2026-09-11: they fed one log line and selected no datasource.

## Controllers

`BaseRestController` (`packages/kernel/src/base/controllers/rest/`) wraps an `OpenAPIHono` router.
Routes can be defined three ways in the same controller: decorator (`@get`, `@post`, `@put`,
`@patch`, `@del`), imperative (`this.defineRoute({ configs, handler })`), or fluent
(`this.bindRoute({ configs }).to({ handler })`). `CrudControllerFactory.build()`
(`packages/kernel/src/base/controllers/factory/`) generates a full CRUD controller from an entity and
repository. gRPC controllers (ConnectRPC) are the one controller tier left in core
(`src/base/controllers/grpc/`) and register through the same `@controller` decorator with
`transport: 'grpc'`. See [Controller system](/architecture/controller-system.md).

## Repository hierarchy

One engine-neutral `AbstractRepository` (`packages/kernel/src/base/repositories/core/`) extends
`BaseHelper` and resolves the datasource/entity lazily; every verb is abstract. Above it sits one
shared chain per connector paradigm, not per engine. The SQL chain lives in `src/connectors/relational`:
`RelationalBaseRepository -> ReadableRelationalRepository -> PersistableRelationalRepository ->
DefaultRelationalRepository -> SoftDeletableRelationalRepository`. Postgres and SQLite each subclass
that chain one-for-one, rebinding only the two engine-facing type parameters - the postgres binding
is `PostgresBaseRepository -> ReadableRepository -> PersistableRepository -> DefaultCRUDRepository ->
SoftDeletableRepository` (the recommended default is `PersistableRepository` or above). The search
chain in `src/connectors/search` mirrors the shape as `SearchBaseRepository ->
ReadableSearchRepository -> PersistableSearchRepository -> DefaultSearchRepository` and has no
transaction support; `typesense` and `meilisearch` add no repository classes at all, only query
dialects. See [Repository hierarchy](/architecture/repository-hierarchy.md).

Hidden fields (`@model` `properties.hidden`) and default filters (`@model` `query.filter`, e.g. soft
delete) are applied at the SQL/query level by each connector's base repository, not by post-processing
the result.

## DataSources and connectors

The engine-neutral bases live in the kernel; every engine-specific implementation lives under
`src/connectors/`, as two paradigm layers plus four engines: `relational` (engine-neutral SQL) with
`postgres` (drivers node-postgres, postgres-js, PGlite, plus Supabase) and `sqlite` (libsql driver)
on top of it, and `search` (engine-neutral) with `typesense` and `meilisearch` on top of it. The root
barrel re-exports only the `postgres` connector, because it never value-imports a client library;
`relational`, `sqlite`, `search`, `typesense` and `meilisearch` are sub-path exports only
(`@venizia/ignis-connectors/relational`, `/sqlite`, `/search`, `/typesense`, `/meilisearch`), which is what keeps
their client packages optional peers. A datasource's driver is named by passing the driver CLASS to
`@datasource({ driver })`, not a string - a class reference is what actually pulls an optional peer
into a consumer's bundle. `/search` and `/typesense` no longer carry the search controllers - they
come from `@venizia/ignis-connectors/search/controllers` or `/typesense/controllers` - and `RecursiveTreeSql`
moved from `kernel` to `connectors`; the root still exports it through the postgres alias (see
[connectors](/packages/connectors.md)). DataSources auto-discover their schema from every `@repository` binding that
references them; no manual schema wiring is needed.

## Components

Built-in components live in `src/components/`: `HealthCheckComponent`, `ApiReferenceComponent`
(interactive OpenAPI UI, Scalar or Swagger UI - the successor to `SwaggerComponent`, whose deprecated
`Swagger*` aliases are all REMOVED), `AuthenticateComponent` (JWT + Basic strategies), `AuthorizeComponent` (Casbin
RBAC), `RequestTrackerComponent`, `GrpcComponent`, `StaticAssetComponent`, `MailComponent`,
`SocketIOComponent`, and `WebSocketComponent`. The root barrel carries `AuthenticateComponent`,
`AuthorizeComponent`, `HealthCheckComponent`, `RequestTrackerComponent`, `ApiReferenceComponent`,
and - through the wholesale kernel re-export, not from `src/components/` - `RestComponent`;
`GrpcComponent`, `MailComponent`, `SocketIOComponent`, `StaticAssetComponent`, and
`WebSocketComponent` are excluded from the barrel and must be imported from their sub-path
(`@venizia/ignis/grpc`, `/mail`, `/socket-io`, `/static-asset`, `/websocket`).
`/mail` needs `bullmq` only when its BullMQ queue executor is used: `BullMQHelper` loads the peer
when it builds a queue or worker, not at import. A compiled binary using that executor passes both
peers - `module` (bullmq) in `IBullMQMailExecutorOpts` and `module` (ioredis) in the Redis helper's own
options - or registers them with `ModuleUtility.register({ modules: { ioredis, bullmq } })`. The
executor's `redis` is a READY `IRedisHelper` (single, sentinel or cluster, never options): `BullMQHelper`
duplicates its client per queue and worker and wraps a cluster queue name in a `{hash tag}`, and the
executor never constructs, disconnects or closes the helper - the application owns it.
Mail attachments are resolved in ONE place, `MailService.send()` via `MailAttachmentUtility.resolve`
(`mail/utilities/attachment.utility.ts`, internal - not in the `/mail` barrel): every attachment
becomes `content` bytes and loses `path`/`href`/`raw`/`encoding` before any transport sees it.
Nodemailer would otherwise read a `path`, an `href` URL or `raw.path` itself; the old Mailgun
mapping forwarded the `path` string as `data`.
- `path` is read only under the `attachmentRoot` option: both sides go through realpath, the file
  opens with `O_NOFOLLOW | O_NONBLOCK` (a FIFO cannot hang the open), then fstat must say regular
  file. Unset root = every `path` refused. Missing, directory, FIFO, unreadable and escape answer
  ONE message and `400 core.mail.attachment_path_refused` - no existence oracle; the fs reason rides
  in `cause` (development responses only). `href`/`raw` are refused.
- Known limit, documented not fixed: an intermediate directory swapped for a symlink between
  realpath and open is followed. It needs write access inside the root; a portable fix does not exist
  (fd-to-path is `/proc`-only).
- A path attachment defaults `filename` to `basename(path)` and `contentType` to
  `ContentTypeTable.resolve` - nodemailer used to derive both from `path`.
- `maxAttachmentBytes` (default `MailDefaults.MAX_ATTACHMENT_BYTES`, 25 MB, decoded bytes) is ONE
  budget per message (`413 core.mail.attachment_too_large`). A file is sized by fstat, then read
  through the same per-chunk counter with `end` one byte past the budget, so a file grown after
  fstat is still capped. Streams (Node `Readable` or web `ReadableStream`) are counted per chunk;
  the `for await` exit destroys/cancels them - never call `.destroy()` directly, a web stream has none.
  `Uint8Array` is bytes; any other `content` is `400 core.mail.invalid_configuration`.
- A refused send releases EVERY attachment stream (`MailAttachmentUtility.release`, in the
  `MailService.send()` catch and in each transport's catch) - otherwise an unread stream keeps its fd.
- `attachmentRoot` (absolute, existing directory) and `maxAttachmentBytes` (positive safe integer)
  are validated in `MailComponent.createAndBindInstances()`; a bad value fails the boot (500).
- `text`/`html` must be a string, or `null`/`undefined` (absent): `MailBodyUtility.assertIsText`
  (`mail/utilities/body.utility.ts`) runs in `MailService.validateMessage()` and in the nodemailer
  transport; `400 core.mail.body_source_refused`. The nodemailer transport also sets nodemailer's
  `disableFileAccess`/`disableUrlAccess` on every send.
- The nodemailer and mailgun transports resolve again with no root and no limit, and the SES MIME
  builder reads with no root: a direct transport call refuses `path` too, but has no size cap. Do
  not give the transports a default limit - a second, smaller cap would reject what the configured
  one allowed.
- `SEND_FAILED`/`BATCH_SEND_FAILED`/`VERIFICATION_FAILED` carry a fixed message; the original
  error goes to `cause` (S-03 - the envelope sends an ApplicationError's message in production).
`StaticAssetComponent` turns each key of `TStaticAssetComponentOptions` into one generated controller on ONE bucket.
An entry is `{ basePath, name?, bucket, helper, keyPrefix?, rawObjectPath?, link?, auth?, serverUpload,
directUpload, metaLink, routes?, extend? }`. Every switch is a `TToggle<Options>`: `{ use: false }` or
`{ use: true, ...options }`. `serverUpload`, `directUpload`, `metaLink` and `directUpload.validation` are
REQUIRED (a missing one is a type error); `routes`, `auth.publicRead` and `extend` are optional. The only
place `use` is read is `StaticAssetToggleUtility.isUsed`.
`StaticAssetEntryUtility.resolve({ key, entry })` (`utilities/entry.utility.ts`) is the one place that reads
the toggles, applies the defaults and makes the cross-checks the types cannot (plain JavaScript, a cast, a
custom helper); every boot error is thrown with the entry's name. `name` is optional and derived from the
key (`staticAsset` -> `StaticAssetController`). The helper declares its backend: `helper.storageType`
(`StorageTypes.DISK` or `BUN_S3`, from helpers; optional on `IStorageHelper`) replaces the old `storage`
field, and the entry refuses a helper that declares neither. `StaticAssetControllerFactory.build<Schema>({
key, entry, policyService?, commitService? })` resolves the entry itself.
Types and boot both require: `directUpload` on needs a `BunS3Helper` (a POST policy is an S3 feature) AND a
`keyPrefix`, and needs `authorize` unless `auth` authenticates or authorizes. `bucket` is required and never
in a URL (`TValueOrAsyncResolver<string>`, read per request); the four bucket-management routes and
bucket-in-URL mode are gone, and the component never creates a bucket. `rawObjectPath` widens the object
segment to the `{objectName}{.+}` catch-all, and the percent-encoded form keeps working. Routes are strict
(no `isStrict`).
The route table is `controller/routes/table.ts`: each route names a feature (`object`, `serverUpload`,
`directUpload`, `validation`, `metaLink`), `registerRoutes` binds it only when the feature is on and its
`routes.<key>` toggle is not `{ use: false }`. Paths: `POST|GET /objects`, `GET|DELETE /objects/{objectName}`,
`GET /download/{objectName}` (both reads honour `Range`), `PUT /meta-links/{objectName}`,
`POST /upload-policy|/upload-validate|/upload-commit`. A `routes.<key>` override is `{ use: true, ...config }`;
`StaticAssetRouteOptionsUtility.readRoute` resolves the auth and hands the rest to `createRoute`.
`extend.before` registers before every built-in route (a literal path then wins over the `rawObjectPath`
catch-all; Hono matches in registration order), `extend.after` after every one; they replace
`defineRoutesBefore` and `defineExtraRoutes`.
`serverUpload` takes `maxBytes`, `maxFiles` and ONE naming hook, `objectKey({ bucket, file,
defaultKey })`, which replaces `resolveObjectName` and `extra.normalizeNameFn`; `link` replaces
`extra.normalizeLinkFn`. There is no spool: the multipart body is parsed whole into memory before the first
file is written, so spooling to disk saved nothing. `maxBytes` answers `413` with
`core.static_asset.upload_too_large` - one code for both upload paths. Its `content-length` check is route
middleware (`StaticAssetRouteOptionsUtility.appendLengthGuard`), appended AFTER the application's own
`routes.upload` middleware: `@hono/zod-openapi`'s form validator reads the whole body before any handler runs,
so a check in the handler saved no memory. The per-file `buffer.length` check - the authoritative one - stays
in the handler. The handler does not check folders: `BaseStorageHelper.upload` does, and throws
`StorageErrors.FOLDER_PATH_INVALID` / `FOLDER_DEPTH_EXCEEDED` (`core.storage.folder_*`); the old
`core.static_asset.folder_*`, `labels_in_query` and `max_keys_invalid` codes are gone. `listObjects`' `maxKeys`
is parsed by the route schema (a bad value is the standard validation error).
The upload labels - `principalType`, `principalId`, `variant`, `sequence` - travel in the BODY (form fields on
`POST /objects`, beside the commit token on `upload-commit`) and are parsed by ONE schema
(`StaticAssetLabelsUtility.parse`, type `TStaticAssetUploadLabels`; `folderPath` is not a label). A label in the
URL is ignored, not refused. A bad one is the standard validation error (422) on both paths. `metaLink` is `{ use: true, repository, createMetaLink? }` (no `model`); the hook
receives `labels`.
Auth is entry-level: `auth: { authenticate?, authorize?, publicRead? }` applies to EVERY built-in route, a
route's own `authenticate`/`authorize` replaces it (`{ skip: true }` opens it), and the resolution is the
kernel's `RouteConfigResolver.resolveAuthenticate` / `resolveAuthorize`, which the CRUD factory calls too -
never a second copy. `publicRead: { use: true }` opens `getObjectByName` and `downloadObjectByName` only
(`listObjects` is not public) and loses to a route's own auth. With no `auth` a route is open.
`keyPrefix` scopes an entry inside a shared bucket: a key outside the prefix answers `404
core.storage.object_not_found` before any storage call; `listObjects` clamps to the prefix and lists `[]` for a
disjoint one; the component's own default upload name lands under the prefix, and an `objectKey` key outside it
is refused (`400 core.static_asset.object_key_out_of_scope`), never rewritten - the application may have
recorded that key elsewhere; the entry's own `maxFolderDepth` (not a `serverUpload` option: it bounds every route) counts folders below the prefix. With `keyPrefix` set and no
`objectKey`, the component's own default naming keeps the original file name to one segment - a `/` in it is
still `400 [upload] Invalid original file name`; an `objectKey` hook relaxes it.
`recreateMetaLink`'s refresh, in `utilities/meta-link.utility.ts`: with `metaLink.createMetaLink` configured,
one `updateBy` writes only `mimetype`/`size`/`etag`/`isSynced` and leaves `link`/`metadata` to the hook;
without one, that same statement also writes `link`, and one `updateById` per returned row then
merges `metadata: { ...row.metadata, ...fileStat.metadata }` (skipped when the stat carries none) -
a read-then-write, so a concurrent write to that row's `metadata` between the two statements is
lost. `action` in the OpenAPI response is `z.enum([...REFRESHED, ...CREATED])`, not a bare `string`.
`deleteObject` is idempotent (a missing object is `200`) and awaits the MetaLink row delete.
Direct upload's routes are wrappers over two services in `services/`:
`StaticAssetUploadPolicyService({ scope, helper, bucket, keyPrefix, directUpload: { maxBytes, expires?,
secretKey, pendingPrefix? } })` (`issuePolicies({ files, owner? })`, the policy body without `authorize`) and
`StaticAssetUploadCommitService({ scope, helper, keyPrefix, directUpload: { secretKey, pendingPrefix?,
validation? }, storage, metaLink?, link })` (`verify({ token, owner? })`, `validate`, and
`commit({ token, owner?, labels? })`, answering `{ bucket, object, link, metaLink? }`; generic over the MetaLink
`Schema` like the component). There is NO `onCommit`: check the file with `validation`, and do work after a
commit in the caller. The HTTP field stays `commitToken`; only the service parameter is `token`. `verify` is
the checks a commit starts with (signature, expiry, owner, `keyPrefix` scope) and returns the PENDING `{
bucket, object }` with no storage call; `commit` calls it, so the checks live in one place.
`StaticAssetBindingKeys.policyService({ name })` / `.commitService({ name })` (`name` = the entry's key in the
options object, not the controller name) bind one of each per entry with `directUpload` on, built by
`StaticAssetEntryUtility.buildDirectUploadServices({ resolved })`; the factory receives the same instances.
That is the ONLY construction path: the factory throws when `directUpload` is on without them.

The pending prefix: a policy signs `pendingPrefix + keyPrefix + <uuid>/<name>` and the commit strips
`pendingPrefix`, so the final key is `keyPrefix + <uuid>/<name>`. Both prefixes come from one place,
`StaticAssetKeyScopeUtility.resolveDirectUploadPrefixes`. `pendingPrefix` (default `pending/`) must be
non-empty, end with `/`, be valid key segments, and be DISJOINT from `keyPrefix` (neither starts with the
other), else boot throws with the entry's name. Why: with `keyPrefix: 'products/'` and `pendingPrefix:
'products/pending/'` the routes would serve pending objects; because `keyPrefix` is required with
`directUpload`, the pending prefix is outside everything the routes serve by construction. The lifecycle
rule that collects abandoned uploads must target the configured `pendingPrefix`. An entry with no `keyPrefix`
that adds one moves its committed keys, and tokens signed for the old pending key fail with `404`.

A policy signs ONE key (`presignPost({ bucket, object, ... })`; `formData` carries `key`). The token
payload is `{ bucket: IBucketRef, object: IObjectRef, expiresAt, owner? }`; `read` refuses any other shape.
`directUpload.resolveOwner` supplies the owner on every direct-upload route, and a token with an owner commits
only for that owner (anything else, or none, is `INVALID_COMMIT_TOKEN`, the forged-token error).
`directUpload.expires.upload` is the policy's lifetime, `expires.commit` the token's (default `upload`). Every
direct-upload route calls `directUpload.authorize` first; the services never do, so a caller that reaches them
directly owns that decision.

`directUpload.validation` is `{ use: false }` or `StaticAssetValidation.define({ issueSchema, handler })`
(which returns it `{ use: true, ... }`; typed as `IStaticAssetValidation<z.ZodType>` so no `AnyType` is needed -
the handler's answer is covariant, and `define` is what types it from the schema). It adds the app's check of
the PENDING object. The commit service's `validate({ token, owner? })` is `verify` plus the handler (valid when
none is configured); `commit` runs the handler after `verify` and before the copy, and throws `UPLOAD_INVALID`
(422) on an invalid file. The route `uploadValidate` (`POST /upload-validate`) exists only when `validation`
is on: its response is documented with `issueSchema`; the handler is `authorize`, `resolveOwner`, `validate`.
Link building lives in `object-link.utility.ts` so the services and the factory share it without importing
each other.
See [object storage](/architecture/object-storage.md) for the signing model behind the second path.
See [component model](/architecture/component-model.md) and the
[components catalog](/reference/components.md).

## Gotchas

- Every constructor parameter of a container-instantiated class (controller, service, repository) must carry `@inject` - mixing decorated and undecorated parameters is refused at boot.
- The kernel is browser-pure and the boundary is machine-checked by `make purity`: it reaches Drizzle only through `import type` and must never value-import a client library. In core, only `src/connectors/<engine>/` may.
- Core API queries (`this.dataSource.getConnector()`) are faster but skip relation loading; use the query API (`this.dataSource.getConnector().query`) when `include` is needed.

## Related

- [Repository hierarchy](/architecture/repository-hierarchy.md)
- [Controller system](/architecture/controller-system.md)
- [Application lifecycle](/architecture/application-lifecycle.md)
- [boot](/packages/boot.md)
