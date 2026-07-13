import type { TConstValue, ValueOrPromise } from '@/common';
import { getError } from '@/modules/error';
import type { Logger } from '@/modules/logger';
import { sleep } from './date.utility';

export class RetryBackoffStrategies {
  static readonly FIXED = 'fixed';
  static readonly LINEAR = 'linear';
  static readonly EXPONENTIAL = 'exponential';

  /** An explicit per-attempt cap schedule, e.g. [250, 1000, 4000]; the last entry repeats. */
  static readonly SCHEDULE = 'schedule';

  static readonly SCHEME_SET = new Set<string>([
    this.FIXED,
    this.LINEAR,
    this.EXPONENTIAL,
    this.SCHEDULE,
  ]);

  static isValid(value: string): value is TRetryBackoffStrategy {
    return this.SCHEME_SET.has(value);
  }
}

export type TRetryBackoffStrategy = TConstValue<typeof RetryBackoffStrategies>;

export class RetryJitterModes {
  /** The computed delay is used as-is. */
  static readonly NONE = 'none';

  /** Uniform random in [0, delay) - decorrelates a thundering herd hardest. */
  static readonly FULL = 'full';

  /** delay/2 + uniform random in [0, delay/2) - jittered but never less than half the delay. */
  static readonly EQUAL = 'equal';

  static readonly SCHEME_SET = new Set<string>([this.NONE, this.FULL, this.EQUAL]);

  static isValid(value: string): value is TRetryJitterMode {
    return this.SCHEME_SET.has(value);
  }
}

export type TRetryJitterMode = TConstValue<typeof RetryJitterModes>;

export interface IRetryBackoffOptions {
  /** Default EXPONENTIAL. */
  strategy?: TRetryBackoffStrategy;

  /** First delay, default 250ms. LINEAR adds it per attempt; EXPONENTIAL multiplies from it. */
  initialDelayMs?: number;

  /** EXPONENTIAL growth factor, default 2. Ignored by other strategies. */
  multiplier?: number;

  /** Upper cap applied BEFORE jitter, default 30000ms. */
  maxDelayMs?: number;

  /** Required when strategy is SCHEDULE; the last entry repeats for later attempts. */
  scheduleMs?: readonly number[];

  /** Default FULL. */
  jitter?: TRetryJitterMode;
}

export interface IRetryContext {
  attempt: number;
  error: unknown;
  elapsedMs: number;
}

const RETRY_TIMEOUT_MARKER = Symbol.for('@venizia/ignis-helpers:retry-timeout');

/** True when `error` is a per-attempt timeout raised by `runWithTimeout`/`executeWithRetry`. */
export const isRetryTimeoutError = (error: unknown): boolean => {
  return typeof error === 'object' && error !== null && RETRY_TIMEOUT_MARKER in error;
};

const buildTimeoutError = (opts: { operation: string; timeoutMs: number }) => {
  const error = getError({
    message: `[runWithTimeout][${opts.operation}] Timed out after ${opts.timeoutMs}ms`,
  });
  Object.defineProperty(error, RETRY_TIMEOUT_MARKER, { value: true });
  return error;
};

const throwIfAborted = (opts: { operation: string; signal?: AbortSignal }) => {
  if (opts.signal?.aborted) {
    throw getError({
      message: `[executeWithRetry][${opts.operation}] Aborted | Reason: ${String(opts.signal.reason ?? 'unknown')}`,
    });
  }
};

/** `sleep` that wakes up early (and rejects) when `signal` aborts mid-wait. */
const sleepWithSignal = async (opts: { ms: number; operation: string; signal?: AbortSignal }) => {
  const { ms, operation, signal } = opts;

  if (!signal) {
    await sleep(ms);
    return;
  }

  throwIfAborted({ operation, signal });

  // The listener is removed in `finally` rather than by the timer callback - the two would
  // otherwise have to reference each other, and a leaked listener on a long-lived signal
  // accumulates across retries.
  let removeAbortListener = () => {};

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);

      const onAbort = () => {
        clearTimeout(timer);
        reject(
          getError({
            message: `[executeWithRetry][${operation}] Aborted during backoff | Reason: ${String(signal.reason ?? 'unknown')}`,
          }),
        );
      };

      removeAbortListener = () => signal.removeEventListener('abort', onAbort);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  } finally {
    removeAbortListener();
  }
};

