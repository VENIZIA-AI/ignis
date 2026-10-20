import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@/common/types';
import { getError } from '@/modules/error';
import {
  executeWithPerformanceMeasure,
  getExecutedPerformance,
  getPerformanceCheckpoint,
} from '@/utilities/performance.utility';

/** `executeWithPerformanceMeasure` resolves from `.then(resolve)` and logs DONE from the later `.finally`, so DONE lands one microtask after the caller resumes - draining the loop once makes that ordering deterministic. */
const flushPendingLogs = () => new Promise(resolve => setTimeout(resolve, 0));

const captureRejection = async (execution: Promise<unknown>): Promise<Error> => {
  try {
    await execution;
  } catch (error) {
    return error as Error;
  }

  throw getError({ message: 'Expected the execution to reject, but it resolved' });
};

const buildLogger = () => {
  const lines: Array<{ level: string; args: unknown[] }> = [];
  const record = (level: string) => {
    return (...args: unknown[]) => {
      lines.push({ level, args });
    };
  };

  const logger = {
    debug: record('debug'),
    info: record('info'),
    error: record('error'),
    warn: record('warn'),
  } as AnyType;

  return { logger, lines };
};

describe('getPerformanceCheckpoint / getExecutedPerformance', () => {
  test('measure a non-negative elapsed duration', () => {
    const from = getPerformanceCheckpoint();
    expect(typeof from).toBe('number');

    const elapsed = getExecutedPerformance({ from });
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  test('honour the requested decimal precision', () => {
    const elapsed = getExecutedPerformance({
      from: getPerformanceCheckpoint() - 12.3456789,
      digit: 2,
    });
    const decimals = elapsed.toString().split('.')[1] ?? '';
    expect(decimals.length).toBeLessThanOrEqual(2);
  });
});

describe('executeWithPerformanceMeasure', () => {
  test('resolves with the task result and logs START then DONE', async () => {
    const { logger, lines } = buildLogger();

    const result = await executeWithPerformanceMeasure<string>({
      logger,
      scope: 'TestScope',
      description: 'doing work',
      task: async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return 'done-value';
      },
    });

    expect(result).toBe('done-value');
    await flushPendingLogs();

    expect(lines).toHaveLength(2);
    expect(lines[0].level).toBe('debug');
    expect(lines[0].args[0]).toContain('START');
    expect(lines[1].args[0]).toContain('DONE');
    expect(lines[1].args[0]).toContain('Took');
  });

  test('supports a synchronous task and a custom level', async () => {
    const { logger, lines } = buildLogger();

    const result = await executeWithPerformanceMeasure<number>({
      logger,
      level: 'info',
      scope: 'Sync',
      task: () => 21 * 2,
    });

    expect(result).toBe(42);
    expect(lines.every(line => line.level === 'info')).toBe(true);
  });

  test('includes args in both log lines when provided', async () => {
    const { logger, lines } = buildLogger();

    await executeWithPerformanceMeasure({
      logger,
      scope: 'WithArgs',
      args: { id: 1 },
      task: async () => 'ok',
    });
    await flushPendingLogs();

    expect(lines).toHaveLength(2);
    expect(lines[0].args).toContainEqual({ id: 1 });
    expect(lines[1].args).toContainEqual({ id: 1 });
  });

  test('propagates a rejecting task and still logs DONE', async () => {
    const { logger, lines } = buildLogger();

    const execution = executeWithPerformanceMeasure({
      logger,
      scope: 'Boom',
      task: async () => {
        throw getError({ message: 'task-failed' });
      },
    });

    const rejection = await captureRejection(execution);
    expect(rejection.message).toBe('task-failed');
    await flushPendingLogs();

    expect(lines).toHaveLength(2);
    expect(lines[1].args[0]).toContain('DONE');
  });

  test('propagates a synchronously throwing task', async () => {
    const { logger } = buildLogger();

    const execution = executeWithPerformanceMeasure({
      logger,
      scope: 'SyncBoom',
      task: () => {
        throw getError({ message: 'sync-failed' });
      },
    });

    const rejection = await captureRejection(execution);
    expect(rejection.message).toBe('sync-failed');
  });
});
