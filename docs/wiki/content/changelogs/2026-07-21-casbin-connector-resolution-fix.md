---
title: BaseFilteredAdapter Connector Resolution Fix
description: BaseFilteredAdapter now falls back from getConnector() to a pre-wired connector and throws a clear framework error instead of a bare TypeError when a datasource is cold.
---

# Changelog - 2026-07-21

## BaseFilteredAdapter Connector Resolution Fix

<Badge type="info" text="Bug Fix" />

**In one line.** `BaseFilteredAdapter`'s `connector` getter now prefers a lazy `getConnector()` accessor, and falls back to a pre-wired `connector` field. When a datasource has neither, it fails with a named error instead of a bare `TypeError`.

## The problem it solves

A datasource that had not resolved a connector yet - cold, not yet touched by a repository - had no `connector` field set. `BaseFilteredAdapter` read `dataSource.connector` directly. A cold datasource threw a bare `TypeError` from deep inside adapter internals, with no indication of what went wrong.

## What changed

- **Lazy accessor preferred, pre-wired connector as fallback.** The `connector` getter now resolves `dataSource.getConnector?.() ?? dataSource.connector`.
- `getConnector()` mirrors how a repository reaches its connector: it wires the driver on first read, and survives pool rotation.
- A datasource that has not been touched yet no longer needs a connector already sitting on it.
- **A cold datasource now fails loudly.** It throws a `getError` naming `[BaseFilteredAdapter]` and explaining that the datasource must expose either accessor, instead of a bare `TypeError`.
- **`ICasbinPolicySource` updated to match.** Both `getConnector?()` and `connector?` are optional - a source only needs to provide one of them.

## Who is affected

- **Consumers constructing `ScopedCasbinAdapter` (or any `BaseFilteredAdapter` subclass) against a datasource without a resolved connector at construction time.** No action needed - both a pre-wired `connector` field and a `getConnector()` accessor keep working.
- **Consumers that matched on the old `TypeError` message.** None known, but that error text has changed.

## Details

| File | Package |
|------|---------|
| `src/components/auth/authorize/adapters/base-filtered.ts` | core |
| `src/components/auth/authorize/adapters/types.ts` | core |
