import { getError, HTTP } from '@venizia/ignis-helpers';
import { customType } from 'drizzle-orm/sqlite-core';

/**
 * A date-time with no zone designator - what SQLite's own
 * `CURRENT_TIMESTAMP` writes. It is UTC by SQLite's definition, but `Date`
 * would read it as host-local, so the offset is pinned on the way in.
 */
const ZONELESS_DATE_TIME = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/;

/**
 * No date storage class - timestamps live in `text`, normalized
 * to ISO 8601 both ways so comparisons stay lexicographic.
 */
export const isoTimestamp = (name: string) => {
  return customType<{
    data: string;
    driverData: string;
  }>({
    dataType() {
      return 'text';
    },
    toDriver(value: string | Date): string {
      if (value instanceof Date) {
        return value.toISOString();
      }

      return value;
    },
    fromDriver(value: string): string {
      const zoneless = ZONELESS_DATE_TIME.exec(value);
      const date = new Date(zoneless ? `${zoneless[1]}T${zoneless[2]}Z` : value);

      if (isNaN(date.getTime())) {
        throw getError({
          message: `Invalid date string: ${value}`,
          statusCode: HTTP.ResultCodes.RS_5.InternalServerError,
        });
      }

      return date.toISOString();
    },
  })(name);
};

/**
 * SQLite `DEFAULT` takes an expression only in parentheses, and `CURRENT_TIMESTAMP` would yield
 * second-resolution text that `isoTimestamp` does not round-trip.
 */
export const ISO_TIMESTAMP_NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
