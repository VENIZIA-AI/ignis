---
title: A Presigned PUT Can Carry a Tag Set and a Size
description: "presignPut takes tagging and contentLength, both inside the signature, so a browser can write an object that is already labelled."
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-09-15

## `presignPut` takes `tagging` and `contentLength`

<Badge type="tip" text="Feature" />

**In one line.** Two optional fields, both signed, so a browser can write an object that is already labelled.

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

## What changed

- **Signed, not merely sent.** A tag that is merely sent is ignored by S3. Signed, the tag exists the moment the object does.
- **The client must send both back unchanged.** Omit the fields and the URL signs `host` alone, as before.
- **`contentLength` is an exact byte count, never a ceiling.** A retry at another size is a bare 403. For a ceiling, use `presignPost` and its `content-length-range`.

## Who is affected

- **Everyone.** Nobody breaks. The fields are additive and optional.
- **You hand-rolled SigV4 to sign `x-amz-tagging` or `content-length`.** This replaces it.
