---
title: A Direct Upload Lands a MetaLink Row Too
description: "upload-commit now writes the MetaLink row the ordinary upload writes, takes the same label query, and reports a row failure in the body rather than as a 500."
---

# Changelog - 2026-09-15

## `upload-commit` writes the MetaLink row

<Badge type="tip" text="Fix" />

The direct upload path wrote no `MetaLink` row. It does now, through the same builder the ordinary
upload uses.

The two paths had disagreed since `directUpload` shipped: a client reading `metaLink` off the
response for an `id` and a `link` got `undefined`, and rendered an empty state with no error.

```json
{
  "bucket": { "name": "uploads" },
  "object": { "key": "9be0.../clip.mp4" },
  "link": "/assets/objects/9be0.../clip.mp4",
  "metaLink": { "data": { "id": "...", "link": "...", "size": 8123456 } }
}
```

## The labels ride the query

```
POST {base}/upload-commit?principalType=Product&principalId=42&variant=thumbnail
```

The same three the ordinary upload takes. Not on the commit token: it is an HMAC over
`{ bucket, key, expiresAt }` and carries no business fields by design. Omit them and the row is
still written, unlabelled.

## A row failure is a 200

```json
{ "metaLink": { "error": "META_LINK_CREATE_FAILED" } }
```

By then the copy has happened and the pending object is gone - the object **is** committed. A 500
would send the caller back with a token whose source no longer exists. The driver's text stays in
the log; the response carries a code.

## No unique constraint on `(bucketName, objectName)`

Considered and dropped. Counted on a real table: of 1038 objects with more than one row, **1027 were
one image attached to a product and to its variants**. A row is one (object, owner) pairing, so the
pair is indexed and deliberately not unique - `BaseMetaLinkModel` now says so.

That leaves `recreate-metalink` doing `findOne` then `create` non-atomically, on purpose: without a
unique index two concurrent transactions both read "no row" and both insert. `FOR UPDATE` locks
nothing that does not exist, and `ON CONFLICT` needs the index the data forbids. Closing it takes
`pg_advisory_xact_lock` - Postgres-only, and the application's.

## Who is affected

Nothing to change. The row appears; add the query labels to attribute it. `metaLink` is now in the
OpenAPI schema, as `{ data }` or `{ error }`.

**Files:**

- [`packages/core-server/src/components/static-asset/controller/factory.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/controller/factory.ts) - `createMetaLinkRow`
- [`packages/core-server/src/components/static-asset/models/base.model.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/core-server/src/components/static-asset/models/base.model.ts) - `BaseMetaLinkModel`
