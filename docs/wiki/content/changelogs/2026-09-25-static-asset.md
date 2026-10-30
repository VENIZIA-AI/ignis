---
title: Static Asset - One Bucket, Direct Upload, MetaLink Changes and Storage Fixes
description: The static-asset component can serve one bucket, scope a shared bucket, take uploads straight to storage, order MetaLink rows and refresh them safely, with several breaking renames and fixes listed below.
packages: ['@venizia/ignis', '@venizia/ignis-kernel', '@venizia/ignis-helpers']
---

# Changelog - 2026-09-25

## Static asset component

<Badge type="tip" text="New Feature" /> <Badge type="tip" text="Feature" /> <Badge type="tip" text="Fix" /> <Badge type="tip" text="Enhancement" /> <Badge type="danger" text="Breaking" /> <Badge type="warning" text="Deprecation" /> <Badge type="warning" text="Behavior Change" /> <Badge type="info" text="Bug Fix" />

**In one line.** The static-asset component can serve one bucket, scope a shared bucket, accept browser uploads straight to storage and keep MetaLink rows ordered and fresh, and a few names, codes and shapes changed on the way.

## What changed

### Routes and options

- **`controller.bucket`** pins one bucket (a string or a resolver) and removes `/buckets/{bucketName}` from `upload`, `listObjects`, `getObjectByName`, `downloadObjectByName`, `deleteObject` and `recreateMetaLink`, and from the generated `link`. `getBuckets`, `getBucketByName`, `createBucket` and `deleteBucket` are not registered and answer 404. `buildAssetDefinitions({ hasConfiguredBucket, rawObjectPath })` builds the route configs; `StaticAssetDefinitions` keeps its value.
- **`controller.rawObjectPath: true`** serves `photos/2024/f.jpg` raw as well as percent-encoded, so stored links keep working. Default is `false`, which keeps today's paths. Validation, `maxFolderDepth` included, runs on the joined path. A catch-all matches everything under its prefix and built-in routes register first, so use `defineRoutesBefore` to put your own literal route (such as `/objects/i18n`) ahead of them.
- **`controller.keyPrefix`** confines every route of a controller to a prefix, so two controllers or tenants can share a bucket. A key outside it answers `404 core.storage.object_not_found` before any storage call. `listObjects` narrows a wider `prefix` and returns `[]` for a disjoint one. `upload` places its default key under the prefix; a `resolveObjectName` or `extra.normalizeNameFn` key outside it is refused with `400 core.static_asset.object_key_out_of_scope`. Direct upload's pending key and policy carry the prefix, and the commit re-checks it. `maxFolderDepth` counts below the prefix. With neither hook set, the default naming keeps the original file name to one segment, so a `/` in it is `400 [upload] Invalid original file name`. `keyPrefix` requires `controller.bucket` and throws at registration without it. `defineRoutesBefore` and `defineExtraRoutes` are not scoped.
- **`routes.<key>.enabled: false`** drops a built-in route entirely (no path, no OpenAPI entry), the same switch the CRUD controller factory uses.
- **`resolveObjectName`** decides the stored object name; it is offered the original name, the default name IGNIS would have written, and the bucket. The result is still checked with `isValidPath()`. **`defineExtraRoutes`** registers your routes after the built-in ones, which win a path collision. Both pass through the component config.
- **`maxBytes`** (`extra.maxBytes`) caps the upload route. Over the ceiling answers `413` with `core.static_asset.upload_too_large`. The declared `content-length` is checked before the body is spooled, then each file's `buffer.length` after parsing. The check runs after your own `routes.upload.middleware`, so your own size guard still answers first. It only bounds a declared `content-length`; a chunked request skips it, so pair it with `configs.middlewares.bodyLimit`.
- **`presignPut`** accepts an optional `contentType` and signs it, so the URL holder cannot choose the stored type. Omit it and the URL signs what it signed before.
- **`getBaseWhere`** (in `@venizia/ignis-kernel`): override `ReadableCrudController.getBaseWhere({ context })` to scope every read verb of a CRUD controller, replacing overrides of `find` and `count`. Each verb ANDs it into the request filter; `findById` goes through `repository.findOne`, and an id outside the scope answers `{ count: 0, data: null }`. It is public, not protected. Write the scope to fail closed. Only read verbs call it; `create`, `updateById`, `deleteById` and `deleteBy` do not.

