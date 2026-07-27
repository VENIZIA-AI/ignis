import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@/common/types';
import { getError } from '@/modules/error';
import {
  computeBackoffDelayMs,
  executeWithRetry,
  executeWithRetryUntil,
  isRetryTimeoutError,
  RetryBackoffStrategies,
  RetryJitterModes,
  runWithTimeout,
} from '@/utilities/retry.utility';

const NO_JITTER = { jitter: RetryJitterModes.NONE } as const;

describe('computeBackoffDelayMs', () => {
  test('FIXED returns initialDelayMs for every attempt', () => {
    for (const attempt of [1, 2, 5]) {
      expect(
        computeBackoffDelayMs({
          attempt,
          backoff: { strategy: RetryBackoffStrategies.FIXED, initialDelayMs: 100, ...NO_JITTER },
        }),
      ).toBe(100);
    }
  });

  test('LINEAR grows by initialDelayMs per attempt', () => {
    const backoff = {
      strategy: RetryBackoffStrategies.LINEAR,
      initialDelayMs: 100,
      ...NO_JITTER,
    } as const;

    expect(computeBackoffDelayMs({ attempt: 1, backoff })).toBe(100);
    expect(computeBackoffDelayMs({ attempt: 3, backoff })).toBe(300);
  });

  test('EXPONENTIAL multiplies from initialDelayMs and is the default strategy', () => {
    const backoff = { initialDelayMs: 100, multiplier: 3, ...NO_JITTER } as const;

    expect(computeBackoffDelayMs({ attempt: 1, backoff })).toBe(100);
    expect(computeBackoffDelayMs({ attempt: 3, backoff })).toBe(900);
  });

  test('maxDelayMs caps the pre-jitter delay', () => {
    expect(
      computeBackoffDelayMs({
        attempt: 10,
        backoff: { initialDelayMs: 100, maxDelayMs: 500, ...NO_JITTER },
      }),
    ).toBe(500);
  });

  test('SCHEDULE indexes per attempt and repeats the last entry', () => {
    const backoff = {
      strategy: RetryBackoffStrategies.SCHEDULE,
      scheduleMs: [250, 1000, 4000],
      ...NO_JITTER,
    } as const;

    expect(computeBackoffDelayMs({ attempt: 1, backoff })).toBe(250);
    expect(computeBackoffDelayMs({ attempt: 3, backoff })).toBe(4000);
    expect(computeBackoffDelayMs({ attempt: 9, backoff })).toBe(4000);
  });

  test('SCHEDULE without scheduleMs throws a named error', () => {
    expect(() =>
      computeBackoffDelayMs({
        attempt: 1,
        backoff: { strategy: RetryBackoffStrategies.SCHEDULE, ...NO_JITTER },
      }),
    ).toThrow(/scheduleMs/);
  });

  test('FULL jitter stays in [0, delay); EQUAL jitter stays in [delay/2, delay)', () => {
    for (let i = 0; i < 200; i++) {
      const full = computeBackoffDelayMs({
        attempt: 1,
        backoff: { initialDelayMs: 1000, jitter: RetryJitterModes.FULL },
      });
      expect(full).toBeGreaterThanOrEqual(0);
      expect(full).toBeLessThan(1000);

      const equal = computeBackoffDelayMs({
        attempt: 1,
        backoff: { initialDelayMs: 1000, jitter: RetryJitterModes.EQUAL },
      });
      expect(equal).toBeGreaterThanOrEqual(500);
      expect(equal).toBeLessThan(1000);
    }
  });
});

