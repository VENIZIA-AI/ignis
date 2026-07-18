import { afterEach, describe, expect, test } from 'bun:test';
import winston from 'winston';
import { resolveLoggerLevel } from '@/modules/logger';
import { defineCustomLogger, resolveDefaultTransportOptions } from '@/modules/logger/winston';

const MESSAGE = Symbol.for('message');
const LEVEL = Symbol.for('level');
const ANSI_ESCAPE = '[';

/** Renders one info object exactly as winston would for a given transport: logger-level format
 * first, then the transport's own format (identity when absent). */
const renderThroughTransport = (opts: {
  logger: winston.Logger;
  transport: winston.transport;
  info: { level: string; message: string };
}): string => {
  const { logger, transport, info } = opts;

  const seed = { ...info, [LEVEL]: info.level } as winston.Logform.TransformableInfo;
  const loggerFormat = logger.format;
  const prepped = loggerFormat ? loggerFormat.transform(seed, loggerFormat.options) : seed;
  if (typeof prepped === 'boolean') {
    throw new Error('logger format filtered the info');
  }

  const transportFormat = transport.format;
  const finalized = transportFormat
    ? transportFormat.transform({ ...prepped }, transportFormat.options)
    : prepped;
  if (typeof finalized === 'boolean') {
    throw new Error('transport format filtered the info');
  }

  return String((finalized as { [MESSAGE]?: unknown })[MESSAGE] ?? finalized.message);
};

const findConsoleTransport = (logger: winston.Logger): winston.transport => {
  const transport = logger.transports.find(el => el instanceof winston.transports.Console);
  expect(transport).toBeDefined();
  return transport!;
};

const findFileTransport = (logger: winston.Logger): winston.transport => {
  const transport = logger.transports.find(el => el instanceof winston.transports.DailyRotateFile);
  expect(transport).toBeDefined();
  return transport!;
};

const buildTextLogger = (extra?: { level?: 'warn' }) => {
  return defineCustomLogger({
    format: 'text',
    ...extra,
    transports: {
      info: { file: { folder: './app_data/logs', prefix: 'fmt-test' } },
      error: {},
    },
  });
};

describe('defineCustomLogger - format wiring per transport', () => {
  test('text mode: what the file transport writes carries no ANSI color codes', () => {
    const logger = buildTextLogger();

    const rendered = renderThroughTransport({
      logger,
      transport: findFileTransport(logger),
      info: { level: 'info', message: 'hello file' },
    });

    expect(rendered).toContain('hello file');
    expect(rendered).not.toContain(ANSI_ESCAPE);
  });

  test('text mode: what the console transport writes is colorized', () => {
    const logger = buildTextLogger();

    const rendered = renderThroughTransport({
      logger,
      transport: findConsoleTransport(logger),
      info: { level: 'info', message: 'hello console' },
    });

    expect(rendered).toContain('hello console');
    expect(rendered).toContain(ANSI_ESCAPE);
  });

  test('json mode: console output is one valid JSON line without ANSI codes', () => {
    const logger = defineCustomLogger({
      format: 'json',
      transports: { info: {}, error: {} },
    });

    const rendered = renderThroughTransport({
      logger,
      transport: findConsoleTransport(logger),
      info: { level: 'info', message: 'hello json' },
    });

    expect(rendered).not.toContain(ANSI_ESCAPE);
    const parsed = JSON.parse(rendered) as { message: string; level: string; label?: string };
    expect(parsed.message).toBe('hello json');
    expect(parsed.level).toBe('info');
  });
});

describe('defineCustomLogger - level control', () => {
  // Console-only: winston's isLevelEnabled honors a transport's OWN level (the info/error file
  // transports are pinned), so only a transport without one reflects the logger-level floor.
  const buildConsoleOnlyLogger = (extra?: { level?: 'warn' }) => {
    return defineCustomLogger({
      format: 'text',
      ...extra,
      transports: { info: {}, error: {} },
    });
  };

  test('defaults to debug so gated debug lines actually reach the transports', () => {
    const logger = buildConsoleOnlyLogger();
    expect(logger.isLevelEnabled('debug')).toBe(true);
  });

  test('an explicit level narrows what the logger emits', () => {
    const logger = buildConsoleOnlyLogger({ level: 'warn' });
    expect(logger.isLevelEnabled('warn')).toBe(true);
    expect(logger.isLevelEnabled('info')).toBe(false);
  });
});

describe('resolveLoggerLevel', () => {
  test('absent value falls back to debug', () => {
    expect(resolveLoggerLevel({ configured: undefined })).toBe('debug');
    expect(resolveLoggerLevel({ configured: '' })).toBe('debug');
  });

  test('a valid level is honored', () => {
    expect(resolveLoggerLevel({ configured: 'warn' })).toBe('warn');
  });

  test('an invalid level falls back to debug instead of silently breaking the logger', () => {
    expect(resolveLoggerLevel({ configured: 'not-a-level' })).toBe('debug');
  });
});

describe('resolveDefaultTransportOptions - file logging is opt-in', () => {
  const savedFolderPath = process.env.APP_ENV_LOGGER_FOLDER_PATH;

  afterEach(() => {
    if (savedFolderPath === undefined) {
      delete process.env.APP_ENV_LOGGER_FOLDER_PATH;
      return;
    }
    process.env.APP_ENV_LOGGER_FOLDER_PATH = savedFolderPath;
  });

  test('without APP_ENV_LOGGER_FOLDER_PATH no file transport options are produced', () => {
    delete process.env.APP_ENV_LOGGER_FOLDER_PATH;

    const transports = resolveDefaultTransportOptions();

    expect(transports.info.file).toBeUndefined();
    expect(transports.error.file).toBeUndefined();
  });

  test('with APP_ENV_LOGGER_FOLDER_PATH set the configured folder is honored', () => {
    process.env.APP_ENV_LOGGER_FOLDER_PATH = './app_data/logs';

    const transports = resolveDefaultTransportOptions();

    expect(transports.info.file?.folder).toBe('./app_data/logs');
    expect(transports.error.file?.folder).toBe('./app_data/logs');
  });
});