```typescript
class OrderController extends ControllerFactory.defineCrudController({ ... }) {
  override async getBaseWhere(opts: { context: TRouteContext }) {
    const tenantId = opts.context.req.header('x-tenant-id');
    return { tenantId: tenantId ?? null };
  }
}
```

### Direct upload

Configure `controller.directUpload` and two routes appear, so the bytes never pass through IGNIS:

```
POST {base}/upload-policy   { files: [{ fileName, contentType, size }] }
                         -> [{ postURL, formData, objectName, commitToken, expiresAt }]

POST {base}/upload-commit   { commitToken } -> the object at its final key
```

```typescript
directUpload: {
  authorize: ({ context }) => Boolean(context.get('currentUser')),
  secretKey: process.env.APP_ENV_UPLOAD_SECRET,
  maxBytes: 100 * 1024 * 1024,
}
```

- **`authorize` is required.** `controller.bucket` must also be set.
- **A POST policy, not a presigned PUT,** because only a policy can express a ceiling (`content-length-range`).
- **The commit is claimed with a signed token, never a key.** It is verified before any storage call, so a forged token costs nothing to reject and reveals nothing. The token carries no business fields.
- **The final key is never inside a policy.** A policy authorizes only `pending/<generated>`; commit copies server-side to the final key and removes the temporary object, so content cannot be replaced after commit. If removing the temporary object fails, the commit still succeeds and logs a warning; use a lifecycle rule on the pending prefix. `onCommit` runs before the copy.
- **`upload-commit` writes a MetaLink row,** through the same builder as the ordinary upload, and takes the same labels. A row failure answers 200 with `{ "metaLink": { "error": "META_LINK_CREATE_FAILED" } }`, because the object is already committed. `metaLink` (`{ data }` or `{ error }`) is in the OpenAPI schema.
- **Not built:** multipart or resumable upload, and malware scanning (`onCommit` is the seam).

### MetaLink

