---
title: BaseFilteredAdapter Connector Resolution Fix
description: BaseFilteredAdapter now falls back from getConnector() to a pre-wired connector and throws a clear framework error instead of a bare TypeError when a datasource is cold.
---

# Changelog - 2026-07-21

## BaseFilteredAdapter Connector Resolution Fix

<Badge type="info" text="Bug Fix" />

**In one line.** `BaseFilteredAdapter`'s `connector` getter now prefers a lazy `getConnector()` accessor, falls back to a pre-wired `connector` field, and fails with a named error instead of a bare `TypeError` when a datasource has neither.

## What changed

- **Lazy accessor preferred, pre-wired connector as fallback.** The `connector` getter resolves `dataSource.getConnector?.() ?? dataSource.connector`. `getConnector()` mirrors how repositories reach their connector - wiring the driver on first read and surviving pool rotation - so a datasource that has not been touched yet no longer needs a connector already sitting on it.
- **A cold datasource now fails loudly.** Previously, a datasource with no `connector` set threw a bare `TypeError` from deep inside adapter internals. It now throws a `getError` naming `[BaseFilteredAdapter]` and explaining that the datasource must expose either accessor.
- **`ICasbinPolicySource` updated to match.** Both `getConnector?()` and `connector?` are optional; a source only needs to provide one of them.

## Who is affected

- **Consumers constructing `ScopedCasbinAdapter` (or any `BaseFilteredAdapter` subclass) against a datasource that had not yet resolved a connector at construction time.** No action needed if the datasource already had a `connector` wired eagerly, or now exposes `getConnector()` - both paths keep working. A construction site that relied on the old `TypeError` message (none known) would see a different error text.

## Details

| File | Package |
|------|---------|
| `src/components/auth/authorize/adapters/base-filtered.ts` | core |
| `src/components/auth/authorize/adapters/types.ts` | core |