/**
 * Races `execution` against `timeoutMs`. `timeoutMs <= 0` (or omitted) means no timeout. The losing
 * execution keeps running - JS promises cannot be cancelled - so pass `signal` through to the
 * execution when it supports cooperative cancellation.
 */
export const runWithTimeout = async <T>(opts: {
  operation: string;
  timeoutMs?: number;
  execution: () => ValueOrPromise<T>;
}): Promise<T> => {
  const { operation, timeoutMs, execution } = opts;

  if (!timeoutMs || timeoutMs <= 0) {
    return execution();
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(buildTimeoutError({ operation, timeoutMs }));
    }, timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve().then(execution), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
};

/** The pre-jitter delay for `attempt` (1-based, i.e. the delay AFTER attempt N failed). */
export const computeBackoffDelayMs = (opts: {
  attempt: number;
  backoff?: IRetryBackoffOptions;
}): number => {
  const { attempt } = opts;
  const {
    strategy = RetryBackoffStrategies.EXPONENTIAL,
    initialDelayMs = 250,
    multiplier = 2,
    maxDelayMs = 30_000,
    scheduleMs,
    jitter = RetryJitterModes.FULL,
  } = opts.backoff ?? {};

  let delayMs: number;
  switch (strategy) {
    case RetryBackoffStrategies.FIXED: {
      delayMs = initialDelayMs;
      break;
    }
    case RetryBackoffStrategies.LINEAR: {
      delayMs = initialDelayMs * attempt;
      break;
    }
    case RetryBackoffStrategies.EXPONENTIAL: {
      delayMs = initialDelayMs * Math.pow(multiplier, attempt - 1);
      break;
    }
    case RetryBackoffStrategies.SCHEDULE: {
      if (!scheduleMs?.length) {
        throw getError({
          message:
            '[computeBackoffDelayMs] strategy SCHEDULE requires a non-empty backoff.scheduleMs',
        });
      }
      delayMs = scheduleMs[Math.min(attempt - 1, scheduleMs.length - 1)];
      break;
    }
    default: {
      throw getError({
        message: `[computeBackoffDelayMs] Unknown backoff strategy '${strategy}' | Expected one of: ${[...RetryBackoffStrategies.SCHEME_SET].join(', ')}`,
      });
    }
  }

  delayMs = Math.min(delayMs, maxDelayMs);

  if (delayMs <= 0) {
    return 0;
  }

  switch (jitter) {
    case RetryJitterModes.NONE: {
      return delayMs;
    }
    case RetryJitterModes.FULL: {
      return Math.floor(Math.random() * delayMs);
    }
    case RetryJitterModes.EQUAL: {
      const half = delayMs / 2;
      return Math.floor(half + Math.random() * half);
    }
    default: {
      throw getError({
        message: `[computeBackoffDelayMs] Unknown jitter mode '${jitter}' | Expected one of: ${[...RetryJitterModes.SCHEME_SET].join(', ')}`,
      });
    }
  }
};

/**
 * Retries `execution` on failure with backoff, under an optional total-time budget.
 *
 * Semantics:
 * - Attempts stop at `maxAttempts`, or when `maxTotalMs` has elapsed, or when a computed backoff
 *   would overshoot the remaining budget - whichever comes first.
 * - `perAttemptTimeoutMs` races each attempt; under a budget it is additionally capped to the
 *   remaining budget, so the last attempt never outlives the deadline.
 * - `shouldRetry` is the classification hook: return `false` to rethrow immediately (permanent
 *   errors have no business retrying). Default retries every failure.
 * - On exhaustion the LAST error is thrown, after a `logger.warn` when a logger is provided.
 * - `signal` aborts between attempts and during backoff sleeps; it is also handed to `execution`
 *   for cooperative cancellation. JS cannot cancel a running promise - a timed-out attempt keeps
 *   running in the background unless the execution honors the signal.
 */
