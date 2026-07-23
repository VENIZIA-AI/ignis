---
title: Repository Read Retry - Predicate-Driven Retries for Replica Lag
description: find/findOne/findById accept an opt-in retry option that re-reads until a predicate passes - fixes read-after-write staleness behind a replicated pool.
---

# Changelog - 2026-07-18

## Repository Read Retry

<Badge type="tip" text="New Feature" />

**In one line.** `find`, `findOne`, and `findById` accept an opt-in `retry` option: re-read with backoff until the result looks right. Built for read-after-write lag behind a replicated pool such as PgDog.

## The problem it solves

You create a row, then read it back. The read lands on a replica that has not caught up, so the row "is not there". `retry` re-reads until it is:

```typescript
const user = await userRepository.findById({
  id,
  options: { retry: { maxAttempts: 4 } },
});
```

After an update, tell `retry` what "fresh" means:

```typescript
const order = await orderRepository.findById({
  id,
  options: { retry: { until: result => result?.status === 'PAID' } },
});
```

## What changed

- `find`, `findOne`, `findById` accept `options.retry` - on the PostgreSQL chain and the search chain (Typesense, Meilisearch).
- Off by default. Without `retry`, behavior is exactly what it was before.
- Write verbs (`create`, `updateById`, ...) do not have this option. `retry` on a write is a compile error.
- New helper in `@venizia/ignis-helpers`: `executeWithRetryUntil` - the loop behind the option, usable anywhere you need to poll for a condition.

## The rules, in plain words

- Retry happens only when the read SUCCEEDED but the result is not what you want yet.
- A real database error is never retried. It throws immediately, same as before.
- Out of attempts? You get the last result as-is. No new error.
- Inside a transaction, retry is skipped - transactions already go to the primary.

## Options

| Option | Default | Meaning |
|---|---|---|
| `maxAttempts` | `3` | Total reads, including the first |
| `until` | per verb (below) | Return `true` to stop: "the result is fresh enough" |
| `maxTotalMs` | unlimited | Stop starting new attempts after this much time |
| `backoff` | 50ms up to 500ms, jittered | Wait between attempts |
| `signal` | - | Cancel the loop (rejects the call) |

Default `until` per verb - the predicate is typed, so it sees exactly what the verb returns:

| Verb | Stops when |
|---|---|
| `findOne` / `findById` | result is not `null`/`undefined` |
| `find` | array is non-empty |
| `find` + `shouldQueryRange: true` | `data` is non-empty |

## Who is affected

- **Single-primary setups:** nothing to do.
- **Apps behind a replicated pool:** add `retry` to reads that follow writes. Delete your hand-rolled polling loops.

## See also

- [Read Retry reference](/references/base/repositories/advanced#read-retry-replica-lag) - full option reference and edge cases
- [Retry Utility](/references/utilities/retry) - `executeWithRetry` and `executeWithRetryUntil`
