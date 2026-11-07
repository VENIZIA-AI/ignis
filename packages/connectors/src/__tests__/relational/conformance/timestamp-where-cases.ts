import type { AnyType } from '@venizia/ignis-helpers/common';
import { isApplicationError } from '@venizia/ignis-helpers/core';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { describe, expect, test } from 'bun:test';

/**
 * A request filter is JSON, which has no `Date`: a timestamp column is filtered with an ISO 8601 string or
 * epoch milliseconds, and the filter builder turns it into a `Date`. These cases run against both engines
 * (`pglite-timestamp-where.test.ts`, `libsql-timestamp-where.test.ts`).
 */

export const TIMESTAMP_TABLE = 'ts_where_event';

/** Whole seconds, so a seconds-resolution column holds the same instants as a millisecond one. */
export const TIMESTAMP_ROWS: Array<{ id: number; at: Date | null }> = [
  { id: 1, at: new Date('2026-11-06T00:00:00.000Z') },
  { id: 2, at: new Date('2026-11-07T00:00:00.000Z') },
  { id: 3, at: new Date('2026-11-08T12:30:00.000Z') },
  { id: 4, at: null },
];

const NOV_7 = '2026-11-07T00:00:00.000Z';
const NOV_8 = '2026-11-08T12:30:00Z';
const NOV_7_MS = Date.parse(NOV_7);
const NOV_8_MS = Date.parse(NOV_8);

interface IAcceptedCase {
  name: string;
  where: (column: string) => AnyType;
  ids: number[];
}

const ACCEPTED: IAcceptedCase[] = [
  { name: 'a bare ISO date-time with Z', where: (c) => ({ [c]: NOV_7 }), ids: [2] },
  { name: 'a bare date', where: (c) => ({ [c]: '2026-11-07' }), ids: [2] },
  {
    name: 'a date-time with an offset',
    where: (c) => ({ [c]: '2026-11-07T07:00:00+07:00' }),
    ids: [2],
  },
  { name: 'a date-time with no seconds', where: (c) => ({ [c]: '2026-11-07T00:00Z' }), ids: [2] },
  {
    name: 'a date-time with fractional seconds',
    where: (c) => ({ [c]: '2026-11-07T00:00:00.000Z' }),
    ids: [2],
  },
  { name: 'epoch milliseconds', where: (c) => ({ [c]: NOV_7_MS }), ids: [2] },
  { name: 'a Date', where: (c) => ({ [c]: new Date(NOV_7) }), ids: [2] },
  { name: 'null', where: (c) => ({ [c]: null }), ids: [4] },
  { name: 'eq', where: (c) => ({ [c]: { eq: NOV_7 } }), ids: [2] },
  { name: 'ne', where: (c) => ({ [c]: { ne: NOV_7 } }), ids: [1, 3] },
  { name: 'neq', where: (c) => ({ [c]: { neq: '2026-11-07' } }), ids: [1, 3] },
  { name: 'is', where: (c) => ({ [c]: { is: NOV_7 } }), ids: [2] },
  { name: 'isn', where: (c) => ({ [c]: { isn: NOV_7 } }), ids: [1, 3] },
  { name: 'gt with a string', where: (c) => ({ [c]: { gt: '2026-11-07' } }), ids: [3] },
  { name: 'gt with a number', where: (c) => ({ [c]: { gt: NOV_7_MS } }), ids: [3] },
  { name: 'gte', where: (c) => ({ [c]: { gte: NOV_7 } }), ids: [2, 3] },
  { name: 'lt', where: (c) => ({ [c]: { lt: NOV_7 } }), ids: [1] },
  { name: 'lte', where: (c) => ({ [c]: { lte: NOV_7 } }), ids: [1, 2] },
  {
    name: 'gt and lt together',
    where: (c) => ({ [c]: { gt: '2026-11-06', lt: NOV_8 } }),
    ids: [2],
  },
  {
    name: 'between, a string and a number',
    where: (c) => ({ [c]: { between: [NOV_7, NOV_8_MS] } }),
    ids: [2, 3],
  },
  {
    name: 'notBetween',
    where: (c) => ({ [c]: { notBetween: [NOV_7, NOV_8] } }),
    ids: [1],
  },
  { name: 'in', where: (c) => ({ [c]: { in: [NOV_7, NOV_8_MS] } }), ids: [2, 3] },
  { name: 'inq', where: (c) => ({ [c]: { inq: ['2026-11-07', NOV_8] } }), ids: [2, 3] },
  { name: 'nin', where: (c) => ({ [c]: { nin: [NOV_7, NOV_8] } }), ids: [1] },
  {
    name: 'in with a Date and a string',
    where: (c) => ({ [c]: { in: [new Date(NOV_7), NOV_8] } }),
    ids: [2, 3],
  },
  { name: 'a bare array', where: (c) => ({ [c]: [NOV_7, NOV_8] }), ids: [2, 3] },
  { name: 'an empty in list', where: (c) => ({ [c]: { in: [] } }), ids: [] },
  {
    name: 'not with an operator object',
    where: (c) => ({ [c]: { not: { gt: NOV_7 } } }),
    ids: [1, 2],
  },
  { name: 'not with a bare value', where: (c) => ({ [c]: { not: NOV_7 } }), ids: [1, 3] },
  {
    name: 'inside or',
    where: (c) => ({ or: [{ [c]: { lt: NOV_7 } }, { [c]: { gt: '2026-11-08' } }] }),
    ids: [1, 3],
  },
  {
    name: 'inside and, nested in or',
    where: (c) => ({
      or: [{ and: [{ [c]: { gte: '2026-11-07' } }, { [c]: { lt: NOV_8 } }] }, { [c]: null }],
    }),
    ids: [2, 4],
  },
];

