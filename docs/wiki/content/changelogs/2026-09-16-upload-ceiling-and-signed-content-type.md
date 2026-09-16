---
title: An Upload Ceiling, and a Signed Content Type
description: "The UPLOAD route takes maxBytes, and presignPut can sign content-type. Both close a gap where the uploader, not the application, decided what was stored."
---

# Changelog - 2026-09-16

## The upload route takes `maxBytes`

<Badge type="tip" text="Feature" />

`directUpload` has always carried a ceiling. The ordinary upload route carried none - any size was
accepted.

```ts
options: {
  maxBytes: 10 * 1024 * 1024,
}
```

Over the ceiling answers **413** with `core.static_asset.upload_too_large`. Absent, nothing changes.

Two checks, on purpose. The request's `content-length` is read **before the body is spooled**, so a
500 MB upload is refused without first landing on disk. Then each parsed file is checked against
`buffer.length` - the authoritative one, because a multipart envelope is bigger than the files inside
it and a declared length is whatever the client declared.

## `presignPut` signs `content-type`

<Badge type="tip" text="Feature" />

```ts
await storage.presignPut({
  bucket: { name: 'imports' },
  object: { key: 'pending/report.csv' },
  contentType: 'application/octet-stream',
});
```

Unsigned, whoever holds the URL picks the type stored on the object - and the stored type is what a
browser later renders. `presignPost` already took `contentType`; now both presign paths agree.

Additive and optional. Omit it and the URL signs exactly what it signed before.

## One too-large code, now 413

<Badge type="danger" text="Breaking" />

`core.static_asset.upload_too_large` used to be the policy path's code and answered **400**. It is now
the code BOTH upload paths use, and it answers **413** - one condition, one branch for a client. A
second code for the ordinary route would have been the same condition wearing two names.

Branching on the 400 from `upload-policy`? Branch on 413.

## Who is affected

**You branch on the status from `upload-policy`.** 400 became 413.

Otherwise nothing breaks: `maxBytes` and `contentType` are opt-in, and the upload route still accepts
any size until you set a ceiling.

**Files:**

- [`packages/core-server/src/components/static-asset/controller/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/controller/factory.ts)
- [`packages/helpers/src/modules/storage/bun-s3/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/helper.ts) - `presignPut`
