import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import type { AnyType } from '@/common/types';
import { getError } from '@/modules/error';
import {
  executePromiseWithLimit,
  getDeepProperty,
  isPromiseLike,
  toError,
} from '@/utilities/promise.utility';

const defer = () => new Promise(resolve => setTimeout(resolve, 0));

const captureRejection = async (execution: Promise<unknown>): Promise<Error> => {
  try {
    await execution;
  } catch (error) {
    return error as Error;
  }

  throw getError({ message: 'Expected the execution to reject, but it resolved' });
};

const buildInstrumentedTasks = (opts: { count: number; delayMs?: number }) => {
  const { count, delayMs = 5 } = opts;

  const state = { inFlight: 0, peak: 0 };
  const tasks = Array.from({ length: count }, (_unused, index) => {
    return async () => {
      state.inFlight += 1;
      state.peak = Math.max(state.peak, state.inFlight);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      state.inFlight -= 1;
      return index;
    };
  });

  return { state, tasks };
};

describe('executePromiseWithLimit', () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };

  beforeAll(() => {
    process.on('unhandledRejection', onUnhandled);
  });

  afterAll(() => {
    process.off('unhandledRejection', onUnhandled);
  });

  afterEach(() => {
    unhandled.length = 0;
  });

  test('returns results in task order, never completion order', async () => {
    const tasks = [
      async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
        return 'slow-first';
      },
      async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return 'fast-second';
      },
      async () => {
        await new Promise(resolve => setTimeout(resolve, 15));
        return 'medium-third';
      },
    ];

    const results = await executePromiseWithLimit({ tasks, limit: 3 });
    expect(results).toEqual(['slow-first', 'fast-second', 'medium-third']);
  });

  test('caps concurrency at `limit`', async () => {
    const { state, tasks } = buildInstrumentedTasks({ count: 20 });

    const results = await executePromiseWithLimit({ tasks, limit: 4 });

    expect(results).toEqual(Array.from({ length: 20 }, (_unused, index) => index));
    expect(state.peak).toBeLessThanOrEqual(4);
    expect(state.peak).toBe(4);
    expect(state.inFlight).toBe(0);
  });

  test('a limit larger than the task count runs everything in parallel', async () => {
    const { state, tasks } = buildInstrumentedTasks({ count: 3 });

    const results = await executePromiseWithLimit({ tasks, limit: 100 });

    expect(results).toEqual([0, 1, 2]);
    expect(state.peak).toBe(3);
  });

  test('an empty task list resolves to an empty array', async () => {
    expect(await executePromiseWithLimit({ tasks: [], limit: 5 })).toEqual([]);
  });

  test('rejects a limit below 1 instead of silently degrading to serial execution', async () => {
    const { tasks } = buildInstrumentedTasks({ count: 3 });

    const zeroLimit = await captureRejection(executePromiseWithLimit({ tasks, limit: 0 }));
    const negativeLimit = await captureRejection(executePromiseWithLimit({ tasks, limit: -5 }));

    expect(zeroLimit.message).toMatch(/limit must be a positive integer/);
    expect(negativeLimit.message).toMatch(/limit must be a positive integer/);
  });

  test('onTaskDone is invoked as slots free up', async () => {
    const { tasks } = buildInstrumentedTasks({ count: 6 });
    const done: unknown[] = [];

    await executePromiseWithLimit({
      tasks,
      limit: 2,
      onTaskDone: async ({ result }) => {
        done.push(result);
      },
    });

    expect(done.length).toBeGreaterThan(0);
  });

  test('a rejecting task rejects the whole call (fail-fast, results are not collected)', async () => {
    const tasks = [
      async () => 'ok',
      async () => {
        throw getError({ message: 'task-2-blew-up' });
      },
      async () => 'ok-3',
    ];

    const rejection = await captureRejection(executePromiseWithLimit({ tasks, limit: 2 }));
    expect(rejection.message).toBe('task-2-blew-up');
  });

  test('a second, later rejection does not escape as an unhandled rejection', async () => {
    const tasks = [
      async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        throw getError({ message: 'first-failure' });
      },
      async () => {
        await new Promise(resolve => setTimeout(resolve, 40));
        throw getError({ message: 'later-failure' });
      },
    ];

    let caught: unknown;
    try {
      await executePromiseWithLimit({ tasks, limit: 2 });
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toBe('first-failure');

    await new Promise(resolve => setTimeout(resolve, 80));
    await defer();

    expect(unhandled).toEqual([]);
  });
});

describe('isPromiseLike', () => {
  test('detects native promises and thenables, rejects everything else', () => {
    expect(isPromiseLike(Promise.resolve(1))).toBe(true);
    expect(isPromiseLike({ then: () => undefined })).toBe(true);

    const thenableFunction = () => undefined;
    (thenableFunction as AnyType).then = () => undefined;
    expect(isPromiseLike(thenableFunction)).toBe(true);

    expect(isPromiseLike(null)).toBe(false);
    expect(isPromiseLike(undefined)).toBe(false);
    expect(isPromiseLike(0)).toBe(false);
    expect(isPromiseLike('then')).toBe(false);
    expect(isPromiseLike({ then: 'not-a-function' })).toBe(false);
    expect(isPromiseLike({})).toBe(false);
  });
});

describe('toError', () => {
  test('passes an Error through and stringifies anything else', () => {
    const error = new TypeError('boom');
    expect(toError(error)).toBe(error);

    expect(toError('plain string').message).toBe('plain string');
    expect(toError(undefined).message).toBe('undefined');
    expect(toError({ code: 1 }).message).toBe('[object Object]');
    expect(toError(getError({ message: 'app' })).message).toBe('app');
  });
});

describe('getDeepProperty', () => {
  test('traverses a dotted path', () => {
    const source = { a: { b: { c: 42 } }, list: [{ id: 1 }] };

    expect(getDeepProperty<typeof source, number>(source, 'a.b.c')).toBe(42);
    expect(getDeepProperty<typeof source, number>(source, 'list.0.id')).toBe(1);
    expect(getDeepProperty<typeof source, undefined>(source, 'a.missing')).toBeUndefined();
  });

  test('throws when the path runs through a nullish value', () => {
    const source = { a: null };
    expect(() => getDeepProperty(source, 'a.b')).toThrow(/Cannot read property 'b' of null/);
  });
});
