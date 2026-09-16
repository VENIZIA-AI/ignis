---
title: Upload Labels Move to the Body
description: "principalType, principalId, variant, sequence and folderPath leave the query string. An identifier in a URL lands in every access log between the client and here."
---

# Changelog - 2026-09-16

## The labels leave the URL

<Badge type="danger" text="Breaking" />

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

## A stale caller is told, not ignored

The server ignores a label left in the query, so this change would otherwise break nothing loudly -
the row just lands unlabelled. The upload route now names every stale label in a warning:

```
Ignoring label(s) in the query string - they travel in the form body now | names: principalId, variant
```

`createMetaLink` still receives them as `query`. The name is historical; the values arrive in the
body.

## Who is affected

**You upload through `{base}/objects`.** Move the labels from the query string into the form.

**You call `upload-commit` with labels.** Move them into the JSON body.

**You call `parseMultipartBody` directly.** Destructure `files`.

**Files:**

- [`packages/helpers/src/utilities/request.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/request.utility.ts) - `parseMultipartBody`, `IParsedMultipartBody`
- [`packages/core-server/src/components/static-asset/controller/base.definition.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/controller/base.definition.ts) - `uploadLabels`
