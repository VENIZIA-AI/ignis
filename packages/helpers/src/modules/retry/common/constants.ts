import { ConstClass } from '@/common/const-class';
import type { TConstValue } from '@/common';

/** How the retry delay grows between attempts. */
export class RetryBackoffStrategies extends ConstClass {
  static readonly FIXED = 'fixed';
  static readonly LINEAR = 'linear';
  static readonly EXPONENTIAL = 'exponential';

  /** An explicit per-attempt cap schedule, e.g. [250, 1000, 4000]; the last entry repeats. */
  static readonly SCHEDULE = 'schedule';
}

/** Union of the `RetryBackoffStrategies` values. */
export type TRetryBackoffStrategy = TConstValue<typeof RetryBackoffStrategies>;

/** How randomness is applied to a computed retry delay. */
export class RetryJitterModes extends ConstClass {
  /** The computed delay is used as-is. */
  static readonly NONE = 'none';

  /** Uniform random in [0, delay) - decorrelates a thundering herd hardest. */
  static readonly FULL = 'full';

  /** delay/2 + uniform random in [0, delay/2) - jittered but never less than half the delay. */
  static readonly EQUAL = 'equal';
}

/** Union of the `RetryJitterModes` values. */
export type TRetryJitterMode = TConstValue<typeof RetryJitterModes>;
