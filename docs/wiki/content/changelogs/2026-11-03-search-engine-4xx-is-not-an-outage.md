---
title: A search engine 4xx is no longer reported as an outage
description: "The Typesense and Meilisearch connectors map an engine 400, 404, 409 or 422 to the matching 4xx error with the engine message kept, and keep the 503 for transport failures, 5xx, auth and rate limits."
packages: ['@venizia/ignis-connectors', '@venizia/ignis']
---

# Changelog - 2026-11-03

## A search engine 4xx is no longer reported as an outage

<Badge type="warning" text="Behavior Change" />

**In one line.** When the search engine rejects your request with a 400, 404, 409 or 422, the connector now throws that 4xx with the engine's message, where it threw a 503 "dependency unavailable"; retry code no longer retries a request that can never succeed.

## What changed

- **An engine 4xx is the caller's mistake and is thrown as one.** `updateDocument({ patch: {} })` against Typesense answered 400, and the connector reported a 503 with the 400 only in `cause`. The same input now throws a 400 whose message carries the engine's text.
  - **400 and 422** throw an error with that status and the engine message. There is no new error code.
  - **404** that the verb does not tolerate throws `404 core.search_engine.not_found`. Verbs that already treated a missing document or collection as a result (`deleteDocument`, `getAlias`, `search` on an unprovisioned collection, ...) are unchanged.
  - **409** throws `409 core.search_engine.already_exists`.
- **The 503 stays for failures that are not the caller's fault.** A connect or timeout failure (no HTTP status), a 5xx, a 401 or 403 (the server's own credentials), a 408 and a 429 still throw the sanitized `503 core.search_engine.dependency_unavailable`, without the engine text.
- **Same rule for both engines and for imports.** Typesense and Meilisearch share the mapping. An import batch the engine rejects with a 4xx throws that 4xx and still carries `details: { totalCount, processedCount, ... }`, so you can resume.
- **Typesense import does not throw `ImportError`.** `importDocuments` passes `throwOnFail: false` to `typesense-js`, so a row the engine rejects comes back in the result (`count.fail` and `responses`), where `typesense-js` called directly throws `ImportError` by default. This was already so; it is written down here because code that relied on the throw must read `count.fail`.

## Who is affected

- **Code or alerts that match the 503 for a request the engine rejects.** It now gets the 4xx, so alerts on `dependency_unavailable` stop firing for caller mistakes, and a 4xx handler or a retry policy that retries only 5xx now sees the right class.
- **Retry code that retried every search error.** It should retry only 5xx and 503 now; a 400, 404, 409 or 422 will fail the same way on a second try.
- **Teams that relied on `ImportError` from a Typesense import.** Check `count.fail` of the result instead.
- **Everyone else.** No action needed.

## Breaking changes

> [!WARNING]
> A call the engine rejects with a 400, 404, 409 or 422 throws a different status than before.

**Before:**

```typescript
try {
  await connector.document.update({ collection: 'products', id: '1', document: {} });
} catch (error) {
  // 503 core.search_engine.dependency_unavailable, with the engine's 400 only in `cause`
}
```

**After:**

```typescript
try {
  await connector.document.update({ collection: 'products', id: '1', document: {} });
} catch (error) {
  // 400, message "[updateDocument] The search engine rejected the request. <engine text>"
}
```
