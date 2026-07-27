import { describe, expect, test } from 'bun:test';
import winston from 'winston';
import { Logger } from '@/modules/logger/winston';

const buildCustomWinston = () => {
  return winston.createLogger({
    transports: [new winston.transports.Console({ silent: true })],
  });
};

describe('Logger.get - cache identity', () => {
  test('the same scope without a custom logger returns the same instance', () => {
    expect(Logger.get('cache-identity-default')).toBe(Logger.get('cache-identity-default'));
  });

  test('a custom-backed logger wraps exactly the winston instance it was given', () => {
    const customLogger = buildCustomWinston();
    const logger = Logger.get('cache-identity-custom-a', customLogger);

    expect(logger['_logger']).toBe(customLogger);
  });

  test('two different custom loggers for the same scope never share a wrapper', () => {
    const firstLogger = buildCustomWinston();
    const secondLogger = buildCustomWinston();

    const firstWrapper = Logger.get('cache-identity-custom-b', firstLogger);
    const secondWrapper = Logger.get('cache-identity-custom-b', secondLogger);

    expect(firstWrapper['_logger']).toBe(firstLogger);
    expect(secondWrapper['_logger']).toBe(secondLogger);
  });
});

describe('Logger.for - method-scoped sub-logger', () => {
  test('keeps the parent scope as prefix', () => {
    const child = Logger.get('for-scope').for('handle');
    expect(child['_formattedPrefix']).toBe('[for-scope-handle] ');
  });

  test('a custom-backed logger keeps its backing winston instance', () => {
    const customLogger = buildCustomWinston();
    const child = Logger.get('for-scope-custom', customLogger).for('handle');

    expect(child['_logger']).toBe(customLogger);
  });
});
