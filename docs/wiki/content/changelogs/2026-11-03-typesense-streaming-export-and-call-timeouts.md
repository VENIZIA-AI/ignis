---
title: The Typesense connector streams exports, excludes fields and takes a timeout per call
description: "TypesenseConnector.streamDocuments reads an export as NDJSON lines with bounded memory, exportDocuments takes excludeFields, a call can set timeoutMs, and updateByFilter refuses an empty document."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-03

## The Typesense connector streams exports, excludes fields and takes a timeout per call

<Badge type="tip" text="New Feature" /> <Badge type="warning" text="Behavior Change" />

**In one line.** Export a collection of any size to disk with `streamDocuments`, drop fields with `excludeFields`, and give one export, import or schema call its own timeout.

## What changed

- **`streamDocuments` streams an export.** It is an async iterable of NDJSON lines, one document per line without its newline, and memory stays at one chunk and one partial line. `exportDocuments` is unchanged: it still returns one string, which fails past the string limit (collections of a few GB).
- **`excludeFields` on export.** `exportDocuments` and `streamDocuments` take `filterBy`, `includeFields` and the new `excludeFields` (sent as `exclude_fields`). `search()` already took `excludeFields`.
- **`timeoutMs` per call.** `exportDocuments`, `streamDocuments`, `importDocuments`, `getCollection`, `createCollection` and `patchCollectionSchema` take `timeoutMs`, a positive integer of milliseconds that overrides `connectionTimeoutSeconds` (5 s by default) for that call: the wait for the engine's answer and then the longest silence on the connection, not a deadline for the whole transfer. Anything else is refused with a 400 before a request. The connector runs such a call on a second client, because `typesense-js` has no timeout per call.
- **`createClient` connector option.** When you give the connector your own `client`, also pass `createClient({ connectionTimeoutSeconds })`; a call with `timeoutMs` is refused with a 400 without it. Without an injected client the connector builds the call client from `nodes`, `apiKey` and `numRetries`.
- **A stream whose reader pauses falls silent.** If you import each batch while you read the stream, the import must finish within the stream's `timeoutMs`; otherwise write the stream to a file first and import from it.
- **`updateByFilter` refuses an empty `document`.** It throws a 400 before it calls the engine, which answered an empty patch with a 400 of its own.

## Who is affected

- **Code that exports a large collection.** Use `streamDocuments`.
- **Code that calls `updateByFilter` with `document: {}`.** It now throws `[updateByFilter] Empty document` where the engine's 400 came back through the error mapping.
- **Everyone else.** No action needed.

## Details

```typescript
const connector = dataSource.getConnector();
const file = Bun.file('products.ndjson').writer();

for await (const line of connector.streamDocuments({
  collection: 'products',
  excludeFields: ['embedding'],
  timeoutMs: 30 * 60 * 1000,
})) {
  file.write(`${line}\n`);
}

await file.end();
```
