---
title: Direct upload can validate a file before it is committed
description: "An app adds only a check and an issue schema; the component adds the upload-validate route, and commit refuses an invalid file."
packages: ['@venizia/ignis']
---

# Changelog - 2026-11-11

## Direct upload can validate a file before it is committed

<Badge type="tip" text="New Feature" />

**In one line.** Set `directUpload.validation` and the component adds `POST {base}/upload-validate`, which answers the problems your own check finds, while commit refuses a file that fails it.

## What changed

- **`directUpload.validation`.** Build it with `StaticAssetValidation.define({ issueSchema, handler })`. `issueSchema` is the shape of one issue, in your own terms (for an Excel import: sheet, row, column, code, message). The handler gets the pending object, the storage helper and the owner, and answers `{ isValid, issues }`; an issue of another shape fails type-checking.
- **`POST {base}/upload-validate`.** Registered only when `validation` is set, overridable and disableable through `routes.uploadValidate`. It takes `{ commitToken }`, calls `authorize` first, resolves the owner and answers your issues in your shape.
- **Commit validates first.** `commit` runs the same check and refuses an invalid file with `422` `core.static_asset.upload_invalid`, before `onCommit` and before any copy.
- **`validate({ token, owner? })`** on `StaticAssetUploadCommitService` is the same check from a service. With no `validation` configured it answers `{ isValid: true, issues: [] }`.
- **New error.** `core.static_asset.upload_invalid`, `422`.

## Who is affected

- **Apps that wrote their own validate route.** Replace it with `validation`; the component owns the route, the authorization and the refusal.
- **Everyone else.** No action needed: with no `validation`, nothing changes.

## Details

```typescript
const workbookValidation = StaticAssetValidation.define({
  issueSchema: z.object({ sheet: z.string(), row: z.number().int(), message: z.string() }),
  handler: async ({ bucket, object, owner, helper }) => {
    const issues = await checkWorkbook({ stream: await helper.getObject({ bucket, object }), owner });

    return { isValid: issues.length === 0, issues };
  },
});
```

See [Direct upload](/extensions/components/static-asset/direct-upload#validate-then-commit) for the full flow.
