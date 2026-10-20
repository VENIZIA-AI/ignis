import type { TRetryBackoffStrategy, TRetryJitterMode } from './constants';

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
