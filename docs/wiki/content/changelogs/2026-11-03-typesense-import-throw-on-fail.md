---
title: TypesenseConnector.importDocuments can throw on a partial import
description: "importDocuments takes an opt-in throwOnFail: true that throws a 422 after the last batch when the engine rejected rows, with the counts and every per-row response; the default still returns them without throwing."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-03

## TypesenseConnector.importDocuments can throw on a partial import

<Badge type="tip" text="New Feature" />

**In one line.** Pass `throwOnFail: true` to `importDocuments` when a rejected row must stop your job; without it nothing changes.

## What changed

- **A new option, `throwOnFail`, default `false`.** The connector always passes `throwOnFail: false` to `typesense-js`, so a rejected row comes back in the result (`count.fail` and `responses`) and does not throw `ImportError` as `typesense-js` does by default. That is unchanged.
- **`throwOnFail: true` throws after the last batch.** Every batch runs first, so the batches that succeeded are written. The error is `422`, with `[importDocuments] N of M documents were rejected by the engine` in the message and `extra.details` = `{ totalCount, processedCount, successCount, failCount }`.
- **The per-row responses are on `error.responses`.** They hold the rejected documents and the engine's text, so they are not in `extra`, which goes on the wire.

## Who is affected

- **Code that relied on `ImportError` from `typesense-js`.** Pass `throwOnFail: true` and read `error.responses`, or keep reading `count.fail`.
- **Everyone else.** No action needed.

## Details

```typescript
try {
  await connector.importDocuments({ collection: 'products', documents, throwOnFail: true });
} catch (error) {
  // 422: error.extra.details has the counts, (error as { responses: unknown[] }).responses every per-row response
}
```
