---
title: Retry Utility
description: Backoff-driven retry helpers - executeWithRetry for error-triggered retries, executeWithRetryUntil for predicate-driven polling
difficulty: intermediate
lastUpdated: 2026-07-18
---

# Retry Utility

Backoff-driven retry helpers for anything that can transiently fail or return a stale result - network calls, database reads behind a replicated pool, or any operation worth polling until a condition holds.

## In one example

```typescript
import { executeWithRetry, executeWithRetryUntil } from '@venizia/ignis-helpers';

// Retries because the call THREW
const data = await executeWithRetry({
  operation: 'fetch-remote-config',
  execution: () => fetchConfig(),
  maxAttempts: 5,
});

// Retries because the result was not YET what we want, not because it threw
const order = await executeWithRetryUntil({
  operation: 'wait-for-paid-order',
  execution: () => orderRepository.findById({ id: orderId }),
  until: result => result?.status === 'PAID',
  maxAttempts: 5,
});
```

## Two retry engines, one purpose

| Function | Retries when | Used by |
|---|---|---|
| `executeWithRetry` | `execution` throws | Anything that fails transiently - network calls, connection setup |
| `executeWithRetryUntil` | `execution` succeeds but `until(result)` returns `false` | [Repository read retry](/references/base/repositories/advanced#read-retry-replica-lag) (`find`/`findOne`/`findById` `options.retry`), and any non-repository code that needs to poll for a condition |

Both share the same backoff engine (`computeBackoffDelayMs`, `IRetryBackoffOptions`) and the same exhaustion contract: **on exhaustion, log once via `logger.warn` and return/throw the LAST outcome - never fabricate a new one.**

## `executeWithRetry`

Retries `execution` on failure with backoff, under an optional total-time budget.

```typescript
const executeWithRetry: <T>(opts: {
  operation: string;
  execution: (context: { attempt: number; signal?: AbortSignal }) => ValueOrPromise<T>;

  /** Default 3. */
  maxAttempts?: number;

  /** Total budget across attempts AND sleeps. Default: unlimited. */
  maxTotalMs?: number;

  /** Per-attempt race. Default: no per-attempt timeout. */
  perAttemptTimeoutMs?: number;

  backoff?: IRetryBackoffOptions;

  /** Return `false` to stop retrying and rethrow `context.error` immediately. */
  shouldRetry?: (context: IRetryContext) => boolean;

  /** Observability hook, awaited before the backoff sleep. */
  onRetry?: (context: IRetryContext & { nextDelayMs: number }) => ValueOrPromise<void>;

  signal?: AbortSignal;
  logger?: ILogger;
}) => Promise<T>;
```

- **`shouldRetry` is the classification hook** - return `false` for permanent errors (e.g. a `400` validation error) that have no business retrying; the error rethrows immediately instead of burning attempts.
- **On exhaustion the LAST error is thrown**, after a single `logger.warn` when a `logger` is provided.
- **`signal` aborts between attempts and during backoff sleeps**, and is also handed to `execution` for cooperative cancellation - JS cannot cancel a running promise, so a timed-out attempt keeps running in the background unless `execution` itself honors the signal.

## `executeWithRetryUntil`

Retries `execution` while a predicate (`until`) says the result is not good enough yet - the engine behind the repository `retry` option, exported for direct use outside repositories.

```typescript
const executeWithRetryUntil: <T>(opts: {
  operation: string;
  execution: (context: { attempt: number; signal?: AbortSignal }) => ValueOrPromise<T>;

  /** Return `true` when `result` is acceptable - stops the retry loop. */
  until: (result: T) => boolean;

  /** Default 3. Below 1 throws immediately, before any execution runs. */
  maxAttempts?: number;

  /** Bounds only whether a NEW attempt may start. An in-flight execution is never interrupted, so
   * the first execution always runs to completion - a non-positive value just means "no retries":
   * exactly one execution still happens. Default: unlimited. */
  maxTotalMs?: number;

  backoff?: IRetryBackoffOptions;

  /** Aborts between attempts and during backoff sleeps. Unlike exhaustion, an abort REJECTS the
   * call instead of returning the last result. */
  signal?: AbortSignal;
  logger?: ILogger;
}) => Promise<T>;
```

- **A real error from `execution` is never retried** - it rethrows immediately, exactly like a caught error anywhere else. `executeWithRetryUntil` only retries a *successful* call whose result failed `until`.
- **On exhaustion, the LAST result is returned as-is** - not thrown, not replaced with `null`/`undefined`. Exactly one `logger.warn` is emitted when a `logger` is provided.
- **`maxTotalMs` only gates whether a NEW attempt may start.** An in-flight execution is never interrupted, so the first execution always runs to completion; a non-positive `maxTotalMs` simply means "no retries" while still performing exactly one execution.
- **Two configurations reject instead of returning a result.** `maxAttempts` below `1` throws immediately, before any execution runs. An aborted `signal` rejects the call instead - the caller cancelled and no longer wants a result, so it does not fall back to the last (stale) result the way exhaustion does.
- **Use it directly for raw query/execute paths or any non-repository polling** - e.g. waiting for a background job's status column to flip, or a downstream service to report ready, without hand-rolling a loop.

> [!NOTE]
> This is the function that powers `options: { retry: { until, maxAttempts, maxTotalMs, backoff } }` on repository `find`/`findOne`/`findById` - see [Advanced Repository Features - Read Retry](/references/base/repositories/advanced#read-retry-replica-lag) for the repository-level API, including the per-verb typed `until` and the transaction-skip rule.

## Backoff & jitter

Both engines share `computeBackoffDelayMs(opts: { attempt: number; backoff?: IRetryBackoffOptions })`, computing the pre-jitter delay then applying jitter:

```typescript
interface IRetryBackoffOptions {
  /** Default EXPONENTIAL. */
  strategy?: 'fixed' | 'linear' | 'exponential' | 'schedule';

  /** First delay, default 250ms. LINEAR adds it per attempt; EXPONENTIAL multiplies from it. */
  initialDelayMs?: number;

  /** EXPONENTIAL growth factor, default 2. Ignored by other strategies. */
  multiplier?: number;

  /** Upper cap applied BEFORE jitter, default 30000ms. */
  maxDelayMs?: number;

  /** Required when strategy is SCHEDULE; the last entry repeats for later attempts. */
  scheduleMs?: readonly number[];

  /** Default FULL. */
  jitter?: 'none' | 'full' | 'equal';
}
```

`RetryBackoffStrategies` and `RetryJitterModes` are the corresponding const classes (`RetryBackoffStrategies.FIXED/LINEAR/EXPONENTIAL/SCHEDULE`, `RetryJitterModes.NONE/FULL/EQUAL`) if you prefer named constants over string literals.

| Strategy | Delay for attempt N (pre-jitter) |
|---|---|
| `fixed` | `initialDelayMs` |
| `linear` | `initialDelayMs * N` |
| `exponential` (default) | `initialDelayMs * multiplier ** (N - 1)` |
| `schedule` | `scheduleMs[N - 1]`, clamped to the last entry once `N` exceeds its length |

| Jitter | Effect |
|---|---|
| `none` | Delay used as-is |
| `full` (default) | Uniform random in `[0, delay)` - decorrelates a thundering herd hardest |
| `equal` | `delay/2 + uniform random in [0, delay/2)` - jittered but never less than half the computed delay |

> [!NOTE]
> The generic defaults above (250ms initial, 30000ms cap, FULL jitter) are tuned for network-style retries. The repository `retry` option overrides these with a tighter, replica-lag-tuned default (EXPONENTIAL from 50ms, capped at 500ms, EQUAL jitter) - see the repository reference.

## Other exports

| Export | What it does |
|---|---|
| `runWithTimeout(opts: { operation: string; timeoutMs?: number; execution: () => ValueOrPromise<T> })` | Races `execution` against `timeoutMs` (no timeout when omitted or `<= 0`). The losing execution keeps running - promises cannot be cancelled - so pass `signal` through when `execution` supports cooperative cancellation. |
| `isRetryTimeoutError(error: unknown): boolean` | `true` when `error` is a per-attempt timeout raised by `runWithTimeout`/`executeWithRetry`. |

## See also

- [Advanced Repository Features - Read Retry](/references/base/repositories/advanced#read-retry-replica-lag) - the repository-level `retry` option built on `executeWithRetryUntil`
- [Utilities Overview](/references/utilities/) - all utility functions
- [Repository Read Retry changelog](/changelogs/2026-07-18-repository-read-retry) - what shipped and why

**Files:**

- [`packages/helpers/src/utilities/retry.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/retry.utility.ts)
