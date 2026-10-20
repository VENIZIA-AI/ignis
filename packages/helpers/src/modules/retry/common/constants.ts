import type { TConstValue } from '@/common';

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
