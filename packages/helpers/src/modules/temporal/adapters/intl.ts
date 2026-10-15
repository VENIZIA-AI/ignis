import { HTTP } from '@/common/constants/http';
import { getError } from '@/modules/error';
import type { ITemporalAdapter } from '../common/types';

/** One formatter per zone: building an `Intl.DateTimeFormat` costs far more than using one. */
const MAX_CACHED_FORMATTERS = 256;

const SECOND_MILLISECONDS = 1000;

/**
 * Time zones through `Intl.DateTimeFormat` alone - no `Temporal`, no polyfill, no date library - so
 * it runs in every browser and every server runtime. The offset is the zone's wall clock at the
 * instant, read field by field, minus the instant itself.
 */
export class IntlTemporalAdapter implements ITemporalAdapter {
  private static readonly formatters = new Map<
    string,
    { formatter: Intl.DateTimeFormat; commonEra: string | undefined }
  >();

  /** The zone's formatter, and how it spells the common era - so any other era is before year 1, whatever the engine calls it. */
  private static formatterOf(opts: { tz: string }): {
    formatter: Intl.DateTimeFormat;
    commonEra: string | undefined;
  } {
    const { tz } = opts;
    const cached = IntlTemporalAdapter.formatters.get(tz);
    if (cached) {
      return cached;
    }

    let formatter: Intl.DateTimeFormat;
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        era: 'short',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      });
    } catch (error) {
      throw getError({
        statusCode: HTTP.ResultCodes.RS_4.BadRequest,
        message: `[IntlTemporalAdapter] unknown time zone '${tz}' | ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    const commonEra = formatter.formatToParts(new Date(0)).find(part => part.type === 'era')?.value;

    // Full: the oldest zone makes room, so zone 257 is not rebuilt on every call.
    if (IntlTemporalAdapter.formatters.size >= MAX_CACHED_FORMATTERS) {
      const oldest = IntlTemporalAdapter.formatters.keys().next().value;
      if (oldest !== undefined) {
        IntlTemporalAdapter.formatters.delete(oldest);
      }
    }
    const entry = { formatter, commonEra };
    IntlTemporalAdapter.formatters.set(tz, entry);
    return entry;
  }

  getOffsetMilliseconds(opts: { value: Date; tz: string }): number {
    const { value, tz } = opts;
    const epoch = value.getTime();

    const fields = { year: 0, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
    let isBeforeCommonEra = false;
    const { formatter, commonEra } = IntlTemporalAdapter.formatterOf({ tz });
    for (const part of formatter.formatToParts(value)) {
      if (part.type === 'era') {
        isBeforeCommonEra = commonEra !== undefined && part.value !== commonEra;
        continue;
      }
      if (part.type in fields) {
        Reflect.set(fields, part.type, Number(part.value));
      }
    }

    // Before year 1 the formatter counts eras: 1 BC is year 0 on the proleptic calendar.
    const year = isBeforeCommonEra ? 1 - fields.year : fields.year;
    // Some engines still write midnight as hour 24 under h23.
    const hour = fields.hour === 24 ? 0 : fields.hour;

    const wallClock = new Date(0);
    wallClock.setUTCFullYear(year, fields.month - 1, fields.day);
    wallClock.setUTCHours(hour, fields.minute, fields.second, 0);

    // The formatter writes whole seconds: compare against the instant truncated the same way.
    const wholeSecond =
      epoch - (((epoch % SECOND_MILLISECONDS) + SECOND_MILLISECONDS) % SECOND_MILLISECONDS);
    return wallClock.getTime() - wholeSecond;
  }
}
