import { HTTP } from '@/common/constants/http';
import { getError } from '@/modules/error';
import type { ITemporalAdapter, ITemporalNamespace } from '../common/types';
import { isTemporalNamespace } from './guards';

const NANOSECONDS_PER_MILLISECOND = 1_000_000;

/**
 * Time zones through the TC39 `Temporal` API: the runtime's global (Bun has it, as do current
 * browsers), or a polyfill's namespace passed as `temporal`.
 */
export class NativeTemporalAdapter implements ITemporalAdapter {
  private readonly temporal: ITemporalNamespace;

  constructor(opts?: { temporal?: ITemporalNamespace }) {
    const temporal: unknown = opts?.temporal ?? Reflect.get(globalThis, 'Temporal');

    if (!isTemporalNamespace(temporal)) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        message:
          '[NativeTemporalAdapter] Temporal is not available on this runtime | Pass a polyfill as `temporal`, or use DayjsTemporalAdapter / LuxonTemporalAdapter',
      });
    }

    this.temporal = temporal;
  }

  getOffsetMilliseconds(opts: { value: Date; timeZone: string }): number {
    const { value, timeZone } = opts;

    try {
      const zoned = this.temporal.Instant.fromEpochMilliseconds(value.getTime()).toZonedDateTimeISO(
        timeZone,
      );
      return zoned.offsetNanoseconds / NANOSECONDS_PER_MILLISECOND;
    } catch (error) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[NativeTemporalAdapter] no offset for ${timeZone} at ${value.getTime()} | ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
}
