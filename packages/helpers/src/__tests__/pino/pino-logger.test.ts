import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import pino from 'pino';
import { LoggerFactory } from '@/modules/logger';
import { WinstonLogger } from '@/modules/logger/winston';
import { buildPinoOptions, PinoLogger, setPinoBackingLogger } from '@/modules/logger/pino';

interface IParsedLine {
  level: number;
  msg: string;
  [key: string]: unknown;
}

/** Behavioral suite - a real pino instance backed by an in-memory destination via `setPinoBackingLogger()` (no env vars, no filesystem, no transport worker threads). */
describe('PinoLogger - behavioral, via an injected in-memory backing', () => {
  const lines: Array<string> = [];

  beforeAll(() => {
    const destination = {
      write: (line: string) => {
        lines.push(line);
      },
    };

    setPinoBackingLogger({
      instance: pino(
        {
          name: 'APP',
          level: 'debug',
          customLevels: { emerg: 70 },
        },
        destination as never,
      ),
    });
  });

  afterAll(() => {
    LoggerFactory.use({ provider: WinstonLogger }); // restore the default for other suites
  });

  beforeEach(() => {
    lines.length = 0;
  });

  const lastParsed = (): IParsedLine => {
    expect(lines.length).toBeGreaterThan(0);
    return JSON.parse(lines[lines.length - 1]) as IParsedLine;
  };

  test("info() carries the [Scope] prefix and pino's native numeric level (30)", () => {
    PinoLogger.get('PinoScope').info('hello');

    const parsed = lastParsed();
    expect(parsed.msg).toBe('[PinoScope] hello');
    expect(parsed.level).toBe(30);
  });

  test('emerg() maps to the custom level 70', () => {
    PinoLogger.get('PinoScope').emerg('down');
    expect(lastParsed().level).toBe(70);
  });

  test('args are deep-formatted through formatLogMessage and secrets are redacted', () => {
    PinoLogger.get('PinoScope').error('failed: %s', { token: 'super-secret', orderId: 42 });

    const parsed = lastParsed();
    expect(parsed.msg).toContain('orderId: 42');
    expect(parsed.msg).toContain('[REDACTED]');
    expect(parsed.msg).not.toContain('super-secret');
  });

  test('for() scopes the prefix with a hyphen', () => {
    PinoLogger.get('P').for('handle').info('x');
    expect(lastParsed().msg.startsWith('[P-handle] ')).toBe(true);
  });

  test('provider contract: LoggerFactory.use({ provider: PinoLogger }) routes factory-issued loggers here', () => {
    LoggerFactory.use({ provider: PinoLogger });
    LoggerFactory.getLogger(['ViaFactory']).info('routed');

    expect(lastParsed().msg).toBe('[ViaFactory] routed');
  });
});

/** Floor-parity suite - real `buildPinoOptions()`/`resolveLoggerLevel()` against a real pino instance and an in-memory destination; asserts pino's ascending severity matches the winston provider, the default `debug` floor admitting every remaining level. */
describe('pino level floor parity with npm ordering', () => {
  const ENV_KEY = 'APP_ENV_LOGGER_LEVEL';
  const savedLevel = process.env[ENV_KEY];

  afterEach(() => {
    if (savedLevel === undefined) {
      delete process.env[ENV_KEY];
      return;
    }
    process.env[ENV_KEY] = savedLevel;
  });

  const buildInstance = () => pino(buildPinoOptions(), { write: () => {} } as never);

  test('default floor (no APP_ENV_LOGGER_LEVEL) admits every level incl. the custom emerg', () => {
    delete process.env[ENV_KEY];
    const instance = buildInstance();

    expect(instance.isLevelEnabled('debug')).toBe(true);
    expect(instance.isLevelEnabled('emerg')).toBe(true);
  });

  test('APP_ENV_LOGGER_LEVEL=warn excludes info/debug, admits warn/error/emerg', () => {
    process.env[ENV_KEY] = 'warn';
    const instance = buildInstance();

    expect(instance.isLevelEnabled('warn')).toBe(true);
    expect(instance.isLevelEnabled('emerg')).toBe(true);
    expect(instance.isLevelEnabled('info')).toBe(false);
    expect(instance.isLevelEnabled('debug')).toBe(false);
  });
});
