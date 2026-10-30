---
title: "getHealth() Never Throws, Imports Keep Progress, and collectionExists() Never Lies About Absence"
description: "Meilisearch getHealth() now resolves { ok: false } instead of throwing, Typesense importDocuments() keeps partial progress on every failure, and Typesense collectionExists() no longer reports a failure as absence."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-08-30

## `getHealth()` Never Throws, Imports Keep Progress, and `collectionExists()` Never Lies About Absence

<Badge type="warning" text="Behavior Change" /> <Badge type="info" text="Bug Fix" />

**In one line.** Meilisearch and Typesense now both hold the `ISearchConnector` contract: a health probe never throws, every failed import carries partial progress, and a collection-existence check never reports absence for a failure it could not classify.

## What changed

- **Meilisearch `getHealth()` no longer throws.** A down engine used to make `ping()` throw instead of returning `false`. It now logs a warning and resolves `{ ok: false }`, like Typesense.
- **Typesense `importDocuments()` attaches progress to every failure.** An `ApplicationError` raised mid-import, a `409` conflict for example, now gets `{ totalCount, processedCount, successCount, failCount }` on its `extra.details`. It is the same error, with its own `statusCode` and `messageCode` intact.
- **Typesense `collectionExists()` surfaces a real failure instead of reporting absence.** Only a genuine not-found resolves `false`. Any other failure reaches the caller as a sanitized `503`.

## Who is affected

- **Anyone calling `ping()` or `getHealth()` as a liveness probe.** Both now resolve, never throw, on either engine. No action needed.
- **Anyone catching a Typesense `importDocuments()` failure and reading `error.extra.details`.** It is now populated for an already-shaped `ApplicationError` too.
- **Meilisearch imports.** Unaffected. They already merged progress onto both error shapes.
- **Anyone calling Typesense `collection.exists()`, directly or via `ensureCollection()`, while the engine is unreachable.** It now throws a sanitized `503` instead of resolving `false`. If your code relied on `ensureCollection()` quietly falling back to a create on any hiccup, it now surfaces the failure, because the collection was never confirmed absent.

## See also

- [Connectors Consistency Hardening](/changelogs/2026-07-11-connectors-consistency-hardening)
- [One Transport for Every Typesense Search](/changelogs/2026-08-07-typesense-multi-search-transport)
