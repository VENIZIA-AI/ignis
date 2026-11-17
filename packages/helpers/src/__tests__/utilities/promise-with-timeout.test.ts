import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { isApplicationError } from '@/modules/error';
import { PromiseUtility } from '@/utilities/promise.utility';

/** Counts the timers `withTimeout` arms with the given delay and how many of them were cleared. */
const trackTimers = (delay: number) => {
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const armed = new Set<unknown>();

  globalThis.setTimeout = ((handler: unknown, ms?: number, ...rest: unknown[]) => {
    const handle = (realSet as AnyTimer)(handler, ms, ...rest);

    if (ms === delay) {
      armed.add(handle);
    }

    return handle;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((handle?: unknown) => {
    armed.delete(handle);

    return (realClear as AnyTimer)(handle);
  }) as typeof clearTimeout;

  return {
    pending: () => armed.size,
    restore: () => {
      globalThis.setTimeout = realSet;
      globalThis.clearTimeout = realClear;
    },
  };
};

type AnyTimer = (...args: unknown[]) => unknown;

/** What the promise rejects with; fails the test when it resolves. */
const rejectionOf = async (execution: Promise<unknown>): Promise<unknown> => {
  try {
    await execution;
  } catch (error) {
    return error;
  }

  throw new Error('Expected the promise to reject, but it resolved');
};

const LIMIT_MS = 4321;

describe('PromiseUtility.withTimeout', () => {
  let timers: ReturnType<typeof trackTimers>;

  beforeEach(() => {
    timers = trackTimers(LIMIT_MS);
  });

  afterEach(() => {
    timers.restore();
  });

  test('the call wins: resolves with its result and leaves no timer behind', async () => {
    const result = await PromiseUtility.withTimeout({
      call: async () => 'done',
      timeoutMs: LIMIT_MS,
    });

    expect(result).toBe('done');
    expect(timers.pending()).toBe(0);
  });

  test('a synchronous return value is accepted', async () => {
    const result2 = await PromiseUtility.withTimeout({ call: () => 7, timeoutMs: LIMIT_MS });
    expect(result2).toBe(7);
    expect(timers.pending()).toBe(0);
  });

  test('the timeout wins: rejects with an ApplicationError carrying the message', async () => {
    timers.restore();

    const error = await rejectionOf(
      PromiseUtility.withTimeout({
        call: () => new Promise<never>(() => {}),
        timeoutMs: 5,
        message: 'upstream too slow',
      }),
    );

    expect(isApplicationError(error)).toBe(true);
    expect((error as Error).message).toContain('upstream too slow');
  });

  test('the timeout error carries 504, the largest timer is accepted', async () => {
    const error = await rejectionOf(
      PromiseUtility.withTimeout({ call: () => new Promise<never>(() => {}), timeoutMs: 5 }),
    );

    expect((error as { statusCode?: number }).statusCode).toBe(504);
    const result4 = await PromiseUtility.withTimeout({
      call: () => 'ok',
      timeoutMs: 2_147_483_647,
    });
    expect(result4).toBe('ok');
  });

  test('the default message names the limit', async () => {
    const error = await rejectionOf(
      PromiseUtility.withTimeout({
        call: () => new Promise<never>(() => {}),
        timeoutMs: 5,
      }),
    );

    expect(isApplicationError(error)).toBe(true);
    expect((error as Error).message).toContain('5ms');
  });

  test('the call rejects: its own error passes through and the timer is cleared', async () => {
    const failure = new Error('boom');

    const error = await rejectionOf(
      PromiseUtility.withTimeout({
        call: async () => {
          throw failure;
        },
        timeoutMs: LIMIT_MS,
      }),
    );

    expect(error).toBe(failure);
    expect(timers.pending()).toBe(0);
  });

  test('a call that throws synchronously rejects the same way', async () => {
    const failure = new Error('sync boom');

    const error = await rejectionOf(
      PromiseUtility.withTimeout({
        call: () => {
          throw failure;
        },
        timeoutMs: LIMIT_MS,
      }),
    );

    expect(error).toBe(failure);
    expect(timers.pending()).toBe(0);
  });

  test('the losing call that rejects later raises no unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);

    process.on('unhandledRejection', onUnhandled);

    try {
      const result3 = await rejectionOf(
        PromiseUtility.withTimeout({
          call: () =>
            new Promise<never>((_resolve, reject) =>
              setTimeout(() => reject(new Error('late')), 20),
            ),
          timeoutMs: 5,
        }),
      );
      expect(isApplicationError(result3)).toBe(true);
      await PromiseUtility.sleep({ ms: 40 });
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    expect(unhandled).toEqual([]);
  });

  test('a non-positive or non-finite timeoutMs rejects with an ApplicationError and never runs the call', async () => {
    let ran = false;

    for (const timeoutMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 31, 3_000_000_000]) {
      const error = await rejectionOf(
        PromiseUtility.withTimeout({
          call: () => {
            ran = true;
          },
          timeoutMs,
        }),
      );

      expect(isApplicationError(error)).toBe(true);
    }

    expect(ran).toBe(false);
  });
});

describe('PromiseUtility.sleep', () => {
  test('resolves with undefined', async () => {
    const value: void = await PromiseUtility.sleep({ ms: 1 });

    expect(value).toBeUndefined();
  });
});
