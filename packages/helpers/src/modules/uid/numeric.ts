import { HTTP } from '@/common/constants';
import { BaseHelper } from '../base';
import { getError } from '../error';
import { DEFAULT_NUMERIC_LENGTH } from './common/constants';
import { UidRandom } from './common/random';
import type { INumericUidOptions } from './common/types';

/**
 * Zero-padded numeric codes, uniformly distributed: `042917`. Use it for a code a human types - a
 * one-time password, an email verification code.
 *
 * Six digits is a million codes, so a code needs an expiry and an attempt limit; the digits alone
 * are not the defence. For a secret that is not typed, use `TokenUidHelper`.
 *
 * `10 ** length` must be an integer up to `2 ** 48` (`length` 14 at most), the range one draw covers.
 */
export class NumericUidHelper extends BaseHelper {
  private readonly length: number;
  private readonly max: number;

  constructor(opts?: INumericUidOptions) {
    super({ scope: NumericUidHelper.name });

    this.length = opts?.length ?? DEFAULT_NUMERIC_LENGTH;
    this.max = Math.pow(10, this.length);

    if (!UidRandom.isValidMax({ max: this.max })) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message: `[${NumericUidHelper.name}] Invalid length | 10 ** length must be an integer from 1 to ${UidRandom.MAX_BELOW} | length: ${this.length}`,
      });
    }
  }

  nextId(): string {
    return UidRandom.below({ max: this.max }).toString().padStart(this.length, '0');
  }
}
