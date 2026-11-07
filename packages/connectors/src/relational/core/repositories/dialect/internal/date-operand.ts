import { EchoUtility } from '@/common/internal';
import { HTTP } from '@venizia/ignis-helpers/common';
import { getError } from '@venizia/ignis-helpers/core';

/** Longest part of a refused value an error message quotes. */
const ECHO_MAX_LENGTH = 64;

/**
 * `YYYY-MM-DD`, or `YYYY-MM-DDTHH:mm[:ss[.fff]]` with `Z` or `+HH:mm`. A date-time with no zone is not accepted: `Date`
 * would read it in the host's zone, so the same filter would mean two instants on two servers.
 */
const ISO_8601 =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](\d{2}):(\d{2})))?$/;

/** A filter value for a column Drizzle maps from a `Date` (`timestamp`, `date`, SQLite `integer({ mode: 'timestamp' })`). */
export class DateOperandUtility {
  static readonly ACCEPTED =
    'an ISO 8601 string (YYYY-MM-DD, or a date-time with T and an offset or Z), a finite number of epoch milliseconds, a Date or null';

  /** A Drizzle column that takes a `Date`. A column with its own driver mapping (a custom type) or a string mode is not one. */
  static isDateColumn(opts: { column: unknown }): boolean {
    const { column } = opts;

    return (
      typeof column === 'object' && column !== null && Reflect.get(column, 'dataType') === 'date'
    );
  }

  /** The `Date` a value stands for, or `undefined` when it stands for none. */
  private static parse(opts: { value: unknown }): Date | undefined {
    const { value } = opts;

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? undefined : value;
    }

    if (typeof value === 'number') {
      const date = new Date(value);

      return Number.isFinite(value) && !Number.isNaN(date.getTime()) ? date : undefined;
    }

    if (typeof value !== 'string') {
      return undefined;
    }

    const match = ISO_8601.exec(value);

    if (!match) {
      return undefined;
    }

    const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
    const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    const isCalendarDate =
      calendar.getUTCFullYear() === Number(year) &&
      calendar.getUTCMonth() === Number(month) - 1 &&
      calendar.getUTCDate() === Number(day);
    const isClock =
      Number(hour ?? 0) <= 23 &&
      Number(minute ?? 0) <= 59 &&
      Number(second ?? 0) <= 59 &&
      Number(offsetHour ?? 0) <= 23 &&
      Number(offsetMinute ?? 0) <= 59;

    if (!isCalendarDate || !isClock) {
      return undefined;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  /** What the refusal says about the value: its text for a string or number, its type otherwise. */
  private static echo(opts: { value: unknown }): string {
    const { value } = opts;

    if (typeof value === 'string') {
      const quoted =
        value.length > ECHO_MAX_LENGTH ? `${value.slice(0, ECHO_MAX_LENGTH)}...` : value;

      return `'${EchoUtility.toSafeEcho({ value: quoted })}'`;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return EchoUtility.toSafeEcho({ value: String(value) });
    }

    return EchoUtility.toSafeEcho({
      value: value instanceof Date ? 'an invalid Date' : `a value of type ${typeof value}`,
    });
  }

  /** One operand as the `Date` the column maps, or a 400 that names the table, the column and the accepted forms. */
  static toDate(opts: { value: unknown; key: string; tableName: string }): Date {
    const { value, key, tableName } = opts;
    const date = DateOperandUtility.parse({ value });

    if (date) {
      return date;
    }

    throw getError({
      statusCode: HTTP.ResultCodes.RS_4.BadRequest,
      message: `[FilterBuilder][toWhere] Table: ${tableName} | Column: '${key}' is a timestamp column | expected: ${DateOperandUtility.ACCEPTED} | got: ${DateOperandUtility.echo({ value })}`,
    });
  }
}
