---
title: An access scope can be an or over different columns
description: "access.resolve may return an or whose branches constrain different columns, such as a merchant or an organizer; the write guard holds each written row to one whole branch instead of refusing the scope."
packages: ['@venizia/ignis-connectors']
---

# Changelog - 2026-11-09

## An access scope can be an or over different columns

<Badge type="tip" text="Enhancement" />

**In one line.** A model whose rows belong to an owner at one of two levels, such as a merchant or, when there is none, an organizer, can now say so in `access.resolve`. Writes under that scope are checked branch by branch instead of being refused.

## What changed

- **An `or` over different columns is accepted on a write.** `access.resolve` can return `{ or: [{ merchantId: { inq: mine } }, { merchantId: null, organizerId: { inq: myOrganizers } }] }`. Before, every create, update and delete under it was refused as "cannot be verified".
- **A row must satisfy one whole branch.** `{ merchantId: mine, organizerId: anyone }` passes through the first branch. `{ merchantId: other, organizerId: mine }` is refused: both branches fail on `merchantId`.
- **An update that writes a scope column must satisfy a whole branch on its own.** A payload that writes no scope column is still not checked.
- **`null` keeps its rule.** With several branches it passes only in a branch that allows it, and only with `write.sharedRows: true`. Without `sharedRows`, an update or delete does not reach the rows of a branch with a `null` constraint.
- **`assign`** fills columns only when exactly one branch still fits the row.
- **A limit of 32 branches.** An `and` of several `or`s multiplies their branches; past 32 the scope cannot be verified and a create or an update is refused.

```ts
@model({
  settings: {
    access: {
      resolve: () => ({
        or: [
          { merchantId: { inq: currentMerchantIds() } },
          { merchantId: null, organizerId: { inq: currentOrganizerIds() } },
        ],
      }),
      write: { sharedRows: true },
    },
  },
})
export class Ticket extends ModelFactory.defineEntity({ table: ticketTable }) {}
```

## Who is affected

- **A scope that works today.** No change. A scope with one branch, even over several columns, and an `or` whose branches all name the same column (the shared-rows scope) are checked exactly as before.
- **A resolver that returns an `or` over two columns for a write.** Its writes used to be refused, now each one is held to a branch. To keep writes on one column, return the narrow scope for a write operation, as the guide shows.
- **A scope with a range, `like` or a nested path.** Still refused, with the same message.

## Details

- The refusal for a row that fits no branch is the usual 403 `core.repository.scope_write_denied`, with the detail `the row satisfies no branch of the resolved scope`. It names no column and no value.
- Guide: [An `or` over different columns](/guides/core-concepts/persistent/model-settings#an-or-over-different-columns).

| File | Package |
|------|---------|
| `src/relational/core/repositories/common/scope-write-guard.ts` | connectors |
