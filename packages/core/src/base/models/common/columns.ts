import { getError, HTTP } from '@venizia/ignis-helpers';
import { customType } from 'drizzle-orm/pg-core';
// --------------------------------------------------------------------------------
/**
 * Custom timestamp type that ensures ISO 8601 string format in both directions.
 *
 * PROBLEM: Drizzle's built-in timestamp types have incompatible behaviors:
 * - mode: 'date' → Type-safe but FE must send Date objects (not JSON-friendly)
 * - mode: 'string' → Accepts strings but returns PostgreSQL format "YYYY-MM-DD HH:mm:ss+TZ" instead of ISO 8601
 *
 * SOLUTION: This custom type accepts ISO strings from FE and converts PostgreSQL
 * timestamps back to ISO 8601 format (e.g., "2026-02-11T04:15:55.533Z") for consistency
 * across API boundaries.
 */
export const isoTimestamp = (name: string, config?: { withTimezone?: boolean }) => {
  return customType<{
    data: string;
    driverData: string;
    config: { withTimezone?: boolean };
  }>({
    dataType() {
      const tz = config?.withTimezone ? ' with time zone' : '';
      return `timestamp${tz}`;
    },
    toDriver(value: string | Date): string {
      if (value instanceof Date) {
        return value.toISOString();
      }

      return value;
    },
    fromDriver(value: string): string {
      const date = new Date(value);

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
