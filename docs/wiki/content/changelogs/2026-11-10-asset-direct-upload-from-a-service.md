---
title: Commit a direct upload from your own service
description: "The static-asset direct upload now has a class you inject into a service, so an app can commit an upload while it saves its own record instead of making a second HTTP call."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-10

## Commit a direct upload from your own service

<Badge type="tip" text="New Feature" />

**In one line.** `AssetDirectUpload` runs the `upload-policy` and `upload-commit` logic without a request, so a service can commit an upload in the same call that saves its record.

## What changed

- **`AssetDirectUpload`.** `issuePolicies({ files })` and `commit({ commitToken, labels })` do what the two routes do. `commit` answers `{ bucket, object, link, metaLink? }`.
- **One instance per entry, bound for you.** Every static-asset entry that sets `controller.directUpload` gets an instance at `StaticAssetComponentBindingKeys.directUpload({ name })`, where `name` is the entry's key in the options object. The routes run that same instance.
- **The routes behave as before.** Paths, schemas, responses and error codes are unchanged.

## Who is affected

- **Apps that copied the route code to commit from a service.** Replace the copy with an injected `AssetDirectUpload`. Code that calls it directly skips `directUpload.authorize`, so decide who may ask for a policy yourself.
- **Everyone else.** No action needed.

## Details

```typescript
@inject({ key: StaticAssetComponentBindingKeys.directUpload({ name: 'assets' }) })
private assetUpload: AssetDirectUpload,

const committed = await this.assetUpload.commit({ commitToken, labels: { principalType: 'Product', principalId: sku } });
```

See [Direct upload](/extensions/components/static-asset/direct-upload#use-from-a-service) for the full example.
