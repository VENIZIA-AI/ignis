---
title: "getHealth() Never Throws, Imports Keep Progress, and collectionExists() Never Lies About Absence"
description: "Meilisearch's health probe used to throw instead of resolving { ok: false }, breaking ping(). Typesense's importDocuments() dropped partial progress on an already-shaped error, and its collectionExists() reported every failure as absence. All three now hold the ISearchConnector contract."
---

# Changelog - 2026-08-30

## `getHealth()` Never Throws, Imports Keep Progress, and `collectionExists()` Never Lies About Absence

<Badge type="warning" text="Behavior Change" /> <Badge type="info" text="Bug Fix" />

**In one line.** Meilisearch and Typesense now both hold the `ISearchConnector` contract they always claimed to: a health probe never throws, every failed import carries partial progress, and a collection-existence check never reports absence for a failure it could not classify.

## The problem it solves

`ISearchConnector.getHealth()` promises `Promise<{ ok: boolean }>` - a resolved value, never a rejection. `BaseSearchConnector.ping()` trusts that promise: it just reads `.ok` off the result. Meilisearch's `getHealth()` routed its probe through the connector's generic engine-call wrapper, which turns a failure into a sanitized `503`. A down engine made `ping()` throw instead of returning `false`.

Typesense's `importDocuments()` had its own comment promising to "attach partial progress so callers can decide to resume or retry." It kept that promise for a raw engine failure, but not for a failure that arrived as an `ApplicationError` mid-import - that branch did a bare `throw error`, dropping the counts.

Typesense's `collectionExists()` wrapped its engine call in a blanket try/catch and returned `false` on any error at all - a network blip looked identical to a genuine absence. That matters because `ensureCollection()` reads a `false` as "go create it." Reporting "does not exist" when the truth is "could not check" is the wrong shape: a transient fault gets acted on as if it were a confirmed absence, instead of surfacing as the infrastructure problem it is. Meilisearch never had this bug - its `collectionExists()` already tolerated only a real not-found. Typesense now matches it.

## What changed

- **Meilisearch `getHealth()` no longer throws.** It now mirrors Typesense: try/catch around the probe, log a warning, resolve `{ ok: false }` on any failure.
- **Typesense `importDocuments()` attaches progress to every failure, not just raw engine errors.** An `ApplicationError` raised mid-import now gets `{ totalCount, processedCount, successCount, failCount }` merged onto its own `extra.details` before being rethrown - the SAME error, with its own `statusCode` / `messageCode` intact.
- **Typesense `collectionExists()` now surfaces a genuine failure instead of reporting absence.** It routes through the same `runEngineCall` every other verb uses; the Typesense SDK's own `exists()` already resolves `false` for a real absence and only ever rejects on an infrastructure failure, so there is no not-found case left to tolerate here - every throw is real and reaches the caller as a sanitized `503`.

## Who is affected

- **Anyone calling `ping()` or `getHealth()` as a liveness probe.** Both now resolve, never throw, on either engine. No action needed - this only removes a way the call could break.
- **Anyone catching a Typesense `importDocuments()` failure and reading `error.extra.details`.** `details` is now populated whether the underlying failure was a raw engine error or an already-shaped `ApplicationError` (a `409` conflict, for example).
- **Meilisearch imports.** Unaffected - `MeilisearchConnector.importDocuments()` already merged progress onto both error shapes.
- **Anyone calling Typesense `collection.exists()` (directly, or via `ensureCollection()`) while the engine is unreachable.** It now throws a sanitized `503` instead of resolving `false`. If your code called `ensureCollection()` expecting it to quietly retry as a create on any hiccup, it now surfaces the failure instead - the correct behavior, since the collection's real state was never confirmed absent.

## The contract going forward

- `getHealth()` never throws, on either engine - a probe failure always resolves `{ ok: false }`.
- Every `importDocuments()` failure carries partial progress in `error.extra.details`, regardless of whether the underlying error was already framework-shaped.
- `collectionExists()` never reports absence for a failure it could not classify - only a genuine not-found resolves `false`; everything else surfaces.

These three pull in opposite directions on purpose, and that is the point: a probe whose job is to detect failure must never throw (`getHealth`), while a query whose `false` triggers a write must never lie about absence (`collectionExists`). Each fix picked the shape its own caller needed, not a shared default.

## See also

- [Connectors Consistency Hardening](/changelogs/2026-07-11-connectors-consistency-hardening) - the review that first aligned Typesense and Meilisearch error shapes
- [One Transport for Every Typesense Search](/changelogs/2026-08-07-typesense-multi-search-transport) - the same connector's other recent contract-tightening pass
