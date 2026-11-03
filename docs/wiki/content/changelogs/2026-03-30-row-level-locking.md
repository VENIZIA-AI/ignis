---
title: Row-Level Locking (FOR UPDATE)
description: Repository read operations can now lock rows with a new lock option, inside a transaction.
packages: ['@venizia/ignis']
---

# Changelog - 2026-03-30

## Row-Level Locking (FOR UPDATE)

**In one line.** `find`, `findOne` and `findById` accept a `lock` option, so you can run `SELECT ... FOR UPDATE` without dropping down to the raw Drizzle connector.

## What changed

- **`lock: { strength, config? }`** in the options of `find`, `findOne` and `findById`.
- **All PostgreSQL strengths** through the `LockStrengths` constant class: `update`, `no key update`, `share` and `key share`.
- **Wait control.** `config: { skipLocked: true }` skips rows another transaction holds, and `config: { noWait: true }` fails immediately instead of waiting.
- **Guard rails.** A lock without a transaction throws `Row-level locking requires a transaction`. A lock together with `include` or `fields` throws `Row-level locking is incompatible with Query API`.

## Who is affected

- **Everyone.** Additive; `lock` is optional and nothing changes without it.
- **Anyone using locks.** Remove `include` and `fields` from the filter, because those queries use the Drizzle Query API, which does not support `.for()`.

## Details

```typescript
import { LockStrengths } from '@venizia/ignis';

const tx = await repo.beginTransaction();
try {
  const item = await repo.findOne({
    filter: { where: { id: '123' } },
    options: { transaction: tx, lock: { strength: LockStrengths.UPDATE } },
  });

  await repo.updateById({ id: '123', data: { quantity: item.quantity - 1 }, options: { transaction: tx } });
  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
}

// Queue-style processing: skip rows already locked
await repo.find({
  filter: { where: { status: 'pending' }, limit: 10 },
  options: { transaction: tx, lock: { strength: 'update', config: { skipLocked: true } } },
});
```

| Strength | SQL |
|----------|-----|
| `update` | `FOR UPDATE` |
| `no key update` | `FOR NO KEY UPDATE` |
| `share` | `FOR SHARE` |
| `key share` | `FOR KEY SHARE` |
