---
title: Repository Read Retry - Predicate-Driven Retries for Replica Lag
description: find/findOne/findById on the PostgreSQL and search repository chains accept an opt-in retry option that re-reads until a predicate passes, solving read-after-write staleness behind a replicated pool.
---

# Changelog - 2026-07-18

## Repository Read Retry

<Badge type="tip" text="New Feature" />

**In one line.** Read verbs (`find`, `findOne`, `findById`) on every repository chain now accept an opt-in `retry` option that re-reads until a predicate passes - built for read-after-write staleness behind a replicated pool such as PgDog.

## What changed

- **New `retry` option on read verbs.** `find`, `findOne`, and `findById` - on the PostgreSQL chain (`ReadableRelationalRepository` and every repository descending from it) and the search chain (`ReadableSearchRepository`, both Typesense and Meilisearch) - accept `options: { retry }`. The read repeats with backoff while a predicate (`until`) returns `false`.
- **A sensible default predicate per verb, or bring your own.** Without `until`, `findOne`/`findById` retry until the result is neither `null` nor `undefined`, `find` retries until the array is non-empty (or `data.length > 0` under `options.shouldQueryRange: true`). Pass `until` for anything sharper - for example, wait for a specific `status`.
- **Never a new error, and never a fabricated result either - with two deliberate exceptions.** A real database/engine error is never retried - it propagates immediately, exactly as before. Retries only happen because a read *succeeded* but the predicate said "not yet." On exhaustion the framework returns the last result as-is - it does not throw and does not invent a "not found." The two exceptions: an invalid `maxAttempts` (below `1`) throws immediately, before any read runs; and an aborted `signal` rejects the call rather than falling back to the last result, since the caller cancelled and no longer wants one.
- **`maxTotalMs` bounds new attempts, never an in-flight read.** The budget only decides whether another attempt may *start* - the first read always runs to completion, and a non-positive budget simply means "no retries" while still performing exactly one read.
- **New option: `signal?: AbortSignal`.** Aborts the retry loop between attempts and during backoff sleeps - pass the incoming request's signal so a cancelled request stops retrying instead of finishing on a connection nobody is reading.
- **Skipped where it cannot help.** Inside a transaction, `retry` is skipped - pools route transactions to the primary, so there is no replica lag to wait out. Locked reads (`lock`) require a transaction, so they are never retried either.
- **Write verbs stay out of it.** `create`, `updateById`, `updateAll`, `deleteById`, `deleteAll`, and the rest of the write surface do not accept `retry` in an inline options literal - TypeScript's excess-property check rejects it at compile time. A pre-built variable carrying an extra `retry` key passes structurally instead, but the key is inert there and never read. Routing stays pooler-owned either way: IGNIS never targets a primary or a replica directly.
- **New helper: `executeWithRetryUntil`.** `@venizia/ignis-helpers` exports the predicate-driven engine that powers the repository option - `executeWithRetryUntil({ operation, execution, until, maxAttempts?, maxTotalMs?, backoff?, signal?, logger? })`. It sits beside the existing `executeWithRetry` and is usable directly for raw query/execute paths or any non-repository code that needs to poll until a condition holds.

## Who is affected

- **Everyone on a single-primary setup.** No action needed - `retry` is opt-in and off by default.
- **Apps behind a replicated pool (for example PgDog primary + replicas) doing create-then-read or update-then-read.** Add `options: { retry: { ... } }` to the affected `find`/`findOne`/`findById` calls instead of a hand-rolled polling loop.
- **Code calling write verbs with a `retry` option.** None exists today - the option was never accepted there, so nothing breaks.

## Details

### Shape

```typescript
interface IReadRetryOptions<TResult> {
  /** Default 3. Below 1 throws immediately, before any read runs. */
  maxAttempts?: number;

  /** Bounds only whether a NEW attempt may start - an in-flight read is never interrupted, so the
   * first read always runs to completion. Default: unlimited. */
  maxTotalMs?: number;

  /** Aborts between attempts and during backoff sleeps - pass the request signal so a cancelled
   * request stops retrying. Unlike exhaustion, an abort rejects the call. */
  signal?: AbortSignal;

  /** Default: EXPONENTIAL from 50ms, capped at 500ms, EQUAL jitter. */
  backoff?: IRetryBackoffOptions;

  /** Return true when the result is fresh enough to stop retrying. */
  until?: (result: TResult) => boolean;
}
```

`until` is typed per verb, so the predicate always sees exactly what that verb returns - no casting, no `unknown`:

| Verb | `until` sees | Default predicate |
|---|---|---|
| `findOne` / `findById` | `TNullable<R>` | Result is neither `null` nor `undefined` |
| `find` | `Array<R>` | Array is non-empty |
| `find` with `options.shouldQueryRange: true` | `{ data: R[]; range: ... }` | `data.length > 0` |

### Usage

```typescript
// create -> find: the default "non-null" predicate is enough
const user = await userRepository.findById({
  id,
  options: { retry: { maxAttempts: 4 } },
});

// update -> find: supply the freshness predicate yourself, fully typed per verb
const order = await orderRepository.findById({
  id,
  options: { retry: { until: result => result?.status === 'PAID' } },
});
```

### New exported types

The base repository common types (`@venizia/ignis`, `packages/core/src/base/repositories/common/types.ts`) now export `IReadRetryOptions`, `IWithReadRetry`, `TFindOptions`, `TFindOneOptions`, `TFindRangeOptions`, and `TDataWithRange` - the option aliases behind the per-verb `until` typing above.

### `executeWithRetryUntil`

```typescript
import { executeWithRetryUntil } from '@venizia/ignis-helpers';

const rows = await executeWithRetryUntil({
  operation: 'wait-for-paid-order',
  execution: () => connector.select().from(orderTable).where(eq(orderTable.id, id)),
  until: result => result[0]?.status === 'PAID',
  maxAttempts: 5,
});
```

On exhaustion, `executeWithRetryUntil` returns the last result - logging exactly one `logger.warn` - rather than throwing, matching the repository option's exhaustion behavior. A real error thrown by `execution` is never retried and rethrows immediately. An invalid `maxAttempts` (below `1`) throws immediately instead, before any execution runs, and an aborted `signal` rejects the call rather than returning the last result.

| File | Package |
|------|---------|
| `packages/helpers/src/utilities/retry.utility.ts` | helpers |
| `packages/core/src/base/repositories/common/types.ts` | core |
| `packages/core/src/base/repositories/core/abstract.ts` | core |
| `packages/core/src/connectors/postgres/repositories/core/readable.ts` | core |
| `packages/core/src/connectors/search/repositories/core/readable.ts` | core |

## See also

- [Advanced Repository Features - Read Retry](/references/base/repositories/advanced#read-retry-replica-lag) - full option reference
- [Retry Utilities](/references/utilities/retry) - `executeWithRetry`/`executeWithRetryUntil`, backoff strategies, jitter modes
