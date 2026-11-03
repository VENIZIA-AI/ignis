---
title: Repository Read Retry - Predicate-Driven Retries for Replica Lag
description: find, findOne and findById accept an opt-in retry option that re-reads until a predicate passes, fixing read-after-write staleness behind a replicated pool.
packages: ['@venizia/ignis-helpers']
---

# Changelog - 2026-07-18

## Repository Read Retry

<Badge type="tip" text="New Feature" />

**In one line.** `find`, `findOne` and `findById` accept an opt-in `retry` option that re-reads with backoff until the result looks right, for read-after-write lag behind a replicated pool such as PgDog.

## What changed

- **`options.retry`** on `find`, `findOne` and `findById`, on the PostgreSQL chain and the search chain (Typesense, Meilisearch). It is off by default, so behavior is unchanged without it.
- **Reads only.** `retry` on a write verb (`create`, `updateById`, ...) is a compile error.
- **New helper `executeWithRetryUntil`** in `@venizia/ignis-helpers`, usable anywhere you need to poll for a condition.

```typescript
const user = await userRepository.findById({
  id,
  options: { retry: { maxAttempts: 4 } },
});

const order = await orderRepository.findById({
  id,
  options: { retry: { until: result => result?.status === 'PAID' } },
});
```

## Who is affected

- **Single-primary setups.** Nothing to do.
- **Apps behind a replicated pool.** Add `retry` to reads that follow writes, and delete hand-rolled polling loops.

## Details

- Retry happens only when the read succeeded but the result is not what you want yet. A real database error is never retried.
- Out of attempts, you get the last result as-is, with no new error.
- Inside a transaction, retry is skipped.

| Option | Default | Meaning |
|---|---|---|
| `maxAttempts` | `3` | Total reads, including the first |
| `until` | per verb | Return `true` to stop |
| `maxTotalMs` | unlimited | Stop starting new attempts after this much time |
| `backoff` | 50ms up to 500ms, jittered | Wait between attempts |
| `signal` | - | Cancel the loop (rejects the call) |

Default `until`: `findOne` and `findById` stop when the result is not `null` or `undefined`; `find` stops when the array is non-empty; `find` with `shouldQueryRange: true` stops when `data` is non-empty.

## See also

- [Read Retry reference](/references/base/repositories/advanced#read-retry-replica-lag)
- [Retry Utility](/references/utilities/retry)
