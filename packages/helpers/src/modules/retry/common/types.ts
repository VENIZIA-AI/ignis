import type { TRetryBackoffStrategy, TRetryJitterMode } from './constants';

/** Retry delay settings; every field is optional. */
export interface IRetryBackoffOptions {
  /** @default RetryBackoffStrategies.EXPONENTIAL */
  strategy?: TRetryBackoffStrategy;

  /**
   * First delay in milliseconds. LINEAR adds it per attempt; EXPONENTIAL multiplies from it.
   *
   * @default 250
   */
  initialDelayMs?: number;

  /**
   * EXPONENTIAL growth factor. Ignored by other strategies.
   *
   * @default 2
   */
  multiplier?: number;

  /**
   * Upper cap in milliseconds, applied BEFORE jitter.
   *
   * @default 30_000
   */
  maxDelayMs?: number;

  /** Required when strategy is SCHEDULE; the last entry repeats for later attempts. */
  scheduleMs?: readonly number[];

  /** @default RetryJitterModes.FULL */
  jitter?: TRetryJitterMode;
}

/** State passed to retry callbacks: the attempt number, the error that triggered the retry and the elapsed time in milliseconds. */
export interface IRetryContext {
  attempt: number;
  error: unknown;
  elapsedMs: number;
}
