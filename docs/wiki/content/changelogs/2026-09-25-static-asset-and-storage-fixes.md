---
title: Static Asset Scoping, a Real Body Limit, and Storage File Names
description: "A shared bucket can be scoped per controller and per route, configs.middlewares.bodyLimit finally does what its type promised, a recreated MetaLink refreshes every row instead of one, non-ASCII file names survive a direct-upload commit, and office files resolve to their registered MIME type."
---

# Changelog - 2026-09-25

Rebuilding the static-asset and storage examples exposed these defects. Each one is fixed at its root.

| Fix | Who is affected |
|---|---|
| [`controller.keyPrefix` scopes a shared bucket](#controller-keyprefix-scopes-a-shared-bucket) | Two controllers or tenants sharing one bucket |
| [`routes.<key>.enabled` drops a built-in route](#routes-key-enabled-drops-a-built-in-route) | Applications that closed a route with a middleware override |
| [`PUT .../meta-links/{objectName}` refreshes every row](#put-meta-links-objectname-refreshes-every-row) | Anyone calling the recreate route on a MetaLink table of their own |
| [`configs.middlewares.bodyLimit` is applied](#configs-middlewares-bodylimit-is-applied) | Applications passing `middlewares` through the constructor `config`; a hook-time assignment still has no effect and now fails the boot |
| [Request spy parses forms only in development](#request-spy-parses-forms-only-in-development) | Any route that reads a form body |
| [`extra.maxBytes` checks `content-length` before the body is read](#extra-maxbytes-checks-content-length-before-the-body-is-read) | Applications with their own upload size guard |
| [The error envelope honors the status on a thrown HTTPException](#the-error-envelope-honors-the-status-on-a-thrown-httpexception) | Every JSON-body route (malformed JSON is now `400`, not `500`), and any route whose handler throws an `HTTPException` |
| [Storage accepts non-ASCII and unusual file names](#storage-accepts-non-ascii-and-unusual-file-names) | Direct upload commits; uploads with a generated key; `MinioHelper` metadata; `Content-Disposition` |
| [Office file types resolve to their registered MIME type](#office-file-types-resolve-to-their-registered-mime-type) | `.xlsx`, `.xls`, `.docx`, `.doc`, `.pptx`, `.ppt`, `.odt`, `.ods` |
| [`presignPost` stops naming the bucket twice in virtual-hosted style](#presignpost-stops-naming-the-bucket-twice-in-virtual-hosted-style) | `BunS3Helper` with `virtualHostedStyle: true` |

## `controller.keyPrefix` scopes a shared bucket

<Badge type="tip" text="Enhancement" />

**In one line.** Two controllers can now point at the same bucket without either one seeing the other's keys.

Set `controller.keyPrefix` and every route on that controller is confined to it:

```typescript
{
  controller: { name: 'TenantAAssets', basePath: '/tenant-a/assets', bucket: 'shared', keyPrefix: 'tenant-a' },
  storage: StaticAssetStorageTypes.BUN_S3,
  helper: bunS3Helper,
}
```

- `getObjectByName`, `downloadObjectByName`, `deleteObject`, and `recreateMetaLink` answer `404 core.storage.object_not_found` for a key outside the prefix - before any storage call, so a caller learns nothing about a key it does not own.
- `listObjects` narrows a caller `prefix` that is wider than the scope, and returns `[]` for one that is disjoint from it, without calling storage.
- `upload` places its own default key under the prefix. A `resolveObjectName` or `extra.normalizeNameFn` key outside it is refused with `400 core.static_asset.object_key_out_of_scope` - never rewritten, because the application may have recorded that key elsewhere.
- With **neither** hook set, the component's own default naming under a scope keeps the original file name to one segment - a `/` in it is `400 [upload] Invalid original file name`, exactly as without `keyPrefix`. Set `resolveObjectName` or `extra.normalizeNameFn` to relax that.
- Direct upload's pending key and policy `starts-with` condition also carry the prefix, and the commit route re-checks it.
- `maxFolderDepth` counts folders below the prefix, not from the bucket root.
- `keyPrefix` requires `controller.bucket` and throws at registration without it - the same requirement `directUpload` already has. Without a configured bucket the four bucket-management routes stay unscoped, so `keyPrefix` alone would isolate only part of the controller's surface.
- Not scoped: `defineRoutesBefore` and `defineExtraRoutes`. The bucket-management routes are not registered at all once `controller.bucket` is set.

**Who is affected:** nobody who leaves `keyPrefix` unset - behavior is unchanged. A controller that set `keyPrefix` without `bucket` (bucket-in-URL mode) now fails to register - add `controller.bucket`. See [`controller.keyPrefix`](/extensions/components/static-asset/api#controller-keyprefix) for the full reference and [Share one bucket between controllers](/extensions/components/static-asset/usage#share-one-bucket-between-controllers) for a worked example.

## `routes.<key>.enabled` drops a built-in route

<Badge type="tip" text="Enhancement" />

Every built-in static-asset route now takes `enabled: false`, the same switch name the CRUD controller factory uses:

```typescript
routes: {
  deleteBucket: { enabled: false },
  deleteObject: { enabled: false },
}
```

Before, closing a route meant overriding it with a middleware that always refused the request. `enabled` is stripped before the route reaches Hono, so a disabled route is not registered at all - no path, no entry in the OpenAPI document.

**Who is affected:** nobody who leaves `routes` unset. An application that closed a route with a hand-written middleware can replace it with `enabled: false`.

## `PUT .../meta-links/{objectName}` refreshes every row

<Badge type="warning" text="Behavior Change" />

**In one line.** Recreating a MetaLink row now refreshes every row for that object, keeps each row's own `storageType` and labels, and only creates a new row when none existed.

Before, the route did a plain `findOne` then `updateById`/`create`: on a table with two rows for the same object - a product image attached to the product and to a variant, the documented case for the table's non-unique pair - only the first row found was touched, and a refresh silently overwrote the row's own `storageType` with the storage backend this controller was configured for.

```typescript
const response = await fetch(`/assets/buckets/uploads/meta-links/${encodeURIComponent(objectName)}`, { method: 'PUT' });
const { success, action, count, metaLink, metaLinks } = await response.json();
// action: 'refreshed' when rows for the object existed, 'created' when none did
```

- `action`, `count`, and `metaLinks` are new on the response. `success` and `metaLink` (now `metaLinks[0]`) are unchanged in shape. `action` is a real OpenAPI enum, `'refreshed' | 'created'`, not a bare `string` - a generated client now gets the narrow type.
- A refresh always updates `mimetype`, `size`, `etag`, and `isSynced: true` on every row of the pair, and leaves each row's `storageType`, `variant`, `principalType`, `principalId`, and `sequence` untouched.
- **`link` and `metadata` depend on `metaLink.createMetaLink`.** With a hook configured, a refresh writes only `mimetype`, `size`, `etag`, `isSynced` - `link` and `metadata` are left alone, because the hook already owns them, so an enrichment it wrote (dimensions, a placeholder, anything beyond `getStat()`) survives a recreate. Without a hook, one statement refreshes `link` plus the stat columns on every row, then one more statement **per row** merges that row's own `metadata` with the stat's - the stat's keys win, everything else the row had survives, and the step is skipped entirely when the stat carries no metadata.
- That merge is a read-then-write: the first statement's own result supplies the "read", and each row's update is a separate statement after it. A concurrent write to that row's `metadata` landing in between is lost.
- A create (no existing rows) goes through the same `createMetaLink` hook and builder an upload uses, so it gets your `storageType` and defaults - not a bare guess.
- Refresh-then-create is still not atomic: two concurrent calls on an object with no existing row can both create one. Rows per pair are deliberately not unique, so the table allows it.

> [!IMPORTANT]
> The MetaLink type contract checks the **select row** only - the columns the component reads and writes, on whatever table `metaLink.model`/`metaLink.repository` point at. A column you add of your own must be nullable or carry a default: the component's default insert writes exactly the columns it knows about, so a `NOT NULL` column with no default passes the type check and then fails every insert the component makes without your own `createMetaLink` hook.

**Who is affected:** anyone calling `PUT .../meta-links/{objectName}` on a table with more than one row per `(bucketName, objectName)` pair, or reading `metaLink.storageType` after a refresh - it now keeps the value your `createMetaLink` hook wrote, instead of the component's own. A `createMetaLink` hook that enriches `metadata` (for example BANA inventory's width, height, and placeholder) is no longer overwritten by a recreate call. Code reading `metaLink` off the response is unaffected; code that assumed one row per object should read `metaLinks` instead.

## `configs.middlewares.bodyLimit` is applied

<Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Behavior Change" />

`IMiddlewareConfigs.bodyLimit` existed as a type with nothing reading it. `RestApplication.registerDefaultMiddlewares()` now installs it - right after the request id, ahead of every other middleware, the request spy included:

```typescript
const application = new MyApplication({
  scope: 'MyApp',
  config: {
    // ...the rest of IApplicationConfigs
    middlewares: { bodyLimit: { enable: true, maxSize: 10 * 1024 * 1024 } },
  },
});
```

> [!IMPORTANT]
> `configs.middlewares` is read inside `registerDefaultMiddlewares()`, before `staticConfigure()` runs. Pass `middlewares` through the constructor's `config` - or an application-config factory that builds that object - not by assigning `this.configs.middlewares` in `staticConfigure()` or a later hook: it is read too late to take effect, and the application refuses to boot when it detects the value changed after the fact.

Over the limit answers `413 core.request.body_too_large`, or your own `onError`. A missing `enable` still applies the limit - fail-closed for a security control, even though the type marks `enable` required. A `maxSize` that is not a finite non-negative number throws at boot. Every other `IMiddlewareConfigs` key (`compress`, `cors`, `csrf`, `ipRestriction`) is still a type only - wire it yourself in `setupMiddlewares()`.

`bodyLimit` bounds the request stream; it does not replace `extra.maxBytes` or the other way around. `extra.maxBytes` only checks a declared `Content-Length`, so a chunked request with none skips it - pair the two. Raise `configs.server.maxRequestBodySize` above `bodyLimit.maxSize`, or Bun's own limit answers first, with no IGNIS envelope. Keep `bodyLimit.path` away from a route that streams a body through - the limiter buffers the whole body on any path it covers.

**Who is affected:** an application that assigns `configs.middlewares.bodyLimit` inside a hook like `staticConfigure()`, expecting it to take effect - it still does not, and the boot now fails instead of accepting it silently. Passed through the constructor, the limit is enforced for the first time. Everyone who never touched `configs.middlewares`: no action needed. See [Body limit](/references/base/middlewares#body-limit-configs-middlewares-bodylimit).

## Request spy parses forms only in development

<Badge type="warning" text="Behavior Change" />

**In one line.** Outside a development environment, the request spy no longer parses a form body - and a malformed form is still `400 core.request.body_malformed` everywhere it matters, through a new shared reader.

Before, `RequestSpyMiddleware` parsed every content type in every environment, just to log it - a multipart upload was fully read once by the spy and again by the route. Outside development the spy now parses only `application/json`, for its own malformed-body check; forms, `text/*`, and everything else reach the route unread.

A route whose `request.body.content` declares `multipart/form-data` or `application/x-www-form-urlencoded` now gets a `formBodyReader` middleware appended, after every application middleware and just ahead of the route's own validator. It parses the form through a new shared reader and maps a parse failure to `400 core.request.body_malformed`, before the validator gets a chance to throw its own generic, uncoded 400 - see [the error envelope fix](#the-error-envelope-honors-the-status-on-a-thrown-httpexception) for what happens when it does.

```typescript
import { readFormBody } from '@venizia/ignis-helpers';

const formData = await readFormBody({ req: context.req });
```

`readFormBody` is new in `@venizia/ignis-helpers` (and `/core`). `parseMultipartBody` now goes through it too.

> [!WARNING]
> An application that calls `context.req.formData()` itself - middleware running ahead of any framework reader, such as an upload authorization guard - is **not** covered by `formBodyReader`. A malformed body there is a `500` in production, not a `400`, unless that middleware calls `readFormBody({ req: context.req })` instead. It returns the same cached `FormData`, so the swap is a one-line change.

**Who is affected:** a route that reads a form body by hand, ahead of the framework's own reader, must switch to `readFormBody`. A route that declares its form body in OpenAPI (the static-asset upload, any `@hono/zod-openapi` form route) needs no change - its `400` on a malformed body is unchanged. Code that relied on the spy logging a non-JSON body outside development already saw nothing logged; this only changes whether it is *parsed*, which was never observable from the log line.

## `extra.maxBytes` checks `content-length` before the body is read

<Badge type="info" text="Bug Fix" />

The `content-length` pre-check moved from the upload handler into route middleware, appended **after** your own `routes.upload.middleware` - so an application's own size guard (for example BANA inventory's `REQUEST_TOO_LARGE`) still answers first.

It moved because `@hono/zod-openapi`'s form validator already reads the whole multipart body before any handler runs: a check inside the handler saw a body that was already fully read, so it never saved the memory it was written to save. The per-file `buffer.length` check - the authoritative one, since a multipart envelope is larger than the files inside it - stays in the handler.

`extra.maxBytes` bounds only a **declared** `content-length` - a chunked request with none skips it entirely. Pair it with [`configs.middlewares.bodyLimit`](#configs-middlewares-bodylimit-is-applied) for a ceiling nothing can skip.

**Who is affected:** nobody by default. An application with its own upload size middleware keeps answering first, unchanged. An application relying on `extra.maxBytes` alone against a chunked client should add `configs.middlewares.bodyLimit`.

## The error envelope honors the status on a thrown HTTPException

<Badge type="info" text="Bug Fix" />

The error handler read `statusCode` only. A Hono `HTTPException` - thrown by `@hono/zod-openapi`'s own request validator, or by your own code - carries its status on `.status`, so every 4xx `HTTPException` rendered as a generic `500 core.system_error` instead of its real status. The handler now reads `.status` too: a 4xx `HTTPException` renders as its own status and keeps its own message, sanitized environment or not; a 5xx one still stays an unexpected `500` whose message never reaches the client.

This is a general correctness fix, not specific to forms: any route whose validator or handler throws an `HTTPException` is affected. The clearest case is JSON: malformed JSON on **any** JSON-body route - every `@hono/zod-openapi` route with a `jsonContent` body, including the generated CRUD controllers - now answers `400 Malformed JSON in request body` instead of `500 core.system_error`. It does not cover a raw runtime error - a `TypeError`, for instance - which still renders as a `500`; see [`readFormBody`](#request-spy-parses-forms-only-in-development) for that case on a form body specifically.

**Who is affected:** any route whose validator or handler throws a Hono `HTTPException` - in practice, every JSON-body and form-body route, through the request validator, and any consumer code that throws one by hand. A response that used to be a `500` for one of these now carries the exception's own 4xx status and its own message (malformed JSON, for example, now reads `Malformed JSON in request body`). Code that matched on `statusCode: 500` for one of these cases should match on the new status instead.

## Storage accepts non-ASCII and unusual file names

<Badge type="info" text="Bug Fix" /> <Badge type="tip" text="Enhancement" />

**In one line.** A file called `Kiểm kê.xlsx` or `Báo cáo [Q3] & tổng hợp #1!.xlsx` now uploads, commits, and downloads under its own name.

- **`BunS3Helper.copyObject` encodes the copy source.** The `x-amz-copy-source` header is now built with per-segment SigV4 encoding. Before, a non-ASCII key made Bun throw `Header 'x-amz-copy-source' has invalid value`, so a direct-upload commit failed outright; a key with `+`, `%`, `?`, or `#` risked copying the wrong object, because S3 URL-decodes the header and splits `?versionId=` off it.
- **A generated key no longer rejects the original name.** When `upload` gets a naming hook (`normalizeNameFn`, or the static-asset controller's own default, `resolveObjectName`, or `controller.keyPrefix`), the original name is only metadata, not the key. Names containing `& # ! [ ] { } ;` or a leading dot are now accepted; control characters, an empty name, and more than 255 characters are still refused. Without a naming hook, the name is the key, and the key rules apply exactly as before.
- **Every key in a batch is checked before the first write.** One bad name in a multi-file upload now stores nothing, instead of writing the files ahead of the bad one.
- **`MinioHelper` stores a non-ASCII name.** The `originalName` and `normalizeName` metadata values are RFC 2047-encoded outside printable ASCII. Before, the upload crashed with `ERR_INVALID_CHAR`.
- **`createContentDispositionHeader` keeps the real name, and now keeps emoji and script-joining marks too.** `filename*` carries the UTF-8 name with every control, bidi-override, and other format character replaced by `_` (so a right-to-left override in a name can no longer relabel the extension a user sees) - **except** the zero-width joiner and non-joiner, which are left alone, because they build emoji sequences (a family emoji is several code points joined by U+200D) and join letters in Persian and other scripts, and reorder nothing. The `filename` fallback stays printable ASCII only. ASCII names produce the same header as before.

**Who is affected:** direct upload and static-asset uploads with non-ASCII or punctuated file names - fixed, no action needed. Code that matched the old error text `[upload] Invalid original file name` for a name copied into a generated key now sees `[upload] Invalid normalized object name | name: ...` instead. `MinioHelper` consumers reading `originalName` metadata get an RFC 2047 value (`=?UTF-8?B?...?=`) for a non-ASCII name; ASCII values are unchanged. A file name with a bidi override or another format character now downloads under a sanitized `filename*`, where it previously carried the raw character through.

## Office file types resolve to their registered MIME type

<Badge type="info" text="Bug Fix" />

`.xlsx`, `.xls`, `.docx`, `.doc`, `.pptx`, `.ppt`, `.odt`, and `.ods` resolve to their real content type in `ContentTypeTable`, instead of falling back to `application/octet-stream`. `.csv`, `.zip`, and `.txt` were already in the table.

This changes what the MetaLink `mimetype` column, `DiskHelper.getStat`, `writeStream`'s default type, and `AssetIngest` record - not what the static-asset routes serve. None of the office types is on `RENDERABLE_CONTENT_TYPES`, so the served `Content-Type` is still `application/octet-stream` with `Content-Disposition: attachment`, unchanged.

**Who is affected:** anyone reading a stored office file's recorded MIME type. Served behavior is unchanged.

## `presignPost` stops naming the bucket twice in virtual-hosted style

<Badge type="info" text="Bug Fix" />

With `virtualHostedStyle: true`, `presignPost`'s `postURL` was `https://<bucket>.<host>/<bucket>` - the bucket named in the host and repeated as a path segment, so the browser posted to a path that does not exist. It is now `https://<bucket>.<host>`. Path-style addressing (the common case, and what every current `BunS3Helper` construction in BANA uses) is unchanged: `http://minio:9000/<bucket>`.

**Who is affected:** `BunS3Helper` constructed with `virtualHostedStyle: true` and used with `directUpload` or a hand-called `presignPost`. Nobody using path-style addressing (the default) sees any change.

## See also

- [Static Asset Component](/extensions/components/static-asset/) - overview and quick start
- [Static Asset Component - Full Reference](/extensions/components/static-asset/api) - `controller.keyPrefix`, per-route `enabled`, recreate-metalink
- [Static Asset Component - Error Reference](/extensions/components/static-asset/errors) - every code, including the two new ones
- [Middlewares Reference](/references/base/middlewares) - body limit, the form body reader, the request spy
- [Storage Helpers - Full Reference](/extensions/helpers/storage/api) - `upload`, MIME table, name validation
- [Request Utility](/references/utilities/request) - `readFormBody`, `createContentDispositionHeader`
