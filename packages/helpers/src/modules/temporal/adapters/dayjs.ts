import { HTTP } from '@/common/constants/http';
import { getError } from '@/modules/error';
import type { IDayjsFactory, ITemporalAdapter } from '../common/types';

const MILLISECONDS_PER_MINUTE = 60_000;

/** The Gregorian calendar repeats every 400 years, to the day and the weekday. */
const GREGORIAN_CYCLE_MILLISECONDS = 146_097 * 86_400_000;

/** 1000-01-01T00:00:00Z. dayjs reads a year below 100 as 19xx; no zone changed its offset before the 1800s. */
const FIRST_SAFE_EPOCH = -30_610_224_000_000;

/**
 * Time zones through your own `dayjs`, passed in rather than imported: this package never loads
 * dayjs, and you keep whatever plugins, locale and default zone you configured.
 *
 * Only `utcOffset()` is read, which stays right whatever the host zone; dayjs's own `format()`
 * near the host's daylight-saving change does not, and is never used here. dayjs does misread a
 * local mean time offset under one hour (London before 1848 reads `-01:15`, not `-00:01:15`);
 * for such dates use `NativeTemporalAdapter` or `LuxonTemporalAdapter`.
 */
export class DayjsTemporalAdapter implements ITemporalAdapter {
  private readonly dayjs: IDayjsFactory;

  constructor(opts: { dayjs: IDayjsFactory }) {
    if (typeof opts.dayjs?.tz !== 'function') {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message:
          '[DayjsTemporalAdapter] dayjs has no `tz` | Extend the utc and timezone plugins first: dayjs.extend(utc), then dayjs.extend(timezone)',
      });
    }

    this.dayjs = opts.dayjs;
  }

  getOffsetMilliseconds(opts: { value: Date; timeZone: string }): number {
    const { value, timeZone } = opts;

    let epoch = value.getTime();
    while (epoch < FIRST_SAFE_EPOCH) {
      epoch += GREGORIAN_CYCLE_MILLISECONDS;
    }

    try {
      return this.dayjs(epoch).tz(timeZone).utcOffset() * MILLISECONDS_PER_MINUTE;
    } catch (error) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[DayjsTemporalAdapter] no offset for ${timeZone} at ${value.getTime()} | ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
