import { DurationMultipliers, IDuration } from '@/common';
import { getError } from '@/modules/error';
import { StoragePresignLimits } from './constants';

/** S3 presigns in whole seconds. An unknown unit is refused; `null` would read as "no expiry". */
export const toExpirySeconds = (opts: { expiresIn: IDuration; operation: string }): number => {
  const { expiresIn, operation } = opts;
  const milliseconds = DurationMultipliers.toMilliseconds(expiresIn);

  if (milliseconds === null || milliseconds <= 0) {
    throw getError({
      message: `[${operation}] Invalid expiry | unit: ${expiresIn?.unit} | value: ${expiresIn?.value}`,
    });
  }

  const seconds = Math.ceil(milliseconds / DurationMultipliers.SECOND);

  // SigV4 caps a presigned URL at 7 days. `IDuration` accepts `month` and `year`, which type-check
  // and then produce a URL the provider rejects - refused here, where the unit is still readable.
  if (seconds > StoragePresignLimits.MAX_EXPIRES_IN_SECONDS) {
    throw getError({
      message: `[${operation}] Expiry exceeds the SigV4 maximum of 7 days | unit: ${expiresIn.unit} | value: ${expiresIn.value}`,
    });
  }

  return seconds;
};
