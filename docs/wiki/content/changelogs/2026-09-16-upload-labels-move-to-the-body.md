---
title: Upload Labels Move to the Body
description: "principalType, principalId, variant, sequence and folderPath leave the query string. An identifier in a URL lands in every access log between the client and here."
---

# Changelog - 2026-09-16

## The labels move to the body

<Badge type="warning" text="Deprecation" />

**Before**

```
POST {base}/objects?principalType=Product&principalId=42&folderPath=photos/2024
```

**After** - form fields beside the file:

```js
const form = new FormData();
form.append('files', file);
form.append('principalType', 'Product');
form.append('principalId', '42');
form.append('folderPath', 'photos/2024');
```

And on `upload-commit`, beside the token in the JSON body:

```json
{ "commitToken": "...", "principalType": "Product", "principalId": "42", "sequence": 3 }
```

A query string is logged everywhere it passes - the access log, the proxy, browser history. An
identifier that describes the payload belongs with the payload.

The cost, stated: the labels are unreadable until the body is parsed, so `folderPath` is validated
after parsing rather than before. Nothing routes or authorizes on these today; if that changes, it
changes here.

## `parseMultipartBody` returns fields too

<Badge type="danger" text="Breaking" />

```ts
const { files, fields } = await parseMultipartBody({ context });
```

It returned `IParsedFile[]` and dropped every non-file entry on the floor - a form field posted with
an upload simply vanished. It now returns `{ files, fields }`.

```ts
// Before
const files = await parseMultipartBody({ context });
// After
const { files } = await parseMultipartBody({ context });
```

## The query still works, and says so

A label left in the query is **still read**. The body wins when both carry one, so a caller that has
migrated is never affected by a stale parameter in a URL.

```
Label(s) read from the query string - they belong in the form body, and this fallback will go |
names: principalId, variant
```

Refusing to read it would have been clean on paper and a broken upload in practice. A client whose
form library only emits `append(key, value, filename)` - the three-argument form, which requires a
Blob - **cannot put a text field in a multipart body at all**. It throws. That is worse than the
unlabelled row the move was meant to prevent, so the fallback stays until consumers have moved.

`createMetaLink` still receives them as `query`. The name is historical; the values arrive in the
body.

## Who is affected

**You upload through `{base}/objects`.** Nothing breaks today. Move the labels into the form when
you can - the warning names the ones still coming from the query.

**You call `upload-commit` with labels.** Same: move them into the JSON body, at your pace.

**You call `parseMultipartBody` directly.** Destructure `files`.

**Files:**

- [`packages/helpers/src/utilities/request.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/request.utility.ts) - `parseMultipartBody`, `IParsedMultipartBody`
- [`packages/core-server/src/components/static-asset/controller/base.definition.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/controller/base.definition.ts) - `uploadLabels`
