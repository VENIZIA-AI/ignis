---
title: Commit a direct upload from your own service
description: "The static-asset direct upload now has a class you inject into a service, so an app can commit an upload while it saves its own record instead of making a second HTTP call."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-10

## Commit a direct upload from your own service

<Badge type="tip" text="New Feature" />

**In one line.** Two services run the `upload-policy` and `upload-commit` logic without a request, so a service can commit an upload in the same call that saves its record.

## What changed

- **`StaticAssetUploadPolicyService` and `StaticAssetUploadCommitService`.** `issuePolicies({ files })` and `commit({ commitToken, labels })` do what the two routes do. `commit` answers `{ bucket, object, link, metaLink? }`.
- **Bound for you.** Every static-asset entry that sets `controller.directUpload` and a `bucket` gets both at `StaticAssetBindingKeys.policyService({ name })` and `.commitService({ name })`, where `name` is the entry's key in the options object. The routes run those same instances.
- **The routes behave as before.** Paths, schemas, responses and error codes are unchanged.

## Who is affected

- **Apps that copied the route code to commit from a service.** Replace the copy with an injected `StaticAssetUploadCommitService`. Code that calls these services directly skips `directUpload.authorize`, and a commit token carries no owner, so check that the user may act on the key yourself.
- **Apps that call `StaticAssetControllerFactory.build` themselves with `directUpload`.** Pass `policyService` and `commitService` too; the controller no longer builds them.
- **Everyone else.** No action needed.

## Details

```typescript
@inject({ key: StaticAssetBindingKeys.commitService({ name: 'assets' }) })
private assetCommit: StaticAssetUploadCommitService,

const committed = await this.assetCommit.commit({ commitToken, labels: { principalType: 'Product', principalId: sku } });
```

See [Direct upload](/extensions/components/static-asset/direct-upload#use-from-a-service) for the full example, the ordering and the security note.
