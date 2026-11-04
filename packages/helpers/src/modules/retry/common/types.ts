import type { TRetryBackoffStrategy, TRetryJitterMode } from './constants';

/** Retry delay settings; every field is optional and the defaults are noted per field. */
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

/** State passed to retry callbacks: the attempt number, the error that triggered the retry and the elapsed time in milliseconds. */
export interface IRetryContext {
  attempt: number;
  error: unknown;
  elapsedMs: number;
}
