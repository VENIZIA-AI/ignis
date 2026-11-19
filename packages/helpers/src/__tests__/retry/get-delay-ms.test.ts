import { describe, expect, test } from 'bun:test';
import { RejectionHelper } from '@venizia/dev-configs/testing';
import { RetryBackoffStrategies, RetryHelper, RetryJitterModes } from '@/modules/retry';

const FIXED = {
  strategy: RetryBackoffStrategies.FIXED,
  initialDelayMs: 5,
  jitter: RetryJitterModes.NONE,
} as const;

describe('RetryHelper.executeWithRetry - getDelayMs is a floor for the next wait', () => {
  test('a longer floor than the backoff is the delay that is slept and reported', async () => {
    const delays: number[] = [];
    let calls = 0;

    const result = await RetryHelper.executeWithRetry({
      operation: 'floor',
      maxAttempts: 2,
      backoff: FIXED,
      getDelayMs: () => 40,
      onRetry: ({ nextDelayMs }) => {
        delays.push(nextDelayMs);
      },
      execution: () => {
        calls += 1;

        if (calls === 1) {
          throw new Error('first');
        }

        return 'done';
      },
    });

    expect(result).toBe('done');
    expect(delays).toEqual([40]);
  });

  test('a shorter floor never shortens the backoff, and undefined leaves it alone', async () => {
    const delays: number[] = [];
    let calls = 0;

    await RetryHelper.executeWithRetry({
      operation: 'shorter',
      maxAttempts: 3,
      backoff: FIXED,
      getDelayMs: ({ attempt }) => (attempt === 1 ? 1 : undefined),
      onRetry: ({ nextDelayMs }) => {
        delays.push(nextDelayMs);
      },
      execution: () => {
        calls += 1;

        if (calls < 3) {
          throw new Error('again');
        }

        return 'ok';
      },
    });

    expect(delays).toEqual([5, 5]);
  });

  test('a floor that does not fit the total budget ends the retries and rethrows the error', async () => {
    let calls = 0;

    const failure = await RejectionHelper.rejectionOf({
      task: RetryHelper.executeWithRetry({
        operation: 'budget',
        maxAttempts: 5,
        maxTotalMs: 50,
        backoff: FIXED,
        getDelayMs: () => 10_000,
        execution: () => {
          calls += 1;

          throw new Error('always');
        },
      }),
    });

    expect((failure as Error).message).toBe('always');
    expect(calls).toBe(1);
  });

  test('getDelayMs receives the attempt and the error', async () => {
    const seen: Array<{ attempt: number; message: string }> = [];
    let calls = 0;

    await RetryHelper.executeWithRetry({
      operation: 'context',
      maxAttempts: 2,
      backoff: FIXED,
      getDelayMs: ({ attempt, error }) => {
        seen.push({ attempt, message: (error as Error).message });

        return undefined;
      },
      execution: () => {
        calls += 1;

        if (calls === 1) {
          throw new Error('boom');
        }

        return 1;
      },
    });

    expect(seen).toEqual([{ attempt: 1, message: 'boom' }]);
  });
});
