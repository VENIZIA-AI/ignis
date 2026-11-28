import { describe, expect, test } from 'bun:test';
import type { ILogger } from '@/modules/logger';
import { Execution } from '@/modules/execution';

/** A logger whose scoped `error` records every call; the other levels are never reached. */
class RecordingLogger implements ILogger {
  constructor(private readonly errors: unknown[]) {}

  debug() {}
  info() {}
  warn() {}
  emerg() {}
  log() {}

  error(message: string, ...args: unknown[]) {
    this.errors.push([message, ...args]);
  }

  for(): ILogger {
    return this;
  }
}

const buildLogger = () => {
  const errors: unknown[] = [];
  const logger = new RecordingLogger(errors);

  return { logger, errors };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Execution.fireAndForget', () => {
  test('a synchronous value passes through untouched - nothing logged, nothing thrown', () => {
    const { logger, errors } = buildLogger();

    Execution.fireAndForget({ logger, scope: 'sync', execution: 42 });
    Execution.fireAndForget({ logger, scope: 'sync', execution: undefined });
    Execution.fireAndForget({ logger, scope: 'sync', execution: null });

    expect(errors).toHaveLength(0);
  });

  test('a rejecting promise is routed to the scoped logger instead of an unhandled rejection', async () => {
    const { logger, errors } = buildLogger();

    Execution.fireAndForget({
      logger,
      scope: 'boom',
      execution: Promise.reject(new Error('boom')),
    });
    await tick();

    expect(errors).toHaveLength(1);
  });

  test('a resolving promise logs nothing', async () => {
    const { logger, errors } = buildLogger();

    Execution.fireAndForget({ logger, scope: 'ok', execution: Promise.resolve('ok') });
    await tick();

    expect(errors).toHaveLength(0);
  });

  test('a non-promise object carrying a non-function `then` is treated as a plain value', () => {
    const { logger, errors } = buildLogger();

    Execution.fireAndForget({ logger, scope: 'fake', execution: { then: 'not-a-function' } });

    expect(errors).toHaveLength(0);
  });
});
