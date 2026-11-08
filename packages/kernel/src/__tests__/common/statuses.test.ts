import { CommonStatuses, Statuses } from '@/common/statuses/common';
import { describe, expect, test } from 'bun:test';

const CHECKS = [
  { name: 'isInitial', digit: '0', set: Statuses.INITIAL_SCHEME_SET },
  { name: 'isPending', digit: '1', set: Statuses.PENDING_SCHEME_SET },
  { name: 'isActive', digit: '2', set: Statuses.ACTIVE_SCHEME_SET },
  { name: 'isCompleted', digit: '3', set: Statuses.COMPLETED_SCHEME_SET },
  { name: 'isInactive', digit: '4', set: Statuses.INACTIVE_SCHEME_SET },
  { name: 'isFailed', digit: '5', set: Statuses.FAILED_SCHEME_SET },
] as const;

/** An application's own phase codes, added to the built-in ones by extending the class. */
class OrderStatuses extends Statuses {
  static readonly SHIPPING = '209_SHIPPING';
  static readonly RETURNED = '409_RETURNED';
}

describe('the seven generic statuses sit in their phase', () => {
  test.each([
    ['OPEN', '105_OPEN', Statuses.PENDING_SCHEME_SET],
    ['SUBMITTED', '106_SUBMITTED', Statuses.PENDING_SCHEME_SET],
    ['READY', '206_READY', Statuses.ACTIVE_SCHEME_SET],
    ['PUBLISHED', '207_PUBLISHED', Statuses.ACTIVE_SCHEME_SET],
    ['ISSUED', '208_ISSUED', Statuses.ACTIVE_SCHEME_SET],
    ['RESOLVED', '306_RESOLVED', Statuses.COMPLETED_SCHEME_SET],
    ['VOIDED', '508_VOIDED', Statuses.FAILED_SCHEME_SET],
  ] as const)('%s is %s, in its phase set and in SCHEME_SET', (name, code, set) => {
    expect(Statuses[name]).toBe(code);
    expect(set.has(code)).toBe(true);
    expect(Statuses.SCHEME_SET.has(code)).toBe(true);
  });
});

describe('the category checks read the leading digit of a code', () => {
  test.each(CHECKS)(
    '$name is true for every built-in code of its set and for no other',
    (check) => {
      for (const status of Statuses.SCHEME_SET) {
        expect(Statuses[check.name](status), status).toBe(check.set.has(status));
      }

      expect(check.set.size).toBeGreaterThan(0);
    },
  );

  test.each(CHECKS)(
    '$name is true for a code of its digit that no built-in list holds',
    (check) => {
      expect(Statuses[check.name](`${check.digit}99_CUSTOM`)).toBe(true);
    },
  );

  test('a subclass adds its own codes, and the built-in constants are inherited', () => {
    expect(OrderStatuses.isActive(OrderStatuses.SHIPPING)).toBe(true);
    expect(OrderStatuses.isPending(OrderStatuses.SHIPPING)).toBe(false);
    expect(OrderStatuses.isInactive(OrderStatuses.RETURNED)).toBe(true);
    expect(OrderStatuses.ACTIVATED).toBe(Statuses.ACTIVATED);
    expect(OrderStatuses.isActive(OrderStatuses.ACTIVATED)).toBe(true);
  });
});

describe('isValid checks the shape of a code, not membership of the built-in list', () => {
  test('every built-in code is valid, and so is a well-formed code of an application', () => {
    for (const status of Statuses.SCHEME_SET) {
      expect(Statuses.isValid(status), status).toBe(true);
    }

    expect(OrderStatuses.isValid(OrderStatuses.SHIPPING)).toBe(true);
  });

  test.each([
    '',
    '207',
    '207_',
    '207_shipping',
    '607_SHIPPING',
    '20_SHIPPING',
    '2077_SHIPPING',
    'X07_SHIPPING',
    '207-SHIPPING',
    '207_SHIPPING ',
    ' 207_SHIPPING',
    '207_SHIP PING',
  ])('%j is not valid', (status) => {
    expect(Statuses.isValid(status)).toBe(false);
  });
});

describe('CommonStatuses keeps its own list', () => {
  test('isValid is still membership of its five statuses', () => {
    expect(CommonStatuses.isValid(CommonStatuses.ACTIVATED)).toBe(true);
    expect(CommonStatuses.isValid(Statuses.RUNNING)).toBe(false);
    expect(CommonStatuses.isValid('209_SHIPPING')).toBe(false);
  });
});
