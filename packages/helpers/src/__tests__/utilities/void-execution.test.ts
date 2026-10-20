import { describe, expect, test } from 'bun:test';
import type { AnyType } from '@/common/types';
import { voidExecution } from '@/utilities/promise.utility';

const buildLogger = () => {
  const errors: unknown[] = [];
  const logger = {
    for: () => ({
      error: (...args: unknown[]) => {
        errors.push(args);
      },
    }),
  } as AnyType;

  return { logger, errors };
};

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('voidExecution', () => {
  test('a synchronous value passes through untouched - nothing logged, nothing thrown', () => {
    const { logger, errors } = buildLogger();

    voidExecution({ logger, scope: 'sync', execution: 42 });
    voidExecution({ logger, scope: 'sync', execution: undefined });
    voidExecution({ logger, scope: 'sync', execution: null });

    expect(errors).toHaveLength(0);
  });

  test('a rejecting promise is routed to the scoped logger instead of an unhandled rejection', async () => {
    const { logger, errors } = buildLogger();

    voidExecution({ logger, scope: 'boom', execution: Promise.reject(new Error('boom')) });
    await tick();

    expect(errors).toHaveLength(1);
  });

  test('a resolving promise logs nothing', async () => {
    const { logger, errors } = buildLogger();

    voidExecution({ logger, scope: 'ok', execution: Promise.resolve('ok') });
    await tick();

    expect(errors).toHaveLength(0);
  });

  test('a non-promise object carrying a non-function `then` is treated as a plain value', () => {
    const { logger, errors } = buildLogger();

    voidExecution({ logger, scope: 'fake', execution: { then: 'not-a-function' } });

    expect(errors).toHaveLength(0);
  });
});
