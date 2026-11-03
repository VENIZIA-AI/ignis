---
title: TypesenseConnector.findDocument returns null for a missing document
description: "findDocument (and document.find) answers null where getDocument throws 404 not_found, the way getAlias does."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-03

## TypesenseConnector.findDocument returns null for a missing document

<Badge type="tip" text="New Feature" />

**In one line.** Use `findDocument` when a missing document is an answer, not an error.

## What changed

- **`findDocument({ collection, id })` returns the document or `null`.** A missing document (the engine's 404) is `null`; every other failure throws as `getDocument` does (a 400 is a 400, a 5xx or a transport failure is the 503).
- **A missing collection is `null` too.** The engine answers a 404 for both, so a mistyped collection name looks like a missing document.
- **`document.find`** is the same call on the document facade of the connector.
- **`getDocument` is unchanged.** It still throws `404 core.search_engine.not_found`.

## Who is affected

- **Code that wrapped `getDocument` in a try/catch only to read a 404 as "not there".** It can call `findDocument`.
- **Everyone else.** No action needed.

## Details

```typescript
const product = await connector.findDocument<IProduct>({ collection: 'products', id: '42' });

if (product === null) {
  // not indexed yet
}
```
