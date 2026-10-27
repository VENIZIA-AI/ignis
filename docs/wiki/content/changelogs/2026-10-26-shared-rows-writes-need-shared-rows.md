---
title: A Shared Row Can No Longer Be Changed or Deleted Without sharedRows
description: 'Under a scope with a null branch, a restricted caller could update or delete a shared row (null scope column) when the patch did not name the column, even with write.sharedRows false. Update, delete, soft delete and restore now leave shared rows out unless write.sharedRows is true.'
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-10-26

## A shared row can no longer be changed or deleted without sharedRows

<Badge type="danger" text="Security" /> <Badge type="warning" text="Behavior Change" />

**In one line.** With a scope such as `{ or: [{ merchantId: { in: ids } }, { merchantId: null }] }` and `write.sharedRows: false`, a restricted caller could still `updateById` or `deleteById` a shared row (`merchantId` is `null`) as long as the patch did not name `merchantId`. 0.4.2 has this gap; this entry closes it.

## What was wrong

The write guard of 0.4.2 held a created or updated payload to the scope, but `_update` checked only the payload (and only when it named the scope column) and then merged the whole READ scope into the `where`, and `_delete` merged only the read scope. The read scope includes the `null` branch, so a shared row matched. `write.sharedRows: false` stopped a caller from creating a shared row but not from changing or deleting an existing one.

## What changed

- **A write selects only rows it may write.** For `updateById`, `updateAll`, `updateBy`, `deleteById`, `deleteAll`, `deleteBy`, soft delete and restore, the scope merged into the `where` has its `null` branch removed unless `write.sharedRows` is `true`. A shared row does not match: the count is `0` and the row is unchanged. The caller's own rows work as before.
- **Reads are unchanged.** They still return the caller's rows and the shared rows.
- **`sharedRows: true` keeps today's behavior,** and `ScopeFilters.UNRESTRICTED` still bypasses the scope.
- **A scope the guard cannot read is refused for a delete too.** An `or` over several columns, a range or a nested path cannot be narrowed, so `deleteById` and friends throw `core.repository.scope_write_denied` ("cannot be verified"), as an update already did. Before, a delete under such a scope ran.

## Who is affected

Every app with a scope that has a `null` branch and `sharedRows: false` (the default): a shared row could be changed or deleted by any caller who could read it. Upgrade. If you relied on a merchant changing platform rows, set `write.sharedRows: true` on that model deliberately; it also lets any merchant create platform-wide rows, so leave it `false` for platform-defined data and use `ScopeFilters.UNRESTRICTED` for the staff who manage it. A delete under an unreadable scope shape now fails: rewrite the scope to the shapes the [model settings guide](/guides/core-concepts/persistent/model-settings) lists.
