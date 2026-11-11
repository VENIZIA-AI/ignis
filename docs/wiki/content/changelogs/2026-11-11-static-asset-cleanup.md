---
title: Deleting a static-asset object now waits for its MetaLink row, and unused helpers are removed
description: "deleteObject awaits the MetaLink delete so a failure is no longer swallowed. Two unused static helpers and two unused validators are removed, and a storage helper's default key function is public."
packages: ['@venizia/ignis-helpers', '@venizia/ignis', '@venizia/dev-configs']
---

# Changelog - 2026-11-11

## Deleting a static-asset object now waits for its MetaLink row, and unused helpers are removed

<Badge type="info" text="Bug Fix" /> <Badge type="warning" text="Breaking" />

**In one line.** A failure to delete the MetaLink row used to be swallowed, so the delete answered `200` and left a stale row; it now answers an error, and a retry removes the row.

## What changed

- **`deleteObject` awaits the MetaLink delete.** The object is removed first, and its removal is idempotent, so retrying after an error is safe.
- **Removed, unused.** `StaticAssetControllerFactory.findLabelsInQuery`, `StaticAssetControllerFactory.buildObjectLink`, and `isValid` and `SCHEME_SET` on `StaticAssetStorageTypes` and `MetaLinkRecreateActions`.
- **`buildObjectLink` moved.** Use `StaticAssetObjectLinkUtility.build`, now exported from `@venizia/ignis/static-asset`.
- **`BaseStorageHelper.normalizeObjectName` is public and static.** A naming hook can start from the key the helper would have written.
- **Header names.** `HTTP.Headers` gains `ACCEPT_RANGES` and `RANGE`.
- **OpenAPI.** The MetaLink row in a response is documented as an object, no longer as any value.

## Who is affected

- **Apps that delete objects with a MetaLink table.** A database failure now surfaces as an error on `DELETE`. Retry it.
- **Apps that call `findLabelsInQuery` or `buildObjectLink`, or override `normalizeObjectName`.** Rename as above.
- **Everyone else.** No action needed.

## Breaking changes

| Old | New |
|---|---|
| `StaticAssetControllerFactory.buildObjectLink(opts)` | `StaticAssetObjectLinkUtility.build(opts)` |
| `StaticAssetControllerFactory.findLabelsInQuery(opts)` | removed: labels are refused in the query by the routes |
| `StaticAssetStorageTypes.isValid`, `.SCHEME_SET` | removed |
| `MetaLinkRecreateActions.isValid`, `.SCHEME_SET` | removed |
| `protected normalizeObjectName(opts)` on a storage helper | `BaseStorageHelper.normalizeObjectName(opts)`, public and static |