describe('runWithTimeout', () => {
  test('resolves the execution result when it beats the timeout', async () => {
    const result = await runWithTimeout({
      operation: 'fast',
      timeoutMs: 1000,
      execution: () => 'ok',
    });

    expect(result).toBe('ok');
  });

  test('times out a slow execution with a detectable timeout error', async () => {
    let caught: unknown;
    try {
      await runWithTimeout({
        operation: 'slow',
        timeoutMs: 20,
        execution: () => new Promise(resolve => setTimeout(resolve, 5000)),
      });
    } catch (error) {
      caught = error;
    }

    expect(isRetryTimeoutError(caught)).toBe(true);
    expect((caught as Error).message).toContain('slow');
  });

  test('timeoutMs omitted or <= 0 means no timeout race', async () => {
    const result = await runWithTimeout({ operation: 'untimed', execution: () => 42 });
    expect(result).toBe(42);
  });

  test('a synchronously-throwing execution rejects instead of escaping the race', async () => {
    let caught: unknown;
    try {
      await runWithTimeout({
        operation: 'sync-throw',
        timeoutMs: 1000,
        execution: () => {
          throw new Error('sync boom');
        },
      });
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toBe('sync boom');
    expect(isRetryTimeoutError(caught)).toBe(false);
  });
});

describe('executeWithRetry', () => {
  const instantBackoff = {
    strategy: RetryBackoffStrategies.FIXED,
    initialDelayMs: 1,
    ...NO_JITTER,
  } as const;

  test('returns the first successful result without retrying', async () => {
    let calls = 0;

    const result = await executeWithRetry({
      operation: 'first-try',
      execution: () => {
        calls += 1;
        return 'ok';
      },
    });

    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  test('retries failures and succeeds; execution receives the 1-based attempt', async () => {
    const attempts: number[] = [];

    const result = await executeWithRetry({
      operation: 'third-time-lucky',
      maxAttempts: 5,
      backoff: instantBackoff,
      execution: ({ attempt }) => {
        attempts.push(attempt);
        if (attempt < 3) {
          throw new Error(`fail ${attempt}`);
        }
        return 'ok';
      },
    });

    expect(result).toBe('ok');
    expect(attempts).toEqual([1, 2, 3]);
  });

  test('exhaustion throws the LAST error', async () => {
    let caught: unknown;
    try {
      await executeWithRetry({
        operation: 'always-fails',
        maxAttempts: 3,
        backoff: instantBackoff,
        execution: ({ attempt }) => {
          throw new Error(`fail ${attempt}`);
        },
      });
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toBe('fail 3');
  });

  test('shouldRetry=false rethrows immediately - the classification hook', async () => {
    let calls = 0;
    const permanent = new Error('permanent');

    let caught: unknown;
    try {
      await executeWithRetry({
        operation: 'permanent',
        maxAttempts: 5,
        backoff: instantBackoff,
        shouldRetry: ({ error }) => (error as Error).message !== 'permanent',
        execution: () => {
          calls += 1;
          throw permanent;
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(permanent);
    expect(calls).toBe(1);
  });

  test('maxTotalMs budget stops retrying even when attempts remain', async () => {
    let calls = 0;
    const startedAt = Date.now();

    let caught: unknown;
    try {
      await executeWithRetry({
        operation: 'budgeted',
        maxAttempts: 100,
        maxTotalMs: 120,
        backoff: { strategy: RetryBackoffStrategies.FIXED, initialDelayMs: 30, ...NO_JITTER },
        execution: () => {
          calls += 1;
          throw new Error('transient');
        },
      });
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toBe('transient');
    expect(calls).toBeLessThan(100);
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  test('a backoff that would overshoot the budget is SKIPPED, not slept', async () => {
    const startedAt = Date.now();

    let caught: unknown;
    try {
      await executeWithRetry({
        operation: 'overshoot',
        maxAttempts: 5,
        maxTotalMs: 100,
        // A 10s backoff against a 100ms budget: the loop must break instead of sleeping.
        backoff: { strategy: RetryBackoffStrategies.FIXED, initialDelayMs: 10_000, ...NO_JITTER },
        execution: () => {
          throw new Error('transient');
        },
      });
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toBe('transient');
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });

  test('perAttemptTimeoutMs is capped to the remaining budget', async () => {
    const startedAt = Date.now();

    let caught: unknown;
    try {
      await executeWithRetry({
        operation: 'hang',
        maxAttempts: 1,
        maxTotalMs: 60,
        perAttemptTimeoutMs: 10_000,
        execution: () => new Promise(resolve => setTimeout(resolve, 30_000)),
      });
    } catch (error) {
      caught = error;
    }

    expect(isRetryTimeoutError(caught)).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });

  test('onRetry observes attempt, error, and the next delay before sleeping', async () => {
    const observed: Array<{ attempt: number; nextDelayMs: number }> = [];

    await executeWithRetry({
      operation: 'observed',
      maxAttempts: 3,
      backoff: { strategy: RetryBackoffStrategies.FIXED, initialDelayMs: 2, ...NO_JITTER },
      onRetry: ({ attempt, nextDelayMs }) => {
        observed.push({ attempt, nextDelayMs });
      },
      execution: ({ attempt }) => {
        if (attempt < 3) {
          throw new Error('transient');
        }
        return 'ok';
      },
    });

    expect(observed).toEqual([
      { attempt: 1, nextDelayMs: 2 },
      { attempt: 2, nextDelayMs: 2 },
    ]);
  });

  test('a pre-aborted signal prevents any attempt', async () => {
    let calls = 0;
    const controller = new AbortController();
    controller.abort('shutdown');

    let caught: unknown;
    try {
      await executeWithRetry({
        operation: 'aborted',
        signal: controller.signal,
        execution: () => {
          calls += 1;
          return 'never';
        },
      });
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toContain('Aborted');
    expect(calls).toBe(0);
  });

  test('aborting during backoff wakes the sleep and rejects promptly', async () => {
    const controller = new AbortController();
    const startedAt = Date.now();

    const pending = executeWithRetry({
      operation: 'abort-mid-backoff',
      maxAttempts: 2,
      backoff: { strategy: RetryBackoffStrategies.FIXED, initialDelayMs: 10_000, ...NO_JITTER },
      signal: controller.signal,
      execution: () => {
        throw new Error('transient');
      },
    });

    setTimeout(() => controller.abort('shutdown'), 20);

    let caught: unknown;
    try {
      await pending;
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toContain('Aborted during backoff');
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });

  test('maxAttempts < 1 throws a named configuration error', async () => {
    let caught: unknown;
    try {
      await executeWithRetry({ operation: 'bad', maxAttempts: 0, execution: () => 'x' });
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).message).toContain('maxAttempts');
  });

  test('logger.warn fires on exhaustion, debug per retry', async () => {
    const events: string[] = [];
    const fakeLogger = {
      for: () => ({
        debug: () => events.push('debug'),
        warn: () => events.push('warn'),
      }),
    } as AnyType;

    try {
      await executeWithRetry({
        operation: 'logged',
        maxAttempts: 3,
        backoff: { strategy: RetryBackoffStrategies.FIXED, initialDelayMs: 1, ...NO_JITTER },
        logger: fakeLogger,
        execution: () => {
          throw new Error('transient');
        },
      });
    } catch {
      // exhaustion is the point
    }

    expect(events).toEqual(['debug', 'debug', 'warn']);
  });
});

describe('executeWithRetry - an exhausted or zero time budget', () => {
  test('maxTotalMs: 0 is NO budget, not an unlimited one - nothing is attempted twice', async () => {
    let attempts = 0;

    let caught: unknown;
    try {
      await executeWithRetry({
        operation: 'zero-budget',
        maxAttempts: 4,
        maxTotalMs: 0,
        backoff: { strategy: RetryBackoffStrategies.FIXED, initialDelayMs: 20 },
        execution: () => {
          attempts += 1;
          throw getError({ message: 'boom' });
        },
      });
    } catch (error) {
      caught = error;
    }

    // Truthiness would read 0 as "no deadline given" and retry the full 4 attempts.
    expect(attempts).toBeLessThanOrEqual(1);
    expect(caught).toBeDefined();
  });

  test('an ALREADY-EXPIRED budget throws a real error, never `undefined`', async () => {
    let attempts = 0;

    let caught: unknown;
    try {
      await executeWithRetry({
        operation: 'expired-budget',
        maxAttempts: 4,
        // A caller computing `deadline - Date.now()` under load lands here routinely.
        maxTotalMs: -10,
        execution: () => {
          attempts += 1;
          return 'never';
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(attempts).toBe(0);
    // Throwing `undefined` blows up the caller's own error handling on `error.message`.
    expect(caught).toBeDefined();
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('budget');
  });

  test('a positive budget still runs and still reports the LAST failure', async () => {
    let attempts = 0;

    let caught: unknown;
    try {
      await executeWithRetry({
        operation: 'live-budget',
        maxAttempts: 3,
        maxTotalMs: 5_000,
        backoff: { strategy: RetryBackoffStrategies.FIXED, initialDelayMs: 1 },
        execution: () => {
          attempts += 1;
          throw getError({ message: 'still boom' });
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(attempts).toBe(3);
    expect((caught as Error).message).toBe('still boom');
  });
});

describe('executeWithRetryUntil', () => {
  const FAST_BACKOFF = {
    strategy: RetryBackoffStrategies.FIXED,
    initialDelayMs: 1,
    ...NO_JITTER,
  } as const;

  test('returns on the first attempt when until is satisfied', async () => {
    let calls = 0;

    const result = await executeWithRetryUntil({
      operation: 'first-attempt',
      backoff: FAST_BACKOFF,
      execution: () => {
        calls += 1;
        return 'ok';
      },
      until: attemptResult => attemptResult === 'ok',
    });

    expect(result).toBe('ok');
    expect(calls).toBe(1);
  });

  test('retries while until returns false and resolves with the first satisfying result', async () => {
    const responses: Array<string | null> = [null, null, 'visible'];
    let calls = 0;

    const result = await executeWithRetryUntil<string | null>({
      operation: 'retry-until-visible',
      maxAttempts: 5,
      backoff: FAST_BACKOFF,
      execution: () => {
        const response = responses[calls];
        calls += 1;
        return response;
      },
      until: attemptResult => attemptResult !== null,
    });

    expect(result).toBe('visible');
    expect(calls).toBe(3);
  });

  test('exhaustion returns the LAST result instead of throwing', async () => {
    let calls = 0;

    const result = await executeWithRetryUntil<string>({
      operation: 'exhausted',
      maxAttempts: 3,
      backoff: FAST_BACKOFF,
      execution: () => {
        calls += 1;
        return 'stale';
      },
      until: () => false,
    });

    expect(result).toBe('stale');
    expect(calls).toBe(3);
  });

  test('maxAttempts defaults to 3', async () => {
    let calls = 0;

    await executeWithRetryUntil<null>({
      operation: 'default-attempts',
      backoff: FAST_BACKOFF,
      execution: () => {
        calls += 1;
        return null;
      },
      until: attemptResult => attemptResult !== null,
    });

    expect(calls).toBe(3);
  });

  test('a thrown error propagates immediately - no retry', async () => {
    let calls = 0;
    let caught: unknown;

    try {
      await executeWithRetryUntil({
        operation: 'real-error',
        maxAttempts: 5,
        backoff: FAST_BACKOFF,
        execution: () => {
          calls += 1;
          throw getError({ message: 'connection refused' });
        },
        until: () => true,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('connection refused');
    expect(calls).toBe(1);
  });

  test('an error thrown AFTER an unmet attempt still propagates - never masked by lastResult', async () => {
    let calls = 0;
    let caught: unknown;

    try {
      await executeWithRetryUntil<string>({
        operation: 'error-after-miss',
        maxAttempts: 5,
        backoff: FAST_BACKOFF,
        execution: () => {
          calls += 1;
          if (calls === 1) {
            return 'not-yet';
          }
          throw getError({ message: 'connection refused' });
        },
        until: attemptResult => attemptResult === 'done',
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('connection refused');
    expect(calls).toBe(2);
  });

  test('exhaustion warns exactly once; real errors never warn', async () => {
    const warnCalls: string[] = [];
    const fakeLogger = {
      for: () => ({
        warn: (message: string) => {
          warnCalls.push(message);
        },
        debug: () => {},
      }),
    } as AnyType;

    await executeWithRetryUntil<null>({
      operation: 'warn-once',
      maxAttempts: 2,
      backoff: FAST_BACKOFF,
      logger: fakeLogger,
      execution: () => null,
      until: attemptResult => attemptResult !== null,
    });

    expect(warnCalls.length).toBe(1);
    expect(warnCalls[0]).toContain('Exhausted retries');
  });

  test('a slow read is never aborted by maxTotalMs - the budget only gates new attempts', async () => {
    let executions = 0;

    const result = await executeWithRetryUntil<string>({
      operation: 'slow-read',
      maxAttempts: 3,
      maxTotalMs: 10,
      backoff: FAST_BACKOFF,
      execution: async () => {
        executions += 1;
        await new Promise(resolve => setTimeout(resolve, 60));
        return 'fresh';
      },
      until: attemptResult => attemptResult === 'fresh',
    });

    expect(result).toBe('fresh');
    expect(executions).toBe(1);
  });

  test('a non-positive maxTotalMs still runs exactly one execution', async () => {
    let executions = 0;

    const result = await executeWithRetryUntil<string>({
      operation: 'zero-budget',
      maxAttempts: 5,
      maxTotalMs: 0,
      backoff: FAST_BACKOFF,
      execution: () => {
        executions += 1;
        return 'stale';
      },
      until: () => false,
    });

    expect(result).toBe('stale');
    expect(executions).toBe(1);

    let negativeExecutions = 0;

    const negativeResult = await executeWithRetryUntil<string>({
      operation: 'negative-budget',
      maxAttempts: 5,
      maxTotalMs: -50,
      backoff: FAST_BACKOFF,
      execution: () => {
        negativeExecutions += 1;
        return 'stale';
      },
      until: () => false,
    });

    expect(negativeResult).toBe('stale');
    expect(negativeExecutions).toBe(1);
  });

  test('an exhausted budget stops further attempts and returns the last result', async () => {
    let executions = 0;

    const result = await executeWithRetryUntil<string>({
      operation: 'budget-exhausted',
      maxAttempts: 10,
      maxTotalMs: 30,
      backoff: FAST_BACKOFF,
      execution: async () => {
        executions += 1;
        await new Promise(resolve => setTimeout(resolve, 20));
        return 'stale';
      },
      until: () => false,
    });

    expect(result).toBe('stale');
    expect(executions).toBeGreaterThanOrEqual(1);
    expect(executions).toBeLessThan(5);
  });

  test('a misconfigured backoff throws before the first execution runs', async () => {
    let executions = 0;
    let caught: unknown;

    try {
      await executeWithRetryUntil<string>({
        operation: 'bad-backoff',
        maxAttempts: 3,
        backoff: { strategy: RetryBackoffStrategies.SCHEDULE },
        execution: () => {
          executions += 1;
          return 'value';
        },
        until: () => false,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/scheduleMs/);
    expect(executions).toBe(0);
  });
});
