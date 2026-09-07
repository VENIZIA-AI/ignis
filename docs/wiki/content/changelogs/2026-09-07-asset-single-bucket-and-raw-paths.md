---
title: The Asset Controller Serves One Bucket, And Raw Nested Object Paths
description: The static-asset controller takes two new options. `bucket` pins one bucket and takes it out of the URL. `rawObjectPath` serves `photos/2024/f.jpg` raw instead of percent-encoded. Both default to off, and off is today's behaviour byte for byte.
---

# Changelog - 2026-09-07

## The asset controller serves one bucket

<Badge type="tip" text="New Feature" />

**In one line.** Set `controller.bucket` and every object route drops `/buckets/{bucketName}`.

```typescript
controller: {
  name: 'AssetController',
  basePath: '/assets',
  bucket: () => process.env.ASSET_BUCKET ?? 'images',
},
```

`GET /assets/objects/photo.jpg` now streams the object. The function runs on every request, so the environment variable is read late, not at boot.

### The problem it solves

An application that serves one bucket does not want the bucket in its URLs. Adopting the framework shape meant rewriting every asset link, including the ones already stored in a database. One consumer wrote a 456-line controller instead.

### What changed

| Symbol | Change | Package |
|---|---|---|
| `controller.bucket` | New. `string` or `() => string`, read per request | core-server |
| `controller.rawObjectPath` | New. `boolean`, default `false` | core-server |
| `buildAssetDefinitions({ hasConfiguredBucket, rawObjectPath })` | New. Builds the ten route configs | core-server |
| `StaticAssetDefinitions` | Unchanged value, now the output of `buildAssetDefinitions({})` | core-server |

A configured bucket shortens `upload`, `listObjects`, `getObjectByName`, `downloadObjectByName`, `deleteObject` and `recreateMetaLink`. Those routes also lose the `bucketName` path param.

`getBuckets`, `getBucketByName`, `createBucket` and `deleteBucket` are **not registered** when a bucket is configured. They answer 404. A single-bucket application has no reason to expose bucket creation or deletion.

The generated `link` follows the same shape, in the upload response and in the `PUT .../meta-links/...` route.

## Raw nested object paths

<Badge type="tip" text="New Feature" />

**In one line.** Set `rawObjectPath: true` and a folder path resolves without percent-encoding.

```typescript
controller: { name: 'AssetController', basePath: '/assets', rawObjectPath: true },
```

### The problem it solves

<code v-pre>{objectName}</code> is one path segment. A folder path only resolved encoded, as `photos%2F2024%2Ff.jpg`; the raw form answered 404. Links stored years ago carry the raw form.

### What changed

The object segment becomes the <code v-pre>{objectName}{.+}</code> catch-all. Both forms now resolve, so no existing link breaks. Every validation still runs on the joined path, `maxFolderDepth` included.

### The four combinations

| `bucket` | `rawObjectPath` | The object route |
|---|---|---|
| unset | `false` | <code v-pre>/assets/buckets/images/objects/photos%2F2024%2Ff.jpg</code> |
| unset | `true` | <code v-pre>/assets/buckets/images/objects/photos/2024/f.jpg</code> |
| `'images'` | `false` | <code v-pre>/assets/objects/photos%2F2024%2Ff.jpg</code> |
| `'images'` | `true` | <code v-pre>/assets/objects/photos/2024/f.jpg</code> |

#A catch-all matches everything under its prefix, and built-in routes register first. `defineRoutesBefore` registers your own routes ahead of them, so a literal path such as `/objects/i18n` still wins. `defineExtraRoutes` keeps registering after the built-ins.

## Who is affected

- **Applications that copied the asset controller to change its URLs.** Delete the copy and set the two options.
- **Applications that set `bucket`.** Move bucket creation out of the HTTP layer. Those four routes are gone.
- **Everyone else.** No action needed. Both options are optional, and unset means today's paths, params, links and status codes.

## Details

- Reference: [Static Asset Component](/extensions/components/static-asset/api).
