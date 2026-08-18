import { getError } from '@venizia/ignis-helpers/core';
import { HTTP } from '@venizia/ignis-helpers/common';
import { customType } from 'drizzle-orm/pg-core';

/** Normalizes timestamps to ISO 8601 both ways - Drizzle's `mode: 'date'` isn't JSON-friendly and `mode: 'string'` returns Postgres's raw format. */
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
