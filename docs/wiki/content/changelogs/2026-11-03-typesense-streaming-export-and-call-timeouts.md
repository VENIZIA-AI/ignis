---
title: The Typesense connector streams exports, excludes fields and takes a timeout per call
description: "TypesenseConnector.streamDocuments reads an export as NDJSON lines with bounded memory, exportDocuments takes excludeFields, a call can set timeoutMs, and updateByFilter refuses an empty document."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-03

## The Typesense connector streams exports, excludes fields and takes a timeout per call

<Badge type="tip" text="New Feature" /> <Badge type="warning" text="Behavior Change" /> <Badge type="warning" text="Breaking Change" />

**In one line.** Export a collection of any size to disk with `streamDocuments`, drop fields with `excludeFields`, and give one export, import or schema call its own timeout.

## What changed

- **`streamDocuments` streams an export.** It is an async iterable of NDJSON lines, one document per line without its newline, and memory stays at one chunk and one partial line. `exportDocuments` is unchanged: it still returns one string, which fails past the string limit (on Bun a string holds at most 2^31 - 1 characters, about 2 GiB of ASCII text).
- **`excludeFields` on export.** `exportDocuments` and `streamDocuments` take `filterBy`, `includeFields` and the new `excludeFields` (sent as `exclude_fields`). `search()` already took `excludeFields`.
- **`timeoutMs` per call.** `exportDocuments`, `streamDocuments`, `importDocuments`, `getCollection`, `createCollection` and `patchCollectionSchema` take `timeoutMs`, a positive integer of milliseconds that overrides `connectionTimeoutSeconds` (5 s by default) for that call: the wait for the engine's answer and then the longest silence on the connection, not a deadline for the whole transfer. Anything else is refused with a 400 before a request. The connector runs such a call on a second client, because `typesense-js` has no timeout per call.
- **`createClient` connector option.** When you give the connector your own `client`, also pass `createClient({ connectionTimeoutSeconds })`; a call with `timeoutMs` is refused with a 400 without it. Without an injected client the connector builds the call client from `nodes`, `apiKey` and `numRetries`.
- **`ITypesenseClientLike` has a new required member.** `documents()` of the client the connector accepts now needs `exportStream(options?)`, which resolves to an async iterable of text or bytes (the `Readable` that `typesense-js` returns is one). The real `Client` already has it; only a client you wrote yourself, such as a test fake or a wrapper, must add it.
- **A stream whose reader pauses falls silent.** If you import each batch while you read the stream, the import must finish within the stream's `timeoutMs`; otherwise write the stream to a file first and import from it.
- **`updateByFilter` refuses an empty `document`.** It throws a 400 before it calls the engine, which answered an empty patch with a 400 of its own.

## Who is affected

- **Code that exports a large collection.** Use `streamDocuments`.
- **Code that calls `updateByFilter` with `document: {}`.** It now throws `[updateByFilter] Empty document` where the engine's 400 came back through the error mapping.
- **Code that passes its own `client` to the connector (a test fake, a wrapper).** The client stops type-checking until `documents()` has `exportStream`; see Breaking changes.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> A hand-made `ITypesenseClientLike` without `documents().exportStream` fails the typecheck.

**Before:** the object a fake returns from `collections(name).documents()`:

```typescript
const documents = {
  export: async () => '',
  import: async () => [],
  // ...
};
```

**After:**

```typescript
const documents = {
  export: async () => '',
  import: async () => [],
  exportStream: async () => (async function* () {})(), // the NDJSON chunks; none here
  // ...
};
```

A call that sets `timeoutMs` on a connector built with this client also needs `createClient` (see above).

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
