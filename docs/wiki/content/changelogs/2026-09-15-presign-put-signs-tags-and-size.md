---
title: A Presigned PUT Can Carry a Tag Set and a Size
description: "presignPut takes tagging and contentLength. Both go inside the signature, because a tag that is merely sent is a tag S3 ignores."
---

# Changelog - 2026-09-15

## `presignPut` takes `tagging` and `contentLength`

<Badge type="tip" text="Feature" />

Two optional fields, both **signed**, so a browser can write an object that is already labelled.

```ts
const url = await storage.presignPut({
  bucket: { name: 'imports' },
  object: { key: 'pending/q1-workbook.csv' },
  tagging: { temp: 'true' },
  contentLength: file.size,
});

await fetch(url, {
  method: 'PUT',
  headers: { 'x-amz-tagging': 'temp=true', 'content-length': String(file.size) },
  body: file,
});
```

The client must send both back unchanged. Omit them and the URL signs `host` alone, as before.

## Why signed, not merely sent

A tag that is merely sent is a tag S3 **ignores** - so a step gated on reading it back fails with
nothing in the upload response to explain it. Signed, the tag exists the moment the object does.

`contentLength` carries the cost of that: a signature expresses equality and nothing else, so it is
an exact byte count, never a ceiling, and a retry at another size is a bare 403. For a ceiling, use
`presignPost` and its `content-length-range`.

## Underneath

Bun's `S3FilePresignOptions` has a method and an expiry and nothing else, so `presignPut` now builds
its own query-signed SigV4 URL. Verified against the signature **AWS publishes** for its documented
presigned-GET example - one wrong byte anywhere and it would not match.

## Who is affected

Nobody breaks. The fields are additive and optional; an `IStorageHelper` that ignores them still
compiles. If you hand-rolled SigV4 to sign `x-amz-tagging` or `content-length`, this replaces it.

**Files:**

- [`packages/helpers/src/modules/storage/bun-s3/utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/utility.ts) - `buildPresignedUrl`, `buildTaggingHeader`
- [`packages/helpers/src/modules/storage/bun-s3/helper.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/modules/storage/bun-s3/helper.ts) - `presignPut`
