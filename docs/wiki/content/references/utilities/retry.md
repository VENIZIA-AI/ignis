---
title: Retry Utility
description: Backoff-driven retry helpers - executeWithRetry retries on errors, executeWithRetryUntil retries until a result looks right
difficulty: intermediate
lastUpdated: 2026-07-18
---

# Retry Utility

Two retry helpers. One retries when a call **throws**. The other retries when a call **succeeds but the result is not what you want yet**.

## In one example

```typescript
import { executeWithRetry, executeWithRetryUntil } from '@venizia/ignis-helpers';

// Retries because the call THREW
const data = await executeWithRetry({
  operation: 'fetch-remote-config',
  execution: () => fetchConfig(),
  maxAttempts: 5,
});

// Retries because the result is not YET what we want
const order = await executeWithRetryUntil({
  operation: 'wait-for-paid-order',
  execution: () => orderRepository.findById({ id: orderId }),
  until: result => result?.status === 'PAID',
  maxAttempts: 5,
});
```

## Which one do I need?

| Function | Retries when | Typical use |
|---|---|---|
| `executeWithRetry` | `execution` throws | Flaky network calls, connection setup |
| `executeWithRetryUntil` | `until(result)` returns `false` | Polling until data is fresh or a job is done. Powers the repository [`retry` option](/references/base/repositories/advanced#read-retry-replica-lag). |

Both share the same backoff engine and the same habit: on exhaustion, log one `logger.warn` and hand back the LAST outcome.

## `executeWithRetry`

```typescript
const executeWithRetry: <T>(opts: {
  operation: string;
  execution: (context: { attempt: number; signal?: AbortSignal }) => ValueOrPromise<T>;
  maxAttempts?: number; // default 3
  maxTotalMs?: number; // total budget across attempts and sleeps
  perAttemptTimeoutMs?: number; // race each attempt against a timeout
  backoff?: IRetryBackoffOptions;
  shouldRetry?: (context: IRetryContext) => boolean;
  onRetry?: (context: IRetryContext & { nextDelayMs: number }) => ValueOrPromise<void>;
  signal?: AbortSignal;
  logger?: ILogger;
}) => Promise<T>;
```

The rules:

- Every thrown error retries, unless `shouldRetry` returns `false` - then it rethrows immediately. Use this for permanent errors like a `400`.
- Out of attempts or budget? The LAST error is thrown.
- `signal` aborts between attempts and during sleeps. It is also passed to `execution` - a running promise cannot be cancelled from outside, so honor it inside if you can.

## `executeWithRetryUntil`

```typescript
const executeWithRetryUntil: <T>(opts: {
  operation: string;
  execution: (context: { attempt: number; signal?: AbortSignal }) => ValueOrPromise<T>;
  until: (result: T) => boolean; // return true to stop: "the result is good"
  maxAttempts?: number; // default 3
  maxTotalMs?: number; // stop starting NEW attempts after this much time
  backoff?: IRetryBackoffOptions;
  signal?: AbortSignal;
  logger?: ILogger;
}) => Promise<T>;
```

The rules:

- A thrown error is never retried. It rethrows immediately. Only a successful call with a "not yet" result retries.
- Out of attempts or budget? The LAST result is returned as-is. No error.
- `maxTotalMs` never cuts a running read short. It only stops NEW attempts from starting. Zero or negative just means "no retries" - one call still runs.
- `maxAttempts` below `1` throws before anything runs.
- An aborted `signal` rejects the call - a cancelled caller does not want a stale result.

Use it for any polling: waiting for a job status to flip, for a downstream service to come up, for a replica to catch up.

## Backoff and jitter

Both helpers wait between attempts using `IRetryBackoffOptions`:

```typescript
interface IRetryBackoffOptions {
  strategy?: 'fixed' | 'linear' | 'exponential' | 'schedule'; // default exponential
  initialDelayMs?: number; // default 250
  multiplier?: number; // exponential growth factor, default 2
  maxDelayMs?: number; // cap before jitter, default 30000
  scheduleMs?: readonly number[]; // required for 'schedule'
  jitter?: 'none' | 'full' | 'equal'; // default full
}
```

| Strategy | Delay for attempt N |
|---|---|
| `fixed` | `initialDelayMs` |
| `linear` | `initialDelayMs * N` |
| `exponential` | `initialDelayMs * multiplier ** (N - 1)` |
| `schedule` | `scheduleMs[N - 1]`, last entry repeats |

| Jitter | Effect |
|---|---|
| `none` | delay used as-is |
| `full` | random in `[0, delay)` |
| `equal` | random in `[delay/2, delay)` |

Prefer named constants? `RetryBackoffStrategies.EXPONENTIAL`, `RetryJitterModes.EQUAL`, etc.

> [!NOTE]
> These defaults (250ms, 30s cap) suit network retries. The repository `retry` option uses its own tighter defaults (50ms up to 500ms) - see [Read Retry](/references/base/repositories/advanced#read-retry-replica-lag).

## Other exports

| Export | What it does |
|---|---|
| `runWithTimeout({ operation, timeoutMs, execution })` | Races `execution` against a timeout. Omitted or `<= 0` means no timeout. |
| `isRetryTimeoutError(error)` | `true` when the error is a timeout from `runWithTimeout`/`executeWithRetry`. |
| `computeBackoffDelayMs({ attempt, backoff })` | The delay both helpers use, exposed for your own loops. |

## See also

- [Read Retry](/references/base/repositories/advanced#read-retry-replica-lag) - the repository `retry` option built on `executeWithRetryUntil`
- [Repository Read Retry changelog](/changelogs/2026-07-18-repository-read-retry) - what shipped and why
- [Utilities Overview](/references/utilities/)

**Files:**

- [`packages/helpers/src/utilities/retry.utility.ts`](https://github.com/VENIZIA-AI/ignis/blob/main/packages/helpers/src/utilities/retry.utility.ts)
