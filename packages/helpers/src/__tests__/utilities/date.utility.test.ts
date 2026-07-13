import { describe, expect, test } from 'bun:test';
import {
  dayjs,
  getDateTz,
  getNextWeekday,
  getPreviousWeekday,
  hrTime,
  isWeekday,
  sleep,
} from '@/utilities/date.utility';

describe('sleep', () => {
  test('resolves after at least the requested delay', async () => {
    const started = performance.now();
    await sleep(20);
    expect(performance.now() - started).toBeGreaterThanOrEqual(15);
  });

  test('resolves immediately for 0', async () => {
    await sleep(0);
    expect(true).toBe(true);
  });
});

describe('default timezone', () => {
  test('the module sets Asia/Ho_Chi_Minh (+07:00) as the dayjs default timezone', () => {
    const parsed = dayjs.tz('2026-06-15 12:00:00');
    expect(parsed.utcOffset()).toBe(420);
    expect(parsed.toISOString()).toBe('2026-06-15T05:00:00.000Z');
  });

  test('an explicitly passed timezone overrides the default', () => {
    const utc = getDateTz({ date: '2026-06-15T05:00:00.000Z', timezone: 'UTC' });
    expect(utc.utcOffset()).toBe(0);
    expect(utc.format('YYYY-MM-DD HH:mm')).toBe('2026-06-15 05:00');

    const saigon = getDateTz({ date: '2026-06-15T05:00:00.000Z', timezone: 'Asia/Ho_Chi_Minh' });
    expect(saigon.utcOffset()).toBe(420);
    expect(saigon.format('YYYY-MM-DD HH:mm')).toBe('2026-06-15 12:00');

    const tokyo = getDateTz({ date: '2026-06-15T05:00:00.000Z', timezone: 'Asia/Tokyo' });
    expect(tokyo.utcOffset()).toBe(540);
  });

  test('timeOffset shifts the result by whole hours', () => {
    const shifted = getDateTz({
      date: '2026-06-15T05:00:00.000Z',
      timezone: 'UTC',
      timeOffset: 3,
    });
    expect(shifted.toISOString()).toBe('2026-06-15T08:00:00.000Z');
  });
});

describe('isWeekday', () => {
  test('Monday through Friday are weekdays, Saturday and Sunday are not', () => {
    expect(isWeekday('2026-06-15')).toBe(true);
    expect(isWeekday('2026-06-19')).toBe(true);
    expect(isWeekday('2026-06-20')).toBe(false);
    expect(isWeekday('2026-06-21')).toBe(false);
  });
});

describe('getPreviousWeekday / getNextWeekday', () => {
  test('skip over the weekend', () => {
    expect(getPreviousWeekday({ date: '2026-06-22' }).format('YYYY-MM-DD')).toBe('2026-06-19');
    expect(getNextWeekday({ date: '2026-06-19' }).format('YYYY-MM-DD')).toBe('2026-06-22');
  });

  test('step by one day when the neighbour is already a weekday', () => {
    expect(getPreviousWeekday({ date: '2026-06-17' }).format('YYYY-MM-DD')).toBe('2026-06-16');
    expect(getNextWeekday({ date: '2026-06-17' }).format('YYYY-MM-DD')).toBe('2026-06-18');
  });

  test('default to now when no date is given', () => {
    expect(isWeekday(getNextWeekday().toISOString())).toBe(true);
    expect(isWeekday(getPreviousWeekday().toISOString())).toBe(true);
    expect(isWeekday(getNextWeekday({}).toISOString())).toBe(true);
  });
});

describe('hrTime', () => {
  test('returns a monotonically non-decreasing second-resolution float', () => {
    const first = hrTime();
    const second = hrTime();

    expect(typeof first).toBe('number');
    expect(second).toBeGreaterThanOrEqual(first);
  });
});