interface IRefusedCase {
  name: string;
  where: (column: string) => AnyType;
  /** Text the refusal echoes back, when the value is echoed. */
  echo?: string;
}

const REFUSED: IRefusedCase[] = [
  { name: 'a word', where: (c) => ({ [c]: 'tomorrow' }), echo: 'tomorrow' },
  { name: 'a locale date', where: (c) => ({ [c]: '11/07/2026' }), echo: '11/07/2026' },
  { name: 'a day past the end of the month', where: (c) => ({ [c]: '2026-02-31' }) },
  { name: 'a month past 12', where: (c) => ({ [c]: '2026-13-01' }) },
  { name: 'an hour past 23', where: (c) => ({ [c]: '2026-11-07T24:00:00Z' }) },
  { name: 'a date-time with no zone', where: (c) => ({ [c]: '2026-11-07T10:00:00' }) },
  { name: 'an empty string', where: (c) => ({ [c]: '' }) },
  { name: 'a numeric string', where: (c) => ({ [c]: String(NOV_7_MS) }), echo: String(NOV_7_MS) },
  { name: 'NaN', where: (c) => ({ [c]: Number.NaN }) },
  { name: 'Infinity', where: (c) => ({ [c]: { gt: Number.POSITIVE_INFINITY } }) },
  { name: 'a number past the Date range', where: (c) => ({ [c]: { gt: 8.64e15 + 1 } }) },
  { name: 'an invalid Date', where: (c) => ({ [c]: { gt: new Date('nope') } }) },
  { name: 'a boolean', where: (c) => ({ [c]: true }) },
  { name: 'a boolean operand', where: (c) => ({ [c]: { eq: false } }) },
  { name: 'an object', where: (c) => ({ [c]: { foo: 1 } }) },
  { name: 'an object operand', where: (c) => ({ [c]: { gt: { a: 1 } } }) },
  { name: 'undefined as an operand', where: (c) => ({ [c]: { gt: undefined } }) },
  { name: 'a bad gt', where: (c) => ({ [c]: { gt: 'bad' } }), echo: 'bad' },
  { name: 'a bad lte', where: (c) => ({ [c]: { lte: 'bad' } }), echo: 'bad' },
  { name: 'a bad ne', where: (c) => ({ [c]: { ne: 'bad' } }), echo: 'bad' },
  { name: 'a bad element of in', where: (c) => ({ [c]: { in: [NOV_7, 'bad'] } }), echo: 'bad' },
  { name: 'a bad element of nin', where: (c) => ({ [c]: { nin: [true] } }) },
  { name: 'a bad element of a bare array', where: (c) => ({ [c]: [NOV_7, 'bad'] }), echo: 'bad' },
  {
    name: 'a bad low end of between',
    where: (c) => ({ [c]: { between: ['bad', NOV_7] } }),
    echo: 'bad',
  },
  {
    name: 'a bad high end of between',
    where: (c) => ({ [c]: { between: [NOV_7, 'bad'] } }),
    echo: 'bad',
  },
  {
    name: 'a bad end of notBetween',
    where: (c) => ({ [c]: { notBetween: [NOV_7, 'bad'] } }),
    echo: 'bad',
  },
  { name: 'a bad value inside not', where: (c) => ({ [c]: { not: { gt: 'bad' } } }), echo: 'bad' },
  { name: 'a bad bare value inside not', where: (c) => ({ [c]: { not: 'bad' } }), echo: 'bad' },
  {
    name: 'a bad value inside or',
    where: (c) => ({ or: [{ id: 1 }, { [c]: { gt: 'bad' } }] }),
    echo: 'bad',
  },
  {
    name: 'a bad value inside and nested in or',
    where: (c) => ({ or: [{ and: [{ [c]: { lt: 'bad' } }] }] }),
    echo: 'bad',
  },
  {
    name: 'a line break in the value',
    where: (c) => ({ [c]: 'a\nb c' }),
    echo: 'a\\u000ab\\u2028c',
  },
];

export class TimestampWhereCases {
  /**
   * `find` runs the repository read for a `where`; `columns` are the timestamp columns of the seeded table, each
   * holding `TIMESTAMP_ROWS`.
   */
  static register(opts: {
    engine: string;
    columns: string[];
    find: (where: AnyType) => Promise<Array<{ id: number }>>;
  }) {
    const { engine, columns, find } = opts;

    describe.each(columns)(`${engine} - a timestamp column ($0): filtered with`, (column) => {
      test.each(ACCEPTED)('$name', async (item) => {
        const rows = await find(item.where(column));

        expect(rows.map((row) => row.id).sort()).toEqual(item.ids);
      });
    });

    describe.each(columns)(`${engine} - a timestamp column ($0): refused with a 400`, (column) => {
      test.each(REFUSED)('$name', async (item) => {
        const error = await RejectionHelper.rejectionOf({ task: find(item.where(column)) });

        expect(isApplicationError(error) && error.statusCode).toBe(400);

        const message = error instanceof Error ? error.message : '';

        expect(message).toContain(`Table: ${TIMESTAMP_TABLE} |`);
        expect(message).toContain(`'${column}'`);
        expect(message).toContain('ISO 8601');
        expect(message).toContain('epoch milliseconds');

        if (item.echo) {
          expect(message).toContain(item.echo);
        }
      });
    });
  }
}
