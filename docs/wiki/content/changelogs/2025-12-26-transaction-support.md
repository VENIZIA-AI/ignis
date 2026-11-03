---
title: Transaction Support
description: Repositories can start explicit transactions that you pass between services and repositories, with a choice of isolation level.
packages: ['@venizia/ignis']
---

# Changelog - 2025-12-26

## Transaction Support

**In one line.** Call `beginTransaction()` on a repository and pass the transaction through `options` to run atomic operations across several services and repositories.

## What changed

- **Explicit transactions.** `repo.beginTransaction()` returns a transaction you commit or roll back yourself.
- **Pass-through context.** Pass it as `options: { transaction: tx }` to any repository call.
- **Isolation levels.** `READ COMMITTED`, `REPEATABLE READ` and `SERIALIZABLE` are supported.

```typescript
const tx = await repo.beginTransaction();

try {
  await repo.create({ data: {...}, options: { transaction: tx } });
  await otherRepo.create({ data: {...}, options: { transaction: tx } });

  await tx.commit();
} catch (err) {
  await tx.rollback();
}
```

## Who is affected

- **Existing code.** No action needed. Calls without a transaction work as before, with implicit auto-commit.