- **Your own table.** `TStaticAssetsComponentOptions` and `StaticAssetComponent` take the MetaLink table as a type argument, constrained by `TMetaLinkCompatibleSchema` (any table whose row has the MetaLink fields). A table in another Postgres schema or with another name now type-checks, so drop any `as unknown as TMetaLinkConfig['model']` cast. A table missing a field is still refused. A column you add yourself must be nullable or have a default. `createMetaLink` is typed as returning `{ count: number; data: TTableObject<Schema> }`.
- **`PUT .../meta-links/{objectName}` refreshes every row** for that object. It updates `mimetype`, `size`, `etag` and `isSynced: true`, and leaves each row's `storageType`, `variant`, `principalType`, `principalId` and `sequence` alone. It creates a row (through your `createMetaLink` hook and the upload builder) only when none existed. The response gains `action` (`'refreshed' | 'created'`), `count` and `metaLinks`; `success` and `metaLink` (now `metaLinks[0]`) keep their shape.
- **With a `metaLink.createMetaLink` hook,** a refresh leaves `link` and `metadata` alone, so your enrichment survives. Without a hook, it refreshes `link` and the stat columns, then merges each row's `metadata` with the stat's (the stat's keys win). That merge is a read-then-write, so a concurrent write to the row's `metadata` can be lost.
- **No unique constraint on `(bucketName, objectName)`,** on purpose: one image can belong to a product and its variants. Refresh-then-create is therefore not atomic, and two concurrent calls on an object with no row can both create one.
- **`MetaLink.sequence`** (`integer().notNull().default(0)`) orders the rows of one principal. The caller supplies it as a form field (`sequence`), or in the JSON body on `upload-commit`. The component never derives it, because reading a maximum and writing max+1 is not atomic. Always tiebreak on `created_at`:

```sql
SELECT link FROM "MetaLink"
 WHERE principal_type = 'ProductVariant' AND principal_id = $1
 ORDER BY sequence, created_at;
```

### Fixes

- **`configs.middlewares.bodyLimit` is applied.** It was a type nothing read. It is installed right after the request id, ahead of every other middleware. Over the limit answers `413 core.request.body_too_large` (or your own `onError`). A missing `enable` still applies the limit. A `maxSize` that is not a finite non-negative number throws at boot. `compress`, `cors`, `csrf` and `ipRestriction` are still types only. Raise `configs.server.maxRequestBodySize` above `bodyLimit.maxSize`, or Bun's own limit answers first without the IGNIS envelope. Keep `bodyLimit.path` off a route that streams a body, because the limiter buffers the whole body.
- **The request spy parses forms only in development.** Elsewhere it parses only `application/json`. A route declaring `multipart/form-data` or `application/x-www-form-urlencoded` gets a `formBodyReader` middleware that maps a malformed form to `400 core.request.body_malformed`. `readFormBody({ req })` is new in `@venizia/ignis-helpers` (and `/core`); `parseMultipartBody` uses it.
- **The error envelope honors a thrown `HTTPException`'s `.status`.** A 4xx renders as its own status and message instead of `500 core.system_error`; malformed JSON on any JSON-body route is now `400 Malformed JSON in request body`. A 5xx stays an unexpected `500` with no message for the client. A raw runtime error such as a `TypeError` is still `500`.
- **Non-ASCII and unusual file names work.** `BunS3Helper.copyObject` encodes the copy source, so a direct-upload commit with a name like `Kiểm kê.xlsx` no longer fails, and keys with `+`, `%`, `?` or `#` no longer risk copying the wrong object. When a naming hook decides the key (`normalizeNameFn`, `resolveObjectName`, or `controller.keyPrefix`), names with `& # ! [ ] { } ;` or a leading dot are accepted; control characters, an empty name and more than 255 characters are still refused. Every key in a batch is checked before the first write. `MinioHelper` RFC 2047-encodes `originalName` and `normalizeName` metadata outside printable ASCII. `createContentDispositionHeader` keeps the real name in `filename*`, replacing control, bidi-override and other format characters with `_` except the zero-width joiner and non-joiner; the `filename` fallback stays printable ASCII.
- **Office types resolve in `ContentTypeTable`:** `.xlsx`, `.xls`, `.docx`, `.doc`, `.pptx`, `.ppt`, `.odt`, `.ods`. This changes the recorded MIME type (MetaLink `mimetype`, `DiskHelper.getStat`, `writeStream`'s default, `AssetIngest`). The served `Content-Type` is still `application/octet-stream` with `Content-Disposition: attachment`.
- **`presignPost` with `virtualHostedStyle: true`** now returns `https://<bucket>.<host>` instead of repeating the bucket in the path. Path-style is unchanged.

## Who is affected

- **Applications that copied the asset controller to change URLs, names or routes.** Delete the copy and use the options above.
- **Applications that set `bucket`.** Move bucket creation out of the HTTP layer; those four routes are gone.
- **Applications that named `TResolveObjectName`, branched on `upload-policy`'s 400, called `/downloads/...`, call `parseMultipartBody` directly, or keep their own MetaLink table.** See Breaking changes.
- **Applications that assign `configs.middlewares.bodyLimit` in `staticConfigure()` or a later hook.** It is read inside `registerDefaultMiddlewares()`, before `staticConfigure()`. Pass `middlewares` through the constructor `config`; a later assignment has no effect and the application refuses to boot when it detects the change.
- **Code that calls `context.req.formData()` itself, ahead of any framework reader.** A malformed body there is a `500` in production. Call `readFormBody({ req: context.req })` instead; it returns the same cached `FormData`.
- **Code that matched `statusCode: 500` for a thrown `HTTPException`,** or the old text `[upload] Invalid original file name` for a name copied into a generated key (now `[upload] Invalid normalized object name | name: ...`). Match the new status or text.
- **Callers of the recreate route on a table with several rows per object.** Read `metaLinks`. A refresh now keeps each row's own `storageType`.
- **Everyone else.** No action needed; the new options are optional and unset keeps today's behavior.

## Breaking changes

> [!WARNING]
> The renames, shapes and status codes below can stop a build or change what a client sees.

| Before | After |
|---|---|
| `TResolveObjectName` | `TObjectNameResolver` |
| `controller.bucket?: string \| (() => string)` | `controller.bucket?: TValueOrAsyncResolver<string>` |
| `metaLink.model: typeof BaseRelationalEntity<Schema>` | `metaLink.model: TValueOrAsyncResolver<...>` |
| `metaLink.repository: DefaultCRUDRepository<Schema>` | `metaLink.repository: TValueOrAsyncResolver<...>` |
| `GET {base}/downloads/{objectName}` | `GET {base}/download/{objectName}` |
| `core.static_asset.upload_too_large` answers `400` (policy path only) | answers `413` on both upload paths |
| `const files = await parseMultipartBody({ context })` | `const { files, fields } = await parseMultipartBody({ context })` |

- **Resolvers.** A resolver is read when the value is used, so a repository can be named before the container binds it and a bucket can come from an environment variable per request. A plain value still works, and a class is a value, never a factory. The route table type is now also exported as `TStaticAssetRoutes`.
- **Download route.** A client on the old path gets a `404` at runtime, with no compile error. If you are on `0.2.0-31`, drop the `s`. To pin the path yourself, an override wins over both spellings: `routes: { downloadObjectByName: { path: '/download/{objectName}{.+}' } }`. The route key `downloadObjectByName` is unchanged. This reverses one row of the [2026-09-08 rename](./2026-09-08-storage-hardening-and-bun-s3-only).
- **Too-large code.** If you branch on the status from `upload-policy`, branch on `413`.
- **`parseMultipartBody`** used to drop every non-file field. It now returns `{ files, fields }`.
- **`MetaLink.sequence`.** On the shipped MetaLink table the column appears and there is nothing to write. With your own table, `TMetaLinkCompatibleSchema` fails to compile until you add it. Migrate both together:

```sql
ALTER TABLE "MetaLink" ADD COLUMN sequence integer NOT NULL DEFAULT 0;
CREATE INDEX "IDX_MetaLink_principal_sequence"
    ON "MetaLink" (principal_type, principal_id, sequence);
```

## Upload labels move to the body

`principalType`, `principalId`, `variant`, `sequence` and `folderPath` leave the query string, because a query string lands in every access log on the way. Send them as form fields beside the file, and on `upload-commit` in the JSON body beside the token.

**Before**

```
POST {base}/objects?principalType=Product&principalId=42&folderPath=photos/2024
```

**After**

```js
const form = new FormData();
form.append('files', file);
form.append('principalType', 'Product');
form.append('principalId', '42');
form.append('folderPath', 'photos/2024');
```

```json
{ "commitToken": "...", "principalType": "Product", "principalId": "42", "sequence": 3 }
```

- **The query still works for now.** A label left in the query is read, the body wins when both carry one, and a warning names the labels still coming from the query. The fallback will go. It stays because a form library that only emits the three-argument `append(key, value, filename)` cannot put a text field in a multipart body. Move your labels when you can.
- **`folderPath` is validated after the body is parsed,** not before.
- **`createMetaLink` still receives the labels as `query`;** the name is historical.
- Omit the labels and the row is still written, unlabelled.

## Details

- Reference: [Static Asset Component](/extensions/components/static-asset/), [Full Reference](/extensions/components/static-asset/api), [Error Reference](/extensions/components/static-asset/errors), [Middlewares](/references/base/middlewares), [Storage Helpers](/extensions/helpers/storage/api), [Request Utility](/references/utilities/request).