export const executeWithRetry = async <T>(opts: {
  signal?: AbortSignal;
  logger?: Logger;
  operation: string;

  /** Default 3. */
  maxAttempts?: number;

  /** Total budget across attempts AND sleeps. Default: unlimited. */
  maxTotalMs?: number;

  /** Per-attempt race. Default: no per-attempt timeout. */
  perAttemptTimeoutMs?: number;

  backoff?: IRetryBackoffOptions;

  execution: (context: { attempt: number; signal?: AbortSignal }) => ValueOrPromise<T>;

  /** Return `false` to stop retrying and rethrow `context.error` immediately. */
  shouldRetry?: (context: IRetryContext) => boolean;

  /** Observability hook, awaited before the backoff sleep. */
  onRetry?: (context: IRetryContext & { nextDelayMs: number }) => ValueOrPromise<void>;
}): Promise<T> => {
  const {
    operation,
    execution,
    maxAttempts = 3,
    maxTotalMs,
    perAttemptTimeoutMs,
    backoff,
    shouldRetry,
    onRetry,
    signal,
    logger,
  } = opts;

  if (maxAttempts < 1) {
    throw getError({
      message: `[executeWithRetry][${operation}] maxAttempts must be >= 1 | Got: ${maxAttempts}`,
    });
  }

  const startedAt = Date.now();
  // `!== undefined`, never truthiness: a budget of 0 - or a negative one, which is what
  // `deadline - Date.now()` yields under load - means NO time left, not unlimited time.
  const deadline = maxTotalMs !== undefined ? startedAt + maxTotalMs : undefined;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    throwIfAborted({ operation, signal });

    let attemptTimeoutMs = perAttemptTimeoutMs;
    if (deadline) {
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        break;
      }
      attemptTimeoutMs = attemptTimeoutMs ? Math.min(attemptTimeoutMs, remainingMs) : remainingMs;
    }

    try {
      return await runWithTimeout({
        operation,
        timeoutMs: attemptTimeoutMs,
        execution: () => execution({ attempt, signal }),
      });
    } catch (error) {
      lastError = error;
      const elapsedMs = Date.now() - startedAt;

      if (shouldRetry && !shouldRetry({ attempt, error, elapsedMs })) {
        throw error;
      }

      if (attempt >= maxAttempts) {
        break;
      }

      const nextDelayMs = computeBackoffDelayMs({ attempt, backoff });
      if (deadline && Date.now() + nextDelayMs >= deadline) {
        break;
      }

      logger
        ?.for('executeWithRetry')
        .debug(
          '[%s] Attempt %d/%d failed - retrying in %dms | Error: %s',
          operation,
          attempt,
          maxAttempts,
          nextDelayMs,
          error,
        );

      await onRetry?.({ attempt, error, elapsedMs, nextDelayMs });

      if (nextDelayMs > 0) {
        await sleepWithSignal({ ms: nextDelayMs, operation, signal });
      }
    }
  }

  const elapsedMs = Date.now() - startedAt;

  // The budget can run out BEFORE the first attempt (an expired `maxTotalMs`), leaving no error to
  // rethrow. `throw undefined` would detonate inside the caller's own handler on `error.message`.
  if (lastError === undefined) {
    throw getError({
      message: `[executeWithRetry][${operation}] Time budget exhausted before any attempt ran | maxTotalMs: ${maxTotalMs}`,
    });
  }

  logger
    ?.for('executeWithRetry')
    .warn('[%s] Exhausted retries | Elapsed: %dms | Error: %s', operation, elapsedMs, lastError);

  throw lastError;
};
