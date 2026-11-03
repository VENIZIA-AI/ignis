---
title: BaseFilteredAdapter Connector Resolution Fix
description: BaseFilteredAdapter now works with a datasource that has not resolved its connector yet, and fails with a named error when it has no connector at all.
packages: ['@venizia/ignis']
---

# Changelog - 2026-07-21

## BaseFilteredAdapter Connector Resolution Fix

<Badge type="info" text="Bug Fix" />

**In one line.** `BaseFilteredAdapter` now prefers a lazy `getConnector()` accessor and falls back to a pre-wired `connector` field, and a datasource with neither fails with a named error instead of a bare `TypeError`.

## What changed

- **A cold datasource works.** The adapter resolves `dataSource.getConnector?.() ?? dataSource.connector`, so a datasource not yet touched by a repository no longer needs a connector already set.
- **A clear error.** With neither accessor, it throws an error naming `[BaseFilteredAdapter]` that says the datasource must expose one of them.
- **`ICasbinPolicySource`.** `getConnector?()` and `connector?` are both optional - a source only needs one.

## Who is affected

- **Consumers constructing `ScopedCasbinAdapter` (or any `BaseFilteredAdapter` subclass) against a datasource without a resolved connector.** No action needed. A pre-wired `connector` field and a `getConnector()` accessor both keep working.
- **Consumers that matched on the old `TypeError` message.** None known, but that error text has changed.
