import { HTTP } from '@/common/constants/http';
import { getError } from '@/modules/error';
import type { ILuxonDateTimeFactory, ITemporalAdapter } from '../common/types';

const MILLISECONDS_PER_MINUTE = 60_000;

/** Time zones through your own Luxon `DateTime`, passed in rather than imported. */
export class LuxonTemporalAdapter implements ITemporalAdapter {
  private readonly dateTime: ILuxonDateTimeFactory;

  constructor(opts: { DateTime: ILuxonDateTimeFactory }) {
    this.dateTime = opts.DateTime;
  }

  getOffsetMilliseconds(opts: { value: Date; timeZone: string }): number {
    const { value, timeZone } = opts;
    const zoned = this.dateTime.fromMillis(value.getTime(), { zone: timeZone });

    // Luxon answers an unusable zone with an invalid `DateTime` rather than a throw.
    if (!zoned.isValid) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[LuxonTemporalAdapter] no offset for ${timeZone} at ${value.getTime()} | ${zoned.invalidReason ?? 'invalid'}`,
      });
    }
    return zoned.offset * MILLISECONDS_PER_MINUTE;
  }
}
